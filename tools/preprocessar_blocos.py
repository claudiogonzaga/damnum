#!/usr/bin/env python3
"""DAMNUM 7.1, Fase 1: gera os blocos do estoque de carbono da vegetação original
(campo ctotal4inv, pasta "Carbono da Vegetação Pretérita" do Quarto Inventário).

  Amazônia:           blocos raster (pixels do TIFF do INPE, resolução nativa) com
                      uma segunda banda de classe (c_pretvizi do vetor);
  Cerrado e Pantanal: blocos vetoriais (polígonos recortados pela célula).

Substitui tools/preprocessar_qcn.sh da versão 7.0. Depende de numpy, shapely e
rasterio (pip), sem GDAL instalado no sistema. Ver docs/fase0_dados.md.

Exemplo:
  python3 tools/preprocessar_blocos.py --uf MT --versao v1 \
      --amazonia /caminho/preterita_amazonia --cerrado /caminho/cerrado_carbono_vegetacao_preterita.shp \
      --pantanal /caminho/pantanal_carbono_vegetacao_preterita.shp \
      --municipios /caminho/Municipios --saida /caminho/saida
"""
import argparse
import collections
import datetime
import glob
import gzip
import hashlib
import json
import math
import os
import sys
import unicodedata

import numpy as np
import shapely

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shp_leitor as L  # noqa: E402

CODIGO_UF = {'MT': '51'}
CELULA_RASTER = 1.0      # graus
CELULA_VETOR = 0.25      # graus
ESCALA_RASTER = 100      # tC/ha × 100 em inteiro de 16 bits
SEM_DADO_RASTER = 65535
ESCALA_VETOR = 1000000   # graus × 1e6 (cerca de 0,1 m)
LIMITE_BLOCO = 2 * 1024 * 1024
URL_BASE = 'https://dataserver-coids.inpe.br/ccst/p4cn/4%20Inventario-CN/'
RAIO_TERRA = 6371008.8


