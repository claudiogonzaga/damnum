// Testes da valoração completa e do relatório, com as séries embutidas (sem rede).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../js/calculo.js');
const V = require('../js/valoracao.js');
const R = require('../js/relatorio.js');
const raiz = path.join(__dirname, '..');
const series = JSON.parse(fs.readFileSync(path.join(raiz, 'data/series_referencia.json'), 'utf8'));
const qcn = JSON.parse(fs.readFileSync(path.join(raiz, 'data/estoques_qcn_fitofisionomias.json'), 'utf8'));

function entrada(extra) {
    return Object.assign({
        versao: '7.0', bioma: 'CERRADO', entendimento: 'gonzaga',
        dataCalculo: new Date(2026, 5, 15), dataDano: new Date(2019, 5, 15),
        areas: { fora: 10, em: 2 }, reparacaoInSitu: true,
        taxaInterinoPct: 6, tempoRecuperacao: 15,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.00, origemCotacao: 'teste' },
        estoque: V.estoqueDaTabela(qcn, 'CERRADO', ''),
        opcaoExtrapatrimonial: 'reais', manual: null,
        identificacao: {}, consultas: [], hash: 'teste'
    }, extra || {});
}

test('custo na data do dano: a inflação não entra duas vezes', () => {
    const r = V.calcular(entrada(), series);
    const fator = series.ipca15_indice['201906'] / series.ipca15_indice['202210'];
    assert.strictEqual(r.custo.mesReferencia, '201906');
    assert.strictEqual(r.custo.valorHa, C.arredondar(11538.92 * fator, 2));
    assert.ok(r.custo.valorHa < 11538.92);
    assert.strictEqual(r.parcelas.material.valor, C.arredondar(10 * r.custo.valorHa, 2));
});

test('dano interino herda a base do custo e usa a taxa em percentual', () => {
    const r = V.calcular(entrada(), series);
    assert.strictEqual(r.interino.fator, 0.48);
    assert.strictEqual(r.parcelas.interino.valor, C.arredondar(2 * r.custo.valorHa * 0.48, 2));
});

test('parcelas de carbono: área × estoque (tC) × 3,67 × preço', () => {
    const r = V.calcular(entrada(), series);
    assert.strictEqual(r.estoque.tC, 47.75);
    assert.strictEqual(r.parcelas.mercado.valor, C.arredondar(12 * 47.75 * 3.67 * 25.00, 2));
    assert.strictEqual(r.parcelas.social.valor, C.arredondar(12 * 47.75 * 3.67 * 121.00, 2));
    assert.strictEqual(r.parcelas.mercado.correcao, 0);
    assert.ok(r.parcelas.mercado.juros > 0);
});

test('patrimoniais: principal corrigido e juros truncados, como no Manual', () => {
    const r = V.calcular(entrada(), series);
    const a = r.parcelas.material.atualizacao;
    assert.strictEqual(a.principalCorrigido, C.truncar(r.parcelas.material.valor * a.coeficiente, 2));
    assert.strictEqual(a.juros, C.truncar(a.principalCorrigido * a.percentualJuros / 100, 2));
    assert.strictEqual(r.totais.atualizado, C.arredondar(
        r.parcelas.material.total + r.parcelas.interino.total + r.parcelas.mercado.total + r.parcelas.social.total, 2));
});

test('sem data do dano: valores na data do cálculo, sem atualização', () => {
    const r = V.calcular(entrada({ dataDano: null }), series);
    assert.strictEqual(r.atualizacao.aplicada, false);
    assert.strictEqual(r.totais.atualizado, r.totais.original);
    assert.strictEqual(r.totais.juros, 0);
    assert.strictEqual(r.custo.mesReferencia, C.ultimoMesDisponivel(series.ipca15_indice));
});

test('IRDR 13/TJMT: dano material zero; alternativo mostra Gonzaga et al.', () => {
    const g = V.calcular(entrada(), series);
    const i = V.calcular(entrada({ entendimento: 'irdr' }), series);
    assert.strictEqual(i.parcelas.material.valor, 0);
    assert.strictEqual(i.alternativo.material.valor, g.parcelas.material.valor);
    assert.strictEqual(i.alternativo.totalAtualizado, g.totais.atualizado);
    assert.strictEqual(g.alternativo.material.valor, 0);
});

test('sem reparação in situ: material sobre a área total e interino zero', () => {
    const r = V.calcular(entrada({ reparacaoInSitu: false }), series);
    assert.strictEqual(r.parcelas.material.area, 12);
    assert.strictEqual(r.parcelas.interino.valor, 0);
});

test('opção (b): sem juros extrapatrimoniais antes de set./2024', () => {
    const a = V.calcular(entrada(), series);
    const b = V.calcular(entrada({ opcaoExtrapatrimonial: 'nenhum' }), series);
    assert.ok(b.parcelas.mercado.juros < a.parcelas.mercado.juros);
    assert.strictEqual(b.parcelas.material.total, a.parcelas.material.total);
});

test('série incompleta: erro, salvo se o usuário informar os fatores', () => {
    const cortada = Object.assign({}, series, { taxa_legal: {} });
    assert.throws(() => V.calcular(entrada(), cortada), e => e.name === 'ErroSerie');
    const manual = { coeficiente: 1.1, jurosPatrimonial: 50, jurosExtra: 30, fonte: 'Calculadora do Cidadão' };
    const r = V.calcular(entrada({ manual }), cortada);
    assert.strictEqual(r.parcelas.material.atualizacao.principalCorrigido, C.truncar(r.parcelas.material.valor * 1.1, 2));
    assert.strictEqual(r.parcelas.mercado.percentualJuros, 30);
});

