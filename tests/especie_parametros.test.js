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
    assert.strictEqual(K, 1.14); // padrão: RPPN, no próprio imóvel, todo o excedente protegido
    assert.strictEqual(c.inSituHa, 2);
    assert.strictEqual(c.custoHa, r.custo.valorHa);
    // Material: área desmatada em excedentes × K = 10,3 × 1,14 = 11,742, arredondada para 12.
    assert.strictEqual(item('material').ha, 12);
    // Interino: valor ÷ custo por hectare × K = área × i × (t + 1) ÷ 2 × K = 2 × 0,06 × 8 × 1,14.
    perto(item('interino').ha, 0.96 * K, 1e-4);
    // Residual (método padrão): área com reparação no local × 14% × K.
    perto(item('residual').ha, 2 * 0.14 * K, 1e-9);
    // Extrapatrimonial: valor ÷ custo por hectare × K.
    perto(item('mercado').ha, r.parcelas.mercado.valor / r.custo.valorHa * K, 1e-9);
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
    perto(item.ha, caex.parcelas.residual.valor / caex.custo.valorHa * 1.14, 1e-9);
    assert.match(item.regra, /custo de recuperação por hectare/);
    // Sem reparação no local, o material cobre a área toda: 12,3 × 1,14 = 14,02, arredondada para 15.
    const sem = V.calcular(entrada({ reparacaoInSitu: false }), series);
    assert.strictEqual(sem.compensacao.itens[0].ha, 15);
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
    perto(item.ha, com.parcelas.lia.total / 9469.61 * 1.14, 1e-9);
    assert.ok(com.parcelas.lia.total > com.parcelas.lia.valor);
    // O total a proteger passa a incluir a área do LIA.
    perto(com.compensacao.totalHa - sem.compensacao.totalHa, item.ha, 1e-9);
    const html = R.gerarHTML(com);
    ['valor atualizado do LIA ÷ preço da terra com vegetação nativa × K', 'R$\u00a09.469,61/ha', 'LIA: preço da terra com vegetação nativa',
        'compensado pela própria compensação ecológica, sem área adicional', 'A compensação ecológica compensa também o dano climático'].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
    assert.ok(R.gerarHTML(sem).includes('como esse preço não foi informado, a área não foi calculada'));
    assert.ok(!html.includes('sem equivalente em área'));
});

test('fator K por faixas: reproduz a tabela do levantamento (v. 3.1) e multiplica as áreas e o residual', () => {
    const casos = [
        [{}, 12, 0, 1.14], [{ vazamento: 'de25a60' }, 12, 10, 1.26], [{ vazamento: 'menos25' }, 12, 20, 1.42],
        [{ instrumento: 'servidao' }, 20, 0, 1.25], [{ instrumento: 'servidao', vazamento: 'de25a60' }, 20, 10, 1.39],
        [{ instrumento: 'servidao', vazamento: 'menos25' }, 20, 20, 1.56],
        [{ instrumento: 'servidao', vazamento: 'menos25', novoDesmate: true }, 30, 20, 1.79],
        [{ instrumento: 'servidao', vazamento: 'menos25', novoDesmate: true, posse: 'mais5', terraApta: true, fogo: 'semPlano' }, 52, 20, 2.60],
        [{ distancia: 'bacia' }, 12, 0, 1.48],
        [{ distancia: 'bacia', instrumento: 'servidao', vazamento: 'menos25', novoDesmate: true, posse: 'mais5', terraApta: true, fogo: 'semPlano' }, 52, 20, 3.39]
    ];
    for (const [cfg, b, v, K] of casos) {
        const f = V.fatorK(cfg);
        assert.deepStrictEqual([f.b, f.v, f.K], [b, v, K], JSON.stringify(cfg));
        assert.strictEqual(f.recusar, false);
    }
    assert.strictEqual(V.fatorK({ novoDesmate: true, posse: 'mais5', terraApta: true, fogo: 'semPlano', instrumento: 'servidao' }).recusar, false);
    assert.strictEqual(V.fatorK({ novoDesmate: true, posse: 'mais5', terraApta: true, fogo: 'semPlano' }).b, 52);
    const base = V.calcular(entrada({ compensacao: {} }), series);
    const bacia = V.calcular(entrada({ compensacao: { distancia: 'bacia' } }), series);
    assert.strictEqual(base.residual.k, 1.14);
    perto(bacia.residual.areaEmEspecie, 2 * 0.14 * 1.48, 1e-9);
    perto(bacia.parcelas.residual.valor / base.parcelas.residual.valor, 1.48 / 1.14, 1e-4);
    assert.strictEqual(bacia.compensacao.itens[0].ha, Math.ceil(10.3 * 1.48));
    assert.notStrictEqual(V.textoCanonico(entrada({ compensacao: {} })), V.textoCanonico(entrada({ compensacao: { distancia: 'bacia' } })));
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    ['compInstrumento', 'compDistancia', 'compVazamento', 'compPosse', 'compFogo', 'compNovoDesmate', 'compTerraApta'].forEach(id => assert.ok(html.includes('id="' + id + '"'), id));
    const rel = R.gerarHTML(bacia);
    ['K = 1,48', 'D = 1,3', 'Fator K da compensação ecológica', 'Verra', 'Compensação: fator de equivalência K', 'Enquanto a RPPN não for reconhecida'].forEach(t => assert.ok(rel.includes(t), 'falta: ' + t));
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
        'área ilegalmente desmatada × K, arredondada para cima', 'compensado pela própria compensação ecológica, sem área adicional', 'isto é 12 hectares',
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
