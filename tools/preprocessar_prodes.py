#!/usr/bin/env python3
"""DAMNUM 7.4: blocos do PRODES e do DETER (INPE) para a sugestão da data do dano.

Baixa do serviço aberto do TerraBrasilis (WFS) os polígonos de uma UF, recorta por
células de 0,25 grau e grava blocos no mesmo formato vetorial dos blocos do mapa de
vegetação. O navegador de quem usa o DAMNUM baixa só os blocos que tocam o polígono
do caso e cruza ali mesmo: nada do caso vai ao INPE nem a servidor nosso.

Camadas (EPSG:4674, coordenadas com 4 casas decimais, cerca de 11 m):
  PRODES Amazônia Legal, Cerrado e Pantanal: incremento anual, com o ano PRODES
    (agosto a julho) e a data da imagem em que a supressão foi mapeada;
  DETER Amazônia e Cerrado: alertas, com a data da imagem e a classe (corte raso,
    degradação, cicatriz de queimada etc.).

Depende de shapely e numpy (o venv de _insumos_v7 já os tem).

Exemplo:
  _insumos_v7/venv/bin/python tools/preprocessar_prodes.py --uf MT \
      --bruto _insumos_v7/prodes_bruto --saida _insumos_v7/publicar/prodes --versao 2026-11
"""
import argparse
import collections
import datetime
import gzip
import hashlib
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
import shapely

SERVICO = 'https://terrabrasilis.dpi.inpe.br/geoserver'
NOME_UF = {'MT': 'MATO GROSSO'}
# fonte: 'P' (PRODES) ou 'D' (DETER). `uf` diz como a camada escreve o estado.
CAMADAS = [
    {'chave': 'prodes_amz', 'fonte': 'P', 'rotulo': 'PRODES Amazônia Legal', 'ws': 'prodes-legal-amz', 'camada': 'yearly_deforestation',
     'campo_uf': 'state', 'uf': 'sigla', 'ordem': 'fid', 'campos': 'year,image_date,geom'},
    {'chave': 'prodes_cerrado', 'fonte': 'P', 'rotulo': 'PRODES Cerrado', 'ws': 'prodes-cerrado-nb', 'camada': 'yearly_deforestation',
     'campo_uf': 'state', 'uf': 'nome', 'ordem': 'fid', 'campos': 'year,image_date,geom'},
    {'chave': 'prodes_pantanal', 'fonte': 'P', 'rotulo': 'PRODES Pantanal', 'ws': 'prodes-pantanal-nb', 'camada': 'yearly_deforestation',
     'campo_uf': 'state', 'uf': 'sigla', 'ordem': 'fid', 'campos': ''},  # esta camada devolve erro quando se pede lista de campos
    {'chave': 'deter_amz', 'fonte': 'D', 'rotulo': 'DETER Amazônia', 'ws': 'deter-amz', 'camada': 'deter_amz',
     'campo_uf': 'uf', 'uf': 'sigla', 'ordem': 'gid', 'campos': 'classname,view_date,geom'},
    {'chave': 'deter_cerrado', 'fonte': 'D', 'rotulo': 'DETER Cerrado', 'ws': 'deter-cerrado-nb', 'camada': 'deter_cerrado',
     'campo_uf': 'uf', 'uf': 'sigla', 'ordem': 'gid', 'campos': 'classname,view_date,geom'},
]
PAGINA = 10000
CELULA = 0.25
ESCALA = 10000  # graus × 1e4: a precisão que o serviço entrega


