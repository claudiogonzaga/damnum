// Gera os relatórios dos casos de teste manual (item 1.11) em HTML, com as
// séries embutidas. Uso: node tools/gerar_casos_teste.js <pasta de saída>
const fs = require('node:fs');
const path = require('node:path');
const V = require('../js/valoracao.js');
const R = require('../js/relatorio.js');

const raiz = path.join(__dirname, '..');
const saida = process.argv[2] || path.join(raiz, '_insumos_v7/entrega');
const series = JSON.parse(fs.readFileSync(path.join(raiz, 'data/series_referencia.json'), 'utf8'));
const qcn = JSON.parse(fs.readFileSync(path.join(raiz, 'data/estoques_qcn_fitofisionomias.json'), 'utf8'));
fs.mkdirSync(saida, { recursive: true });

const casos = [];
for (const [bioma, rotulo] of [['CERRADO', 'cerrado'], ['FLORESTA AMAZÔNICA', 'amazonia']]) {
    for (const entendimento of ['gonzaga', 'irdr']) {
        casos.push({ nome: `caso_${rotulo}_2019_${entendimento}`, bioma, entendimento });
    }
}

const resumo = [];
for (const caso of casos) {
    const r = V.calcular({
        versao: '7.0', bioma: caso.bioma, entendimento: caso.entendimento,
        dataCalculo: new Date(2026, 9, 4, 12, 0, 0), dataDano: new Date(2019, 5, 15),
        areas: { fora: 10, em: 2 }, reparacaoInSitu: true,
        taxaInterinoPct: 6, tempoRecuperacao: 15,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.22, origemCotacao: 'valor fixo do caso de teste' },
        estoque: V.estoqueDaTabela(qcn, caso.bioma, ''),
        opcaoExtrapatrimonial: 'reais', manual: null,
        numeroProcesso: 'Caso de teste (dados fictícios)', identificacao: {},
        consultas: [{ serie: 'Selic, taxa legal e IPCA-15', fonte: 'séries embutidas no DAMNUM', quando: 'arquivo de ' + series.gerado_em, situacao: 'ok', reserva: true }],
        hash: require('node:crypto').createHash('sha256').update(caso.nome).digest('hex')
    }, series);
    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + caso.nome + '</title>' +
        '<style>@page { size: A4; margin: 18mm 15mm; } body { font-family: "Times New Roman", serif; } tr { page-break-inside: avoid; }</style></head><body>' +
        R.gerarHTML(r) + '</body></html>';
    fs.writeFileSync(path.join(saida, caso.nome + '.html'), html);
    resumo.push({ caso: caso.nome, material: r.parcelas.material.total, interino: r.parcelas.interino.total, mercado: r.parcelas.mercado.total, social: r.parcelas.social.total, original: r.totais.original, atualizado: r.totais.atualizado });
}
console.table(resumo);
