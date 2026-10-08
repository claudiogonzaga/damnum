// Lucro do ilícito ambiental (LIA). Os números de conferência vêm do resumo
// expandido de Gonzaga, Roquette, Silva e Sinisgalli (SICAM 2026), Tabela 2 e
// caso hipotético de 1.000 ha em Mato Grosso.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/calculo.js');
const V = require('../js/valoracao.js');
const R = require('../js/relatorio.js');
const series = require('../data/series_referencia.json');
const qcn = require('../data/estoques_qcn_fitofisionomias.json');
const r2 = v => Math.round(v * 100) / 100;
const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);

test('ΔVT: antecipação da valorização, R$ 33.020,24/ha a 3,74% ao ano', () => {
    perto(33020.24 * C.fatorAntecipacao(3.74, 1), 1190, 1);      // "≈ R$ 1.190/ha"
    perto(33020.24 * C.fatorAntecipacao(3.74, 16), 14670, 1);    // "≈ R$ 14.670/ha"
    perto(C.fatorAntecipacao(3.74, 1), 0.0361, 0.0001);
    perto(C.fatorAntecipacao(3.74, 16), 0.4443, 0.0001);
    // Sensibilidade do trabalho: R$ 11,6 e 17,3 milhões para 1.000 ha com r de 2,74% e 4,74%.
    perto(33020.24 * 1000 * C.fatorAntecipacao(2.74, 16) / 1e6, 11.6, 0.05);
    perto(33020.24 * 1000 * C.fatorAntecipacao(4.74, 16) / 1e6, 17.3, 0.05);
});

test('GR: adiamento da reposição florestal, R$ 343,16/ha a 9,73% ao ano', () => {
    perto(343.16 * (C.fatorCapitalizacao(9.73, 3) - 1), 110, 0.5);
    perto(343.16 * (C.fatorCapitalizacao(9.73, 5) - 1), 203, 0.5);
    perto(343.16 * (C.fatorCapitalizacao(9.73, 16) - 1), 1173, 0.5);
});

test('referência de MT: taxa de reposição do Cerrado e Plano de Exploração Florestal', () => {
    const p = V.liaPadrao('CERRADO', 1000, 'soja', 16);
    assert.strictEqual(p.reposicaoHa, 343.16);                    // 1,3 UPF/MT
    assert.strictEqual(p.volumeM3, 50);
    // 205 UPF (R$ 54.113,85, "R$ 54,1 mil") + vistoria de R$ 5.500; sem Diagnóstico até 1.000 ha.
    assert.strictEqual(p.taxasLicenciamento, r2(205 * 263.97 + 5500));
    assert.strictEqual(V.liaPadrao('CERRADO', 1001, 'soja', 16).taxasLicenciamento, r2((5 + 0.2 * 1001 + 65) * 263.97 + 5500));
    assert.strictEqual(V.liaPadrao('CERRADO', 0, 'soja', 16).taxasLicenciamento, 0);
    assert.deepStrictEqual([p.ebitda, p.arrendamento], [1558.57, 305.33]);
    assert.strictEqual(V.liaPadrao('CERRADO', 10, 'pecuaria', 5).arrendamento, 0);
});

test('caso do trabalho: renda da terra de R$ 3,4 milhões (1.000 ha, 11 anos de soja)', () => {
    const cfg = Object.assign(V.liaPadrao('CERRADO', 0, 'soja', 16), { anosAtividade: 11 });
    const l = V.calcularLIA(cfg, 0, 1000);
    perto(l.naoAutorizavel.renda / 1e6, 3.4, 0.05);
    perto(l.naoAutorizavel.reposicao / 1e6, 1.2, 0.05);           // "GR de R$ 1,2 milhão"
});