def baixar_pagina(c, uf, inicio, destino):
    valor_uf = uf if c['uf'] == 'sigla' else NOME_UF[uf]
    parametros = {
        'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature',
        'typeName': '%s:%s' % (c['ws'], c['camada']), 'outputFormat': 'application/json',
        'count': PAGINA, 'startIndex': inicio, 'sortBy': c['ordem'],
        'CQL_FILTER': "%s='%s'" % (c['campo_uf'], valor_uf)}
    if c['campos']:
        parametros['propertyName'] = c['campos']
    for tentativa in range(6):
        url = '%s/%s/%s/ows?%s' % (SERVICO, c['ws'], c['camada'], urllib.parse.urlencode(parametros))
        try:
            pedido = urllib.request.Request(url, headers={'User-Agent': 'preprocessador-de-blocos/1.0'})
            with urllib.request.urlopen(pedido, timeout=300) as r:
                dados = r.read()
            json.loads(dados)  # confere que veio inteiro
            with gzip.open(destino + '.parcial', 'wb') as f:
                f.write(dados)
            os.replace(destino + '.parcial', destino)
            return
        except urllib.error.HTTPError as erro:
            # Algumas camadas devolvem erro 400 quando se pede lista de campos: pede tudo.
            if erro.code == 400 and 'propertyName' in parametros:
                del parametros['propertyName']
                continue
            print('    falha (%s), tentativa %d' % (erro, tentativa + 1), file=sys.stderr)
            time.sleep(10 * (tentativa + 1))
        except Exception as erro:  # rede instável: espera e tenta de novo
            print('    falha (%s), tentativa %d' % (erro, tentativa + 1), file=sys.stderr)
            time.sleep(10 * (tentativa + 1))
    raise SystemExit('Não consegui baixar ' + url)


def baixar(c, uf, pasta):
    """Baixa a camada inteira em páginas; páginas já baixadas são reaproveitadas."""
    os.makedirs(pasta, exist_ok=True)
    arquivos, inicio = [], 0
    while True:
        destino = os.path.join(pasta, '%s_%s_%07d.json.gz' % (c['chave'], uf, inicio))
        if not os.path.exists(destino):
            baixar_pagina(c, uf, inicio, destino)
        with gzip.open(destino, 'rb') as f:
            n = len(json.load(f)['features'])
        arquivos.append(destino)
        print('  %s: %d feições a partir de %d' % (c['chave'], n, inicio), file=sys.stderr)
        if n < PAGINA:
            return arquivos
        inicio += PAGINA


def partes(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g] if g.area > 0 else []
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return [p for parte in g.geoms for p in partes(parte)]
    return []


def quantizar(coords):
    q = np.round(np.asarray(coords)[:, :2] * ESCALA).astype(np.int64)
    manter = np.ones(len(q), dtype=bool)
    manter[1:] = np.any(q[1:] != q[:-1], axis=1)
    q = q[manter]
    if len(q) < 4:
        return None
    d = np.diff(q, axis=0)
    return [int(q[0, 0]), int(q[0, 1])] + d.reshape(-1).tolist()


