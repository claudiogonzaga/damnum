// Consulta ao mapa do Quarto Inventário em blocos (versão 7.1), com um mapa
// sintético. Os estoques abaixo são FICTÍCIOS e servem só para conferir a lógica
// de interseção, de média e de "sem dado".
const test = require('node:test');
const assert = require('node:assert');

const Mapa = require('../js/mapa-qcn.js');
const V = require('../js/valoracao.js');
const libs = require('../vendor/damnum-geo.js');
const S = require('./blocos_sinteticos.js');

const fonte = () => Mapa.criarFonteMemoria(libs, S.mapaSintetico());
const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);

test('interruptor ligado, com o endereço dos blocos separado do contador', () => {
    assert.strictEqual(Mapa.MAPA_QCN_ATIVO, true);
    assert.strictEqual(Mapa.DADOS_BASE_URL, 'https://damnum-dados.pages.dev');
    assert.ok(!/script\.google\.com/.test(Mapa.DADOS_BASE_URL));
    assert.strictEqual(Mapa.VERSAO_DADOS, 'v1');
    assert.strictEqual(Mapa.CAMPO_ESTOQUE, 'ctotal4inv');
});

test('vetor: polígono em duas classes, média ponderada pela área conferida à mão', async () => {
    // 3/4 na classe 1 (100 tC/ha) e 1/4 na classe 2 (20 tC/ha): (3 × 100 + 1 × 20) ÷ 4 = 80.
    const r = await Mapa.consultarPoligono(libs, fonte(), S.poligono(-55.415, -12.605, -55.395, -12.595));
    assert.strictEqual(r.tipo, 'poligono');
    assert.deepStrictEqual(r.partes.map(p => p.id), [1, 2]);
    perto(r.partes[0].area_ha / r.area_ha, 0.75, 1e-6);
    perto(r.estoque_tC_ha, 80, 1e-6);
    perto(r.pct_descoberto, 0, 1e-6);
    assert.deepStrictEqual(r.blocos, ['cev_498_309']);
    assert.strictEqual(r.campo, 'ctotal4inv');
});

test('raster: a área de cada pixel é a fração coberta pelo polígono', async () => {
    // Linha 0, de meio pixel antes do limite entre as colunas 1 e 2 até o fim da
    // coluna 3, só a metade norte: 0,5 pixel a 100 e 2 pixels a 40, cada um pela
    // metade. Média: (0,5 × 100 + 2 × 40) ÷ 2,5 = 52.
    const r = await Mapa.consultarPoligono(libs, fonte(), S.poligono(-55.005, -12.001, -55.000, -12.000));
    perto(r.estoque_tC_ha, 52, 1e-6);
    assert.deepStrictEqual(r.partes.map(p => [p.formato, p.c_pret, p.categ]), [['raster', 'ON', 'F'], ['raster', 'Ds', 'F']]);
    perto(r.partes[0].area_ha / r.area_ha, 0.8, 1e-6);
    perto(r.pct_descoberto, 0, 1e-6);
});

test('percentual sem cobertura: a parte fora do mapa recebe a reserva', async () => {
    // Metade do polígono na classe 1 (100 tC/ha) e metade a oeste, fora de qualquer feição.
    const r = await Mapa.consultarPoligono(libs, fonte(), S.poligono(-55.43, -12.605, -55.41, -12.595));
    perto(r.pct_descoberto, 50, 1e-4);
    perto(r.estoque_tC_ha, 100, 1e-9);
    const e = V.estoqueDoMapa(r, { tC: 30, descricaoOrigem: 'média do bioma' }, null);
    perto(e.tC, 0.5 * 100 + 0.5 * 30, 1e-4);
    assert.strictEqual(e.entrada, 'polígono');
});

test('zero em classe de floresta é "sem dado", nunca estoque zero (vetor e raster)', async () => {
    // Vetor: metade na classe 2 (20 tC/ha) e metade na classe 4 (Sd, floresta, valor 0).
    const v = await Mapa.consultarPoligono(libs, fonte(), S.poligono(-55.39, -12.605, -55.37, -12.595));
    perto(v.estoque_tC_ha, 20, 1e-9);
    perto(v.pct_sem_dado, 50, 1e-4);
    perto(v.pct_descoberto, 50, 1e-4);
    assert.ok(!v.partes.some(p => p.id === 4));
    // Raster: linha 1, colunas 0 (100) e 1 (0): a média é 100, e não 50.
    const r = await Mapa.consultarPoligono(libs, fonte(), S.poligono(-55.008, -12.004, -55.004, -12.002));
    perto(r.estoque_tC_ha, 100, 1e-9);
    perto(r.pct_sem_dado, 50, 1e-4);
    // Coordenada sobre o zero: sem estoque, marcada como sem dado.
    const p = await Mapa.consultarPonto(libs, fonte(), -55.005, -12.003);
    assert.strictEqual(p.estoque_tC_ha, null);
    assert.strictEqual(p.sem_dado, true);
    const q = await Mapa.consultarPonto(libs, fonte(), -55.37, -12.60);
    assert.strictEqual(q.estoque_tC_ha, null);
    assert.strictEqual(q.sem_dado, true);
    assert.strictEqual(Mapa.temDado(0), false);
    assert.strictEqual(Mapa.temDado(null), false);
});

