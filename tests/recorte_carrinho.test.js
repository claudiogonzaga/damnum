// Várias áreas num arquivo: separação por feição, data do dano nos atributos,
// recorte pelas áreas territorialmente protegidas e relatório consolidado.
// Geometrias sintéticas; estoques e valores FICTÍCIOS.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Mapa = require('../js/mapa-qcn.js');
const R = require('../js/relatorio.js');
const V = require('../js/valoracao.js');
const libs = require('../vendor/damnum-geo.js');
const S = require('./blocos_sinteticos.js');
const series = require('../data/series_referencia.json');
const qcn = require('../data/estoques_qcn_fitofisionomias.json');

const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);
const anel = (x0, y0, x1, y1) => S.poligono(x0, y0, x1, y1).geometry.coordinates;
const area = f => libs.area(f) / 10000;
const com = (f, props) => Object.assign(f, { properties: props });

test('separarFeicoes: uma área por feição do arquivo, com todos os seus polígonos e atributos', () => {
    const gleba1 = { type: 'Feature', properties: { name: 'Gleba 1', image_date: '2021-08-12' }, geometry: { type: 'GeometryCollection', geometries: [
        { type: 'Polygon', coordinates: anel(-55.415, -12.605, -55.405, -12.595) },
        { type: 'Polygon', coordinates: anel(-55.400, -12.605, -55.395, -12.595) }] } };
    const gleba2 = com(S.poligono(-55.390, -12.605, -55.385, -12.595), { name: 'Gleba 2', image_date: '2023-07-30' });
    const geo = Mapa.normalizar(libs, { type: 'FeatureCollection', features: [gleba1, gleba2] });
    const grupos = Mapa.separarFeicoes(libs, geo);
    assert.deepStrictEqual(grupos.map(g => g.nome), ['Gleba 1', 'Gleba 2']);
    assert.strictEqual(grupos[0].resumo.poligonos, 2);
    assert.strictEqual(grupos[0].atributos.image_date, '2021-08-12');
    perto(grupos[0].resumo.area_ha + grupos[1].resumo.area_ha, geo.resumo.area_ha, 1e-4);
    // Arquivo de uma área só: um grupo.
    assert.strictEqual(Mapa.separarFeicoes(libs, Mapa.normalizar(libs, gleba2)).length, 1);
});

test('data do dano nos atributos: data completa preenche; ano sozinho é pista; texto qualquer não vale', () => {
    const d = Mapa.dataDaFeicao({ image_date: '2021-08-12', main_class: 'desmatamento' });
    assert.strictEqual(d.campo, 'image_date');
    assert.deepStrictEqual([d.data.getFullYear(), d.data.getMonth() + 1, d.data.getDate()], [2021, 8, 12]);
    assert.deepStrictEqual(Mapa.dataDaFeicao({ VIEW_DATE: '05/03/2020' }).data.getMonth() + 1, 3);
    assert.strictEqual(Mapa.dataDaFeicao({ data: '20190715' }).data.getDate(), 15);
    assert.strictEqual(Mapa.dataDaFeicao({ timestamp: '2022-01-31T13:00:00Z' }).data.getDate(), 31);
    assert.deepStrictEqual(Mapa.dataDaFeicao({ year: 2021 }), { data: null, ano: 2021, campo: 'year' });
    assert.strictEqual(Mapa.dataDaFeicao({ data: '31/02/2021' }), null); // dia que não existe
    assert.strictEqual(Mapa.dataDaFeicao({ name: '2021-08-12', descricao: 'qualquer' }), null); // campo que não é de data
    assert.strictEqual(Mapa.dataDaFeicao({ year: 'Gleba 2021' }), null);
    assert.strictEqual(Mapa.dataDaFeicao({}), null);
});

