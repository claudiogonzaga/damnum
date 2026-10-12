#!/usr/bin/env python3
"""Liga cada código c_pret dos blocos à linha bioma + sigla da tabela por
fitofisionomia (data/estoques_qcn_fitofisionomias.json) e compara os estoques.

Uso: crosswalk_c_pret.py fonte.json estoques_qcn_fitofisionomias.json saida.json

`fonte.json` é o gerado por tools/preprocessar_blocos.py (estatística por classe:
média de ctotal4inv ponderada pela área, só onde há dado). A saída lista os
códigos sem correspondência e as diferenças acima de 0,5 tC/ha.
"""
import json
import sys

TOLERANCIA = 0.5  # tC/ha


def main():
    fonte = json.load(open(sys.argv[1], encoding='utf-8'))
    tabela = json.load(open(sys.argv[2], encoding='utf-8'))
    linhas, sem, difere = [], [], []
    for e in fonte['estatistica_por_classe']:
        fitos = tabela['biomas'][e['bioma']]['fitofisionomias']
        achadas = [(i, f) for i, f in enumerate(fitos) if f['sigla'] == e['c_pret'] and isinstance(f.get('total_tC_ha'), (int, float))]
        item = {'bioma': e['bioma'], 'c_pret': e['c_pret'], 'area_ha': e['area_ha'], 'd_medio_mapa_tC_ha': e['d_medio_tC_ha']}
        if not achadas:
            item['tabela'] = None
            sem.append(item)
        else:
            i, f = achadas[0]
            item['tabela'] = {'indice': i, 'sigla': f['sigla'], 'nome': f['nome'], 'total_tC_ha': f['total_tC_ha']}
            item['diferenca_tC_ha'] = round(e['d_medio_tC_ha'] - f['total_tC_ha'], 2)
            if abs(item['diferenca_tC_ha']) > TOLERANCIA:
                difere.append(item)
        linhas.append(item)
    saida = {
        'versao_dos_dados': fonte['versao'], 'uf': fonte['uf'], 'gerado_em': fonte['gerado_em'],
        'nota': 'Média do mapa: ctotal4inv ponderado pela área, na janela dos blocos gerados (inclui faixas de estados vizinhos). '
                'Na Amazônia o mapa varia pixel a pixel; a tabela traz um valor por fitofisionomia.',
        'tolerancia_tC_ha': TOLERANCIA, 'classes': linhas,
        'sem_correspondencia': [(s['bioma'], s['c_pret']) for s in sem],
        'acima_da_tolerancia': [(d['bioma'], d['c_pret'], d['diferenca_tC_ha']) for d in difere]
    }
    with open(sys.argv[3], 'w', encoding='utf-8') as f:
        json.dump(saida, f, ensure_ascii=False, indent=1)
    print('%d classes; %d sem correspondência na tabela; %d com diferença acima de %.1f tC/ha' % (len(linhas), len(sem), len(difere), TOLERANCIA))
    print('sem correspondência:', ', '.join('%s/%s' % (s['bioma'], s['c_pret']) for s in sem))


if __name__ == '__main__':
    main()