def sem_acento(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def area_ha_aprox(geom):
    """Área em hectares de geometria em graus, pela latitude do centro da caixa."""
    if geom.is_empty:
        return 0.0
    x0, y0, x1, y1 = geom.bounds
    grau = math.pi / 180 * RAIO_TERRA
    return geom.area * grau * grau * math.cos(math.radians((y0 + y1) / 2)) / 10000


# ---------- unidade da federação ----------

def carregar_municipios(pasta, uf):
    """Devolve [(geocódigo, nome, geometria)] dos municípios da UF, a partir das
    malhas por bioma do Inventário (IBGE, 2016). Um município em dois biomas
    aparece em dois arquivos; as partes são unidas."""
    partes = collections.defaultdict(list)
    nomes = {}
    for dbf in sorted(glob.glob(os.path.join(pasta, '*_municipios_ibge_2016.dbf'))):
        _, linhas = L.ler_dbf(dbf, 'utf-8')
        for i, _cx, aneis in L.iterar_poligonos(dbf[:-4] + '.shp'):
            cod = str(linhas[i]['cd_geocmu'])
            if not cod.startswith(CODIGO_UF[uf]):
                continue
            nomes[cod] = linhas[i]['nm_municip']
            partes[cod].append(geometria_de_aneis(aneis))
    return [(cod, nomes[cod], shapely.union_all(partes[cod])) for cod in sorted(partes)]


def geometria_de_aneis(aneis):
    """Polígono (com buracos e ilhas) a partir dos anéis de um registro, pela
    regra par-ímpar de aninhamento."""
    pols = [validar(shapely.Polygon(a)) for a in aneis if len(a) >= 4]
    pols = [p for q in pols for p in partes_poligonais(q)]
    return combinar_por_aninhamento(pols)


def validar(g):
    return g if g.is_valid else shapely.make_valid(g)


def partes_poligonais(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g] if g.area > 0 else []
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return [p for parte in g.geoms for p in partes_poligonais(parte)]
    return []


def combinar_por_aninhamento(pols):
    """Região definida por anéis que não se cruzam: um ponto pertence a ela se
    está dentro de um número ímpar de anéis. Cada anel entra como polígono cheio."""
    if not pols:
        return shapely.Polygon()
    if len(pols) == 1:
        return pols[0]
    areas = np.array([p.area for p in pols])
    arvore = shapely.STRtree(pols)
    pontos = [p.representative_point() for p in pols]
    quem, onde = arvore.query(pontos, predicate='within')  # ponto `quem` dentro do polígono `onde`
    nivel = np.zeros(len(pols), dtype=int)
    for i, j in zip(quem, onde):
        if j != i and areas[j] > areas[i]:
            nivel[i] += 1
    regiao = shapely.Polygon()
    for k in range(nivel.max() + 1):
        camada = shapely.union_all([p for p, n in zip(pols, nivel) if n == k])
        regiao = regiao.union(camada) if k % 2 == 0 else regiao.difference(camada)
    return regiao


# ---------- blocos vetoriais ----------

def quantizar_anel(coords):
    q = np.round(np.asarray(coords)[:, :2] * ESCALA_VETOR).astype(np.int64)
    manter = np.ones(len(q), dtype=bool)
    manter[1:] = np.any(q[1:] != q[:-1], axis=1)
    q = q[manter]
    if len(q) < 4:
        return None
    d = np.diff(q, axis=0)
    return [int(q[0, 0]), int(q[0, 1])] + d.reshape(-1).tolist()


def poligonos_para_json(geom):
    saida = []
    for p in partes_poligonais(geom):
        aneis = [quantizar_anel(p.exterior.coords)] + [quantizar_anel(i.coords) for i in p.interiors]
        if aneis[0] is None:
            continue
        saida.append([a for a in aneis if a is not None])
    return saida


def gerar_vetor(nome_bioma, sigla, caminho_shp, celulas_uf, caixa_uf, escrever, estat):
    """Recorta os polígonos do bioma pelas células de CELULA_VETOR que tocam a UF."""
    _, linhas = L.ler_dbf(caminho_shp[:-4] + '.dbf')
    chave_id = 'id' if 'id' in linhas[0] else 'objectid'
    geoms, regs = [], []
    invalidos = 0
    for i, _cx, aneis in L.iterar_poligonos(caminho_shp, caixa_uf):
        for a in aneis:
            if len(a) < 4:
                continue
            g = shapely.Polygon(a)
            if not g.is_valid:
                invalidos += 1
                g = shapely.make_valid(g)
            for p in partes_poligonais(g):
                geoms.append(p)
                regs.append(i)
    print('  %s: %d anéis na caixa da UF; %d inválidos corrigidos' % (nome_bioma, len(geoms), invalidos), file=sys.stderr)
    geoms = np.array(geoms, dtype=object)
    regs = np.array(regs, dtype=np.int64)
    passo = CELULA_VETOR
    ix0, iy0 = math.floor(caixa_uf[0] / passo), math.floor(caixa_uf[1] / passo)
    ix1, iy1 = math.ceil(caixa_uf[2] / passo), math.ceil(caixa_uf[3] / passo)

    def folha(g, r, ix, iy):
        if (ix, iy) not in celulas_uf or len(g) == 0:
            return
        feicoes = []
        for reg in np.unique(r):
            regiao = combinar_por_aninhamento(list(g[r == reg]))
            pol = poligonos_para_json(regiao)
            if not pol:
                continue
            l = linhas[reg]
            d = l['ctotal4inv']
            feicoes.append({
                'id': int(l[chave_id]), 'c_pret': l['c_pretvizi'], 'c_pretorig': l['c_pretorig'], 'categ': l['categvizi'],
                'd': None if d is None else round(d, 4),
                'cagb': l['cagb'], 'cbgb': l['cbgb'], 'cdw': l['cdw'], 'clitter': l['clitter'],
                'pol': pol
            })
            if d:
                e = estat[(nome_bioma, l['c_pretvizi'])]
                a = area_ha_aprox(regiao)
                e[0] += a
                e[1] += a * d
        if feicoes:
            caixa = [round(ix * passo, 6), round(iy * passo, 6), round((ix + 1) * passo, 6), round((iy + 1) * passo, 6)]
            escrever('%sv_%d_%d' % (sigla, ix + round(180 / passo), iy + round(90 / passo)), nome_bioma, 'vetor', caixa,
                     {'escala': ESCALA_VETOR, 'campo': 'ctotal4inv', 'feicoes': feicoes})

    def dividir(g, r, a0, b0, a1, b1):
        if len(g) == 0:
            return
        if not any((ix, iy) in celulas_uf for ix in range(a0, a1) for iy in range(b0, b1)):
            return
        if a1 - a0 == 1 and b1 - b0 == 1:
            folha(g, r, a0, b0)
            return
        if a1 - a0 >= b1 - b0:
            m = (a0 + a1) // 2
            metades = [(a0, b0, m, b1), (m, b0, a1, b1)]
        else:
            m = (b0 + b1) // 2
            metades = [(a0, b0, a1, m), (a0, m, a1, b1)]
        lim = shapely.bounds(g)
        for (c0, d0, c1, d1) in metades:
            x0, y0, x1, y1 = c0 * passo, d0 * passo, c1 * passo, d1 * passo
            toca = (lim[:, 0] < x1) & (lim[:, 2] > x0) & (lim[:, 1] < y1) & (lim[:, 3] > y0)
            dentro = toca & (lim[:, 0] >= x0) & (lim[:, 2] <= x1) & (lim[:, 1] >= y0) & (lim[:, 3] <= y1)
            cruza = toca & ~dentro
            novos, novos_r = list(g[dentro]), list(r[dentro])
            if cruza.any():
                cortes = shapely.clip_by_rect(g[cruza], x0, y0, x1, y1)
                for corte, reg in zip(cortes, r[cruza]):
                    for p in partes_poligonais(corte):
                        novos.append(p)
                        novos_r.append(reg)
            dividir(np.array(novos, dtype=object), np.array(novos_r, dtype=np.int64), c0, d0, c1, d1)

    dividir(geoms, regs, ix0, iy0, ix1, iy1)
    return invalidos


# ---------- blocos raster (Amazônia) ----------

def gerar_raster_amazonia(pasta, uf_geom, caixa_uf, escrever, estat):
    import rasterio
    from rasterio import features, windows

    tif = os.path.join(pasta, 'CarbonoVeg_Amazonia_total_tiff_4inventario.tif')
    with rasterio.open(tif) as ds:
        if ds.nodata != -9999.0 or ds.dtypes[0] != 'float32':
            raise SystemExit('TIFF diferente do validado na Fase 0 (nodata/tipo).')
        t = ds.transform
        passo = t.a
        if abs(t.a + t.e) > 1e-12:
            raise SystemExit('Pixel não quadrado.')
        jan = windows.from_bounds(*caixa_uf, transform=t).round_offsets().round_lengths()
        jan = jan.intersection(windows.Window(0, 0, ds.width, ds.height))
        c0, l0, nc, nl = int(jan.col_off), int(jan.row_off), int(jan.width), int(jan.height)
        valores = ds.read(1, window=jan)
        tj = ds.window_transform(jan)
    # Banda de classe: c_pretvizi do vetor da Amazônia, na mesma grade. Um pixel
    # recebe a classe se o centro cai em número ímpar de anéis dessa classe.
    por_classe = collections.defaultdict(list)
    categoria = {}
    invalidos = 0
    for dbf in sorted(glob.glob(os.path.join(pasta, 'amazonia_carbono_vegetacao_*.dbf'))):
        shp = dbf[:-4] + '.shp'
        cx = L.caixa_do_arquivo(shp)
        if cx[0] > caixa_uf[2] or cx[2] < caixa_uf[0] or cx[1] > caixa_uf[3] or cx[3] < caixa_uf[1]:
            continue
        _, linhas = L.ler_dbf(dbf)
        for i, _c, aneis in L.iterar_poligonos(shp, caixa_uf):
            cls = linhas[i]['c_pretvizi']
            categoria[cls] = linhas[i]['categvizi']
            for a in aneis:
                if len(a) >= 4:
                    por_classe[cls].append(a)
    legenda = [''] + sorted(por_classe)
    classes = np.zeros((nl, nc), dtype=np.uint8)
    for cod, cls in enumerate(legenda):
        if cod == 0:
            continue
        conta = np.zeros((nl, nc), dtype=np.uint8)
        lote, pontos = [], 0
        aneis_cls = por_classe[cls]
        for n, a in enumerate(aneis_cls):
            lote.append(({'type': 'Polygon', 'coordinates': [a[:, :2].tolist()]}, 1))
            pontos += len(a)
            if pontos > 400000 or n == len(aneis_cls) - 1:
                conta += features.rasterize(lote, out_shape=(nl, nc), transform=tj, fill=0, dtype='uint8',
                                            merge_alg=rasterio.enums.MergeAlg.add)
                lote, pontos = [], 0
        classes[(conta % 2 == 1) & (classes == 0)] = cod
    print('  Amazônia: janela de %d × %d pixels; %d classes' % (nc, nl, len(legenda) - 1), file=sys.stderr)

    inteiro = np.full(valores.shape, SEM_DADO_RASTER, dtype=np.uint16)
    valido = valores != -9999.0
    inteiro[valido] = np.clip(np.round(valores[valido] * ESCALA_RASTER), 0, SEM_DADO_RASTER - 1).astype(np.uint16)

    # estatística por classe (pixels com valor > 0), ponderada pela área do pixel
    lat = tj.f + (np.arange(nl) + 0.5) * tj.e
    peso = np.cos(np.radians(lat))[:, None] * np.ones((1, nc))
    grau = math.pi / 180 * RAIO_TERRA
    ha_pixel = passo * passo * grau * grau / 10000
    usar = valido & (valores > 0) & (classes > 0)
    for cod, cls in enumerate(legenda):
        if cod == 0:
            continue
        m = usar & (classes == cod)
        if m.any():
            e = estat[('Amazônia', cls)]
            e[0] += float(peso[m].sum() * ha_pixel)
            e[1] += float((peso[m] * valores[m]).sum() * ha_pixel)

    # células de 1 grau: cada pixel pertence à célula em que está o seu centro
    x_centro = tj.c + (np.arange(nc) + 0.5) * tj.a
    y_centro = lat
    cel_x = np.floor(x_centro / CELULA_RASTER).astype(int)
    cel_y = np.floor(y_centro / CELULA_RASTER).astype(int)
    for cx_ in np.unique(cel_x):
        cols = np.where(cel_x == cx_)[0]
        for cy_ in np.unique(cel_y):
            lins = np.where(cel_y == cy_)[0]
            caixa_cel = shapely.box(cx_ * CELULA_RASTER, cy_ * CELULA_RASTER, (cx_ + 1) * CELULA_RASTER, (cy_ + 1) * CELULA_RASTER)
            if not caixa_cel.intersects(uf_geom):
                continue
            v = inteiro[lins[0]:lins[-1] + 1, cols[0]:cols[-1] + 1]
            if not (v != SEM_DADO_RASTER).any():
                continue
            k = classes[lins[0]:lins[-1] + 1, cols[0]:cols[-1] + 1]
            x0 = tj.c + cols[0] * tj.a
            y0 = tj.f + lins[0] * tj.e
            caixa = [x0, y0 + len(lins) * tj.e, x0 + len(cols) * tj.a, y0]
            escrever('amr_%d_%d' % (cx_ + 180, cy_ + 90), 'Amazônia', 'raster', [round(c, 9) for c in caixa], {
                'campo': 'ctotal4inv', 'x0': x0, 'y0': y0, 'passo': passo,
                'colunas': int(len(cols)), 'linhas': int(len(lins)),
                'escala': ESCALA_RASTER, 'sem_dado': SEM_DADO_RASTER,
                'legenda': [[cls, categoria.get(cls, '')] for cls in legenda],
                'valores': v.reshape(-1).tolist(), 'classes': k.reshape(-1).tolist()
            })
    return {'tif': tif, 'janela': [c0, l0, nc, nl], 'passo': passo, 'legenda': legenda,
            'valores': valores, 'classes': classes, 'transform': tj}


# ---------- tabela por município ----------

def tabela_municipios(municipios, raster, vetores, saida):
    """Município × c_pret → área (ha) e D médio (tC/ha), só onde há dado (D > 0)."""
    from rasterio import features
    acum = collections.defaultdict(lambda: [0.0, 0.0])
    if raster:
        tj, valores, classes, legenda = raster['transform'], raster['valores'], raster['classes'], raster['legenda']
        nl, nc = valores.shape
        indice = features.rasterize([(m[2].__geo_interface__, k + 1) for k, m in enumerate(municipios)],
                                    out_shape=(nl, nc), transform=tj, fill=0, dtype='uint16')
        lat = tj.f + (np.arange(nl) + 0.5) * tj.e
        grau = math.pi / 180 * RAIO_TERRA
        ha = (np.cos(np.radians(lat)) * raster['passo'] ** 2 * grau * grau / 10000)[:, None] * np.ones((1, nc))
        usar = (valores > 0) & (classes > 0) & (indice > 0)
        chave = indice[usar].astype(np.int64) * 1000 + classes[usar]
        ordem = np.argsort(chave, kind='stable')
        chave, a, v = chave[ordem], ha[usar][ordem], valores[usar][ordem].astype(np.float64)
        unicos, inicio = np.unique(chave, return_index=True)
        soma_a = np.add.reduceat(a, inicio)
        soma_av = np.add.reduceat(a * v, inicio)
        for u, sa, sav in zip(unicos, soma_a, soma_av):
            m = municipios[int(u // 1000) - 1]
            e = acum[(m[0], m[1], 'Amazônia', legenda[int(u % 1000)])]
            e[0] += float(sa)
            e[1] += float(sav)
    for nome_bioma, caminho, caixa in vetores:
        _, linhas = L.ler_dbf(caminho[:-4] + '.dbf')
        arvore = shapely.STRtree([m[2] for m in municipios])
        for i, _cx, aneis in L.iterar_poligonos(caminho, caixa):
            d = linhas[i]['ctotal4inv']
            if not d:
                continue
            g = geometria_de_aneis(aneis)
            for k in arvore.query(g, predicate='intersects'):
                a = area_ha_aprox(g.intersection(municipios[k][2]))
                if a > 0:
                    e = acum[(municipios[k][0], municipios[k][1], nome_bioma, linhas[i]['c_pretvizi'])]
                    e[0] += a
                    e[1] += a * d
    linhas_saida = [{'geocodigo': k[0], 'municipio': k[1], 'bioma': k[2], 'c_pret': k[3],
                     'area_ha': round(v[0], 2), 'd_tC_ha': round(v[1] / v[0], 2)}
                    for k, v in sorted(acum.items()) if v[0] >= 1]
    with open(os.path.join(saida, 'municipio_cpret.csv'), 'w', encoding='utf-8') as f:
        f.write('geocodigo;municipio;bioma;c_pret;area_ha;d_tC_ha\n')
        for l in linhas_saida:
            f.write('%(geocodigo)s;%(municipio)s;%(bioma)s;%(c_pret)s;%(area_ha).2f;%(d_tC_ha).2f\n' % l)
    return linhas_saida


# ---------- principal ----------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--uf', required=True, choices=sorted(CODIGO_UF))
    ap.add_argument('--versao', default='v1')
    ap.add_argument('--amazonia', help='pasta com o TIFF e o shapefile da vegetação pretérita da Amazônia')
    ap.add_argument('--cerrado', help='cerrado_carbono_vegetacao_preterita.shp')
    ap.add_argument('--pantanal', help='pantanal_carbono_vegetacao_preterita.shp')
    ap.add_argument('--municipios', required=True, help='pasta com as malhas *_municipios_ibge_2016')
    ap.add_argument('--saida', required=True, help='pasta de saída (recebe <versao>/...)')
    ap.add_argument('--data-download', default='', help='data do download dos arquivos do INPE (AAAA-MM-DD)')
    args = ap.parse_args()

    gerado_em = datetime.date.today().isoformat()
    raiz = os.path.join(args.saida, args.versao)
    os.makedirs(os.path.join(raiz, 'blocos'), exist_ok=True)

    print('Municípios de %s...' % args.uf, file=sys.stderr)
    municipios = carregar_municipios(args.municipios, args.uf)
    uf_geom = shapely.union_all([m[2] for m in municipios])
    caixa_uf = uf_geom.bounds
    print('  %d municípios; caixa %s' % (len(municipios), [round(c, 3) for c in caixa_uf]), file=sys.stderr)
    passo = CELULA_VETOR
    celulas_uf = set()
    for ix in range(math.floor(caixa_uf[0] / passo), math.ceil(caixa_uf[2] / passo)):
        for iy in range(math.floor(caixa_uf[1] / passo), math.ceil(caixa_uf[3] / passo)):
            if shapely.box(ix * passo, iy * passo, (ix + 1) * passo, (iy + 1) * passo).intersects(uf_geom):
                celulas_uf.add((ix, iy))

    indice = []
    estat = collections.defaultdict(lambda: [0.0, 0.0])

    def escrever(chave, bioma, formato, caixa, conteudo):
        bloco = {'versao': args.versao, 'gerado_em': gerado_em, 'chave': chave, 'bioma': bioma, 'formato': formato, 'bbox': caixa}
        bloco.update(conteudo)
        bruto = json.dumps(bloco, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        comprimido = gzip.compress(bruto, compresslevel=9, mtime=0)
        with open(os.path.join(raiz, 'blocos', chave + '.gz'), 'wb') as f:
            f.write(comprimido)
        indice.append({'chave': chave, 'bioma': bioma, 'formato': formato, 'bbox': caixa,
                       'bytes': len(comprimido), 'sha256': hashlib.sha256(comprimido).hexdigest()})

    fontes, corrigidas, raster, vetores = [], {}, None, []
    if args.amazonia:
        print('Amazônia (raster)...', file=sys.stderr)
        raster = gerar_raster_amazonia(args.amazonia, uf_geom, caixa_uf, escrever, estat)
        fontes.append(descrever_fonte('Amazônia', raster['tif'], 'Carbono%20da%20Vegeta%C3%A7%C3%A3o%20Pret%C3%A9rita/Amazonia/CarbonoVeg_Amazonia_total_tiff_4inventario.tif'))
        fontes.append({'bioma': 'Amazônia', 'uso': 'banda de classe (c_pretvizi)',
                       'url': URL_BASE + 'Carbono%20da%20Vegeta%C3%A7%C3%A3o%20Pret%C3%A9rita/Amazonia/CarbonoVeg_Amazonia_comp_shp_4inventario.zip',
                       'modificado_no_servidor': '2021-06-25'})
    for nome, sigla, caminho, url in (
            ('Cerrado', 'ce', args.cerrado, 'Carbono%20da%20Vegeta%C3%A7%C3%A3o%20Pret%C3%A9rita/Cerrado/CarbonoVeg_Cerrado_4inventario.rar'),
            ('Pantanal', 'pa', args.pantanal, 'Carbono%20da%20Vegeta%C3%A7%C3%A3o%20Pret%C3%A9rita/Pantanal/CarbonoVeg_Pantanal_4inventario.rar')):
        if not caminho:
            continue
        print('%s (vetor)...' % nome, file=sys.stderr)
        corrigidas[nome] = gerar_vetor(nome, sigla, caminho, celulas_uf, caixa_uf, escrever, estat)
        vetores.append((nome, caminho, caixa_uf))
        fontes.append(descrever_fonte(nome, caminho, url))

    print('Tabela por município...', file=sys.stderr)
    por_municipio = tabela_municipios(municipios, raster, vetores, raiz)

    indice.sort(key=lambda b: b['chave'])
    maior = max(indice, key=lambda b: b['bytes'])
    if maior['bytes'] > LIMITE_BLOCO:
        print('ATENÇÃO: bloco %s tem %d bytes, acima do limite.' % (maior['chave'], maior['bytes']), file=sys.stderr)
    biomas = sorted({b['bioma'] for b in indice})

    def gravar(nome, obj):
        with open(os.path.join(raiz, nome), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':') if nome != 'versao.json' and nome != 'fonte.json' else None,
                      indent=None if nome not in ('versao.json', 'fonte.json') else 1)

    gravar('indice.json', {'versao': args.versao, 'gerado_em': gerado_em, 'blocos': indice})
    gravar('versao.json', {
        'versao': args.versao, 'gerado_em': gerado_em, 'ufs': [args.uf], 'biomas': biomas,
        'data_download': args.data_download,
        'campo': 'ctotal4inv', 'unidade': 'tC/ha',
        'celula_graus': {'raster': CELULA_RASTER, 'vetor': CELULA_VETOR},
        'blocos': len(indice), 'bytes': sum(b['bytes'] for b in indice),
        'fonte': 'Quarto Inventário Nacional de Emissões (MCTI/INPE), Carbono da Vegetação Pretérita; dados públicos, sem licença nomeada; citar a fonte',
        'fontes': fontes
    })
    gravar('fonte.json', {
        'versao': args.versao, 'gerado_em': gerado_em, 'data_download': args.data_download, 'uf': args.uf,
        'parametros': {'celula_raster_graus': CELULA_RASTER, 'celula_vetor_graus': CELULA_VETOR,
                       'escala_raster': ESCALA_RASTER, 'sem_dado_raster': SEM_DADO_RASTER, 'escala_vetor': ESCALA_VETOR},
        'geometrias_corrigidas': corrigidas, 'fontes': fontes,
        'blocos': len(indice), 'maior_bloco': {'chave': maior['chave'], 'bytes': maior['bytes']},
        'estatistica_por_classe': [{'bioma': k[0], 'c_pret': k[1], 'area_ha': round(v[0], 1), 'd_medio_tC_ha': round(v[1] / v[0], 2)}
                                   for k, v in sorted(estat.items()) if v[0] > 0]
    })
    gravar('municipio_cpret.json', {'versao': args.versao, 'gerado_em': gerado_em, 'uf': args.uf, 'campo': 'ctotal4inv',
                                    'colunas': ['geocodigo', 'municipio', 'bioma', 'c_pret', 'area_ha', 'd_tC_ha'],
                                    'linhas': [[l['geocodigo'], l['municipio'], l['bioma'], l['c_pret'], l['area_ha'], l['d_tC_ha']] for l in por_municipio]})
    print('%d blocos, %.1f MB; maior: %s (%d bytes)' % (len(indice), sum(b['bytes'] for b in indice) / 1e6, maior['chave'], maior['bytes']), file=sys.stderr)


def descrever_fonte(bioma, caminho, url_relativa):
    m = datetime.date.fromtimestamp(os.path.getmtime(caminho)).isoformat()
    return {'bioma': bioma, 'uso': 'estoque (ctotal4inv)', 'arquivo': os.path.basename(caminho), 'bytes': os.path.getsize(caminho),
            'url': URL_BASE + url_relativa, 'modificado_no_servidor': '2021-06-25', 'data_do_arquivo_local': m}


if __name__ == '__main__':
    main()