test('categoria pelo nome do tema ou da feição; temas do CAR que não são área protegida ficam de fora', () => {
    const cat = t => (Mapa.categoriaDoTexto(t) || {}).chave || null;
    assert.strictEqual(cat('APP'), 'app');
    assert.strictEqual(cat('SHAPE_5103403/APP'), 'app');
    assert.strictEqual(cat('Área de Preservação Permanente'), 'app');
    assert.strictEqual(cat('RESERVA_LEGAL'), 'rl');
    assert.strictEqual(cat('ARL proposta'), 'rl');
    assert.strictEqual(cat('cnuc_2025'), 'uc');
    assert.strictEqual(cat('tis_poligonais'), 'ti');
    assert.strictEqual(cat('Terra Indígena Xingu'), 'ti');
    // Falsos positivos que a regra evita.
    ['Apiacás', 'Tipo de solo', 'Carlos', 'Talhão norte', 'aplicativo'].forEach(t => assert.strictEqual(cat(t), null, t));

    const app = com(S.poligono(-55.415, -12.605, -55.405, -12.595), {});
    const rl = com(S.poligono(-55.405, -12.605, -55.395, -12.595), {});
    const imovel = com(S.poligono(-55.5, -12.7, -55.3, -12.5), {});
    const camada = Mapa.camadaDeColecoes(libs, [
        { nome: 'APP', geo: { type: 'FeatureCollection', features: [app] }, tema: true },
        { nome: 'RESERVA_LEGAL', geo: { type: 'FeatureCollection', features: [rl] }, tema: true },
        { nome: 'AREA_IMOVEL', geo: { type: 'FeatureCollection', features: [imovel] }, tema: true },
        { nome: 'VEGETACAO_NATIVA', geo: { type: 'FeatureCollection', features: [imovel] }, tema: true }
    ], 'car.zip');
    assert.deepStrictEqual(camada.contagem, { app: 1, rl: 1 });
    assert.strictEqual(camada.descricaoIgnoradas, 'AREA_IMOVEL (1), VEGETACAO_NATIVA (1)');
    // Só o perímetro do imóvel: recusa, em vez de pôr todo o polígono em área protegida.
    assert.throws(() => Mapa.camadaDeColecoes(libs, [{ nome: 'AREA_IMOVEL', geo: imovel, tema: true }], 'x.zip'), /não traz polígono de área protegida; só AREA_IMOVEL \(1\)/);
    // KML do usuário: o nome do arquivo não é tema; vale o nome de cada feição.
    const kml = Mapa.camadaDeColecoes(libs, [{ nome: 'car_imovel', geo: { type: 'FeatureCollection', features: [
        com(S.poligono(-55.415, -12.605, -55.405, -12.595), { name: 'APP córrego' }),
        com(S.poligono(-55.405, -12.605, -55.395, -12.595), { name: 'Reserva Legal' }),
        com(S.poligono(-55.5, -12.7, -55.3, -12.5), { name: 'Área do imóvel' })] } }], 'car_imovel.kml');
    assert.deepStrictEqual(kml.contagem, { app: 1, rl: 1 });
    assert.strictEqual(kml.descricaoIgnoradas, 'Área do imóvel (1)');
    // KML chamado "APP_fazenda" com feições sem nome: vale o nome do arquivo.
    assert.deepStrictEqual(Mapa.camadaDeColecoes(libs, [{ nome: 'APP_fazenda', geo: app }], 'APP_fazenda.kml').contagem, { app: 1 });
});

test('recorte: parte em APP, parte em reserva legal sobreposta, parte fora; a sobreposição conta uma vez', () => {
    const dano = Mapa.normalizar(libs, S.poligono(-55.420, -12.605, -55.380, -12.595));
    const app = S.poligono(-55.420, -12.605, -55.405, -12.595);      // primeira faixa
    const rl = S.poligono(-55.410, -12.605, -55.395, -12.595);       // sobrepõe 0,005° da APP
    const longe = S.poligono(-56.0, -13.0, -55.9, -12.9);            // não toca o polígono
    const camada = Mapa.camadaDeColecoes(libs, [
        { nome: 'APP', geo: { type: 'FeatureCollection', features: [app, longe] } },
        { nome: 'RESERVA_LEGAL', geo: rl }
    ], 'car_imovel.zip');
    const rc = Mapa.recortarProtegidas(libs, dano, camada);
    const uniao = area(S.poligono(-55.420, -12.605, -55.395, -12.595));
    perto(rc.total_ha, area(dano.features[0]), 1e-6);
    perto(rc.em_ha, uniao, 1e-3);
    perto(rc.fora_ha, rc.total_ha - uniao, 1e-3);
    assert.deepStrictEqual(rc.categorias.map(c => c.chave), ['app', 'rl']);
    perto(rc.categorias[0].area_ha, area(app), 1e-3);
    perto(rc.sobreposicao_ha, area(app) + area(rl) - uniao, 1e-3);
    assert.strictEqual(rc.arquivo, 'car_imovel.zip');
    // Camada que não toca o polígono: nada em área protegida.
    const fora = Mapa.recortarProtegidas(libs, dano, Mapa.camadaDeColecoes(libs, [{ nome: 'APP', geo: longe }], 'outro.zip'));
    assert.strictEqual(fora.em_ha, 0);
    perto(fora.fora_ha, fora.total_ha, 1e-9);
});

