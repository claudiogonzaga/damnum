// Blocos sintéticos do mapa, no formato publicado por tools/preprocessar_blocos.py.
// Todos os estoques aqui são FICTÍCIOS: servem só para conferir a lógica.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const ESCALA = 1000000;

function anel(pontos) {
    const q = pontos.map(p => [Math.round(p[0] * ESCALA), Math.round(p[1] * ESCALA)]);
    const saida = [q[0][0], q[0][1]];
    for (let i = 1; i < q.length; i++) saida.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
    return saida;
}

function retangulo(x0, y0, x1, y1) {
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
}

function feicaoRetangular(id, c_pret, categ, d, x0, y0, x1, y1) {
    return { id, c_pret, c_pretorig: c_pret, categ, d, cagb: null, cbgb: null, cdw: null, clitter: null, pol: [[anel(retangulo(x0, y0, x1, y1))]] };
}

function blocoVetor(chave, bbox, feicoes, bioma) {
    return { versao: 'v1', gerado_em: '2026-01-01', chave, bioma: bioma || 'Cerrado', formato: 'vetor', bbox, escala: ESCALA, campo: 'ctotal4inv', feicoes };
}

// `valores` em tC/ha por linha (de norte para sul); null = fora da cobertura.
function blocoRaster(chave, x0, y0, passo, valores, classes, legenda, bioma) {
    const linhas = valores.length, colunas = valores[0].length;
    return {
        versao: 'v1', gerado_em: '2026-01-01', chave, bioma: bioma || 'Amazônia', formato: 'raster',
        bbox: [x0, y0 - linhas * passo, x0 + colunas * passo, y0],
        campo: 'ctotal4inv', x0, y0, passo, colunas, linhas, escala: 100, sem_dado: 65535, legenda,
        valores: [].concat(...valores).map(v => v === null ? 65535 : Math.round(v * 100)),
        classes: [].concat(...classes)
    };
}

function poligono(x0, y0, x1, y1) {
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [retangulo(x0, y0, x1, y1)] } };
}

// Grava a estrutura de publicação em `pasta`/v1 e devolve o índice.
function publicar(pasta, blocos, extras) {
    const raiz = path.join(pasta, 'v1');
    fs.mkdirSync(path.join(raiz, 'blocos'), { recursive: true });
    const indice = blocos.map(b => {
        const gz = zlib.gzipSync(Buffer.from(JSON.stringify(b)));
        fs.writeFileSync(path.join(raiz, 'blocos', b.chave + '.gz'), gz);
        return { chave: b.chave, bioma: b.bioma, formato: b.formato, bbox: b.bbox, bytes: gz.length, sha256: crypto.createHash('sha256').update(gz).digest('hex') };
    });
    const versao = Object.assign({
        versao: 'v1', gerado_em: '2026-01-01', data_download: '2026-01-01', ufs: ['MT'], biomas: ['Amazônia', 'Cerrado'], campo: 'ctotal4inv',
        celula_graus: { raster: 1, vetor: 0.25 }, blocos: indice.length,
        fontes: [{ bioma: 'Cerrado', uso: 'estoque (ctotal4inv)', arquivo: 'sintetico.shp', url: 'https://exemplo.invalid/sintetico', modificado_no_servidor: '2021-06-25' }]
    }, extras || {});
    fs.writeFileSync(path.join(raiz, 'versao.json'), JSON.stringify(versao));
    fs.writeFileSync(path.join(raiz, 'indice.json'), JSON.stringify({ versao: 'v1', gerado_em: '2026-01-01', blocos: indice }));
    fs.writeFileSync(path.join(raiz, 'municipio_cpret.json'), JSON.stringify({ versao: 'v1', uf: 'MT', campo: 'ctotal4inv', linhas: [['5100000', 'FICTÍCIO', 'Cerrado', 'Sa', 1000, 33.3]] }));
    return indice;
}

// Mapa sintético em Mato Grosso (valores fictícios):
//   Cerrado, vetor, célula de -55,50 a -55,25 por -12,75 a -12,50:
//     id 1 (Fa, F, 100), id 2 (Sa, F, 20), id 3 (Sg, G, 10), id 4 (Sd, F, 0 = sem dado);
//   Amazônia, raster de 4 × 3 pixels de 0,002°, com canto noroeste em -55,008 / -12,000:
//     linha 0: 100 100 40 40; linha 1: 100 0 40 fora; linha 2: fora em tudo.
function mapaSintetico() {
    const vetor = blocoVetor('cev_498_309', [-55.5, -12.75, -55.25, -12.5], [
        feicaoRetangular(1, 'Fa', 'F', 100, -55.42, -12.61, -55.40, -12.59),
        feicaoRetangular(2, 'Sa', 'F', 20, -55.40, -12.61, -55.38, -12.59),
        feicaoRetangular(3, 'Sg', 'G', 10, -55.42, -12.63, -55.38, -12.61),
        feicaoRetangular(4, 'Sd', 'F', 0, -55.38, -12.63, -55.36, -12.59)
    ]);
    const raster = blocoRaster('amr_124_77', -55.008, -12.0, 0.002,
        [[100, 100, 40, 40], [100, 0, 40, null], [null, null, null, null]],
        [[1, 1, 2, 2], [1, 1, 2, 0], [0, 0, 0, 0]],
        [['', ''], ['Ds', 'F'], ['ON', 'F']]);
    return [vetor, raster];
}

module.exports = { anel, retangulo, feicaoRetangular, blocoVetor, blocoRaster, poligono, publicar, mapaSintetico };
