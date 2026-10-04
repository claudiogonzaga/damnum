// DAMNUM — indicação da fitofisionomia pelo mapa de vegetação do IBGE (BDiA,
// 1:250.000), enquanto o mapa do Quarto Inventário por estado não está disponível.
//
// O IBGE só indica a fitofisionomia; o estoque continua vindo da tabela do
// Quarto Inventário. Onde a área já está antropizada, o IBGE informa a vegetação
// pretérita só no nível de região (Savana, Floresta Ombrófila Densa...), e a
// escolha da formação fica com o usuário.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DamnumIBGE = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var URL_WFS = 'https://geoservicos.ibge.gov.br/geoserver/BDIA/ows';
    var CAMADA = 'BDIA:vege_area';
    var CAMPOS = 'leg_carga,leg_uveg,nm_uveg,leg_uantr,nm_uantr,leg_contat,nm_contat,veg_pretet,nm_pretet,leg_sup';
    var FONTE = 'IBGE, Banco de Dados e Informações Ambientais (BDiA), mapa de vegetação 1:250.000, camada ' + CAMADA;
    var TEMPO_LIMITE_MS = 15000;

    // WFS 1.0.0: o ponto vai na ordem longitude, latitude. Sem a geometria na
    // resposta (propertyName), que chega a centenas de KB por polígono.
    function urlDoPonto(lon, lat) {
        return URL_WFS + '?service=WFS&version=1.0.0&request=GetFeature&typeName=' + CAMADA +
            '&outputFormat=application/json&propertyName=' + CAMPOS +
            '&CQL_FILTER=' + encodeURIComponent('INTERSECTS(geom,POINT(' + lon + ' ' + lat + '))');
    }

    async function consultarPonto(lon, lat) {
        var controle = new AbortController();
        var relogio = setTimeout(function () { controle.abort(); }, TEMPO_LIMITE_MS);
        try {
            var resposta = await fetch(urlDoPonto(lon, lat), { signal: controle.signal });
            if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
            var dados = await resposta.json();
            return dados.features && dados.features.length ? dados.features[0].properties : null;
        } finally {
            clearTimeout(relogio);
        }
    }

    function texto(v) { return v == null ? '' : String(v).trim(); }

    // Índices das linhas da tabela cujo total existe.
    function linhasValidas(fitofisionomias) {
        var lista = [];
        fitofisionomias.forEach(function (f, i) {
            if (typeof f.total_tC_ha === 'number') lista.push({ indice: i, sigla: f.sigla, nome: f.nome, tC: f.total_tC_ha });
        });
        return lista;
    }

    // Linha da tabela cuja sigla é o maior prefixo da legenda do IBGE
    // (ex.: "Sda" → "Sd"). Exige ao menos região + formação (2 caracteres).
    function linhaPorLegenda(linhas, legenda) {
        for (var n = Math.min(legenda.length, 3); n >= 2; n--) {
            var prefixo = legenda.slice(0, n);
            var achada = linhas.filter(function (l) { return l.sigla === prefixo; })[0];
            if (achada) return achada;
        }
        return null;
    }

    // Formações de uma região: sigla = região + letra minúscula (ex.: S → Sa, Sd, Sg, Sp),
    // mais a linha genérica da própria região, se a tabela tiver.
    function linhasDaRegiao(linhas, regiao) {
        return linhas.filter(function (l) {
            if (l.sigla === regiao) return true;
            return l.sigla.length === regiao.length + 1 && l.sigla.indexOf(regiao) === 0 && /[a-z]/.test(l.sigla.charAt(regiao.length));
        });
    }

    // Interpreta a resposta do IBGE frente à tabela do bioma escolhido.
    // tipo: 'formacao' (uma linha indicada), 'regiao' (várias candidatas),
    //       'sem-correspondencia' ou 'fora' (ponto fora do mapa).
    function interpretar(props, fitofisionomias) {
        if (!props) return { tipo: 'fora', candidatas: [], descricao: 'O ponto está fora do mapa de vegetação do IBGE.' };
        var linhas = linhasValidas(fitofisionomias);
        var natural = texto(props.leg_uveg) || texto(props.leg_contat);
        var nomeNatural = texto(props.nm_uveg) || texto(props.nm_contat);
        var regiao = texto(props.veg_pretet);
        var base = {
            legendaIBGE: texto(props.leg_carga),
            situacao: texto(props.leg_sup),
            usoAtual: texto(props.nm_uantr)
        };

        if (natural) {
            var linha = linhaPorLegenda(linhas, natural);
            if (linha) {
                return Object.assign(base, {
                    tipo: 'formacao', candidatas: [linha],
                    descricao: 'O IBGE mapeia no ponto a formação ' + natural + ' (' + nomeNatural + '), que corresponde à linha ' + linha.sigla + ' da tabela do Quarto Inventário.'
                });
            }
            if (!regiao) regiao = natural.replace(/[a-z].*$/, '');
            base.semLinha = 'O IBGE mapeia no ponto a formação ' + natural + ' (' + nomeNatural + '), que não tem linha na tabela do Quarto Inventário para este bioma. ';
        }

        if (regiao) {
            var candidatas = linhasDaRegiao(linhas, regiao);
            var nomeRegiao = texto(props.nm_pretet) || regiao;
            if (candidatas.length) {
                var valores = candidatas.map(function (c) { return c.tC; });
                return Object.assign(base, {
                    tipo: 'regiao', candidatas: candidatas,
                    minimo: Math.min.apply(null, valores), maximo: Math.max.apply(null, valores),
                    descricao: (base.semLinha || '') + (base.usoAtual ? 'A área está antropizada (' + base.usoAtual + '). ' : '') +
                        'O IBGE indica como vegetação original a região ' + regiao + ' (' + nomeRegiao + '), sem a formação. A escolha da formação cabe ao usuário.'
                });
            }
            return Object.assign(base, {
                tipo: 'sem-correspondencia', candidatas: [],
                descricao: (base.semLinha
                    ? base.semLinha + 'A região ' + regiao + ' (' + nomeRegiao + ') também não tem.'
                    : 'A região ' + regiao + ' (' + nomeRegiao + ') não tem linha na tabela do Quarto Inventário para este bioma.') +
                    ' Confira o bioma ou escolha a fitofisionomia por outra fonte.'
            });
        }
        return Object.assign(base, { tipo: 'sem-correspondencia', candidatas: [], descricao: 'O IBGE não informa a vegetação neste ponto.' });
    }

    return {
        FONTE: FONTE,
        urlDoPonto: urlDoPonto,
        consultarPonto: consultarPonto,
        interpretar: interpretar
    };
});
