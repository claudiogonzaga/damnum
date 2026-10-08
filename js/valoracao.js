// DAMNUM — montagem da valoração a partir dos dados de entrada e das séries.
// Sem DOM e sem rede: script.js coleta a entrada e mostra o resultado.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./calculo.js'));
    } else {
        root.DamnumValoracao = factory(root.DamnumCalc);
    }
})(typeof self !== 'undefined' ? self : this, function (C) {
    'use strict';

    // Portaria Ibama 118/2022: custos de implantação e manutenção de projeto de
    // recuperação, R$/ha, base outubro de 2022.
    var CUSTOS_PORTARIA_118 = {
        'CERRADO': { menor_valor: 1580.50, media: 11538.92, maior_valor: 17948.50 },
        'FLORESTA AMAZÔNICA': { menor_valor: 1745.75, media: 6010.33, maior_valor: 15170.17 },
        'PANTANAL MATO-GROSSENSE': { menor_valor: 981.00, media: 16220.67, maior_valor: 29334.00 },
        'CAATINGA': { menor_valor: 1536.00, media: 11198.38, maior_valor: 20860.75 },
        'PAMPAS': { menor_valor: 2090.00, media: 12285.25, maior_valor: 23008.25 },
        'MATA ATLÂNTICA': { menor_valor: 1521.00, media: 15737.26, maior_valor: 24302.00 }
    };

    // Nome do bioma na tabela do Quarto Inventário (data/estoques_qcn_fitofisionomias.json).
    var BIOMA_QCN = {
        'CERRADO': 'Cerrado',
        'FLORESTA AMAZÔNICA': 'Amazônia',
        'PANTANAL MATO-GROSSENSE': 'Pantanal',
        'CAATINGA': 'Caatinga',
        'PAMPAS': 'Pampa',
        'MATA ATLÂNTICA': 'Mata Atlântica'
    };

    // Dano interino: parâmetros de cada método.
    var INTERINO_GONZAGA = { taxaPct: 6 };
    // Nota Técnica 03/2022 do CAEx Ambiental/MPMT (atualizada em 17/01/2024):
    // taxa igual à média da série histórica do IPCA de 1995 a 2023 (item 3.1);
    // 100 anos para floresta (item 3.2.4) e 30 anos para cerrado (item 3.2.5).
    var INTERINO_CAEX = { taxaPct: 6.82, tempo: { floresta: 100, savana: 30 } };

    // Forma da vegetação para o tempo de recuperação. Com a fitofisionomia
    // escolhida, vale a categoria do Quarto Inventário (F = florestal; G e OFL =
    // savânica ou campestre). Sem ela, o Cerrado é tratado como savânico, como na
    // Nota Técnica do CAEx, e os demais biomas como florestais, que é a categoria
    // predominante de todos eles na tabela do Inventário.
    function formaDaVegetacao(tabelaQCN, bioma, indiceFitofisionomia) {
        if (tabelaQCN && indiceFitofisionomia !== null && indiceFitofisionomia !== undefined && indiceFitofisionomia !== '') {
            var f = tabelaQCN.biomas[BIOMA_QCN[bioma]].fitofisionomias[indiceFitofisionomia];
            return f.categoria === 'F' ? 'floresta' : 'savana';
        }
        return bioma === 'CERRADO' ? 'savana' : 'floresta';
    }

    // Configuração padrão do dano interino para um método e uma forma de vegetação.
    function interinoPadrao(metodo, forma, temposRecuperacao) {
        var pontos = temposRecuperacao.formas[forma].pontos;
        if (metodo === 'caex') {
            return { metodo: 'caex', forma: forma, pontos: pontos, taxaPct: INTERINO_CAEX.taxaPct, tempo: INTERINO_CAEX.tempo[forma], anosAteRegularizacao: 0 };
        }
        return { metodo: 'gonzaga', forma: forma, pontos: pontos, taxaPct: INTERINO_GONZAGA.taxaPct, tempo: C.faixaDeTempos(pontos).mediana, anosAteRegularizacao: 0 };
    }

    // Calcula o dano interino por hectare e descreve o método.
    function calcularInterino(config, custoHa, areaInterino, areaFora) {
        var r = {
            metodo: config.metodo, forma: config.forma, taxaPct: config.taxaPct, tempo: config.tempo,
            faixa: null, estatisticas: null, valorAreaProtegida: 0, valorAreaFora: 0, anosAteRegularizacao: 0, jurosAnoUm: null
        };
        if (config.metodo === 'caex') {
            r.fator = C.fatorInterinoCAEx(config.taxaPct, config.tempo);
            r.jurosAnoUm = C.jurosAnoUmCAEx(config.taxaPct);
            r.anosAteRegularizacao = config.anosAteRegularizacao > 0 ? config.anosAteRegularizacao : 0;
            r.valorAreaFora = areaFora * custoHa * r.jurosAnoUm * r.anosAteRegularizacao;
        } else {
            r.fator = C.fatorInterino(config.taxaPct, config.tempo);
            var pontos = config.pontos || [];
            if (pontos.length) {
                r.estatisticas = C.faixaDeTempos(pontos);
                r.faixa = pontos.map(function (p) {
                    var fator = C.fatorInterino(config.taxaPct, p.anos);
                    return { anos: p.anos, atributo: p.atributo, fonte: p.fonte, nota: p.nota || '', fator: fator, valor: areaInterino * custoHa * fator };
                });
                ['minimo', 'maximo', 'mediana'].forEach(function (k) {
                    r.estatisticas['valor_' + k] = areaInterino * custoHa * C.fatorInterino(config.taxaPct, r.estatisticas[k]);
                });
            }
        }
        r.referencias = config.referencias || [];
        r.valorAreaProtegida = areaInterino * custoHa * r.fator;
        return r;
    }

    // ---------- lucro do ilícito ambiental (LIA) ----------
    // Método de Gonzaga, Roquette, Silva e Sinisgalli (resumo expandido submetido
    // ao SICAM 2026, "proveito econômico do ilícito ambiental"). Os valores abaixo
    // são os parâmetros de referência de MATO GROSSO citados no trabalho; servem
    // de ponto de partida e são todos editáveis na tela.
    var LIA_REFERENCIA_MT = {
        upf: 263.97,                 // UPF/MT de set./2026 (Portaria 120/2026-SEFAZ)
        taxaRealPct: 3.74,           // Selic real média, 2010 a 2025 (BCB, SGS 4390 e 433)
        taxaNominalPct: 9.73,        // Selic nominal média, 2010 a 2025
        atividades: {
            soja: { rotulo: 'soja', ebitda: 1558.57, arrendamento: 305.33,
                fonte: 'EBITDA médio de 2017 a 2023 (Rossi et al., 2023); arrendamento deduzido médio de 2021/22 a 2025/26 (IMEA, 2026)' },
            pecuaria: { rotulo: 'pecuária de corte', ebitda: 374.54, arrendamento: 0,
                fonte: 'EBITDA médio de 2016 a 2023 (Rossi et al., 2023); na cria e no ciclo completo o arrendamento deduzido é nulo (IMEA, 2026)' }
        },
        // Valorização da terra no mercado Norte Araguaia (INCRA, 2024): só como exemplo.
        valorizacaoExemplo: { pastagem: 10636.44, agricola: 33020.24 },
        // Lei 11.179/2020-MT: Plano de Exploração Florestal, 5 + 0,2 UPF por hectare;
        // Diagnóstico Ambiental, 65 UPF, acima de 1.000 ha (LC 233/2005).
        pefFixoUPF: 5, pefPorHaUPF: 0.2, diagnosticoUPF: 65, diagnosticoAcimaDeHa: 1000,
        vistoria: 5500,              // estimativa do trabalho: dois técnicos, dois dias, 600 km
        honorariosHa: 99.83,         // piso: inventário R$ 50/ha (mercado) + georreferenciamento R$ 49,83/ha (INCRA, 2025)
        // Reposição florestal (Decreto 1.313/2022-MT): 0,10 UPF por m³ de tora e
        // 0,02 UPF por estéreo de lenha. Volumes presumidos da LC 233/2005, art. 46, § 3º.
        reposicaoUPF: {
            'CERRADO': 1.3,              // 65 estéreos de lenha (valor do trabalho: R$ 343,16/ha)
            'FLORESTA AMAZÔNICA': 4.3    // DERIVADO, a conferir: 30 m³ de tora (3,0) + 50 m³ de lenha = 65 st (1,3)
        },
        reposicaoDemaisUPF: 0.78,    // DERIVADO, a conferir: 39 estéreos de lenha
        volumeM3: { 'CERRADO': 50 }, volumeDemaisM3: 30
    };

    // Valores padrão do LIA para um caso (bioma, áreas e intervalo em anos).
    function liaPadrao(bioma, areaFora, atividade, anos) {
        var ref = LIA_REFERENCIA_MT;
        var at = ref.atividades[atividade] || null;
        var taxasUPF = areaFora > 0 ? ref.pefFixoUPF + ref.pefPorHaUPF * areaFora + (areaFora > ref.diagnosticoAcimaDeHa ? ref.diagnosticoUPF : 0) : 0;
        var trUPF = ref.reposicaoUPF[bioma] !== undefined ? ref.reposicaoUPF[bioma] : ref.reposicaoDemaisUPF;
        return {
            atividade: atividade, anos: anos, anosAtividade: anos,
            ebitda: at ? at.ebitda : 0, arrendamento: at ? at.arrendamento : 0,
            valorizacao: 0, taxaRealPct: ref.taxaRealPct, taxaNominalPct: ref.taxaNominalPct,
            volumeM3: ref.volumeM3[bioma] !== undefined ? ref.volumeM3[bioma] : ref.volumeDemaisM3, precoMadeira: 0,
            taxasLicenciamento: C.arredondar(taxasUPF * ref.upf + (areaFora > 0 ? ref.vistoria : 0), 2),
            honorariosHa: ref.honorariosHa,
            reposicaoHa: C.arredondar(trUPF * ref.upf, 2)
        };
    }

    // Calcula o LIA pela árvore de decisão do trabalho:
    //   área não autorizável (APP e reserva legal): Gf + Σ(L + R) + GR, com atividade; Gf + ΔVT + GR, sem ela;
    //   área autorizável (demais áreas):            CL + Σ(L + R) + GR, com atividade; CL + ΔVT + GR, sem ela.
    function calcularLIA(cfg, areaFora, areaEm) {
        var comAtividade = cfg.atividade !== 'nenhuma';
        var t = cfg.anos;
        var fatorAnt = C.fatorAntecipacao(cfg.taxaRealPct, t);
        var fatorCL = C.fatorCapitalizacao(cfg.taxaNominalPct, t);
        var fatorGR = C.fatorCapitalizacao(cfg.taxaNominalPct, t) - 1;
        function porArea(area, autorizavel) {
            var p = { area: area, autorizavel: autorizavel, produtoFlorestal: 0, licenciamento: 0, lucro: 0, renda: 0, antecipacao: 0, reposicao: 0 };
            if (!(area > 0)) { p.total = 0; return p; }
            if (autorizavel) p.licenciamento = (cfg.taxasLicenciamento + cfg.honorariosHa * area) * fatorCL;
            else p.produtoFlorestal = area * cfg.volumeM3 * cfg.precoMadeira;
            if (comAtividade) {
                p.lucro = area * cfg.ebitda * cfg.anosAtividade;
                p.renda = area * cfg.arrendamento * cfg.anosAtividade;
            } else {
                p.antecipacao = area * cfg.valorizacao * fatorAnt;
            }
            p.reposicao = area * cfg.reposicaoHa * fatorGR;
            p.total = p.produtoFlorestal + p.licenciamento + p.lucro + p.renda + p.antecipacao + p.reposicao;
            return p;
        }
        var autorizavel = porArea(areaFora, true);
        var naoAutorizavel = porArea(areaEm, false);
        var avisos = [];
        if (areaEm > 0 && !(cfg.precoMadeira > 0)) avisos.push('O preço do produto florestal não foi informado; a parcela do produto florestal retirado (Gf) ficou em zero.');
        if (!comAtividade && !(cfg.valorizacao > 0)) avisos.push('A valorização da terra (ΔV) não foi informada; a parcela de antecipação da valorização (ΔVT) ficou em zero.');
        if (comAtividade && cfg.anosAtividade !== t) avisos.push('O lucro e a renda da terra foram somados por ' + cfg.anosAtividade + ' anos de atividade, e não pelos ' + t + ' anos do intervalo.');
        return {
            config: cfg, comAtividade: comAtividade,
            fatorAntecipacao: fatorAnt, fatorLicenciamento: fatorCL, fatorReposicao: fatorGR,
            autorizavel: autorizavel, naoAutorizavel: naoAutorizavel,
            total: autorizavel.total + naoAutorizavel.total, avisos: avisos
        };
    }

    var FONTE_QCN = 'Quarta Comunicação Nacional, Relatório de Referência LULUCF (MCTI, 2020)';

    // Meses de cada série de que o cálculo precisa, para decidir se uma fonte serve.
    function exigenciasDeSeries(mesDano, mesCalculo, atualizar) {
        var ex = { selic: [], taxa_legal: [], ipca15_var: [], ipca15_indice: [C.MES_BASE_PORTARIA] };
        if (!atualizar) return ex;
        ex.ipca15_indice.push(mesDano);
        ex.ipca15_var = C.intervaloMeses(mesDano, C.somarMeses(mesCalculo, -1));
        C.intervaloMeses(C.somarMeses(mesDano, 1), mesCalculo).forEach(function (m) {
            if (m >= C.MES_INICIO_TAXA_LEGAL) ex.taxa_legal.push(C.somarMeses(m, -1));
            else if (m >= '200301') ex.selic.push(m);
        });
        return ex;
    }

    // Estoque pela tabela do Quarto Inventário: fitofisionomia escolhida ou média do bioma.
    function estoqueDaTabela(tabelaQCN, bioma, indiceFitofisionomia) {
        var nome = BIOMA_QCN[bioma];
        var b = tabelaQCN.biomas[nome];
        if (indiceFitofisionomia === null || indiceFitofisionomia === undefined || indiceFitofisionomia === '') {
            return {
                origem: 'bioma',
                tC: b.media_ponderada_tC_ha,
                descricaoOrigem: 'média do bioma ' + nome + ' (tabela do Quarto Inventário Nacional)',
                fonte: FONTE_QCN + ', Tabela ' + b.tabela,
                regra: 'média dos totais das fitofisionomias ponderada pela participação no bioma, só com as categorias F (floresta), G (campo) e OFL (outras formações lenhosas); ficam de fora dunas e afloramento rochoso'
            };
        }
        var f = b.fitofisionomias[indiceFitofisionomia];
        var sub = f.subvalores || [];
        return {
            origem: 'fitofisionomia',
            tC: f.total_tC_ha,
            sigla: f.sigla,
            nome: f.nome,
            subvalores: sub,
            descricaoOrigem: 'tabela por fitofisionomia do Quarto Inventário Nacional (bioma ' + nome + ')',
            fonte: FONTE_QCN + ', Tabela ' + b.tabela + ', p. ' + (f.paginas || []).join(' e '),
            regra: sub.length > 1 ? 'fitofisionomia com mais de um valor na tabela: média aritmética simples dos totais' : ''
        };
    }

    function estoqueDoUsuario(tC, fonte) {
        return { origem: 'usuario', tC: tC, descricaoOrigem: 'estoque informado pelo usuário', fonte: fonte, regra: '' };
    }

    // Estoque pelo mapa por estado. A parte do polígono fora da cobertura recebe o
    // estoque de reserva (tabela).
    function estoqueDoMapa(consulta, reserva) {
        var e;
        if (consulta.tipo === 'coordenada') {
            e = {
                origem: 'mapa-coordenada', tC: consulta.estoque_tC_ha,
                descricaoOrigem: 'mapa do Quarto Inventário Nacional por estado, consulta por coordenada (estimativa aproximada)',
                regra: 'estoque (c_v_4i) do polígono do Inventário que contém a coordenada'
            };
        } else {
            var descoberta = consulta.pct_descoberto / 100;
            e = {
                origem: 'mapa-poligono',
                tC: consulta.estoque_tC_ha * (1 - descoberta) + reserva.tC * descoberta,
                descricaoOrigem: 'mapa do Quarto Inventário Nacional por estado, interseção com o polígono da área desmatada',
                regra: 'média do estoque (c_v_4i) ponderada pela área de interseção de cada polígono do Inventário',
                reservaDescoberta: reserva.descricaoOrigem + ' (' + reserva.tC + ' tC/ha)'
            };
        }
        e.fonte = 'Quarto Inventário Nacional de Emissões (MCTI, 2020), dados espaciais por UF; ' + (consulta.versaoMapa || 'versão do arquivo não informada');
        e.mapa = consulta;
        return e;
    }

    function parcelaPatrimonial(valor, area, ctx) {
        valor = C.arredondar(valor, 2);
        var p = { valor: valor, area: area, correcao: 0, juros: 0, total: valor, atualizacao: null };
        if (!ctx.atualizar || !(valor > 0)) return p;
        var a;
        if (ctx.manual) {
            var principal = C.truncar(valor * ctx.manual.coeficiente, 2);
            var juros = C.truncar(principal * ctx.manual.jurosPatrimonial / 100, 2);
            a = { coeficiente: ctx.manual.coeficiente, principalCorrigido: principal, percentualJuros: ctx.manual.jurosPatrimonial, juros: juros, total: C.arredondar(principal + juros, 2) };
        } else {
            a = C.atualizarParcela(ctx.series, { valor: valor, mesValor: ctx.mesDano, mesTermoJuros: ctx.mesDano, mesCalculo: ctx.mesCalculo });
        }
        p.atualizacao = a;
        p.correcao = C.arredondar(a.principalCorrigido - valor, 2);
        p.juros = a.juros;
        p.total = a.total;
        return p;
    }

    function parcelaCarbono(valor, ctx) {
        valor = C.arredondar(valor, 2);
        var p = { valor: valor, correcao: 0, juros: 0, total: valor, percentualJuros: 0 };
        if (!ctx.atualizar) return p;
        p.percentualJuros = ctx.percentualJurosExtra;
        p.juros = C.truncar(valor * p.percentualJuros / 100, 2);
        p.total = C.arredondar(valor + p.juros, 2);
        return p;
    }

    // Monta a valoração completa. Lança ErroSerie se faltar mês em alguma série.
    function calcular(entrada, series) {
        var mesCalculo = C.mesDeData(entrada.dataCalculo);
        var dataInformada = !!entrada.dataDano;
        var mesDano = dataInformada ? C.mesDeData(entrada.dataDano) : mesCalculo;
        var atualizar = dataInformada && mesDano < mesCalculo;
        var manual = atualizar ? entrada.manual : null;
        var portaria = CUSTOS_PORTARIA_118[entrada.bioma];

        // Custo de recuperação na data do dano (ou no último índice publicado, sem data).
        var custo = { portaria: portaria };
        var mesReferencia = mesDano;
        if (!atualizar || typeof series.ipca15_indice[mesReferencia] !== 'number') {
            if (atualizar && !manual) {
                C.custoNoMes(portaria.media, series, mesReferencia); // lança ErroSerie
            }
            var ultimo = Object.keys(series.ipca15_indice).length ? C.ultimoMesDisponivel(series.ipca15_indice) : null;
            mesReferencia = atualizar ? null : ultimo;
        }
        if (mesReferencia && typeof series.ipca15_indice[C.MES_BASE_PORTARIA] === 'number') {
            var c = C.custoNoMes(portaria.media, series, mesReferencia);
            custo.valorHa = C.arredondar(c.valor, 2);
            custo.mesReferencia = mesReferencia;
            custo.indiceBase = c.indiceBase;
            custo.indiceMes = c.indiceMes;
            custo.fator = c.fator;
        } else {
            custo.valorHa = portaria.media;
            custo.mesReferencia = C.MES_BASE_PORTARIA;
            custo.fator = null;
        }

        var ctx = { atualizar: atualizar, manual: manual, series: series, mesDano: mesDano, mesCalculo: mesCalculo, percentualJurosExtra: 0 };
        var referenciaPatrimonial = null, referenciaExtra = null;
        if (atualizar && !manual) {
            referenciaPatrimonial = C.atualizarParcela(series, { valor: 1, mesValor: mesDano, mesTermoJuros: mesDano, mesCalculo: mesCalculo });
            referenciaExtra = C.jurosExtrapatrimonial(series, mesDano, mesCalculo, entrada.opcaoExtrapatrimonial);
            ctx.percentualJurosExtra = referenciaExtra.percentual;
        } else if (manual) {
            ctx.percentualJurosExtra = manual.jurosExtra;
        }

        var fora = entrada.areas.fora, em = entrada.areas.em, total = fora + em;
        var reparacao = entrada.reparacaoInSitu && em > 0;
        var areaMaterial = reparacao ? fora : total;
        var areaInterino = reparacao ? em : 0;
        var valorMaterialGonzaga = areaMaterial * custo.valorHa;
        // Sem configuração própria, vale o método de Gonzaga et al. com a taxa e o tempo informados.
        var configInterino = entrada.interino || { metodo: 'gonzaga', forma: null, pontos: [], taxaPct: entrada.taxaInterinoPct, tempo: entrada.tempoRecuperacao };
        var interino = calcularInterino(configInterino, custo.valorHa, areaInterino, fora);
        var valorInterino = interino.valorAreaProtegida + interino.valorAreaFora;

        var parametros = Object.assign({}, entrada.parametros);
        parametros.precoSocialCO2BRL = C.arredondar(parametros.precoSocialCO2USD * parametros.cotacaoDolar, 2);
        parametros.precoMercadoCO2BRL = C.arredondar(parametros.precoMercadoCO2USD * parametros.cotacaoDolar, 2);

        var parcelas = {
            material: parcelaPatrimonial(entrada.entendimento === 'irdr' ? 0 : valorMaterialGonzaga, areaMaterial, ctx),
            interino: parcelaPatrimonial(valorInterino, areaInterino, ctx),
            mercado: parcelaCarbono(C.danoCarbono(total, entrada.estoque.tC, parametros.precoMercadoCO2BRL), ctx),
            social: parcelaCarbono(C.danoCarbono(total, entrada.estoque.tC, parametros.precoSocialCO2BRL), ctx)
        };

        // Lucro do ilícito ambiental: calculado até o ano da regularização, em valores
        // nominais das fontes; não recebe correção nem juros na calculadora.
        var lia = entrada.lia ? calcularLIA(entrada.lia, fora, em) : null;
        if (lia) {
            var valorLia = C.arredondar(lia.total, 2);
            parcelas.lia = { valor: valorLia, correcao: 0, juros: 0, total: valorLia };
        }

        function somar(campo, lista) {
            return C.arredondar(lista.reduce(function (s, p) { return s + p[campo]; }, 0), 2);
        }
        var todas = [parcelas.material, parcelas.interino, parcelas.mercado, parcelas.social];
        if (lia) todas.push(parcelas.lia);
        var totais = { original: somar('valor', todas), correcao: somar('correcao', todas), juros: somar('juros', todas), atualizado: somar('total', todas) };

        // Entendimento alternativo, como na versão 6: no IRDR 13/TJMT o material e
        // o interino ficam em zero; em Gonzaga et al. entram os dois.
        var alt = entrada.entendimento === 'gonzaga'
            ? { material: parcelaPatrimonial(0, areaMaterial, ctx), interino: parcelaPatrimonial(0, areaInterino, ctx) }
            : { material: parcelaPatrimonial(valorMaterialGonzaga, areaMaterial, ctx), interino: parcelaPatrimonial(valorInterino, areaInterino, ctx) };
        var altTodas = [alt.material, alt.interino, parcelas.mercado, parcelas.social];
        if (lia) altTodas.push(parcelas.lia);
        alt.totalOriginal = somar('valor', altTodas);
        alt.totalAtualizado = somar('total', altTodas);

        var avisosPiso = [];
        [['custo social do carbono', parametros.precoSocialCO2USD], ['preço no mercado voluntário', parametros.precoMercadoCO2USD]].forEach(function (par) {
            if (C.abaixoDoPisoCNJ(par[1])) avisosPiso.push(avisoPiso(par[0], par[1]));
        });

        return {
            versao: entrada.versao,
            dataCalculo: entrada.dataCalculo, mesCalculo: mesCalculo,
            dataDano: entrada.dataDano, dataInformada: dataInformada, mesDano: mesDano,
            bioma: entrada.bioma, entendimento: entrada.entendimento,
            numeroProcesso: entrada.numeroProcesso || '',
            identificacao: entrada.identificacao || {},
            areas: { fora: fora, em: em, total: total, observacao: entrada.areas.observacao || '' },
            reparacaoInSitu: reparacao,
            custo: custo,
            interino: interino,
            lia: lia,
            liaAnoRegularizacao: entrada.lia ? entrada.lia.anoRegularizacao : null,
            parametros: parametros,
            estoque: entrada.estoque,
            parcelas: parcelas,
            totais: totais,
            alternativo: alt,
            avisosPiso: avisosPiso,
            atualizacao: {
                aplicada: atualizar,
                motivo: atualizar ? '' : (dataInformada ? 'o dano ocorreu no mês do cálculo' : 'a data do dano não foi informada'),
                manual: manual,
                opcaoExtrapatrimonial: entrada.opcaoExtrapatrimonial,
                referenciaPatrimonial: referenciaPatrimonial,
                referenciaExtrapatrimonial: referenciaExtra
            },
            series: series,
            consultas: entrada.consultas || [],
            hash: entrada.hash || ''
        };
    }

    function avisoPiso(rotulo, precoUSD) {
        return 'O ' + rotulo + ' informado (US$ ' + String(precoUSD.toFixed(2)).replace('.', ',') + '/tCO₂) está abaixo de US$ 5,00/tCO₂e, valor do Fundo Amazônia que o Protocolo para Julgamento de Ações Ambientais (CNJ, 2024, p. 66; Recomendação CNJ 156/2024) recomenda como piso.';
    }

    // Texto canônico dos parâmetros de entrada, para o hash de reprodutibilidade.
    // Não inclui nomes nem CPF/CNPJ.
    function textoCanonico(entrada) {
        var d = entrada.dataDano;
        return JSON.stringify({
            versao: entrada.versao,
            bioma: entrada.bioma,
            entendimento: entrada.entendimento,
            dataDano: d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null,
            mesCalculo: C.mesDeData(entrada.dataCalculo),
            areaFora: entrada.areas.fora,
            areaEm: entrada.areas.em,
            reparacaoInSitu: !!entrada.reparacaoInSitu,
            interino: entrada.interino
                ? { metodo: entrada.interino.metodo, forma: entrada.interino.forma, taxaPct: entrada.interino.taxaPct, tempo: entrada.interino.tempo, anosAteRegularizacao: entrada.interino.anosAteRegularizacao || 0 }
                : { metodo: 'gonzaga', taxaPct: entrada.taxaInterinoPct, tempo: entrada.tempoRecuperacao },
            precoSocialCO2USD: entrada.parametros.precoSocialCO2USD,
            precoMercadoCO2USD: entrada.parametros.precoMercadoCO2USD,
            cotacaoDolar: entrada.parametros.cotacaoDolar,
            estoqueTC: entrada.estoque.tC,
            origemEstoque: entrada.estoque.origem,
            opcaoExtrapatrimonial: entrada.opcaoExtrapatrimonial,
            lia: entrada.lia || null,
            manual: entrada.manual || null
        });
    }

    return {
        CUSTOS_PORTARIA_118: CUSTOS_PORTARIA_118,
        BIOMA_QCN: BIOMA_QCN,
        LIA_REFERENCIA_MT: LIA_REFERENCIA_MT,
        liaPadrao: liaPadrao,
        calcularLIA: calcularLIA,
        INTERINO_GONZAGA: INTERINO_GONZAGA,
        INTERINO_CAEX: INTERINO_CAEX,
        formaDaVegetacao: formaDaVegetacao,
        interinoPadrao: interinoPadrao,
        calcularInterino: calcularInterino,
        exigenciasDeSeries: exigenciasDeSeries,
        estoqueDaTabela: estoqueDaTabela,
        estoqueDoUsuario: estoqueDoUsuario,
        estoqueDoMapa: estoqueDoMapa,
        calcular: calcular,
        avisoPiso: avisoPiso,
        textoCanonico: textoCanonico
    };
});
