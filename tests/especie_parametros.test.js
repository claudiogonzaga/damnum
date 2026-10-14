// Reparação em espécie antes da indenização, fator k do dano residual e quadro
// de parâmetros com fonte e data.
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

test('compensação ecológica: hectares de cada parcela pelas regras do método', () => {
    const r = V.calcular(entrada(), series);
    const c = r.compensacao;
    const item = k => c.itens.filter(i => i.chave === k)[0];
    assert.strictEqual(c.inSituHa, 2);
    assert.strictEqual(c.custoHa, r.custo.valorHa);
    // Material: área igual à desmatada fora de APP e reserva legal, arredondada para cima.
    assert.strictEqual(item('material').ha, 11);
    // Interino: valor ÷ custo por hectare = área × i × (t + 1) ÷ 2 = 2 × 0,06 × 8 = 0,96 ha.
    perto(item('interino').ha, 0.96, 1e-4);
    // Residual (método padrão): área com reparação no local × 14% × k.
    perto(item('residual').ha, 2 * 0.14, 1e-9);
    // Extrapatrimonial: valor ÷ custo por hectare.
    perto(item('mercado').ha, r.parcelas.mercado.valor / r.custo.valorHa, 1e-9);
    perto(c.totalHa, c.itens.reduce((s, i) => s + i.ha, 0), 1e-9);
    // Dano climático: compensado pela própria compensação, sem área adicional.
    assert.ok(!c.itens.some(i => i.chave === 'social'));
    assert.strictEqual(c.climatico.valor, r.parcelas.social.valor);
    assert.ok(!c.itens.some(i => i.chave === 'lia'));
});

test('compensação ecológica: sem dano material no IRDR; residual do CAEx convertido pelo custo', () => {
    const irdr = V.calcular(entrada({ entendimento: 'irdr' }), series);
    assert.strictEqual(irdr.compensacao.itens[0].ha, 0);
    const caex = V.calcular(entrada({ residual: V.residualPadrao('caex') }), series);
    const item = caex.compensacao.itens.filter(i => i.chave === 'residual')[0];
    perto(item.ha, caex.parcelas.residual.valor / caex.custo.valorHa, 1e-9);
    assert.match(item.regra, /custo de recuperação por hectare/);
    // Sem reparação no local, o material cobre a área toda (12,3 ha, arredondada para 13).
    const sem = V.calcular(entrada({ reparacaoInSitu: false }), series);
    assert.strictEqual(sem.compensacao.itens[0].ha, 13);
    assert.strictEqual(sem.compensacao.inSituHa, 0);
});

test('LIA em área: valor atualizado do LIA ÷ preço da terra com vegetação nativa', () => {
    const base = Object.assign(V.liaPadrao('CERRADO', 10.3, 'soja', 7), { anoRegularizacao: 2026, rotuloAtividade: 'soja' });
    const sem = V.calcular(entrada({ lia: base }), series);
    const itemSem = sem.compensacao.itens.filter(i => i.chave === 'lia')[0];
    assert.strictEqual(itemSem.ha, null);
    assert.match(itemSem.regra, /informe o preço da terra/);
    const com = V.calcular(entrada({ lia: Object.assign({}, base, { precoTerraNativa: 9469.61 }) }), series);
    const item = com.compensacao.itens.filter(i => i.chave === 'lia')[0];
    perto(item.ha, com.parcelas.lia.total / 9469.61, 1e-9);
    assert.ok(com.parcelas.lia.total > com.parcelas.lia.valor);
    // O total a proteger passa a incluir a área do LIA.
    perto(com.compensacao.totalHa - sem.compensacao.totalHa, item.ha, 1e-9);
    const html = R.gerarHTML(com);
    ['valor atualizado do LIA ÷ preço da terra com vegetação nativa', 'R$\u00a09.469,61/ha', 'LIA: preço da terra com vegetação nativa',
        'compensado pela própria compensação ecológica, sem área adicional', 'A compensação ecológica compensa também o dano climático'].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
    assert.ok(R.gerarHTML(sem).includes('como esse preço não foi informado, a área não foi calculada'));
    assert.ok(!html.includes('sem equivalente em área'));
});

