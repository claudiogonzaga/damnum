#!/usr/bin/env python3
"""DAMNUM 7.1: camada leve com os limites dos seis biomas, para identificar o
bioma pelo polígono ou pela coordenada em todo o Brasil. Fonte: malhas municipais
por bioma do Quarto Inventário (IBGE, 2016), unidas por bioma e simplificadas.

Uso: gerar_biomas.py <pasta das malhas *_municipios_ibge_2016> <pasta v1 dos dados>
Grava <v1>/blocos/biomas_br.gz e registra o arquivo e o SHA-256 em <v1>/versao.json.
"""
import gzip
import hashlib
import json
import os
import sys

import shapely

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shp_leitor as L  # noqa: E402
from preprocessar_blocos import geometria_de_aneis, partes_poligonais, quantizar_anel  # noqa: E402

ARQUIVOS = [('Amazônia', 'amazonia'), ('Cerrado', 'cerrado'), ('Mata Atlântica', 'mata_atlantica'),
            ('Caatinga', 'caatinga'), ('Pampa', 'pampa'), ('Pantanal', 'pantanal')]
TOLERANCIA = 0.005  # graus, cerca de 500 m
ESCALA = 100000


def main():
    pasta, raiz = sys.argv[1], sys.argv[2]
    saida = os.path.join(raiz, 'blocos', 'biomas_br.gz')
    biomas = []
    for nome, arq in ARQUIVOS:
        shp = os.path.join(pasta, arq + '_municipios_ibge_2016.shp')
        partes = [geometria_de_aneis(aneis).simplify(0.001) for _i, _c, aneis in L.iterar_poligonos(shp)]
        uniao = shapely.make_valid(shapely.union_all(partes).simplify(TOLERANCIA))
        pol = []
        for p in partes_poligonais(uniao):
            if p.area < 1e-5:
                continue
            aneis = [a for a in [quantizar_anel_escala(p.exterior.coords)] + [quantizar_anel_escala(i.coords) for i in p.interiors if shapely.Polygon(i).area >= 1e-5] if a]
            if aneis:
                pol.append(aneis)
        biomas.append({'nome': nome, 'pol': pol})
        print(nome, len(pol), 'polígonos', file=sys.stderr)
    corpo = {'versao': 'v1', 'escala': ESCALA, 'fonte': 'malhas municipais por bioma do Quarto Inventário (IBGE, 2016), simplificadas a %s grau' % TOLERANCIA, 'biomas': biomas}
    dados = gzip.compress(json.dumps(corpo, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), compresslevel=9, mtime=0)
    with open(saida, 'wb') as f:
        f.write(dados)
    versao = os.path.join(raiz, 'versao.json')
    if os.path.exists(versao):
        v = json.load(open(versao, encoding='utf-8'))
        v['biomas_limites'] = {'arquivo': 'blocos/biomas_br.gz', 'bytes': len(dados), 'sha256': hashlib.sha256(dados).hexdigest(), 'fonte': corpo['fonte']}
        with open(versao, 'w', encoding='utf-8') as f:
            json.dump(v, f, ensure_ascii=False, indent=1)
    print(saida, len(dados), 'bytes', file=sys.stderr)


def quantizar_anel_escala(coords):
    import numpy as np
    q = np.round(np.asarray(coords)[:, :2] * ESCALA).astype(np.int64)
    manter = np.ones(len(q), dtype=bool)
    manter[1:] = np.any(q[1:] != q[:-1], axis=1)
    q = q[manter]
    if len(q) < 4:
        return None
    d = np.diff(q, axis=0)
    return [int(q[0, 0]), int(q[0, 1])] + d.reshape(-1).tolist()


if __name__ == '__main__':
    main()
