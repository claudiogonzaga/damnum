// Dano interino: os dois métodos e a faixa por tempos de recuperação publicados.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/calculo.js');
const V = require('../js/valoracao.js');
const R = require('../js/relatorio.js');
const series = require('../data/series_referencia.json');
const qcn = require('../data/estoques_qcn_fitofisionomias.json');
const tempos = require('../data/tempos_recuperacao.json');

function entrada(interino, extra) {
    return Object.assign({
        versao: '7.0', bioma: 'FLORESTA AMAZÔNICA', entendimento: 'gonzaga',
        dataCalculo: new Date(2026, 5, 15), dataDano: new Date(2019, 5, 15),
        areas: { fora: 10, em: 2 }, reparacaoInSitu: true,
        interino,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.00, origemCotacao: 'teste' },
        estoque: V.estoqueDaTabela(qcn, 'FLORESTA AMAZÔNICA', ''),
        opcaoExtrapatrimonial: 'reais', manual: null, identificacao: {}, consultas: [], hash: 'teste'
    }, extra || {});
}

// Nota Técnica 03/2022 do CAEx Ambiental/MPMT (atualizada em 17/01/2024), Quadros 1 e 2.
test('método CAEx reproduz o Quadro 1 da Nota Técnica 03/2022', () => {
    const r2 = v => Math.round(v * 100) / 100;
    assert.strictEqual(r2(9999.84 * C.fatorInterinoCAEx(6.82, 100)), 9986.20); // floresta, baixa resiliência
    assert.strictEqual(r2(9999.84 * C.fatorInterinoCAEx(6.82, 30)), 8618.13);  // cerrado, baixa resiliência
    assert.strictEqual(r2(6656.91 * C.fatorInterinoCAEx(6.82, 100)), 6647.83); // floresta, alta resiliência
    // A Nota traz 5.737,10; a conta dá 5.737,106.
    assert.ok(Math.abs(6656.91 * C.fatorInterinoCAEx(6.82, 30) - 5737.10) < 0.01);
});

test('método CAEx reproduz o Quadro 2 (juros do ano 1)', () => {
    const r2 = v => Math.round(v * 100) / 100;
    assert.strictEqual(r2(9999.84 * C.jurosAnoUmCAEx(6.82)), 638.45);
    assert.strictEqual(r2(6656.91 * C.jurosAnoUmCAEx(6.82)), 425.02);
    assert.strictEqual(r2(2669.88 * C.jurosAnoUmCAEx(6.82)), 170.46);
});

test('soma dos juros decrescentes é igual à forma fechada 1 − (1 + i)^−t', () => {
    assert.ok(Math.abs(C.fatorInterinoCAEx(6.82, 100) - (1 - Math.pow(1.0682, -100))) < 1e-12);
    assert.strictEqual(C.fatorInterinoCAEx(0, 50), 0);
});

test('faixa dos tempos publicados: mínimo, máximo e mediana', () => {
    const f = C.faixaDeTempos(tempos.formas.floresta.pontos);
    assert.deepStrictEqual([f.minimo, f.maximo, f.mediana, f.quantidade], [10, 120, 55, 8]);
    const s = C.faixaDeTempos(tempos.formas.savana.pontos);
    assert.deepStrictEqual([s.minimo, s.maximo, s.mediana, s.quantidade], [30, 30, 30, 1]);
    assert.strictEqual(C.mediana([3, 1, 2]), 2);
    assert.strictEqual(C.mediana([]), null);
});

test('todo ponto de tempo de recuperação tem anos, atributo e fonte', () => {
    for (const forma of Object.values(tempos.formas)) {
        for (const p of forma.pontos) {
            assert.ok(p.anos > 0 && p.atributo && p.fonte);
        }
    }
});

test('padrão: método de Gonzaga et al., taxa de 6% e tempo igual à mediana', () => {
    const p = V.interinoPadrao('gonzaga', 'floresta', tempos);
    assert.deepStrictEqual([p.metodo, p.taxaPct, p.tempo], ['gonzaga', 6, 55]);
    const r = V.calcular(entrada(p), series);
    assert.strictEqual(r.interino.fator, 0.06 * 56 / 2);
    assert.strictEqual(r.parcelas.interino.valor, C.arredondar(2 * r.custo.valorHa * 0.06 * 56 / 2, 2));
    assert.strictEqual(r.interino.faixa.length, 8);
    assert.strictEqual(r.interino.estatisticas.valor_mediana, r.interino.valorAreaProtegida);
    assert.ok(r.interino.estatisticas.valor_minimo < r.interino.estatisticas.valor_mediana);
    assert.ok(r.interino.estatisticas.valor_maximo > r.interino.estatisticas.valor_mediana);
});

