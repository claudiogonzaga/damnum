#!/usr/bin/env python3
"""Liga cada código c_pret do mapa do QCN à linha bioma + sigla da tabela por
fitofisionomia e confere os estoques.

Uso: crosswalk_c_pret.py atributos.csv estoques_qcn_fitofisionomias.json saida.json

Imprime o relatório (códigos sem correspondência, diferenças acima de 0,5 tC/ha
entre a média de c_v_4i por c_pret e o total da tabela, e a conferência
c_v_4i = c_agb + c_bgb + c_dw + c_litter).

ATENÇÃO: ainda não executado com dados reais (arquivos do INPE indisponíveis em
04/10/2026). O nome do bioma no mapa pode vir grafado de outro modo; ajuste
BIOMAS se a primeira execução listar biomas desconhecidos.
"""
import csv
import json
import sys
import unicodedata
from collections import defaultdict

TOLERANCIA = 0.5  # tC/ha
BIOMAS = {
    'amazonia': 'Amazônia', 'cerrado': 'Cerrado', 'mata atlantica': 'Mata Atlântica',
    'caatinga': 'Caatinga', 'pampa': 'Pampa', 'pantanal': 'Pantanal',
}


def sem_acento(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn').strip().lower()


def numero(texto):
    try:
        return float(str(texto).replace(',', '.'))
    except ValueError:
        return None


def main(caminho_csv, caminho_tabela, caminho_saida):
    tabela = json.load(open(caminho_tabela, encoding='utf-8'))
    por_sigla = {
        (bioma, f['sigla']): f
        for bioma, dados in tabela['biomas'].items() for f in dados['fitofisionomias']
    }

    soma = defaultdict(float)
    conta = defaultdict(int)
    biomas_desconhecidos = set()
    amostra = soma_errada = 0
    with open(caminho_csv, encoding='utf-8', newline='') as arquivo:
        for linha in csv.DictReader(arquivo):
            linha = {k.lower(): v for k, v in linha.items()}
            bioma = BIOMAS.get(sem_acento(linha['bioma']))
            if not bioma:
                biomas_desconhecidos.add(linha['bioma'])
                continue
            estoque = numero(linha['c_v_4i'])
            if estoque is None:
                continue
            chave = (bioma, linha['c_pret'].strip())
            soma[chave] += estoque
            conta[chave] += 1
            partes = [numero(linha[c]) for c in ('c_agb', 'c_bgb', 'c_dw', 'c_litter')]
            if None not in partes:
                amostra += 1
                if abs(sum(partes) - estoque) > 0.01:
                    soma_errada += 1

    crosswalk, sem_par, diferencas = [], [], []
    for (bioma, c_pret) in sorted(soma):
        media = soma[(bioma, c_pret)] / conta[(bioma, c_pret)]
        linha_tabela = por_sigla.get((bioma, c_pret))
        item = {'bioma': bioma, 'c_pret': c_pret, 'poligonos': conta[(bioma, c_pret)],
                'media_c_v_4i': round(media, 2), 'sigla_tabela': None, 'total_tabela_tC_ha': None}
        if linha_tabela is None:
            sem_par.append(item)
        else:
            item['sigla_tabela'] = linha_tabela['sigla']
            item['total_tabela_tC_ha'] = linha_tabela['total_tC_ha']
            if linha_tabela['total_tC_ha'] is not None and abs(media - linha_tabela['total_tC_ha']) > TOLERANCIA:
                diferencas.append(item)
        crosswalk.append(item)

    json.dump({'gerado_por': 'tools/crosswalk_c_pret.py', 'tolerancia_tC_ha': TOLERANCIA, 'itens': crosswalk},
              open(caminho_saida, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print('--- crosswalk c_pret × tabela por fitofisionomia')
    print('códigos (bioma, c_pret):', len(crosswalk))
    print('sem correspondência na tabela:', len(sem_par))
    for i in sem_par:
        print('   ', i['bioma'], i['c_pret'], '| polígonos:', i['poligonos'], '| média c_v_4i:', i['media_c_v_4i'])
    print('diferença acima de', TOLERANCIA, 'tC/ha entre a média do mapa e a tabela:', len(diferencas))
    for i in diferencas:
        print('   ', i['bioma'], i['c_pret'], '| mapa:', i['media_c_v_4i'], '| tabela:', i['total_tabela_tC_ha'])
    if biomas_desconhecidos:
        print('biomas não reconhecidos (ajustar BIOMAS):', sorted(biomas_desconhecidos))
    print('conferência c_v_4i = c_agb + c_bgb + c_dw + c_litter:', amostra, 'feições;', soma_errada, 'com diferença acima de 0,01 tC/ha')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
