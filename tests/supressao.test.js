// Data do dano pelo PRODES e pelo DETER: cruzamento do polígono do caso com
// blocos no formato publicado por tools/preprocessar_prodes.py. Blocos sintéticos.
const test = require('node:test');
const assert = require('node:assert');

const Mapa = require('../js/mapa-qcn.js');
const R = require('../js/relatorio.js');
const libs = require('../vendor/damnum-geo.js');
const S = require('./blocos_sinteticos.js');

const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);
const ESCALA = 10000;
// Retângulo no formato dos blocos: primeiro vértice e diferenças, em graus × 1e4.
function ret(x0, y0, x1, y1) {
    const q = v => Math.round(v * ESCALA);
    const p = [[q(x0), q(y0)], [q(x1), q(y0)], [q(x1), q(y1)], [q(x0), q(y1)], [q(x0), q(y0)]];
    const anel = [p[0][0], p[0][1]];
    for (let i = 1; i < p.length; i++) anel.push(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    return [[anel]];
}
const bloco = {
    chave: 'pd_498_309', bioma: '', formato: 'vetor', tema: 'supressao', escala: ESCALA, bbox: [-55.5, -12.75, -55.25, -12.5],
    feicoes: [
        { id: 0, f: 'P', o: 'prodes_amz', a: 2022, d: '2022-07-30', pol: ret(-55.42, -12.61, -55.41, -12.59) },
        { id: 1, f: 'P', o: 'prodes_amz', a: 2023, d: '2023-08-02', pol: ret(-55.41, -12.61, -55.405, -12.59) },
        { id: 2, f: 'D', o: 'deter_amz', c: 'CICATRIZ_DE_QUEIMADA', d: '2020-09-10', pol: ret(-55.42, -12.61, -55.40, -12.59) },
        { id: 3, f: 'D', o: 'deter_amz', c: 'CICATRIZ_DE_QUEIMADA', d: '2024-09-01', pol: ret(-55.42, -12.61, -55.40, -12.59) },
        { id: 4, f: 'D', o: 'deter_amz', c: 'DESMATAMENTO_CR', d: '2022-05-14', pol: ret(-55.30, -12.61, -55.29, -12.59) }
    ]
};
const atual = { versao: 'prodes/2026-11', gerado_em: '2026-11-18', uf: ['MT'], fontes: [] };
const fonte = () => ({ atual, blocos: Mapa.criarFonteMemoria(libs, [bloco]) });

test('supressão no polígono: área em comum por fonte, ano e data da imagem, da maior para a menor', async () => {
    const geo = Mapa.normalizar(libs, S.poligono(-55.415, -12.605, -55.405, -12.595));
    const r = await Mapa.supressaoNoPoligono(libs, fonte(), geo);
    const prodes = r.itens.filter(g => g.fonte === 'PRODES');
    assert.deepStrictEqual(prodes.map(g => g.ano), [2022, 2023]);
    assert.strictEqual(prodes[0].data, '2022-07-30');
    // Os dois anos do PRODES dividem o polígono ao meio e o cobrem inteiro.
    perto(prodes[0].pct, 50, 0.5);
    perto(r.prodesHa, r.areaHa, 0.01);
    // O alerta de corte raso fica longe e não entra; as cicatrizes de queimada cobrem tudo, em dois anos.
    assert.ok(!r.itens.some(g => g.classe === 'DESMATAMENTO_CR'));
    assert.deepStrictEqual(r.anosComQueimada, ['2020', '2024']);
    assert.strictEqual(r.itens.find(g => g.classe === 'CICATRIZ_DE_QUEIMADA').rotuloClasse, 'cicatriz de queimada');
    assert.strictEqual(r.dados.versao, 'prodes/2026-11');
});

test('supressão no polígono: área sem registro devolve lista vazia', async () => {
    const geo = Mapa.normalizar(libs, S.poligono(-55.35, -12.70, -55.34, -12.69));
    const r = await Mapa.supressaoNoPoligono(libs, fonte(), geo);
    assert.deepStrictEqual(r.itens, []);
    assert.strictEqual(r.prodesHa, 0);
});

test('bloco de supressão decodificado traz fonte, ano, data e classe, e não os campos do estoque', () => {
    const b = Mapa.decodificarBloco(libs, JSON.parse(JSON.stringify(bloco)));
    assert.deepStrictEqual(b.feicoesGeo[0].properties, { id: 0, fonte: 'P', origem: 'prodes_amz', ano: 2022, data: '2022-07-30', classe: null });
});

test('relatório: a data aceita do PRODES aparece com a origem; sem ela, só a data', () => {
    const V = require('../js/valoracao.js');
    const series = require('../data/series_referencia.json');
    const estoque = V.resolverEstoque({ usuario: { tC: 58.39, fonte: 'teste' }, tabela: null, municipio: null, consulta: null, mapa: { disponivel: false, info: null } });
    const entrada = { versao: '7.4.0', bioma: 'FLORESTA AMAZÔNICA', entendimento: 'gonzaga', dataCalculo: new Date(2026, 8, 15), dataDano: new Date(2022, 6, 30),
        areas: { fora: 0, em: 10 }, reparacaoInSitu: true, taxaInterinoPct: 6, tempoRecuperacao: 15,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.40, origemCotacao: 'teste' },
        estoque, opcaoExtrapatrimonial: 'reais', manual: null, consultas: [], hash: 'h', lia: null };
    const com = R.gerarHTML(V.calcular(Object.assign({ origemData: 'PRODES Amazônia Legal, ano PRODES 2022, imagem de 30/07/2022' }, entrada), series));
    assert.ok(com.includes('PRODES Amazônia Legal, ano PRODES 2022'));
    assert.ok(com.includes('a supressão é anterior a ela'));
    assert.ok(!R.gerarHTML(V.calcular(entrada, series)).includes('a supressão é anterior a ela'));
});

