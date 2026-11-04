// Gradação do dano extrapatrimonial pelos critérios do STJ (REsp 2.200.069/MT):
// escala de cinco graus por critério, com o meio como padrão.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../js/calculo.js');
const V = require('../js/valoracao.js');
const R = require('../js/relatorio.js');
const series = require('../data/series_referencia.json');
const qcn = require('../data/estoques_qcn_fitofisionomias.json');
const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);

function entrada(extra) {
    return Object.assign({
        versao: '7.1', bioma: 'CERRADO', entendimento: 'gonzaga',
        dataCalculo: new Date(2026, 5, 15), dataDano: new Date(2019, 5, 15),
        areas: { fora: 10.3, em: 2 }, reparacaoInSitu: true, taxaInterinoPct: 6, tempoRecuperacao: 15,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.00, origemCotacao: 'teste' },
        estoque: V.estoqueDaTabela(qcn, 'CERRADO', ''), opcaoExtrapatrimonial: 'reais', manual: null,
        identificacao: {}, consultas: [], hash: 'teste', lia: null
    }, extra || {});
}

test('gradação: o meio é o padrão e mantém o valor-base', () => {
    const sem = V.calcular(entrada(), series);
    const meio = V.calcular(entrada({ gradacao: { contribuicao: 3, situacao: 3, perenidade: 3, culpa: 3, proveito: 3 } }), series);
    const e = sem.estoque;
    const base = C.arredondar(12.3 * e.tC * 3.67 * 25.00, 2);
    for (const r of [sem, meio]) {
        assert.strictEqual(r.gradacao.fator, 1);
        assert.strictEqual(r.gradacao.padrao, true);
        assert.strictEqual(r.gradacao.valorBase, base);
        assert.strictEqual(r.parcelas.mercado.valor, base);
    }
    assert.deepStrictEqual(sem.padroes.gradacao, { contribuicao: 3, situacao: 3, perenidade: 3, culpa: 3, proveito: 3 });
});

test('gradação: um ponto para qualquer lado do meio vale 1/8 do valor-base; dois pontos, 1/6', () => {
    const f = n => V.gradacaoExtrapatrimonial(n).fator;
    assert.deepStrictEqual(V.AJUSTE_GRAU_24, { 1: -4, 2: -3, 3: 0, 4: 3, 5: 4 });
    assert.strictEqual(f({ culpa: 4 }), 1 + 1 / 8);
    assert.strictEqual(f({ perenidade: 2 }), 1 - 1 / 8);
    perto(f({ contribuicao: 5 }), 1 + 1 / 6, 1e-12);
    perto(f({ situacao: 1 }), 1 - 1 / 6, 1e-12);
    // 1/6 + 1/8 − 1/8 = 1/6.
    perto(f({ culpa: 5, proveito: 4, situacao: 2 }), 7 / 6, 1e-12);
    const todos = g => ({ contribuicao: g, situacao: g, perenidade: g, culpa: g, proveito: g });
    perto(f(todos(5)), 11 / 6, 1e-12);
    perto(f(todos(1)), 1 / 6, 1e-12);
    perto(f(todos(4)), 1 + 5 / 8, 1e-12);
    // Grau inválido ou ausente vale o meio.
    for (const invalido of [0, 6, 2.5, 'x', null, undefined]) assert.strictEqual(f({ culpa: invalido }), 1);
    // Um ponto para cada lado se anula.
    const g = V.gradacaoExtrapatrimonial({ proveito: 5, culpa: 1 });
    assert.deepStrictEqual(g.criterios.map(c => c.rotulo), ['média', 'média', 'média', 'muito baixa', 'muito alto']);
    assert.deepStrictEqual(g.criterios.map(c => c.ajuste), ['0', '0', '0', '−1/6', '+1/6']);
    assert.strictEqual(g.soma24, 0);
    assert.strictEqual(g.fator, 1);
    assert.strictEqual(g.padrao, false);
});

test('gradação: frações exatas para a tela e o relatório', () => {
    const fr = V.fracao24;
    assert.deepStrictEqual([fr(3), fr(4), fr(-3), fr(-4), fr(0), fr(7), fr(6), fr(8), fr(-20)], ['+1/8', '+1/6', '−1/8', '−1/6', '0', '+7/24', '+1/4', '+1/3', '−5/6']);
    assert.deepStrictEqual([fr(24, false), fr(27, false), fr(28, false), fr(31, false), fr(44, false), fr(4, false)], ['1', '9/8', '7/6', '31/24', '11/6', '1/6']);
    const g = V.gradacaoExtrapatrimonial({ culpa: 5, proveito: 4 });
    assert.strictEqual(g.soma, '+7/24');
    assert.strictEqual(g.fatorFracao, '31/24');
});

test('gradação: os cinco critérios são os do STJ, menos a extensão, que o valor-base já mede', () => {
    assert.deepStrictEqual(V.GRADACAO_STJ.map(c => c.nome), [
        'Contribuição causal do infrator', 'Situação socioeconômica do infrator', 'Perenidade do dano',
        'Gravidade da culpa', 'Proveito obtido com o ilícito']);
    V.GRADACAO_STJ.forEach(c => assert.strictEqual(c.graus.length, 5));
});

