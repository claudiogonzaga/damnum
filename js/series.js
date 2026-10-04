// DAMNUM — obtenção das séries oficiais (Selic, taxa legal, IPCA-15).
//
// Ordem de consulta de cada série:
//   1. API oficial (Banco Central, SGS; IBGE, SIDRA);
//   2. para a Selic, o Ipeadata, que republica a SGS 4390;
//   3. séries embutidas em data/series_referencia.json, só se cobrirem todo o
//      período pedido.
// Nunca se calcula com série incompleta: quem decide é o núcleo (calculo.js),
// que lança erro quando falta um mês.
(function (root) {
    'use strict';

    var URL_SELIC_BCB = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados?formato=json';
    var URL_TAXA_LEGAL_BCB = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.29543/dados?formato=json';
    var URL_SELIC_IPEADATA = "https://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='BM12_TJOVER12')";
    var URL_IPCA15_SIDRA = 'https://servicodados.ibge.gov.br/api/v3/agregados/3065/periodos/200005-{FIM}/variaveis/1117|355?localidades=N1[all]';
    var URL_SERIES_EMBUTIDAS = 'data/series_referencia.json';
    var TEMPO_LIMITE_MS = 15000;

    function agora() {
        return new Date().toLocaleString('pt-BR');
    }

    async function buscarJSON(url) {
        var controle = new AbortController();
        var relogio = setTimeout(function () { controle.abort(); }, TEMPO_LIMITE_MS);
        try {
            var resposta = await fetch(url, { signal: controle.signal });
            if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
            return await resposta.json();
        } finally {
            clearTimeout(relogio);
        }
    }

    // SGS devolve [{ data: 'DD/MM/AAAA', valor: '0.87' }]; a data é o 1º dia do mês.
    function converterSGS(dados) {
        var serie = {};
        dados.forEach(function (item) {
            var p = item.data.split('/');
            var v = parseFloat(item.valor);
            if (p.length === 3 && !isNaN(v)) serie[p[2] + p[1]] = v;
        });
        return serie;
    }

    function converterIpeadata(dados) {
        var serie = {};
        (dados.value || []).forEach(function (item) {
            if (typeof item.VALVALOR !== 'number') return;
            serie[item.VALDATA.slice(0, 4) + item.VALDATA.slice(5, 7)] = item.VALVALOR;
        });
        return serie;
    }

    function converterSIDRA(dados) {
        var saida = { indice: {}, variacao: {} };
        dados.forEach(function (variavel) {
            var destino = String(variavel.id) === '1117' ? saida.indice : saida.variacao;
            var serie = variavel.resultados[0].series[0].serie;
            Object.keys(serie).forEach(function (mes) {
                var v = parseFloat(serie[mes]);
                if (!isNaN(v)) destino[mes] = v;
            });
        });
        return saida;
    }

    function cobre(serie, meses) {
        return meses.every(function (m) { return typeof serie[m] === 'number'; });
    }

    // Carrega as séries necessárias.
    // `exigencias`: { selic: [meses], taxa_legal: [meses], ipca15_var: [meses], ipca15_indice: [meses] }
    // Devolve { series, consultas: [{ serie, fonte, quando, situacao }], embutidas }.
    async function carregarSeries(exigencias, mesCalculo) {
        var consultas = [];
        var series = { selic: {}, taxa_legal: {}, ipca15_var: {}, ipca15_indice: {} };
        var embutidas = null;

        async function obterEmbutidas() {
            if (!embutidas) embutidas = await buscarJSON(URL_SERIES_EMBUTIDAS);
            return embutidas;
        }

        async function tentar(nome, rotulo, fontes, mesesExigidos) {
            for (var i = 0; i < fontes.length; i++) {
                var fonte = fontes[i];
                try {
                    var serie = await fonte.obter();
                    if (!cobre(serie, mesesExigidos)) throw new Error('não cobre todo o período');
                    series[nome] = serie;
                    consultas.push({ serie: rotulo, fonte: fonte.descricao, quando: fonte.quando ? fonte.quando() : agora(), situacao: 'ok', reserva: !!fonte.reserva });
                    return;
                } catch (erro) {
                    consultas.push({ serie: rotulo, fonte: fonte.descricao, quando: agora(), situacao: 'falhou: ' + erro.message, reserva: !!fonte.reserva });
                }
            }
        }

        function fonteEmbutida(chave, descricao) {
            return {
                descricao: descricao,
                reserva: true,
                quando: function () { return 'arquivo de ' + embutidas.gerado_em; },
                obter: async function () { return (await obterEmbutidas())[chave]; }
            };
        }

        var ipca;
        async function obterIPCA() {
            if (!ipca) ipca = converterSIDRA(await buscarJSON(URL_IPCA15_SIDRA.replace('{FIM}', mesCalculo)));
            return ipca;
        }

        await Promise.all([
            tentar('selic', 'Selic mensal', [
                { descricao: 'Banco Central, SGS 4390', obter: async function () { return converterSGS(await buscarJSON(URL_SELIC_BCB)); } },
                { descricao: 'Ipeadata, série BM12_TJOVER12 (republica a SGS 4390)', obter: async function () { return converterIpeadata(await buscarJSON(URL_SELIC_IPEADATA)); } },
                fonteEmbutida('selic', 'séries embutidas no DAMNUM (SGS 4390)')
            ], exigencias.selic || []),
            tentar('taxa_legal', 'Taxa legal', [
                { descricao: 'Banco Central, SGS 29543', obter: async function () { return converterSGS(await buscarJSON(URL_TAXA_LEGAL_BCB)); } },
                fonteEmbutida('taxa_legal', 'séries embutidas no DAMNUM (SGS 29543)')
            ], exigencias.taxa_legal || []),
            tentar('ipca15_var', 'IPCA-15, variação mensal', [
                { descricao: 'IBGE, SIDRA, tabela 3065, variável 355', obter: async function () { return (await obterIPCA()).variacao; } },
                fonteEmbutida('ipca15_var', 'séries embutidas no DAMNUM (SIDRA 3065)')
            ], exigencias.ipca15_var || []),
            tentar('ipca15_indice', 'IPCA-15, número-índice', [
                { descricao: 'IBGE, SIDRA, tabela 3065, variável 1117', obter: async function () { return (await obterIPCA()).indice; } },
                fonteEmbutida('ipca15_indice', 'séries embutidas no DAMNUM (SIDRA 3065)')
            ], exigencias.ipca15_indice || [])
        ]);

        return { series: series, consultas: consultas };
    }

    root.DamnumSeries = {
        carregarSeries: carregarSeries,
        converterSGS: converterSGS,
        converterIpeadata: converterIpeadata,
        converterSIDRA: converterSIDRA
    };
})(typeof self !== 'undefined' ? self : this);