test('MapBiomas Alerta: envia só o retângulo com folga; cruza aqui e monta o link do laudo pelo código', async () => {
    const geo = Mapa.normalizar(libs, S.poligono(-55.415, -12.605, -55.405, -12.595));
    let pedida = '';
    const alerta = (codigo, x0, y0, x1, y1) => ({ type: 'Feature', geometry: S.poligono(x0, y0, x1, y1).geometry,
        properties: { alert_code: codigo, area_ha: 50, sources: 'DETER-B', detected_at: '2023-06-01', image_before_at: '2023-03-10', image_after_at: '2023-06-20' } });
    const buscar = async url => { pedida = url; return { ok: true, json: async () => ({ features: [alerta(123456, -55.42, -12.61, -55.41, -12.59), alerta(999, -55.30, -12.61, -55.29, -12.59)] }) }; };
    const r = await Mapa.alertasMapBiomas(libs, geo, buscar);
    // Só o alerta que toca o polígono, com metade dele em comum.
    assert.deepStrictEqual(r.itens.map(a => a.codigo), ['123456']);
    perto(r.itens[0].pct, 50, 0.5);
    assert.strictEqual(r.itens[0].url, 'https://plataforma.alerta.mapbiomas.org/alerta/123456');
    assert.strictEqual(r.itens[0].imagemAntes, '2023-03-10');
    // O pedido leva a caixa arredondada para fora em centésimos de grau, e nenhum vértice do polígono.
    assert.deepStrictEqual(r.caixaEnviada, [-55.42, -12.61, -55.4, -12.59]);
    const consulta = decodeURIComponent(pedida);
    assert.ok(consulta.startsWith(Mapa.MAPBIOMAS.servico + '?'));
    assert.ok(consulta.includes("BBOX(geom,-55.42,-12.61,-55.4,-12.59,'EPSG:4674')"));
    assert.ok(!consulta.includes('-55.415') && !consulta.includes('-12.605'));
});

test('MapBiomas Alerta: erro do serviço vira mensagem; sem alerta, lista vazia', async () => {
    const geo = Mapa.normalizar(libs, S.poligono(-55.415, -12.605, -55.405, -12.595));
    await assert.rejects(Mapa.alertasMapBiomas(libs, geo, async () => ({ ok: false, status: 503 })), /respondeu 503/);
    assert.deepStrictEqual((await Mapa.alertasMapBiomas(libs, geo, async () => ({ ok: true, json: async () => ({ features: [] }) }))).itens, []);
});
