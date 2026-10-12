#!/usr/bin/env python3
"""Fase 0 (v7.1): amostra os .dbf de Shapes_UF do Quarto Inventário por faixa de
bytes, sem baixá-los. Uso: python3 tools/fase0_amostrar_dbf.py MT saida.json [blocos] [registros_por_bloco]"""
import json, struct, subprocess, sys, collections

BASE = 'https://dataserver-coids.inpe.br/ccst/p4cn/4%20Inventario-CN/Shapes_UF/'
ARQUIVOS = {'MT': ['Produtos_MT_Amazonia_1', 'Produtos_MT_Amazonia_2', 'Produtos_MT_Amazonia_3',
                   'Produtos_MT_Cerrado', 'Produtos_MT_Pantanal']}


def faixa(url, ini, fim):
    return subprocess.run(['curl', '-s', '-m', '120', '-r', '%d-%d' % (ini, fim), url],
                          capture_output=True, check=True).stdout


def cabecalho(url):
    h = faixa(url, 0, 65535)
    n, hl, rl = struct.unpack('<IHH', h[4:12])
    campos, o = [], 32
    while h[o] != 0x0D:
        d = h[o:o + 32]
        campos.append((d[:11].split(b'\0')[0].decode('latin1'), chr(d[11]), d[16], d[17]))
        o += 32
    return n, hl, rl, campos


def registros(url, hl, rl, campos, inicio, quantos):
    dados = faixa(url, hl + inicio * rl, hl + (inicio + quantos) * rl - 1)
    for i in range(len(dados) // rl):
        r, o, linha = dados[i * rl:(i + 1) * rl], 1, {}
        for nome, tipo, tam, _ in campos:
            linha[nome] = r[o:o + tam].decode('latin1').strip()
            o += tam
        yield linha


def main():
    uf = sys.argv[1]
    destino = sys.argv[2]
    blocos = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    por_bloco = int(sys.argv[4]) if len(sys.argv) > 4 else 100
    saida = {}
    for nome in ARQUIVOS[uf]:
        url = BASE + uf + '/' + nome + '.dbf'
        n, hl, rl, campos = cabecalho(url)
        amostra = []
        for b in range(blocos):
            ini = int((n - por_bloco) * b / max(blocos - 1, 1))
            amostra.extend(registros(url, hl, rl, campos, ini, por_bloco))
        saida[nome] = {'registros': n, 'tam_registro': rl, 'campos': campos, 'amostra': amostra}
        print(nome, n, 'registros;', len(amostra), 'amostrados', file=sys.stderr)
    with open(destino, 'w', encoding='utf-8') as f:
        json.dump(saida, f, ensure_ascii=False)


if __name__ == '__main__':
    main()
