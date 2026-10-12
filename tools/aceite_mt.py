#!/usr/bin/env python3
"""Aceite da versão 7.1 com dados reais de Mato Grosso: cálculo independente do
estoque (D) sobre os arquivos ORIGINAIS do INPE, sem passar pelos blocos.

Método: grade densa de pontos dentro do polígono (estatística zonal por
amostragem). Em cada ponto, o valor vem do pixel do TIFF da Amazônia ou, fora
dele, do polígono do vetor do Cerrado ou do Pantanal que contém o ponto (regra
par-ímpar aplicada direto aos anéis do shapefile). Não usa QGIS nem os blocos.

Uso: aceite_mt.py casos.json --amazonia PASTA --cerrado ARQ.shp --pantanal ARQ.shp --saida esperado.json
"""
import argparse
import json
import math
import os
import sys

import numpy as np
import rasterio
import shapely

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shp_leitor as L  # noqa: E402

N = 500  # pontos por lado da grade


def valores_do_vetor(caminho, xs, ys):
    """Para cada ponto, (c_pretvizi, ctotal4inv) do registro que o contém, ou None."""
    _, linhas = L.ler_dbf(caminho[:-4] + '.dbf')
    saida = [None] * len(xs)
    caixa = (xs.min(), ys.min(), xs.max(), ys.max())
    for i, cx, aneis in L.iterar_poligonos(caminho, caixa):
        cand = np.where((xs >= cx[0]) & (xs <= cx[2]) & (ys >= cx[1]) & (ys <= cx[3]))[0]
        if len(cand) == 0:
            continue
        par = np.zeros(len(cand), dtype=int)
        for a in aneis:
            if len(a) < 4:
                continue
            m = (xs[cand] >= a[:, 0].min()) & (xs[cand] <= a[:, 0].max()) & (ys[cand] >= a[:, 1].min()) & (ys[cand] <= a[:, 1].max())
            if m.any():
                par[m] += shapely.contains_xy(shapely.Polygon(a), xs[cand][m], ys[cand][m]).astype(int)
        for k, c in zip(par, cand):
            if k % 2 == 1:
                saida[c] = (linhas[i]['c_pretvizi'], linhas[i]['ctotal4inv'])
    return saida


def avaliar(xs, ys, args):
    """Devolve por ponto: (fonte, classe, d). d None = fora; d 0 = sem dado."""
    res = [None] * len(xs)
    with rasterio.open(os.path.join(args.amazonia, 'CarbonoVeg_Amazonia_total_tiff_4inventario.tif')) as ds:
        vals = np.array([v[0] for v in ds.sample(list(zip(xs, ys)))])
    no_raster = vals != -9999.0
    vet = {}
    for nome, caminho in (('Cerrado', args.cerrado), ('Pantanal', args.pantanal)):
        vet[nome] = valores_do_vetor(caminho, xs, ys)
    duplos = 0
    for k in range(len(xs)):
        achados = []
        if no_raster[k]:
            achados.append(('Amazônia', '', float(vals[k])))
        for nome in vet:
            if vet[nome][k] is not None:
                achados.append((nome, vet[nome][k][0], vet[nome][k][1] or 0.0))
        if len(achados) > 1:
            duplos += 1
        res[k] = achados
    return res, duplos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('casos')
    ap.add_argument('--amazonia', required=True)
    ap.add_argument('--cerrado', required=True)
    ap.add_argument('--pantanal', required=True)
    ap.add_argument('--saida', required=True)
    args = ap.parse_args()
    casos = json.load(open(args.casos, encoding='utf-8'))
    saida = {'metodo': 'grade de %d × %d pontos sobre os arquivos originais do INPE' % (N, N), 'poligonos': [], 'coordenadas': []}
    for p in casos['poligonos']:
        g = shapely.Polygon(p['coords'][0], p['coords'][1:])
        x0, y0, x1, y1 = g.bounds
        gx, gy = np.meshgrid(x0 + (np.arange(N) + 0.5) * (x1 - x0) / N, y0 + (np.arange(N) + 0.5) * (y1 - y0) / N)
        gx, gy = gx.ravel(), gy.ravel()
        dentro = shapely.contains_xy(g, gx, gy)
        xs, ys = gx[dentro], gy[dentro]
        res, duplos = avaliar(xs, ys, args)
        peso = np.cos(np.radians(ys))
        soma_p = soma_pd = sem = fora = 0.0
        for k, achados in enumerate(res):
            # Em sobreposição entre o raster e um vetor, vale o vetor (regra do cliente).
            vetor = [a for a in achados if a[0] != 'Amazônia']
            usar = vetor[0] if vetor else (achados[0] if achados else None)
            if usar and usar[2] and usar[2] > 0:
                soma_p += peso[k]
                soma_pd += peso[k] * usar[2]
            elif achados:
                sem += peso[k]
            else:
                fora += peso[k]
        total = peso.sum()
        saida['poligonos'].append({'nome': p['nome'], 'pontos': int(len(xs)), 'd': soma_pd / soma_p if soma_p else None,
                                   'pct_sem_dado': 100 * sem / total, 'pct_fora': 100 * fora / total,
                                   'pontos_em_duas_fontes': duplos})
        print(p['nome'], saida['poligonos'][-1], file=sys.stderr)
    xs = np.array([c['lon'] for c in casos['coordenadas']])
    ys = np.array([c['lat'] for c in casos['coordenadas']])
    res, _ = avaliar(xs, ys, args)
    for c, achados in zip(casos['coordenadas'], res):
        saida['coordenadas'].append({'nome': c['nome'], 'lon': c['lon'], 'lat': c['lat'],
                                     'achados': [{'bioma': a[0], 'c_pret': a[1], 'd': a[2]} for a in achados]})
        print(c['nome'], achados, file=sys.stderr)
    json.dump(saida, open(args.saida, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
