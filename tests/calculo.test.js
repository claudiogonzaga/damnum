// Testes do núcleo de cálculo. Rodar com: node --test tests/
// Não usam rede: as séries vêm de data/series_referencia.json.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../js/calculo.js');
const raiz = path.join(__dirname, '..');
const series = JSON.parse(fs.readFileSync(path.join(raiz, 'data/series_referencia.json'), 'utf8'));
const qcn = JSON.parse(fs.readFileSync(path.join(raiz, 'data/estoques_qcn_fitofisionomias.json'), 'utf8'));

// Manual de Cálculos da Justiça Federal (CJF, 2026), item 4.2.1, exemplo
// "2) Devedor não enquadrado como Fazenda Pública", p. 52.
test('exemplo do Manual CJF 2026, p. 52: parcela a (jan./2002)', () => {
    const r = C.atualizarParcela(series, { valor: 1000, mesValor: '200201', mesTermoJuros: '200501', mesCalculo: '202606' });
    assert.strictEqual(r.coeficiente, 1.4590697197);
    assert.strictEqual(r.principalCorrigido, 1459.06);
    assert.strictEqual(r.percentualJuros, 209.65);
    assert.strictEqual(r.juros, 3058.91);
    assert.strictEqual(r.total, 4517.97);
});

test('exemplo do Manual CJF 2026, p. 52: parcela b (ago./2024)', () => {
    const r = C.atualizarParcela(series, { valor: 1000, mesValor: '202408', mesTermoJuros: '200501', mesCalculo: '202606' });
    assert.strictEqual(r.coeficiente, 1.0953927279);
    assert.strictEqual(r.principalCorrigido, 1095.39);
    assert.strictEqual(r.percentualJuros, 14.57);
    assert.strictEqual(r.juros, 159.59);
    assert.strictEqual(r.total, 1254.98);
});

test('exemplo do Manual CJF 2026, p. 52: total da conta', () => {
    const a = C.atualizarParcela(series, { valor: 1000, mesValor: '200201', mesTermoJuros: '200501', mesCalculo: '202606' });
    const b = C.atualizarParcela(series, { valor: 1000, mesValor: '202408', mesTermoJuros: '200501', mesCalculo: '202606' });
    assert.strictEqual(C.arredondar(a.principalCorrigido + b.principalCorrigido, 2), 2554.45);
    assert.strictEqual(C.arredondar(a.juros + b.juros, 2), 3218.50);
    assert.strictEqual(C.arredondar(a.total + b.total, 2), 5772.95);
});

test('taxa legal de set./2025 confere com o Manual (item 4.2.2)', () => {
    assert.strictEqual(series.taxa_legal['202509'], 1.305984);
});

test('juros no exemplo da Fazenda a partir de out./2025: 7,03% (Manual, p. 51)', () => {
    // Taxa legal aplicada de out./2025 a jun./2026 = referências set./2025 a maio/2026.
    const r = C.percentualJuros(series, '202509', '202509', '202606');
    assert.strictEqual(r.percentual, 7.03);
});

test('dano no mês do cálculo: sem correção e sem juros', () => {
    const r = C.atualizarParcela(series, { valor: 500, mesValor: '202606', mesTermoJuros: '202606', mesCalculo: '202606' });
    assert.strictEqual(r.coeficiente, 1);
    assert.strictEqual(r.juros, 0);
    assert.strictEqual(r.total, 500);
});

test('termos coincidentes (caso do DAMNUM): Selic até ago./2024 e IPCA-15 + taxa legal depois', () => {
    const r = C.atualizarParcela(series, { valor: 1000, mesValor: '201906', mesTermoJuros: '201906', mesCalculo: '202606' });
    const corrigem = r.mesesCorrecao.filter(m => m.incluido).map(m => m.mes);
    assert.strictEqual(corrigem[0], '201906');
    assert.strictEqual(corrigem[1], '202408');
    assert.strictEqual(corrigem[corrigem.length - 1], '202605');
    assert.strictEqual(r.mesesJuros[0].mes, '201907');
    assert.strictEqual(r.mesesJuros[0].tipo, 'Selic');
    assert.strictEqual(r.mesesJuros.find(m => m.mes === '202408').tipo, 'Selic');
    assert.strictEqual(r.mesesJuros.find(m => m.mes === '202409').tipo, 'taxa legal');
});