test('gradação: o fator vale só para o extrapatrimonial, e a compensação usa o valor graduado', () => {
    const padrao = V.calcular(entrada(), series);
    const r = V.calcular(entrada({ gradacao: { culpa: 5, proveito: 4 } }), series);
    assert.strictEqual(r.gradacao.fator, 31 / 24);
    assert.strictEqual(r.parcelas.mercado.valor, C.arredondar(r.gradacao.valorBase * 31 / 24, 2));
    assert.strictEqual(r.parcelas.mercado.juros, C.truncar(r.parcelas.mercado.valor * r.parcelas.mercado.percentualJuros / 100, 2));
    // Dano climático e demais parcelas não mudam.
    for (const k of ['material', 'interino', 'residual', 'social']) assert.strictEqual(r.parcelas[k].valor, padrao.parcelas[k].valor);
    assert.strictEqual(r.compensacao.climatico.valor, padrao.compensacao.climatico.valor);
    // A área de compensação do extrapatrimonial acompanha o valor graduado.
    const item = x => x.compensacao.itens.filter(i => i.chave === 'mercado')[0];
    perto(item(r).ha, r.parcelas.mercado.valor / r.compensacao.custoHojeHa * r.compensacao.fatorK.K, 1e-9);
    perto(item(r).ha / item(padrao).ha, 31 / 24, 1e-6);
    perto(r.totais.original - padrao.totais.original, r.parcelas.mercado.valor - padrao.parcelas.mercado.valor, 0.011);
});

test('relatório: quadro da gradação, com fator, valor-base e o que o usuário alterou', () => {
    const padrao = R.gerarHTML(V.calcular(entrada(), series));
    ['Gradação pelos critérios do STJ', 'REsp 2.200.069/MT', 'Dano extrapatrimonial: fator de gradação', '(todos os critérios no meio)',
        'Todos os critérios ficaram no meio; o valor graduado é o valor-base.', 'Recurso Especial n. 2.200.069/MT'].forEach(t => assert.ok(padrao.includes(t), 'falta: ' + t));
    assert.ok(!padrao.includes('alterado pelo usuário'));
    const r = V.calcular(entrada({ gradacao: { culpa: 5, proveito: 4 } }), series);
    const html = R.gerarHTML(r);
    V.GRADACAO_STJ.forEach(c => assert.ok(html.includes(c.nome), 'falta: ' + c.nome));
    ['× fator de gradação', 'Valor-base (extensão do dano)', '5 (muito alta)', '4 (alto)', '+1/6', '+1/8', '1 + soma dos ajustes (+7/24)', '31/24 ≈ 1,2917',
        'Um grau para qualquer lado do meio soma ou retira 1/8 do valor-base; dois graus, 1/6.'].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
    const moeda = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    assert.ok(html.includes('Valor graduado: ' + moeda(r.gradacao.valorBase) + ' × 31/24 = <b>' + moeda(r.parcelas.mercado.valor) + '</b>'));
    assert.strictEqual(html.split('alterado pelo usuário').length - 1, 1);
});

test('relatório: abaixo do meio, avisa quando o preço implícito fica abaixo do piso do CNJ', () => {
    const r = V.calcular(entrada({ gradacao: { situacao: 1 } }), series);
    assert.strictEqual(r.gradacao.fator, 20 / 24);
    // US$ 5,00 × 5/6 = US$ 4,17.
    assert.ok(R.gerarHTML(r).includes('preço implícito da tonelada ficou em US$ 4,17/tCO₂'));
    const caro = entrada({ gradacao: { situacao: 1 } });
    caro.parametros = Object.assign({}, caro.parametros, { precoMercadoCO2USD: 10 });
    assert.strictEqual(V.calcular(caro, series).gradacao.aviso, '');
    assert.strictEqual(V.calcular(entrada({ gradacao: { situacao: 5 } }), series).gradacao.aviso, '');
});

test('relatório: bioma patrimônio nacional traz o critério 7 do REsp 2.200.069/MT', () => {
    const amazonia = entrada({ bioma: 'FLORESTA AMAZÔNICA', estoque: V.estoqueDaTabela(qcn, 'FLORESTA AMAZÔNICA', '') });
    assert.ok(R.gerarHTML(V.calcular(amazonia, series)).includes('O bioma é patrimônio nacional (Constituição, art. 225, § 4º)'));
    assert.ok(!R.gerarHTML(V.calcular(entrada(), series)).includes('O bioma é patrimônio nacional'));
});

test('hash: a gradação entra no texto canônico', () => {
    assert.strictEqual(V.textoCanonico(entrada()), V.textoCanonico(entrada({ gradacao: { culpa: 3 } })));
    assert.notStrictEqual(V.textoCanonico(entrada()), V.textoCanonico(entrada({ gradacao: { culpa: 4 } })));
});

test('tela: caixa da gradação aberta no formulário e nota no resultado', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /<details class="input-group" id="grupoGradacao" open>/);
    ['id="camposGradacao"', 'id="notaGradacao"', 'id="btnGradacaoMeio"', 'id="notaGradacaoResultado"', 'REsp 2.200.069/MT'].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
});