test('método CAEx: 6,82% e 100 anos (floresta) ou 30 anos (cerrado)', () => {
    const f = V.interinoPadrao('caex', 'floresta', tempos);
    const s = V.interinoPadrao('caex', 'savana', tempos);
    assert.deepStrictEqual([f.taxaPct, f.tempo, s.tempo], [6.82, 100, 30]);
    const r = V.calcular(entrada(f), series);
    assert.strictEqual(r.parcelas.interino.valor, C.arredondar(2 * r.custo.valorHa * C.fatorInterinoCAEx(6.82, 100), 2));
    assert.strictEqual(r.interino.faixa, null);
});

test('método CAEx: área fora de APP e reserva legal só entra com os anos informados', () => {
    const sem = V.calcular(entrada(V.interinoPadrao('caex', 'floresta', tempos)), series);
    assert.strictEqual(sem.interino.valorAreaFora, 0);
    const cfg = Object.assign(V.interinoPadrao('caex', 'floresta', tempos), { anosAteRegularizacao: 5 });
    const com = V.calcular(entrada(cfg), series);
    assert.ok(Math.abs(com.interino.valorAreaFora - 10 * com.custo.valorHa * C.jurosAnoUmCAEx(6.82) * 5) < 1e-9);
    assert.strictEqual(com.parcelas.interino.valor, C.arredondar(com.interino.valorAreaProtegida + com.interino.valorAreaFora, 2));
    // No método de Gonzaga et al. os anos são ignorados.
    const g = V.calcular(entrada(Object.assign(V.interinoPadrao('gonzaga', 'floresta', tempos), { anosAteRegularizacao: 5 })), series);
    assert.strictEqual(g.interino.valorAreaFora, 0);
});

test('forma da vegetação: pela fitofisionomia; sem ela, Cerrado é savânico e os demais, florestais', () => {
    assert.strictEqual(V.formaDaVegetacao(qcn, 'CERRADO', ''), 'savana');
    assert.strictEqual(V.formaDaVegetacao(qcn, 'FLORESTA AMAZÔNICA', ''), 'floresta');
    const cerrado = qcn.biomas['Cerrado'].fitofisionomias;
    assert.strictEqual(V.formaDaVegetacao(qcn, 'CERRADO', cerrado.findIndex(f => f.categoria === 'F')), 'floresta');
    assert.strictEqual(V.formaDaVegetacao(qcn, 'CERRADO', cerrado.findIndex(f => f.categoria === 'G')), 'savana');
});

test('sem reparação in situ o interino da área protegida continua zero nos dois métodos', () => {
    for (const m of ['gonzaga', 'caex']) {
        const r = V.calcular(entrada(V.interinoPadrao(m, 'floresta', tempos), { reparacaoInSitu: false }), series);
        assert.strictEqual(r.parcelas.interino.valor, 0);
    }
});

test('relatório: faixa com mínimo, mediana e máximo no método padrão; Nota Técnica no método CAEx', () => {
    const cfg = Object.assign(V.interinoPadrao('gonzaga', 'floresta', tempos), { referencias: tempos.referencias });
    const g = R.gerarHTML(V.calcular(entrada(cfg), series));
    ['Faixa do dano interino', 'Mínimo', 'Mediana', 'Máximo', 'Poorter et al. (2021)', 'O valor adotado corresponde à mediana', 'POORTER, L. et al. Multidimensional'].forEach(t => assert.ok(g.includes(t), 'falta: ' + t));
    const editado = R.gerarHTML(V.calcular(entrada(Object.assign({}, cfg, { tempo: 20 })), series));
    assert.ok(editado.includes('informado pelo usuário, e não a mediana'));
    const c = R.gerarHTML(V.calcular(entrada(Object.assign(V.interinoPadrao('caex', 'floresta', tempos), { anosAteRegularizacao: 3 })), series));
    ['Nota Técnica 03/2022', 'José Guilherme Roquette', 'item 1.5', 'item 1.7', 'juros do ano 1'].forEach(t => assert.ok(c.includes(t), 'falta: ' + t));
    assert.ok(!c.includes('Faixa do dano interino'));
});

test('hash muda com o método do dano interino', () => {
    const a = V.textoCanonico(entrada(V.interinoPadrao('gonzaga', 'floresta', tempos)));
    const b = V.textoCanonico(entrada(V.interinoPadrao('caex', 'floresta', tempos)));
    assert.notStrictEqual(a, b);
});
