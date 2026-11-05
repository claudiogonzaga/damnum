// Arquivo com vários polígonos: MultiGeometry do KML (GeometryCollection),
// MultiPolygon, polígonos separados e sobrepostos. Mapa sintético, estoques FICTÍCIOS.
const test = require('node:test');
const assert = require('node:assert');

const Mapa = require('../js/mapa-qcn.js');
const R = require('../js/relatorio.js');
const V = require('../js/valoracao.js');
const libs = require('../vendor/damnum-geo.js');
const S = require('./blocos_sinteticos.js');
const series = require('../data/series_referencia.json');
const qcn = require('../data/estoques_qcn_fitofisionomias.json');

const fonte = () => Mapa.criarFonteMemoria(libs, S.mapaSintetico());
const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);
const anel = (x0, y0, x1, y1) => S.poligono(x0, y0, x1, y1).geometry.coordinates;
const area = f => libs.area(f) / 10000;

test('MultiGeometry do KML (GeometryCollection): cada polígono entra; pontos e linhas são ignorados e contados', () => {
    const gc = { type: 'Feature', properties: { name: 'Fazenda' }, geometry: { type: 'GeometryCollection', geometries: [
        { type: 'Polygon', coordinates: anel(-55.415, -12.605, -55.405, -12.595) },
        { type: 'Polygon', coordinates: anel(-55.400, -12.605, -55.395, -12.595) },
        { type: 'Point', coordinates: [-55.41, -12.60] },
        { type: 'LineString', coordinates: [[-55.41, -12.60], [-55.40, -12.60]] }] } };
    const geo = Mapa.normalizar(libs, gc);
    const r = geo.resumo;
    assert.strictEqual(r.poligonos, 2);
    assert.deepStrictEqual(r.partes.map(p => p.nome), ['Fazenda (1)', 'Fazenda (2)']);
    assert.strictEqual(r.descricaoIgnorados, '1 ponto e 1 linha');
    assert.strictEqual(r.uniao, true);
    assert.strictEqual(r.sobreposicao_ha, 0);
    perto(r.area_ha, r.area_soma_ha, 1e-6);
    // Arquivo só com pontos e linhas: a mensagem diz o que havia.
    assert.throws(() => Mapa.normalizar(libs, { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [0, 0] }] }), /não contém polígono: tem só 1 ponto/);
});

test('polígonos sobrepostos: a área da sobreposição conta uma vez só', () => {
    const a = S.poligono(-55.415, -12.605, -55.400, -12.595), b = S.poligono(-55.405, -12.605, -55.395, -12.595);
    const todo = S.poligono(-55.415, -12.605, -55.395, -12.595);
    const geo = Mapa.normalizar(libs, { type: 'FeatureCollection', features: [a, b] });
    perto(geo.resumo.area_soma_ha, area(a) + area(b), 1e-6);
    perto(geo.resumo.area_ha, area(todo), 1e-4);
    perto(geo.resumo.sobreposicao_ha, area(a) + area(b) - area(todo), 1e-4);
    perto(Mapa.areaHa(libs, geo), area(todo), 1e-4);
});

test('consulta ao mapa: sobrepostos valem o mesmo que o polígono único; separados, a média ponderada', async () => {
    const a = S.poligono(-55.415, -12.605, -55.400, -12.595), b = S.poligono(-55.405, -12.605, -55.395, -12.595);
    const unico = await Mapa.consultarPoligono(libs, fonte(), Mapa.normalizar(libs, S.poligono(-55.415, -12.605, -55.395, -12.595)));
    const sobrepostos = await Mapa.consultarPoligono(libs, fonte(), Mapa.normalizar(libs, { type: 'FeatureCollection', features: [a, b] }));
    perto(sobrepostos.area_ha, unico.area_ha, 1e-4);
    perto(sobrepostos.estoque_tC_ha, unico.estoque_tC_ha, 1e-6); // 80 tC/ha, como em mapa.test.js
    perto(sobrepostos.estoque_tC_ha, 80, 1e-6);
    assert.strictEqual(sobrepostos.arquivo.poligonos, 2);
    // Separados (MultiPolygon de uma feição só): área somada e estoque ponderado pela área de cada classe.
    const multi = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [anel(-55.415, -12.605, -55.405, -12.595), anel(-55.400, -12.605, -55.395, -12.595)] } };
    const separados = await Mapa.consultarPoligono(libs, fonte(), Mapa.normalizar(libs, multi));
    const p1 = await Mapa.consultarPoligono(libs, fonte(), Mapa.normalizar(libs, S.poligono(-55.415, -12.605, -55.405, -12.595)));
    const p2 = await Mapa.consultarPoligono(libs, fonte(), Mapa.normalizar(libs, S.poligono(-55.400, -12.605, -55.395, -12.595)));
    perto(separados.area_ha, p1.area_ha + p2.area_ha, 1e-4);
    perto(separados.estoque_tC_ha, (p1.estoque_tC_ha * p1.area_coberta_ha + p2.estoque_tC_ha * p2.area_coberta_ha) / (p1.area_coberta_ha + p2.area_coberta_ha), 1e-6);
});

test('altitude do KML (x, y, 0) é descartada', () => {
    const comZ = { type: 'Polygon', coordinates: [anel(-55.415, -12.605, -55.405, -12.595)[0].map(c => [c[0], c[1], 0])] };
    const geo = Mapa.normalizar(libs, comZ);
    geo.features[0].geometry.coordinates[0].forEach(c => assert.strictEqual(c.length, 2));
});

test('relatório: lista os polígonos do arquivo e diz quanto de sobreposição foi descontado', async () => {
    const a = S.poligono(-55.415, -12.605, -55.400, -12.595), b = S.poligono(-55.405, -12.605, -55.395, -12.595);
    a.properties.name = 'Talhão norte'; b.properties.name = 'Talhão sul';
    const consulta = await Mapa.consultarPoligono(libs, fonte(), Mapa.normalizar(libs, { type: 'FeatureCollection', features: [a, b] }));
    const reserva = V.estoqueDaTabela(qcn, 'FLORESTA AMAZÔNICA', '');
    const estoque = V.resolverEstoque({ usuario: null, tabela: reserva, municipio: null, consulta, mapa: { disponivel: true, info: null } });
    const r = V.calcular({
        versao: '7.1', bioma: 'FLORESTA AMAZÔNICA', entendimento: 'gonzaga', dataCalculo: new Date(2026, 5, 15), dataDano: new Date(2021, 4, 10),
        areas: { fora: consulta.area_ha, em: 0 }, reparacaoInSitu: true, taxaInterinoPct: 6, tempoRecuperacao: 15,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.00, origemCotacao: 'teste' },
        estoque, opcaoExtrapatrimonial: 'reais', manual: null, identificacao: {}, consultas: [], hash: 'teste', lia: null
    }, series);
    const html = R.gerarHTML(r);
    ['O arquivo trouxe 2 polígonos', 'Talhão norte', 'Talhão sul', 'foi descontada: vale a área da união dos polígonos', 'Área calculada (união dos polígonos)'].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
});
