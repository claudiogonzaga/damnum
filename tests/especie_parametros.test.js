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
    const K = c.fatorK.K;
    assert.strictEqual(K, 1.56); // padrão: servidão, no próprio imóvel, vazamento de 20%
    assert.strictEqual(c.inSituHa, 2);
    assert.strictEqual(c.custoHa, r.custo.valorHa);
    // Material: área desmatada em excedentes × K = 10,3 × 1,56 = 16,07, arredondada para 17.
    assert.strictEqual(item('material').ha, 17);
    // Interino: valor ÷ custo por hectare × K = área × i × (t + 1) ÷ 2 × K = 2 × 0,06 × 8 × 1,14.
    perto(item('interino').ha, 0.96 * K, 1e-4);
    // Residual (método padrão): área com reparação no local × 14% × K.
    perto(item('residual').ha, 2 * 0.14 * K, 1e-9);
    // Extrapatrimonial (preço de hoje): valor ÷ custo por hectare de hoje × K.
    assert.ok(c.custoHojeHa > c.custoHa);
    perto(item('mercado').ha, r.parcelas.mercado.valor / c.custoHojeHa * K, 1e-9);
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
    perto(item.ha, caex.parcelas.residual.valor / caex.custo.valorHa * 1.56, 1e-9);
    assert.match(item.regra, /custo de recuperação por hectare/);
    // Sem reparação no local, o material cobre a área toda: 12,3 × 1,56 = 19,19, arredondada para 20.
    const sem = V.calcular(entrada({ reparacaoInSitu: false }), series);
    assert.strictEqual(sem.compensacao.itens[0].ha, 20);
    assert.strictEqual(sem.compensacao.inSituHa, 0);
});

test('LIA em área: valor atualizado do LIA ÷ preço da terra com vegetação nativa', () => {
    const base = Object.assign(V.liaPadrao('CERRADO', 10.3, 'soja', 7), { anoRegularizacao: 2026, rotuloAtividade: 'soja' });
    // Padrão: preço do INCRA (2024) para o mercado Norte Araguaia.
    assert.strictEqual(base.precoTerraNativa, 9469.61);
    const sem = V.calcular(entrada({ lia: Object.assign({}, base, { precoTerraNativa: 0 }) }), series);
    const itemSem = sem.compensacao.itens.filter(i => i.chave === 'lia')[0];
    assert.strictEqual(itemSem.ha, null);
    assert.match(itemSem.regra, /informe o preço da terra/);
    const com = V.calcular(entrada({ lia: Object.assign({}, base, { precoTerraNativa: 9469.61 }) }), series);
    const item = com.compensacao.itens.filter(i => i.chave === 'lia')[0];
    perto(item.ha, com.parcelas.lia.total / 9469.61 * 1.56, 1e-9);
    assert.ok(com.parcelas.lia.total > com.parcelas.lia.valor);
    // O total a proteger passa a incluir a área do LIA.
    perto(com.compensacao.totalHa - sem.compensacao.totalHa, item.ha, 1e-9);
    const html = R.gerarHTML(com);
    ['valor atualizado do LIA ÷ preço da terra com vegetação nativa × K', 'R$\u00a09.469,61/ha', 'LIA: preço da terra com vegetação nativa',
        'compensado pela própria compensação ecológica, sem área adicional', 'A compensação ecológica compensa também o dano climático'].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
    assert.ok(R.gerarHTML(sem).includes('como esse preço não foi informado, a área não foi calculada'));
    assert.ok(!html.includes('sem equivalente em área'));
});

test('fator K: servidão 1,56 por padrão, negociável até 1,14; RPPN 1,14', () => {
    assert.strictEqual(V.fatorK({}).K, 1.56);
    assert.strictEqual(V.fatorK({ instrumento: 'servidao' }).K, 1.56);
    assert.strictEqual(V.fatorK({ instrumento: 'servidao', kServidao: 1.3 }).K, 1.3);
    assert.strictEqual(V.fatorK({ instrumento: 'servidao', kServidao: 1.3 }).negociado, true);
    assert.strictEqual(V.fatorK({ instrumento: 'servidao', kServidao: 0.9 }).K, 1.14);
    assert.strictEqual(V.fatorK({ instrumento: 'servidao', kServidao: 3 }).K, 1.56);
    assert.strictEqual(V.fatorK({ instrumento: 'rppn', kServidao: 1.5 }).K, 1.14);
    const servidao = V.calcular(entrada({ compensacao: {} }), series);
    const rppn = V.calcular(entrada({ compensacao: { instrumento: 'rppn' } }), series);
    assert.strictEqual(servidao.residual.k, 1.56);
    assert.strictEqual(rppn.residual.k, 1.14);
    perto(rppn.residual.areaEmEspecie, 2 * 0.14 * 1.14, 1e-9);
    perto(servidao.parcelas.residual.valor / rppn.parcelas.residual.valor, 1.56 / 1.14, 1e-4);
    assert.strictEqual(rppn.compensacao.itens[0].ha, Math.ceil(10.3 * 1.14));
    assert.notStrictEqual(V.textoCanonico(entrada({ compensacao: {} })), V.textoCanonico(entrada({ compensacao: { instrumento: 'rppn' } })));
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /<option value="servidao" selected>/);
    assert.match(html, /id="compKServidao" value="1.56" step="0.01" min="1.14" max="1.56"/);
    assert.ok(html.includes('não pode abranger áreas já protegidas do imóvel, como a reserva legal e as APPs'));
    const rel = R.gerarHTML(rppn);
    ['K = 1,14', 'Fator K da compensação ecológica', 'Compensação: fator de equivalência K', 'não pode abranger áreas já protegidas do imóvel', 'Enquanto a RPPN não for reconhecida'].forEach(t => assert.ok(rel.includes(t), 'falta: ' + t));
    assert.ok(R.gerarHTML(V.calcular(entrada({ compensacao: { kServidao: 1.3 } }), series)).includes('reduzido por negociação a 1,30'));
});

test('residual: o seletor traz cada estimativa com a fonte, e a mediana sai redonda', () => {
    assert.strictEqual(V.residualPadrao('gonzaga').pfePct, 14);
    const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.match(script, /function preencherEstimativasPFE\(metodo\)/);
    assert.match(script, /p\.fonte \+ ': ' \+ p\.nota/);
    assert.ok(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes('id="pfeFonte"'));
});

test('relatório: a reparação em espécie vem antes do demonstrativo em dinheiro', () => {
    const html = R.gerarHTML(V.calcular(entrada(), series));
    const iEspecie = html.indexOf('REPARAÇÃO EM ESPÉCIE, QUE PRECEDE A INDENIZAÇÃO');
    const iDemonstrativo = html.indexOf('2. DEMONSTRATIVO DISCRIMINADO POR PARCELA');
    assert.ok(iEspecie > 0 && iEspecie < iDemonstrativo);
    ['precedência em relação à opção pela indenização pecuniária', 'Área a recuperar no próprio local: <b>2,0000 ha</b>', 'Área a proteger (ha)',
        'área ilegalmente desmatada × K, arredondada para cima', 'compensado pela própria compensação ecológica, sem área adicional', 'isto é 17 hectares', 'hoje (', 
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
        'Compensação: fator de equivalência K', 'Dano residual: percentual (estimativas)'].forEach(t => assert.ok(padrao.includes(t), 'falta: ' + t));
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