test('árvore de decisão: área autorizável leva CL; não autorizável leva Gf', () => {
    const cfg = Object.assign(V.liaPadrao('CERRADO', 100, 'soja', 5), { precoMadeira: 200 });
    const l = V.calcularLIA(cfg, 100, 20);
    assert.ok(l.autorizavel.licenciamento > 0);
    assert.strictEqual(l.autorizavel.produtoFlorestal, 0);
    assert.strictEqual(l.naoAutorizavel.licenciamento, 0);
    assert.strictEqual(l.naoAutorizavel.produtoFlorestal, 20 * 50 * 200);
    assert.strictEqual(l.autorizavel.lucro, 100 * 1558.57 * 5);
    assert.strictEqual(l.autorizavel.renda, 100 * 305.33 * 5);
    assert.strictEqual(l.autorizavel.antecipacao, 0);
    // 100 ha de cerrado: cenário de 50 ha do orçamento, R$ 39.360,00 ÷ 50 = R$ 787,20/ha.
    assert.strictEqual(cfg.honorariosHa, 787.20);
    perto(l.autorizavel.licenciamento, cfg.taxasLicenciamento + 787.20 * 100, 1e-6);
    perto(l.total, l.autorizavel.total + l.naoAutorizavel.total, 1e-9);
});

test('sem atividade: a terra entra pela antecipação, nunca somada ao lucro e à renda', () => {
    const cfg = Object.assign(V.liaPadrao('CERRADO', 100, 'nenhuma', 16), { valorizacao: 33020.24 });
    const l = V.calcularLIA(cfg, 100, 0);
    assert.strictEqual(l.autorizavel.lucro, 0);
    assert.strictEqual(l.autorizavel.renda, 0);
    perto(l.autorizavel.antecipacao, 100 * 33020.24 * C.fatorAntecipacao(3.74, 16), 1e-6);
    const semValor = V.calcularLIA(V.liaPadrao('CERRADO', 100, 'nenhuma', 16), 100, 0);
    assert.ok(semValor.avisos.some(a => /valorização da terra/.test(a)));
});

function entrada(lia) {
    return {
        versao: '7.0', bioma: 'CERRADO', entendimento: 'gonzaga',
        dataCalculo: new Date(2026, 5, 15), dataDano: new Date(2019, 5, 15),
        areas: { fora: 10, em: 2 }, reparacaoInSitu: true, taxaInterinoPct: 6, tempoRecuperacao: 30,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.00, origemCotacao: 'teste' },
        estoque: V.estoqueDaTabela(qcn, 'CERRADO', ''), opcaoExtrapatrimonial: 'reais', manual: null,
        identificacao: {}, consultas: [], hash: 'teste', lia
    };
}

test('honorários e EIA/RIMA pela faixa de área e pela forma da vegetação (orçamento de set./2026)', () => {
    assert.deepStrictEqual(V.honorariosDaFaixa(100, 'savana'), { cenarioHa: 50, porHa: 787.20 });
    assert.deepStrictEqual(V.honorariosDaFaixa(100, 'floresta'), { cenarioHa: 50, porHa: 883.20 });
    assert.deepStrictEqual(V.honorariosDaFaixa(500, 'savana'), { cenarioHa: 150, porHa: 512.00 });
    assert.deepStrictEqual(V.honorariosDaFaixa(500, 'floresta'), { cenarioHa: 150, porHa: 614.40 });
    // Acima de 1.000 ha: total do cenário de 1.500 ha menos o EIA/RIMA, que entra à parte.
    assert.deepStrictEqual(V.honorariosDaFaixa(1500, 'savana'), { cenarioHa: 1500, porHa: 163.84 });
    assert.deepStrictEqual(V.honorariosDaFaixa(1500, 'floresta'), { cenarioHa: 1500, porHa: 227.84 });
    assert.strictEqual(V.liaPadrao('CERRADO', 1000, 'soja', 5).eiaRima, 0);
    const grande = V.liaPadrao('CERRADO', 1500, 'soja', 5);
    assert.strictEqual(grande.eiaRima, 220800);
    assert.strictEqual(r2(grande.honorariosHa * 1500 + grande.eiaRima), 466560);       // total do orçamento
    const fl = V.liaPadrao('FLORESTA AMAZÔNICA', 1500, 'soja', 5);
    assert.strictEqual(r2(fl.honorariosHa * 1500 + fl.eiaRima), 562560);
    assert.ok(V.calcularLIA(grande, 1500, 0).avisos.some(a => /EIA\/RIMA/.test(a)));
});

