// Dano interino e dano residual: método padrão (Gonzaga et al.) e método do
// CAEx Ambiental/MPMT, defendido por José Guilherme Roquette. Os números de
// conferência vêm da Nota Técnica 03/2022 (Quadros 1 e 2) e do Relatório
// Técnico 963/2026.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/calculo.js');
const V = require('../js/valoracao.js');
const R = require('../js/relatorio.js');
const series = require('../data/series_referencia.json');
const qcn = require('../data/estoques_qcn_fitofisionomias.json');
const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);

function entrada(extra) {
    return Object.assign({
        versao: '7.0', bioma: 'FLORESTA AMAZÔNICA', entendimento: 'gonzaga',
        dataCalculo: new Date(2026, 5, 15), dataDano: new Date(2023, 11, 15),
        areas: { fora: 0, em: 215.71 }, reparacaoInSitu: true, taxaInterinoPct: 6, tempoRecuperacao: 15,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.00, origemCotacao: 'teste' },
        estoque: V.estoqueDaTabela(qcn, 'FLORESTA AMAZÔNICA', ''), opcaoExtrapatrimonial: 'reais', manual: null,
        identificacao: {}, consultas: [], hash: 'teste', lia: null
    }, extra || {});
}

test('interino padrão: Gonzaga et al., 6% e 15 anos; CAEx: 6,82%, 100 ou 30 anos e custo de Timotheo', () => {
    assert.deepStrictEqual(V.interinoPadrao('gonzaga', 'floresta'), { metodo: 'gonzaga', forma: 'floresta', taxaPct: 6, tempo: 15, anosAteRegularizacao: 0 });
    const f = V.interinoPadrao('caex', 'floresta'), s = V.interinoPadrao('caex', 'savana');
    assert.deepStrictEqual([f.taxaPct, f.tempo, f.resiliencia], [6.82, 100, 'baixa']);
    assert.strictEqual(s.tempo, 30);
});

test('interino do CAEx reproduz a Nota Técnica: Quadro 1 (floresta) e Quadro 2 (cerrado)', () => {
    // Quadro 1: baixa resiliência, floresta, 100 anos: R$ 9.985,95/ha (custo de R$ 9.999,84).
    const baixa = V.calcularInterino(V.interinoPadrao('caex', 'floresta'), 0, 9999.84, 1, 0);
    perto(baixa.valorAreaProtegida, 9985.95, 0.5);
    const alta = V.calcularInterino(Object.assign(V.interinoPadrao('caex', 'savana'), { resiliencia: 'alta' }), 0, 6656.91, 1, 0);
    perto(alta.valorAreaProtegida, 6656.91 * C.fatorInterinoCAEx(6.82, 30), 1e-9);
    assert.strictEqual(alta.custoHa, 6656.91);
});

test('interino: o método do CAEx usa o custo de Timotheo; o padrão usa o custo do DAMNUM', () => {
    const padrao = V.calcular(entrada(), series);
    assert.strictEqual(padrao.interino.custoHa, padrao.custo.valorHa);
    const caex = V.calcular(entrada({ interino: V.interinoPadrao('caex', 'floresta') }), series);
    assert.strictEqual(caex.interino.custoHa, 9999.84);
    assert.notStrictEqual(caex.interino.custoHa, caex.custo.valorHa);
    // Valor da Nota, sem reajuste, qualquer que seja a data do dano.
    const antes = V.calcular(entrada({ dataDano: new Date(2020, 5, 15), interino: V.interinoPadrao('caex', 'floresta') }), series);
    assert.strictEqual(antes.interino.custoHa, 9999.84);
});

test('residual padrão: faixa do percentual não recuperado, de 1,99% a 26%, mediana de 14%', () => {
    const e = C.faixaDeValores(V.RESIDUAL_PONTOS.map(p => p.pct));
    assert.deepStrictEqual([e.minimo, e.mediana, e.maximo, e.quantidade], [1.99, 14, 26, 5]);
    assert.strictEqual(V.residualPadrao('gonzaga').pfePct, 14);
    const d = V.calcularResidual(V.residualPadrao('gonzaga'), 10000, null, 100);
    assert.strictEqual(d.valor, 100 * 10000 * 0.14);
    perto(d.areaEmEspecie, 14, 1e-9);
    perto(d.estatisticas.valor_minimo, 100 * 10000 * 0.0199, 1e-6);
    perto(d.estatisticas.valor_maximo, 100 * 10000 * 0.26, 1e-6);
    assert.strictEqual(d.faixa.length, 5);
});

test('residual do CAEx reproduz o Relatório Técnico 963/2026: 215,71 ha = R$ 2.621.482,72', () => {
    const d = V.calcularResidual(V.residualPadrao('caex'), 0, 41649.33, 215.71);
    assert.strictEqual(C.arredondar(d.valor, 2), 2621482.72);
    const r = V.calcular(entrada({ residual: V.residualPadrao('caex') }), series);
    assert.strictEqual(r.parcelas.residual.valor, 2621482.72);
});

test('na valoração: o residual só incide na área com reparação in situ, é atualizado e entra nos totais', () => {
    const r = V.calcular(entrada({ areas: { fora: 10, em: 2 } }), series);
    assert.strictEqual(r.residual.area, 2);
    assert.strictEqual(r.parcelas.residual.valor, C.arredondar(2 * r.custo.valorHa * 0.14, 2));
    assert.ok(r.parcelas.residual.correcao > 0 && r.parcelas.residual.juros > 0);
    const semReparo = V.calcular(entrada({ areas: { fora: 10, em: 2 }, reparacaoInSitu: false }), series);
    assert.strictEqual(semReparo.parcelas.residual.valor, 0);
    assert.ok(R.gerarHTML(semReparo).includes('não há dano residual a calcular'));
    const p = r.parcelas;
    assert.strictEqual(r.totais.original, C.arredondar(p.material.valor + p.interino.valor + p.residual.valor + p.mercado.valor + p.social.valor, 2));
    const outro = entrada({ residual: Object.assign(V.residualPadrao('gonzaga'), { pfePct: 20 }) });
    assert.notStrictEqual(V.textoCanonico(outro), V.textoCanonico(entrada()));
});

test('relatório: seções do interino e do residual em cada método', () => {
    const padrao = R.gerarHTML(V.calcular(entrada(), series));
    ['2.2 Dano interino', '2.3 Dano residual', 'Faixa do dano residual conforme o percentual que não se recupera', 'Mediana', 'Reparação em espécie',
        '2.4 Dano extrapatrimonial', '2.5 Dano climático', 'POORTER, Lourens'].forEach(t => assert.ok(padrao.includes(t), 'falta: ' + t));
    assert.ok(!padrao.includes('tempo de recuperação</b>'));
    const caex = R.gerarHTML(V.calcular(entrada({ interino: V.interinoPadrao('caex', 'floresta'), residual: V.residualPadrao('caex') }), series));
    ['Nota Técnica 03/2022', 'Relatório Técnico 963/2026', 'Timotheo et al., 2017', 'sem reajuste', 'A × (custo de reposição × PFE) ÷ i'].forEach(t => assert.ok(caex.includes(t), 'falta: ' + t));
    assert.ok(!caex.includes('Faixa do dano residual'));
});
