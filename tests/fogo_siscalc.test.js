// Fogo em vegetação nativa, área sem possibilidade técnica de recuperação e a
// linha de comparação com o SISCALC Ambiental (Nota Técnica 03/2022 do CAEx,
// atualizada em 17/01/2024). Valores por hectare conferidos com os Quadros 1 e 2
// da Nota e com os registros do SISCALC em 18/11/2026.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const V = require('../js/valoracao.js');
const R = require('../js/relatorio.js');
const series = require('../data/series_referencia.json');

const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);
const estoque = V.resolverEstoque({ usuario: { tC: 58.39, fonte: 'teste' }, tabela: null, municipio: null, consulta: null, mapa: { disponivel: false, info: null } });
function calcular(extra) {
    return V.calcular(Object.assign({
        versao: '7.3.0', bioma: 'FLORESTA AMAZÔNICA', entendimento: 'gonzaga', dataCalculo: new Date(2026, 8, 15), dataDano: new Date(2021, 7, 12),
        areas: { fora: 0, em: 10 }, reparacaoInSitu: true, taxaInterinoPct: 6, tempoRecuperacao: 15,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.40, origemCotacao: 'teste' },
        estoque, opcaoExtrapatrimonial: 'reais', manual: null, consultas: [], hash: 'h', lia: null
    }, extra), series);
}

test('incêndio em floresta: interino do Quadro 1 da Nota (R$ 2.189,57/ha) e 25% do estoque no carbono', () => {
    const d = calcular(), f = calcular({ tipologia: 'incendio-floresta' });
    perto(f.parcelas.interino.valor / 10, 2189.57, 0.01);
    assert.strictEqual(f.parcelas.material.valor, 0);
    assert.strictEqual(f.parcelas.residual.valor, 0);
    perto(f.parcelas.social.valor, d.parcelas.social.valor * 0.25, 0.01);
    perto(f.parcelas.mercado.valor, d.parcelas.mercado.valor * 0.25, 0.01);
    assert.strictEqual(f.tipologia, 'incendio-floresta');
    assert.strictEqual(f.siscalc.valor, f.parcelas.interino.valor);
    // Área dentro e fora de área protegida: no fogo, somam.
    perto(calcular({ tipologia: 'incendio-floresta', areas: { fora: 4, em: 6 } }).parcelas.interino.valor, f.parcelas.interino.valor, 0.01);
    // Fração informada pelo usuário.
    perto(calcular({ tipologia: 'incendio-floresta', fogo: { fracaoPct: 40 } }).parcelas.social.valor, d.parcelas.social.valor * 0.40, 0.01);
});

test('queimada em savana: interino de R$ 330,04/ha; carbono zero por padrão, maior se a fração for informada', () => {
    const s = calcular({ tipologia: 'queimada-savana', bioma: 'CERRADO' });
    perto(s.parcelas.interino.valor / 10, 330.04, 0.01);
    assert.strictEqual(s.parcelas.social.valor, 0);
    assert.strictEqual(s.parcelas.mercado.valor, 0);
    assert.ok(calcular({ tipologia: 'queimada-savana', bioma: 'CERRADO', fogo: { fracaoPct: 10 } }).parcelas.social.valor > 0);
});

test('fogo não calcula lucro do ilícito; os subtotais continuam somando o total', () => {
    const lia = { atividade: 'pecuaria', anoRegularizacao: 2026, anos: 5, anosAtividade: 5, ebitda: 100, arrendamento: 50, valorizacao: 0, taxaRealPct: 3.74, taxaNominalPct: 9.73, volumeM3: 0, precoMadeira: 0, taxasLicenciamento: 0, honorariosHa: 0, reposicaoHa: 0, eiaRima: 0, precoTerraNativa: 0, mesBaseLicenciamento: null };
    const f = calcular({ tipologia: 'incendio-floresta', lia });
    assert.strictEqual(f.lia, null);
    perto(f.totais.ecossistema.original + f.totais.carbono.original, f.totais.original, 0.011);
});

test('sem possibilidade técnica de recuperação: perpetuidade do plantio total (R$ 610.693,99/ha), sem interino nem residual', () => {
    const r = calcular({ irrecuperavel: true });
    perto(r.parcelas.material.valor / 10, 41649.33 / 0.0682, 0.01);
    assert.strictEqual(r.parcelas.interino.valor, 0);
    assert.strictEqual(r.parcelas.residual.valor, 0);
    assert.strictEqual(r.parcelas.social.valor, calcular().parcelas.social.valor);
    assert.strictEqual(calcular({ irrecuperavel: true, tipologia: 'incendio-floresta' }).irrecuperavel, null);
    assert.notStrictEqual(V.textoCanonico(Object.assign({ versao: 'x', dataCalculo: new Date(), parametros: {}, estoque: {}, areas: {} }, { irrecuperavel: true })),
        V.textoCanonico({ versao: 'x', dataCalculo: new Date(), parametros: {}, estoque: {}, areas: {} }));
});

test('linha do SISCALC: os valores dos Quadros 1 e 2 da Nota, em qualquer método do DAMNUM', () => {
    // Área protegida, floresta, baixa resiliência: R$ 9.986,20/ha.
    perto(calcular().siscalc.valor / 10, 9986.20, 0.01);
    // Fora de área protegida, 5 anos (2021 a 2026), baixa resiliência: R$ 638,45/ha por ano.
    perto(calcular({ areas: { fora: 10, em: 0 } }).siscalc.valor / 10, 638.45 * 5, 0.02);
    // Alta resiliência, quando o método do CAEx está escolhido assim: R$ 6.647,83/ha.
    perto(calcular({ interino: { metodo: 'caex', forma: 'floresta', taxaPct: 6.82, tempo: 100, resiliencia: 'alta', anosAteRegularizacao: 0 } }).siscalc.valor / 10, 6647.83, 0.01);
    // Cerrado, 30 anos: R$ 8.618,13/ha.
    perto(calcular({ bioma: 'CERRADO' }).siscalc.valor / 10, 8618.13, 0.01);
});

test('relatório: tipo de dano, blocos do fogo, hipótese irrecuperável e linha do SISCALC', () => {
    const fogo = R.gerarHTML(calcular({ tipologia: 'incendio-floresta' }));
    ['incêndio em floresta em pé', 'Fração do estoque perdida com o fogo', '25,00%', 'Silva et al. (2018)', 't = 26 anos', 'regeneração natural', 'Valor pelo método do CAEx Ambiental do MPMT (SISCALC Ambiental)', 'não calculado nos casos de fogo'].forEach(t => assert.ok(fogo.includes(t), 'falta: ' + t));
    assert.ok(!fogo.includes('Hipótese da não recuperação da área ilegalmente desmatada'));
    const irr = R.gerarHTML(calcular({ irrecuperavel: true }));
    ['sem possibilidade técnica de recuperação', 'CATE II', '÷ 6,82%'].forEach(t => assert.ok(irr.includes(t), 'falta: ' + t));
    const des = R.gerarHTML(calcular());
    assert.ok(des.includes('desmatamento a corte raso') && des.includes('SISCALC Ambiental'));
    const pagina = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    ['id="tipologia"', 'id="fracaoFogo"', 'id="irrecuperavel"'].forEach(t => assert.ok(pagina.includes(t), t));
});