test('cálculo anterior a set./2024: 1% no mês do pagamento', () => {
    const r = C.percentualJuros(series, '202301', '202301', '202306');
    const ultimo = r.meses[r.meses.length - 1];
    assert.strictEqual(ultimo.taxa, 1);
    assert.strictEqual(r.meses[0].mes, '202302');
});

test('série incompleta gera erro, não cálculo parcial', () => {
    const cortada = Object.assign({}, series, { taxa_legal: {} });
    assert.throws(() => C.percentualJuros(cortada, '202501', '202501', '202606'), /taxa legal/);
    assert.throws(() => C.coeficienteCorrecao(series, '199912', null, '202606'), /jan\.\/2001/);
});

test('juros extrapatrimoniais: opções (a) e (b) só diferem antes de set./2024', () => {
    const reais = C.jurosExtrapatrimonial(series, '201906', '202606', 'reais');
    const nenhum = C.jurosExtrapatrimonial(series, '201906', '202606', 'nenhum');
    const soTaxaLegal = C.jurosExtrapatrimonial(series, '202408', '202606', 'reais');
    assert.strictEqual(nenhum.percentual, soTaxaLegal.percentual);
    assert.strictEqual(soTaxaLegal.percentual, 14.57);
    assert.ok(reais.percentual > nenhum.percentual);
    reais.meses.forEach(m => assert.ok(m.taxa >= 0));
});

test('custo de recuperação levado ao mês do dano pelo número-índice do IPCA-15', () => {
    const base = C.custoNoMes(1000, series, '202210');
    assert.strictEqual(base.valor, 1000);
    const antes = C.custoNoMes(1000, series, '201906');
    const depois = C.custoNoMes(1000, series, '202506');
    assert.ok(antes.valor < 1000 && depois.valor > 1000);
    assert.strictEqual(antes.fator, series.ipca15_indice['201906'] / series.ipca15_indice['202210']);
});

test('taxa do dano interino em percentual: 6 equivale ao antigo 0,06', () => {
    assert.strictEqual(C.fatorInterino(6, 15), 0.06 * (15 + 1) / 2);
    assert.ok(C.validarTaxaInterino(6));
    assert.ok(C.validarTaxaInterino(0));
    assert.ok(C.validarTaxaInterino(30));
    assert.ok(!C.validarTaxaInterino(31));
    assert.ok(!C.validarTaxaInterino(-1));
    assert.ok(!C.validarTaxaInterino(NaN));
});

test('conversão de carbono em CO2: fator 3,67', () => {
    assert.strictEqual(C.FATOR_C_PARA_CO2, 3.67);
    assert.strictEqual(C.carbonoParaCO2(100), 367);
    assert.strictEqual(C.danoCarbono(2, 100, 10), 2 * 100 * 3.67 * 10);
});

test('médias do QCN por bioma reproduzem a tabela do item 1.6', () => {
    const esperado = {
        'Amazônia': [160.77, 590.04], 'Cerrado': [47.75, 175.24], 'Mata Atlântica': [110.65, 406.09],
        'Caatinga': [32.04, 117.57], 'Pampa': [34.03, 124.88], 'Pantanal': [50.11, 183.89]
    };
    for (const [bioma, [tC, tCO2]] of Object.entries(esperado)) {
        const b = qcn.biomas[bioma];
        const media = C.mediaPonderadaBioma(b.fitofisionomias);
        assert.strictEqual(C.arredondar(media, 2), tC, bioma + ' (calculada)');
        assert.strictEqual(b.media_ponderada_tC_ha, tC, bioma + ' (JSON)');
        // O prompt converte a média já arredondada: 160,77 × 3,67 = 590,03 e não 590,04.
        assert.ok(Math.abs(C.carbonoParaCO2(media) - tCO2) < 0.02, bioma + ' (tCO2)');
    }
});

test('média ponderada por área (mapa por estado)', () => {
    const r = C.mediaPonderadaPorArea([{ area_ha: 3, c_v_4i: 100 }, { area_ha: 1, c_v_4i: 20 }, { area_ha: 5, c_v_4i: NaN }]);
    assert.strictEqual(r.estoque, 80);
    assert.strictEqual(r.area_ha, 4);
    assert.strictEqual(C.mediaPonderadaPorArea([]), null);
});

test('piso de preço do CNJ: aviso abaixo de US$ 5,00', () => {
    assert.ok(C.abaixoDoPisoCNJ(4.99));
    assert.ok(!C.abaixoDoPisoCNJ(5));
    assert.ok(!C.abaixoDoPisoCNJ(24.2));
});