test('na valoração: sem data do dano não há LIA; com ela, o LIA entra nos totais', () => {
    const cfg = Object.assign(V.liaPadrao('CERRADO', 10, 'soja', 7), { anoRegularizacao: 2026, rotuloAtividade: 'soja', referenciaMT: true });
    const semData = V.calcular(Object.assign(entrada(cfg), { dataDano: null }), series);
    assert.strictEqual(semData.lia, null);
    assert.strictEqual(semData.parcelas.lia, undefined);
    const sem = V.calcular(entrada(null), series);
    const com = V.calcular(entrada(cfg), series);
    assert.ok(com.parcelas.lia.valor > 0);
    assert.strictEqual(com.totais.original, C.arredondar(sem.totais.original + com.parcelas.lia.valor, 2));
    assert.strictEqual(com.totais.atualizado, C.arredondar(sem.totais.atualizado + com.parcelas.lia.total, 2));
    assert.notStrictEqual(V.textoCanonico(entrada(cfg)), V.textoCanonico(entrada(null)));
});

test('atualização do LIA pelo Manual: desde o dano; ganhos posteriores, desde o mês em que se formam', () => {
    const cfg = Object.assign(V.liaPadrao('CERRADO', 10, 'soja', 7), { anoRegularizacao: 2026, precoMadeira: 200 });
    const r = V.calcular(entrada(cfg), series);
    const p = r.parcelas.lia, g = p.grupos;
    // jun./2019 a jun./2026: um valor no mês do dano, sete anos de lucro e renda e a reposição.
    assert.strictEqual(g.length, 9);
    assert.strictEqual(g[0].mes, '201906');
    assert.deepStrictEqual(g.slice(1, 8).map(x => x.mes), ['202006', '202106', '202206', '202306', '202406', '202506', '202606']);
    assert.strictEqual(g[8].mes, '202606');
    assert.ok(p.total > p.valor);
    // Valor do mês do dano: mesma atualização de uma parcela patrimonial.
    const ref = C.atualizarParcela(series, { valor: g[0].valor, mesValor: '201906', mesTermoJuros: '201906', mesCalculo: '202606' });
    assert.strictEqual(g[0].total, ref.total);
    // Lucro do ano 1: correção e juros a partir de jun./2020.
    const ano1 = C.atualizarParcela(series, { valor: g[1].valor, mesValor: '202006', mesTermoJuros: '201906', mesCalculo: '202606' });
    assert.strictEqual(g[1].total, C.arredondar(ano1.principalCorrigido + ano1.juros, 2));
    // Reposição na regularização (mês do cálculo): já capitalizada, sem acréscimo.
    assert.strictEqual(g[8].total, g[8].valor);
    assert.strictEqual(p.valor, C.arredondar(g.reduce((s, x) => s + x.valor, 0), 2));
    assert.strictEqual(p.total, C.arredondar(g.reduce((s, x) => s + x.total, 0), 2));
    // Licenciamento orçado em set./2026 e trazido ao mês do dano: fator menor que 1.
    assert.ok(r.lia.fatorLicenciamento < 1 && r.lia.fatorLicenciamento > 0.5);
});

test('relatório: seção do LIA com as parcelas, a presunção de uso e o aviso de Mato Grosso', () => {
    const cfg = Object.assign(V.liaPadrao('CERRADO', 10, 'soja', 7), { anoRegularizacao: 2026, rotuloAtividade: 'soja', referenciaMT: true, fontes: 'teste.' });
    const html = R.gerarHTML(V.calcular(entrada(cfg), series));
    ['2.6 Lucro do ilícito ambiental (LIA)', 'Atualização</b> até', 'Súmulas 43 e 54/STJ', 'lucro e renda da terra do ano 1', 'REsp 1.145.083/MG', 'CL — licenciamento evitado', 'ΣL — lucro da atividade', 'ΣR — renda da terra',
        'GR — adiamento da reposição florestal', 'Súmula 618/STJ', 'Mato Grosso', 'LUCRO DO ILÍCITO AMBIENTAL ='].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
    assert.ok(!R.gerarHTML(V.calcular(entrada(null), series)).includes('2.6 Lucro do ilícito'));
    assert.ok(!/Santa L/i.test(html));
});