test('fator k do dano residual multiplica a área em espécie e o valor', () => {
    const base = V.calcular(entrada(), series);
    const k2 = V.calcular(entrada({ residual: Object.assign(V.residualPadrao('gonzaga'), { k: 2 }) }), series);
    perto(k2.residual.areaEmEspecie, 2 * base.residual.areaEmEspecie, 1e-9);
    perto(k2.parcelas.residual.valor, 2 * base.parcelas.residual.valor, 0.011);
    assert.notStrictEqual(V.textoCanonico(entrada()), V.textoCanonico(entrada({ residual: Object.assign(V.residualPadrao('gonzaga'), { k: 2 }) })));
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /id="kResidual" value="1"/);
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8'), /padrao\.k = parseFloat\(valorCampo\('kResidual'\)\)/);
});

test('relatório: a reparação em espécie vem antes do demonstrativo em dinheiro', () => {
    const html = R.gerarHTML(V.calcular(entrada(), series));
    const iEspecie = html.indexOf('REPARAÇÃO EM ESPÉCIE, QUE PRECEDE A INDENIZAÇÃO');
    const iDemonstrativo = html.indexOf('2. DEMONSTRATIVO DISCRIMINADO POR PARCELA');
    assert.ok(iEspecie > 0 && iEspecie < iDemonstrativo);
    ['precedência em relação à opção pela indenização pecuniária', 'Área a recuperar no próprio local: <b>2,0000 ha</b>', 'Área a proteger (ha)',
        'área igual à ilegalmente desmatada, arredondada para cima', 'compensado pela própria compensação ecológica, sem área adicional', 'isto é 11 hectares',
        'Regras para a instituição de RPPN'].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
    assert.ok(!html.includes('CENÁRIOS QUANTO À REPARAÇÃO'));
    // Na tela, o bloco da reparação em espécie vem antes dos valores.
    const pagina = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(pagina.indexOf('id="secaoEspecie"') < pagina.indexOf('id="danoMaterialMedia"'));
    assert.ok(pagina.indexOf('id="secaoEspecie"') > pagina.indexOf('id="resultado"'));
});

test('relatório: a faixa do dano residual traz a ressalva de que é exploratória', () => {
    const html = R.gerarHTML(V.calcular(entrada(), series));
    assert.ok(html.includes('A faixa é exploratória'));
    assert.ok(html.includes('não equivale a intervalo estatístico'));
});

test('relatório: quadro de parâmetros com fonte, data e o que o usuário alterou', () => {
    const padrao = R.gerarHTML(V.calcular(entrada(), series));
    ['PARÂMETROS DE REFERÊNCIA', 'Data de referência', 'Portaria Ibama 118/2022', 'out./2022', 'Ricke et al. (2018)', 'out./2024',
        'Dano residual: fator de equivalência (k)'].forEach(t => assert.ok(padrao.includes(t), 'falta: ' + t));
    assert.ok(!padrao.includes('alterado pelo usuário'));
    const mudou = entrada({ taxaInterinoPct: 8 });
    mudou.parametros.precoSocialCO2USD = 30;
    const html = R.gerarHTML(V.calcular(mudou, series));
    assert.strictEqual(html.split('alterado pelo usuário').length - 1, 2);
    // Com o LIA, entram os parâmetros dele, com a data de cada um.
    const cfg = Object.assign(V.liaPadrao('CERRADO', 10.3, 'soja', 7), { anoRegularizacao: 2026, rotuloAtividade: 'soja', ebitda: 2000 });
    const comLia = R.gerarHTML(V.calcular(entrada({ lia: cfg }), series));
    ['LIA: lucro operacional (EBITDA)', 'LIA: honorários técnicos evitados', 'set./2026', 'média de 2010 a 2025'].forEach(t => assert.ok(comLia.includes(t), 'falta: ' + t));
    assert.strictEqual(comLia.split('alterado pelo usuário').length - 1, 1);
    assert.ok(!/Santa L/i.test(comLia));
});

test('LIA: o relatório presume o uso de toda a área e põe a prova a cargo do infrator', () => {
    const cfg = Object.assign(V.liaPadrao('CERRADO', 10.3, 'soja', 7), { anoRegularizacao: 2026, rotuloAtividade: 'soja' });
    const html = R.gerarHTML(V.calcular(entrada({ lia: cfg }), series));
    assert.ok(html.includes('presume-se o uso de toda a área desmatada desde o desmatamento, cabendo ao infrator provar uso parcial ou cessado (Súmula 618/STJ'));
});