test('estoque: fitofisionomia, média do bioma, usuário e mapa', () => {
    const cerrado = qcn.biomas['Cerrado'].fitofisionomias;
    const i = cerrado.findIndex(f => (f.subvalores || []).length > 1);
    const fito = V.estoqueDaTabela(qcn, 'CERRADO', i);
    assert.strictEqual(fito.tC, cerrado[i].total_tC_ha);
    assert.match(fito.regra, /média aritmética simples/);
    assert.strictEqual(V.estoqueDaTabela(qcn, 'FLORESTA AMAZÔNICA', '').tC, 160.77);
    assert.strictEqual(V.estoqueDoUsuario(132.5, 'CCAL').origem, 'usuario');
    const reserva = V.estoqueDaTabela(qcn, 'CERRADO', '');
    const mapa = V.estoqueDoMapa({ tipo: 'poligono', estoque_tC_ha: 100, pct_descoberto: 25, partes: [] }, reserva);
    assert.strictEqual(mapa.tC, 100 * 0.75 + 47.75 * 0.25);
});

test('toda fitofisionomia exibida confere com o JSON e tem página do QCN', () => {
    for (const [nome, b] of Object.entries(qcn.biomas)) {
        b.fitofisionomias.forEach((f, i) => {
            if (typeof f.total_tC_ha !== 'number') return;
            const bioma = Object.keys(V.BIOMA_QCN).find(k => V.BIOMA_QCN[k] === nome);
            const e = V.estoqueDaTabela(qcn, bioma, i);
            assert.strictEqual(e.tC, f.total_tC_ha);
            assert.ok(Math.abs(C.carbonoParaCO2(e.tC) - f.total_tCO2_ha) < 0.011, nome + ' ' + f.sigla);
            assert.match(e.fonte, /Tabela \d+, p\. \d+/);
        });
    }
});

test('aviso do piso do CNJ quando o preço fica abaixo de US$ 5,00', () => {
    const p = { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 4.00, cotacaoDolar: 5, origemCotacao: 'teste' };
    const r = V.calcular(entrada({ parametros: p }), series);
    assert.strictEqual(r.avisosPiso.length, 1);
    assert.match(r.avisosPiso[0], /Recomendação CNJ 156\/2024/);
    assert.strictEqual(V.calcular(entrada(), series).avisosPiso.length, 0);
});

test('relatório: incisos II a V do art. 524 preenchidos; I, VI e VII tratados', () => {
    const id = { credorNome: 'Ministério Público', credorDoc: '00.000.000/0001-00', devedorNome: 'Fulano', devedorDoc: '000.000.000-00', descontos: '', bensPenhora: 'Imóvel rural matrícula 1' };
    const html = R.gerarHTML(V.calcular(entrada({ identificacao: id, numeroProcesso: '0000000-00.2025.8.11.0001' }), series));
    ['art. 524, II', 'art. 524, III', 'art. 524, IV', 'art. 524, V', 'simples, mensal', 'Credor / exequente', 'Devedor / executado',
        '4. DESCONTOS OBRIGATÓRIOS', 'Não há.', '5. BENS PASSÍVEIS DE PENHORA', 'Imóvel rural matrícula 1', '6. TOTAL GERAL', '7. METADADOS',
        'Hash SHA-256', '8. AVISO', 'valor de referência mínimo', '3. TABELA MÊS A MÊS', 'não está pacificada'
    ].forEach(trecho => assert.ok(html.includes(trecho), 'falta: ' + trecho));
    assert.ok(html.indexOf('1. IDENTIFICAÇÃO') < html.indexOf('2. DEMONSTRATIVO') && html.indexOf('2. DEMONSTRATIVO') < html.indexOf('3. TABELA')
        && html.indexOf('3. TABELA') < html.indexOf('4. DESCONTOS') && html.indexOf('6. TOTAL') < html.indexOf('7. METADADOS') && html.indexOf('7. METADADOS') < html.indexOf('8. AVISO'));
});

test('relatório escapa o texto digitado pelo usuário', () => {
    const html = R.gerarHTML(V.calcular(entrada({ numeroProcesso: '<script>x</script>' }), series));
    assert.ok(!html.includes('<script>x'));
});

test('tabela mês a mês e CSV: uma linha por mês, acumulados iguais aos do cálculo', () => {
    const r = V.calcular(entrada(), series);
    const linhas = R.linhasMensais(r);
    assert.strictEqual(linhas.length, C.intervaloMeses('201906', '202606').length);
    const ultima = linhas[linhas.length - 1];
    assert.strictEqual(C.arredondar(ultima.coeficiente, 10), r.parcelas.material.atualizacao.coeficiente);
    assert.strictEqual(C.truncar(ultima.jurosAcumulado, 2), r.parcelas.material.atualizacao.percentualJuros);
    assert.strictEqual(C.truncar(ultima.jurosExtraAcumulado, 2), r.parcelas.mercado.percentualJuros);
    const csv = R.gerarCSV(r).trim().split('\r\n');
    assert.strictEqual(csv.length, linhas.length + 1);
});

test('hash: mesmo texto canônico para a mesma entrada; nomes das partes ficam de fora', () => {
    const a = V.textoCanonico(entrada({ identificacao: { credorNome: 'A' } }));
    const b = V.textoCanonico(entrada({ identificacao: { credorNome: 'B' } }));
    assert.strictEqual(a, b);
    assert.notStrictEqual(a, V.textoCanonico(entrada({ areas: { fora: 11, em: 2 } })));
});
