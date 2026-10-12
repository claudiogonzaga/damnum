"""Leitor mínimo de shapefile de polígonos (tipos 5 e 15) e de .dbf, para os
arquivos do Quarto Inventário. Não depende de GDAL. Devolve os anéis de cada
registro como matrizes numpy (x, y); registros vazios (tipo 0) são pulados."""
import struct
import numpy as np


def ler_dbf(caminho, codificacao='latin1'):
    with open(caminho, 'rb') as f:
        cab = f.read(32)
        n, tam_cab, tam_reg = struct.unpack('<IHH', cab[4:12])
        campos = []
        while True:
            d = f.read(32)
            if d[0] == 0x0D:
                break
            campos.append((d[:11].split(b'\0')[0].decode('latin1').lower(), chr(d[11]), d[16]))
        f.seek(tam_cab)
        dados = f.read(n * tam_reg)
    linhas = []
    for i in range(n):
        r, o, linha = dados[i * tam_reg:(i + 1) * tam_reg], 1, {}
        for nome, tipo, tam in campos:
            v = r[o:o + tam].decode(codificacao, 'replace').strip()
            o += tam
            if tipo in 'NF':
                try:
                    v = float(v)
                except ValueError:
                    v = None
            linha[nome] = v
        linhas.append(linha)
    return campos, linhas


def caixa_do_arquivo(caminho_shp):
    with open(caminho_shp, 'rb') as f:
        h = f.read(100)
    return struct.unpack('<4d', h[36:68])


def iterar_poligonos(caminho_shp, caixa=None):
    """Gera (indice, caixa_do_registro, [anéis]) na ordem do arquivo. Com `caixa`
    (xmin, ymin, xmax, ymax), pula os registros que não a tocam."""
    with open(caminho_shp, 'rb') as f:
        f.seek(100)
        i = -1
        while True:
            cab = f.read(8)
            if len(cab) < 8:
                return
            i += 1
            tam = struct.unpack('>i', cab[4:8])[0] * 2
            conteudo = f.read(tam)
            tipo = struct.unpack('<i', conteudo[:4])[0]
            if tipo == 0:
                continue
            if tipo not in (5, 15, 25):
                raise ValueError('tipo de geometria não tratado: %d' % tipo)
            cx = struct.unpack('<4d', conteudo[4:36])
            if caixa and (cx[0] > caixa[2] or cx[2] < caixa[0] or cx[1] > caixa[3] or cx[3] < caixa[1]):
                continue
            n_partes, n_pontos = struct.unpack('<2i', conteudo[36:44])
            partes = np.frombuffer(conteudo, dtype='<i4', count=n_partes, offset=44)
            pontos = np.frombuffer(conteudo, dtype='<f8', count=n_pontos * 2, offset=44 + 4 * n_partes).reshape(-1, 2)
            limites = list(partes) + [n_pontos]
            aneis = [pontos[limites[k]:limites[k + 1]] for k in range(n_partes)]
            yield i, cx, aneis