test('sobreposição entre raster e vetor: vale o vetor e a área não é contada duas vezes', async () => {
    // Um pixel de 0,002° a 100 tC/ha; um polígono vetorial a 20 tC/ha cobre a metade leste dele.
    const raster = S.blocoRaster('amr_1_1', -55.002, -12.0, 0.002, [[100]], [[1]], [['', ''], ['Ds', 'F']]);
    const vetor = S.blocoVetor('cev_1_1', [-55.25, -12.25, -55.0, -12.0], [S.feicaoRetangular(9, 'Sa', 'F', 20, -55.001, -12.002, -55.000, -12.000)]);
    const f = Mapa.criarFonteMemoria(libs, [raster, vetor]);
    const r = await Mapa.consultarPoligono(libs, f, S.poligono(-55.002, -12.002, -55.000, -12.000));
    perto(r.area_coberta_ha, r.area_ha, 1e-6);
    perto(r.estoque_tC_ha, 60, 1e-6);
    perto(r.pct_descoberto, 0, 1e-6);
    const p = await Mapa.consultarPonto(libs, f, -55.0005, -12.001);
    assert.strictEqual(p.classe.formato, 'vetor');
    assert.strictEqual(p.estoque_tC_ha, 20);
});

test('polígono todo fora do mapa não tem estoque', async () => {
    const r = await Mapa.consultarPoligono(libs, fonte(), S.poligono(-50.02, -10.02, -50.01, -10.01));
    assert.strictEqual(r.estoque_tC_ha, null);
    perto(r.pct_descoberto, 100, 1e-9);
});

test('coordenada no interior de uma classe, sem vizinhas a 100 m', async () => {
    const r = await Mapa.consultarPonto(libs, fonte(), -55.41, -12.60);
    assert.strictEqual(r.tipo, 'coordenada');
    assert.strictEqual(r.classe.id, 1);
    assert.strictEqual(r.estoque_tC_ha, 100);
    assert.deepStrictEqual(r.vizinhas, []);
    assert.strictEqual(r.aviso, 'Valor aproximado: o estoque foi obtido para um ponto, não para a área do dano. Envie o polígono para um cálculo mais preciso.');
});

test('coordenada a menos de 100 m da divisa lista a classe vizinha e o seu estoque (vetor)', async () => {
    // 0,0005 grau de longitude a 12,6° S são cerca de 54 m.
    const r = await Mapa.consultarPonto(libs, fonte(), -55.4005, -12.60);
    assert.strictEqual(r.classe.id, 1);
    assert.deepStrictEqual(r.vizinhas.map(v => [v.c_pret, v.d]), [['Sa', 20]]);
    assert.ok(r.vizinhas[0].distancia_m > 40 && r.vizinhas[0].distancia_m < 70);
});

test('coordenada no raster: valor do pixel e classe vizinha a menos de 100 m', async () => {
    // Pixel de 0,002° (cerca de 220 m). Ponto na coluna 1 da linha 0, a 0,0004°
    // (cerca de 43 m) da coluna 2, que é de outra classe.
    const r = await Mapa.consultarPonto(libs, fonte(), -55.0044, -12.001);
    assert.strictEqual(r.classe.formato, 'raster');
    assert.strictEqual(r.estoque_tC_ha, 100);
    assert.deepStrictEqual(r.vizinhas.map(v => [v.c_pret, v.d]), [['ON', 40]]);
    // No meio da coluna 0, a mais de 100 m de outra classe: sem vizinhas.
    const s = await Mapa.consultarPonto(libs, fonte(), -55.007, -12.001);
    assert.deepStrictEqual(s.vizinhas, []);
});

test('coordenada fora da cobertura', async () => {
    const r = await Mapa.consultarPonto(libs, fonte(), -50.0, -10.0);
    assert.strictEqual(r.classe, null);
    assert.strictEqual(r.estoque_tC_ha, null);
    assert.strictEqual(r.sem_dado, false);
});

test('área geodésica do polígono e divergência acima de 1%', () => {
    const p = S.poligono(-55.415, -12.605, -55.395, -12.595);
    const area = Mapa.areaHa(libs, p);
    // 0,02° × 0,01° a 12,6° S: cerca de 2.171 m × 1.106 m = 240 ha.
    perto(area, 240, 3);
    assert.strictEqual(Mapa.divergenciaDeArea(area, area * 1.005).diverge, false);
    assert.strictEqual(Mapa.divergenciaDeArea(area, area * 1.02).diverge, true);
    assert.strictEqual(Mapa.divergenciaDeArea(area, 0), null);
});

test('normalizar aceita geometria solta, Feature e FeatureCollection, e recusa arquivo sem polígono', () => {
    const p = S.poligono(-55.4, -12.6, -55.39, -12.59);
    assert.strictEqual(Mapa.normalizar(libs, p.geometry).features.length, 1);
    assert.strictEqual(Mapa.normalizar(libs, p).features.length, 1);
    assert.strictEqual(Mapa.normalizar(libs, { type: 'FeatureCollection', features: [p, { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }] }).features.length, 1);
    assert.throws(() => Mapa.normalizar(libs, { type: 'Point', coordinates: [0, 0] }), /não contém polígono/);
});
