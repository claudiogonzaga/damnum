// Testes do item 1.6-A com um mapa sintético. Os estoques (c_v_4i) abaixo são
// FICTÍCIOS e servem só para conferir a lógica de interseção e de média.
const test = require('node:test');
const assert = require('node:assert');

const C = require('../js/calculo.js');
const Mapa = require('../js/mapa-qcn.js');
const libs = require('../vendor/damnum-geo.js');
const { gerarPMTiles, fonteEmMemoria } = require('./pmtiles_sintetico.js');

function retangulo(lon1, lat1, lon2, lat2, props) {
    return {
        type: 'Feature', properties: props,
        geometry: { type: 'Polygon', coordinates: [[[lon1, lat1], [lon2, lat1], [lon2, lat2], [lon1, lat2], [lon1, lat1]]] }
    };
}

// Três classes vizinhas em Mato Grosso (valores fictícios).
const CLASSES = [
    retangulo(-55.52, -12.51, -55.50, -12.49, { id: 1, uf: 'MT', mun_nome: 'Fictício', c_pret: 'Fa', cagrpret: 'F', c_v_4i: 100 }),
    retangulo(-55.50, -12.51, -55.48, -12.49, { id: 2, uf: 'MT', mun_nome: 'Fictício', c_pret: 'Sa', cagrpret: 'OFL', c_v_4i: 20 }),
    retangulo(-55.52, -12.53, -55.48, -12.51, { id: 3, uf: 'MT', mun_nome: 'Fictício', c_pret: 'Sg', cagrpret: 'G', c_v_4i: 10 })
];
const ZOOM = 14;
const arquivo = gerarPMTiles(CLASSES, ZOOM);
const fontePMTiles = () => Mapa.criarFontePMTiles(libs, fonteEmMemoria(arquivo));
const fonteMemoria = () => Mapa.criarFonteGeoJSON(libs, CLASSES);

test('mapa desligado por constante enquanto os arquivos do INPE não chegam', () => {
    assert.strictEqual(Mapa.MAPA_QCN_ATIVO, false);
});

test('PMTiles sintético: cabeçalho lido com zoom máximo 14', async () => {
    const m = await fontePMTiles().metadados();
    assert.strictEqual(m.maxZoom, ZOOM);
});

for (const [nome, fonte] of [['PMTiles', fontePMTiles], ['GeoJSON em memória', fonteMemoria]]) {
    test(nome + ': polígono em duas classes, média ponderada pela área', async () => {
        // 3/4 na classe 1 (100 tC/ha) e 1/4 na classe 2 (20 tC/ha): média 80.
        const alvo = retangulo(-55.515, -12.505, -55.495, -12.495, {});
        const r = await Mapa.consultarPoligono(libs, fonte(), alvo, C.mediaPonderadaPorArea);
        assert.strictEqual(r.partes.length, 2);
        assert.strictEqual(r.partes[0].id, 1);
        assert.ok(Math.abs(r.estoque_tC_ha - 80) / 80 < 0.005, 'estoque ' + r.estoque_tC_ha);
        assert.ok(r.pct_descoberto < 0.5, 'descoberto ' + r.pct_descoberto);
        assert.ok(Math.abs(r.area_coberta_ha - r.area_ha) / r.area_ha < 0.005);
    });

    test(nome + ': polígono parcialmente fora da cobertura informa o percentual descoberto', async () => {
        // Metade dentro da classe 1, metade a oeste do mapa.
        const alvo = retangulo(-55.53, -12.505, -55.51, -12.495, {});
        const r = await Mapa.consultarPoligono(libs, fonte(), alvo, C.mediaPonderadaPorArea);
        assert.ok(Math.abs(r.pct_descoberto - 50) < 0.5, 'descoberto ' + r.pct_descoberto);
        assert.ok(Math.abs(r.estoque_tC_ha - 100) < 1e-9);
    });

    test(nome + ': polígono todo fora do mapa não tem estoque', async () => {
        const alvo = retangulo(-50.02, -10.01, -50.01, -10.0, {});
        const r = await Mapa.consultarPoligono(libs, fonte(), alvo, C.mediaPonderadaPorArea);
        assert.strictEqual(r.estoque_tC_ha, null);
        assert.strictEqual(r.pct_descoberto, 100);
    });

    test(nome + ': coordenada no interior de uma classe, sem vizinhas a 100 m', async () => {
        const r = await Mapa.consultarPonto(libs, fonte(), -55.51, -12.50);
        assert.strictEqual(r.poligono.id, 1);
        assert.strictEqual(r.estoque_tC_ha, 100);
        assert.strictEqual(r.vizinhas.length, 0);
        assert.match(r.aviso, /Estimativa aproximada/);
    });

    test(nome + ': coordenada a menos de 100 m da divisa lista a classe vizinha', async () => {
        // 0,0005° de longitude ≈ 54 m a oeste da divisa entre as classes 1 e 2.
        const r = await Mapa.consultarPonto(libs, fonte(), -55.5005, -12.50);
        assert.strictEqual(r.poligono.id, 1);
        assert.deepStrictEqual(r.vizinhas.map(v => v.id), [2]);
        assert.strictEqual(r.vizinhas[0].c_v_4i, 20);
        assert.ok(r.vizinhas[0].distancia_m > 40 && r.vizinhas[0].distancia_m < 70);
    });

    test(nome + ': coordenada fora da cobertura', async () => {
        const r = await Mapa.consultarPonto(libs, fonte(), -50.0, -10.0);
        assert.strictEqual(r.poligono, null);
        assert.strictEqual(r.estoque_tC_ha, null);
    });
}

test('área geodésica: 1° × 1° no equador ≈ 1,23 milhão de ha', () => {
    const ha = Mapa.areaHa(libs, retangulo(0, 0, 1, 1, {}));
    assert.ok(Math.abs(ha - 1230000) / 1230000 < 0.01, String(ha));
});

test('divergência entre área calculada e área digitada: aviso acima de 1%', () => {
    assert.strictEqual(Mapa.divergenciaDeArea(100.9, 100).diverge, false);
    assert.strictEqual(Mapa.divergenciaDeArea(101.1, 100).diverge, true);
    assert.strictEqual(Mapa.divergenciaDeArea(98.9, 100).diverge, true);
    assert.strictEqual(Mapa.divergenciaDeArea(10, 0), null);
});

test('normalização do arquivo do usuário: aceita geometria solta e rejeita arquivo sem polígono', () => {
    const fc = Mapa.normalizar(libs, CLASSES[0].geometry);
    assert.strictEqual(fc.features.length, 1);
    assert.throws(() => Mapa.normalizar(libs, { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }), /não contém polígono/);
});