def para_json(geom):
    saida = []
    for p in partes(geom):
        aneis = [quantizar(p.exterior.coords)] + [quantizar(i.coords) for i in p.interiors]
        if aneis[0] is None:
            continue
        saida.append([a for a in aneis if a is not None])
    return saida


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--uf', default='MT')
    ap.add_argument('--bruto', required=True, help='pasta das páginas baixadas (reaproveitadas se existirem)')
    ap.add_argument('--saida', required=True, help='pasta "prodes" do site de dados')
    ap.add_argument('--versao', default=datetime.date.today().strftime('%Y-%m'))
    args = ap.parse_args()

    celulas = collections.defaultdict(list)
    hoje_iso = datetime.date.today().isoformat()
    fontes, total = [], 0
    for c in CAMADAS:
        arquivos = baixar(c, args.uf, args.bruto)
        n, invalidos, mais_recente, futuras = 0, 0, '', 0
        for arq in arquivos:
            with gzip.open(arq, 'rb') as f:
                feicoes = json.load(f)['features']
            for ft in feicoes:
                if not ft.get('geometry'):
                    continue
                p = ft['properties']
                data = (p.get('image_date') or p.get('view_date') or '')[:10]
                # Data depois de hoje é erro de digitação na origem: fica só o ano.
                if data > hoje_iso:
                    data = ''
                    futuras += 1
                registro = {'f': c['fonte'], 'o': c['chave']}
                if c['fonte'] == 'P':
                    if not p.get('year'):
                        continue
                    registro['a'] = int(p['year'])
                else:
                    if not data:
                        continue
                    registro['c'] = p.get('classname') or ''
                if data:
                    registro['d'] = data
                    mais_recente = max(mais_recente, data)
                g = shapely.geometry.shape(ft['geometry'])
                if not g.is_valid:
                    invalidos += 1
                    try:
                        g = shapely.make_valid(g)
                    except shapely.errors.GEOSException:
                        g = g.buffer(0)  # geometria que o make_valid não resolve
                if g.is_empty:
                    continue
                x0, y0, x1, y1 = g.bounds
                for ix in range(math.floor(x0 / CELULA), math.floor(x1 / CELULA) + 1):
                    for iy in range(math.floor(y0 / CELULA), math.floor(y1 / CELULA) + 1):
                        corte = shapely.clip_by_rect(g, ix * CELULA, iy * CELULA, (ix + 1) * CELULA, (iy + 1) * CELULA)
                        pol = para_json(corte)
                        if pol:
                            celulas[(ix, iy)].append(dict(registro, pol=pol))
                n += 1
        total += n
        fontes.append({'chave': c['chave'], 'rotulo': c['rotulo'], 'camada': '%s:%s' % (c['ws'], c['camada']), 'feicoes': n,
                       'invalidas_corrigidas': invalidos, 'datas_futuras_descartadas': futuras, 'data_mais_recente': mais_recente})
        print('%s: %d feições, %d inválidas corrigidas, %d datas futuras descartadas, mais recente %s' % (c['chave'], n, invalidos, futuras, mais_recente), file=sys.stderr)

    versao = 'prodes/' + args.versao
    pasta = os.path.join(args.saida, args.versao)
    os.makedirs(os.path.join(pasta, 'blocos'), exist_ok=True)
    indice, tamanho, maior = [], 0, 0
    for (ix, iy), feicoes in sorted(celulas.items()):
        chave = 'pd_%d_%d' % (ix + round(180 / CELULA), iy + round(90 / CELULA))
        caixa = [round(ix * CELULA, 6), round(iy * CELULA, 6), round((ix + 1) * CELULA, 6), round((iy + 1) * CELULA, 6)]
        for i, ft in enumerate(feicoes):
            ft['id'] = i
        corpo = json.dumps({'chave': chave, 'bioma': '', 'formato': 'vetor', 'bbox': caixa, 'escala': ESCALA, 'tema': 'supressao', 'feicoes': feicoes},
                           ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        dados = gzip.compress(corpo, 9, mtime=0)
        with open(os.path.join(pasta, 'blocos', chave + '.gz'), 'wb') as f:
            f.write(dados)
        indice.append({'chave': chave, 'bioma': '', 'formato': 'vetor', 'bbox': caixa, 'bytes': len(dados), 'sha256': hashlib.sha256(dados).hexdigest()})
        tamanho += len(dados)
        maior = max(maior, len(dados))
    hoje = datetime.date.today().isoformat()
    with open(os.path.join(pasta, 'indice.json'), 'w') as f:
        json.dump({'versao': versao, 'gerado_em': hoje, 'blocos': indice}, f, separators=(',', ':'))
    info = {'versao': versao, 'gerado_em': hoje, 'uf': [args.uf], 'servico': SERVICO, 'fontes': fontes,
            'precisao': 'coordenadas com 4 casas decimais (cerca de 11 m), como o serviço entrega'}
    with open(os.path.join(pasta, 'versao.json'), 'w') as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    with open(os.path.join(args.saida, 'atual.json'), 'w') as f:
        json.dump({'versao': versao, 'gerado_em': hoje, 'uf': [args.uf], 'fontes': fontes}, f, ensure_ascii=False, indent=1)
    print('%d feições em %d blocos, %.1f MB no total, maior bloco %.2f MB' % (total, len(indice), tamanho / 1e6, maior / 1e6), file=sys.stderr)


if __name__ == '__main__':
    main()