test('CNUC: zona de amortecimento fica fora; APA entra com aviso', () => {
    const dano = Mapa.normalizar(libs, S.poligono(-55.420, -12.605, -55.380, -12.595));
    const za = com(S.poligono(-55.5, -12.7, -55.3, -12.5), { nome_uc: 'Parque Estadual X', categoria: 'Parque', limite: 'ZA' });
    const apa = com(S.poligono(-55.420, -12.605, -55.410, -12.595), { nome_uc: 'APA do Rio Y', categoria: 'Área de Proteção Ambiental', limite: 'UC' });
    const camada = Mapa.camadaDeColecoes(libs, [{ nome: 'cnuc_2025_08', geo: { type: 'FeatureCollection', features: [za, apa] }, tema: true }], 'shp_cnuc_2025_08.zip');
    assert.deepStrictEqual(camada.contagem, { uc: 1 });
    assert.strictEqual(camada.descricaoIgnoradas, 'zona de amortecimento (1)');
    const rc = Mapa.recortarProtegidas(libs, dano, camada);
    perto(rc.em_ha, area(apa), 1e-3);
    assert.match(rc.aviso, /Área de Proteção Ambiental \(APA\)/);
});

test('sem camada, o nome dos polígonos do arquivo separa APP e excedente', () => {
    const app = com(S.poligono(-55.420, -12.605, -55.410, -12.595), { name: 'APP do córrego' });
    const exc = com(S.poligono(-55.410, -12.605, -55.390, -12.595), { name: 'Talhão 3' });
    const geo = Mapa.normalizar(libs, { type: 'FeatureCollection', features: [app, exc] });
    const camada = Mapa.camadaDosNomes(libs, geo);
    const rc = Mapa.recortarProtegidas(libs, geo, camada);
    assert.strictEqual(rc.pelosNomes, true);
    perto(rc.em_ha, area(app), 1e-3);
    perto(rc.fora_ha, area(exc), 1e-3);
    assert.strictEqual(Mapa.camadaDosNomes(libs, Mapa.normalizar(libs, exc)), null);
});

test('sobreposição entre áreas do carrinho', () => {
    const a = Mapa.normalizar(libs, S.poligono(-55.420, -12.605, -55.400, -12.595));
    const b = Mapa.normalizar(libs, S.poligono(-55.410, -12.605, -55.390, -12.595));
    const c = Mapa.normalizar(libs, S.poligono(-55.380, -12.605, -55.370, -12.595));
    perto(Mapa.sobreposicaoHa(libs, a, b), area(S.poligono(-55.410, -12.605, -55.400, -12.595)), 1e-3);
    assert.strictEqual(Mapa.sobreposicaoHa(libs, a, c), 0);
});

function calcularCaso(opcoes) {
    const reserva = V.estoqueDaTabela(qcn, 'FLORESTA AMAZÔNICA', '');
    const estoque = V.resolverEstoque({ usuario: null, tabela: reserva, municipio: null, consulta: null, mapa: { disponivel: false, info: null } });
    return V.calcular(Object.assign({
        versao: '7.1', bioma: 'FLORESTA AMAZÔNICA', entendimento: 'gonzaga', dataCalculo: new Date(2026, 5, 15),
        reparacaoInSitu: true, taxaInterinoPct: 6, tempoRecuperacao: 15,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.00, origemCotacao: 'teste' },
        estoque, opcaoExtrapatrimonial: 'reais', manual: null, identificacao: {}, consultas: [], hash: 'h', lia: null
    }, opcoes), series);
}

