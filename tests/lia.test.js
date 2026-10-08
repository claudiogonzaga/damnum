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
    perto(l.autorizavel.licenciamento, (cfg.taxasLicenciamento + 99.83 * 100) * Math.pow(1.0973, 5), 1e-6);
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

test('na valoração: o LIA é opcional, soma-se aos totais e não recebe correção nem juros', () => {
    const sem = V.calcular(entrada(null), series);
    assert.strictEqual(sem.lia, null);
    assert.strictEqual(sem.parcelas.lia, undefined);
    const cfg = Object.assign(V.liaPadrao('CERRADO', 10, 'soja', 7), { anoRegularizacao: 2026, rotuloAtividade: 'soja', referenciaMT: true });
    const com = V.calcular(entrada(cfg), series);
    assert.ok(com.parcelas.lia.valor > 0);
    assert.strictEqual(com.parcelas.lia.total, com.parcelas.lia.valor);
    assert.strictEqual(com.totais.original, C.arredondar(sem.totais.original + com.parcelas.lia.valor, 2));
    assert.strictEqual(com.totais.atualizado, C.arredondar(sem.totais.atualizado + com.parcelas.lia.valor, 2));
    assert.strictEqual(com.alternativo.totalOriginal, C.arredondar(sem.alternativo.totalOriginal + com.parcelas.lia.valor, 2));
    assert.notStrictEqual(V.textoCanonico(entrada(cfg)), V.textoCanonico(entrada(null)));
});

test('relatório: seção do LIA com as parcelas, a presunção de uso e o aviso de Mato Grosso', () => {
    const cfg = Object.assign(V.liaPadrao('CERRADO', 10, 'soja', 7), { anoRegularizacao: 2026, rotuloAtividade: 'soja', referenciaMT: true, fontes: 'teste.' });
    const html = R.gerarHTML(V.calcular(entrada(cfg), series));
    ['2.5 Lucro do ilícito ambiental (LIA)', 'REsp 1.145.083/MG', 'CL — licenciamento evitado', 'ΣL — lucro da atividade', 'ΣR — renda da terra',
        'GR — adiamento da reposição florestal', 'Súmula 618/STJ', 'Mato Grosso', 'LUCRO DO ILÍCITO AMBIENTAL ='].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
    assert.ok(!R.gerarHTML(V.calcular(entrada(null), series)).includes('2.5 Lucro do ilícito'));
});