test('relatório: área valorada e recorte das áreas protegidas', () => {
    const recorte = { arquivo: 'car_imovel.zip', pelosNomes: false, total_ha: 10, em_ha: 4, fora_ha: 6, categorias: [{ chave: 'app', nome: 'APP', area_ha: 3 }, { chave: 'rl', nome: 'reserva legal', area_ha: 1.5 }], sobreposicao_ha: 0.5, descricaoIgnoradas: 'AREA_IMOVEL (1)', aviso: '' };
    const r = calcularCaso({ dataDano: new Date(2021, 7, 12), areas: { fora: 6, em: 4, recorte }, nomeArea: 'Gleba <1>' });
    assert.strictEqual(r.areas.recorte, recorte);
    const html = R.gerarHTML(r);
    ['Área valorada', 'Gleba &lt;1&gt;', 'Recorte pela camada de áreas protegidas "car_imovel.zip"', 'APP: 3,0000 ha; reserva legal: 1,5000 ha',
        'se sobrepõem em 0,5000 ha', 'Camadas do CAR são autodeclaratórias', 'AREA_IMOVEL (1)'].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
    assert.ok(!R.gerarHTML(calcularCaso({ dataDano: new Date(2021, 7, 12), areas: { fora: 6, em: 4 } })).includes('Área valorada'));
});

test('relatório consolidado: cada área com a sua data; parcelas, áreas e totais somados; anexos', () => {
    const r1 = calcularCaso({ dataDano: new Date(2021, 7, 12), areas: { fora: 10, em: 0 }, hash: 'aaa' });
    const r2 = calcularCaso({ dataDano: new Date(2023, 6, 30), areas: { fora: 2, em: 3 }, hash: 'bbb' });
    const r3 = calcularCaso({ dataDano: null, areas: { fora: 1, em: 0 }, hash: 'ccc' });
    const itens = [{ nome: 'Gleba 1', r: r1 }, { nome: 'Gleba 2', r: r2, sobreposicoes: [{ item: 1, nome: 'Gleba 1', ha: 0.25 }] }, { nome: 'Ponto', r: r3 }];
    const html = R.gerarHTMLConsolidado(itens, { hash: 'conjunto123', dataCalculo: new Date(2026, 5, 15) });
    const soma = f => [r1, r2, r3].reduce((s, r) => s + f(r), 0);
    const moeda = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    assert.ok(html.includes('TOTAL GERAL = ' + moeda(Math.round(soma(r => r.totais.original) * 100) / 100)));
    assert.ok(html.includes('TOTAL ATUALIZADO ATÉ JUN./2026 = ' + moeda(Math.round(soma(r => r.totais.atualizado) * 100) / 100)), 'total atualizado');
    // Cada parcela é a soma das áreas.
    const material = Math.round(soma(r => r.parcelas.material.total) * 100) / 100;
    assert.ok(html.includes(moeda(material)), 'dano material somado');
    // A atualização de cada área parte da sua própria data: as duas diferem.
    assert.notStrictEqual(r1.atualizacao.referenciaPatrimonial.coeficiente, r2.atualizacao.referenciaPatrimonial.coeficiente);
    ['RELATÓRIO CONSOLIDADO', 'de 3 áreas, cada uma valorada à parte', '12/08/2021', '30/07/2023', 'não informada',
        'se sobrepõe em 0,2500 ha à área 1 (Gleba 1)', 'Sem data do dano, sem atualização e sem lucro do ilícito ambiental: Ponto',
        'ANEXO 1 — Gleba 1', 'ANEXO 2 — Gleba 2', 'ANEXO 3 — Ponto', 'conjunto123', 'aaa', 'bbb', 'page-break-before:always',
        'Compensação ecológica (ha)'].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
    perto(soma(r => r.compensacao.totalHa), r1.compensacao.totalHa + r2.compensacao.totalHa + r3.compensacao.totalHa, 1e-9);
    // Meses de cálculo diferentes: aviso.
    const antigo = calcularCaso({ dataDano: new Date(2021, 7, 12), dataCalculo: new Date(2026, 4, 10), areas: { fora: 1, em: 0 } });
    assert.ok(R.gerarHTMLConsolidado([{ nome: 'A', r: r1 }, { nome: 'B', r: antigo }]).includes('calculadas em meses diferentes'));
    // Nome digitado é escapado.
    assert.ok(R.gerarHTMLConsolidado([{ nome: '<b>x</b>', r: r1 }]).includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('página: fila, camada de áreas protegidas e carrinho', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    ['id="filaPoligonos"', 'id="btnFilaIniciar"', 'id="arquivoProtegidas"', 'id="notaRecorte"', 'id="btnUsarRecorte"',
        'id="carrinho"', 'id="tabelaCarrinho"', 'id="btnConsolidado"', 'id="textoConsolidado"', 'id="btnCarrinho"'].forEach(t => assert.ok(html.includes(t), t));
});
