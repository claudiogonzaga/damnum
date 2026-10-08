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

    // ---------- custos de reposição da Nota Técnica do CAEx ----------
    // Nota Técnica 03/2022 do CAEx Ambiental/MPMT (atualizada em 17/01/2024), itens
    // 3.2.2, 3.2.3 e 3.2.1 (sem reparação): custos de Timotheo et al. (2017),
    // "atualizados conforme o IPCA no período 2017-2023". A Nota não indica o mês;
    // a calculadora adota dez./2023 como base (PENDENTE de confirmação).
    var MES_BASE_TIMOTHEO = '202312';
    var CUSTOS_TIMOTHEO = {
        alta: { valor: 6656.91, rotulo: 'desmatamento com alta resiliência: isolamento e condução da regeneração natural ("cercamento")' },
        baixa: { valor: 9999.84, rotulo: 'desmatamento com baixa resiliência: isolamento e plantio de mudas em 5 m × 5 m ("adensamento")' },
        plantio: { valor: 41649.33, rotulo: 'isolamento e plantio total de mudas em 3 m × 2 m' }
    };

    // ---------- dano interino ----------
    // Gonzaga et al. (2025): custo × i × (t + 1) ÷ 2; taxa de 6% e tempo mínimo de 15 anos.
    var INTERINO_GONZAGA = { taxaPct: 6, tempo: 15 };
    // Nota Técnica 03/2022 do CAEx: taxa igual à média do IPCA de 1995 a 2023
    // (item 3.1); 100 anos para floresta (3.2.4) e 30 anos para cerrado (3.2.5);
    // custo de reposição de Timotheo et al. conforme a resiliência.
    var INTERINO_CAEX = { taxaPct: 6.82, tempo: { floresta: 100, savana: 30 }, resiliencia: 'baixa' };

    // Forma da vegetação para o tempo de recuperação da Nota do CAEx. Com a
    // fitofisionomia escolhida, vale a categoria do Quarto Inventário (F =
    // florestal; G e OFL = savânica ou campestre). Sem ela, o Cerrado é tratado
    // como savânico, como na Nota, e os demais biomas como florestais, que é a
    // categoria predominante de todos eles na tabela do Inventário.
    function formaDaVegetacao(tabelaQCN, bioma, indiceFitofisionomia) {
        if (tabelaQCN && indiceFitofisionomia !== null && indiceFitofisionomia !== undefined && indiceFitofisionomia !== '') {
            var f = tabelaQCN.biomas[BIOMA_QCN[bioma]].fitofisionomias[indiceFitofisionomia];
            return f.categoria === 'F' ? 'floresta' : 'savana';
        }
        return bioma === 'CERRADO' ? 'savana' : 'floresta';
    }

    function interinoPadrao(metodo, forma) {
        if (metodo === 'caex') {
            return { metodo: 'caex', forma: forma, taxaPct: INTERINO_CAEX.taxaPct, tempo: INTERINO_CAEX.tempo[forma], resiliencia: INTERINO_CAEX.resiliencia, anosAteRegularizacao: 0 };
        }
        return { metodo: 'gonzaga', forma: forma, taxaPct: INTERINO_GONZAGA.taxaPct, tempo: INTERINO_GONZAGA.tempo, anosAteRegularizacao: 0 };
    }

    // `custoHa`: custo do DAMNUM (Portaria Ibama 118/2022) no mês de referência.
    // `custoCaexHa`: custo de Timotheo et al. no mesmo mês, usado só no método do CAEx.
    function calcularInterino(config, custoHa, custoCaexHa, areaInterino, areaFora) {
        var r = { metodo: config.metodo, forma: config.forma, taxaPct: config.taxaPct, tempo: config.tempo,
            valorAreaProtegida: 0, valorAreaFora: 0, anosAteRegularizacao: 0, jurosAnoUm: null, resiliencia: null };
        if (config.metodo === 'caex') {
            r.resiliencia = config.resiliencia;
            r.custoHa = custoCaexHa;
            r.fator = C.fatorInterinoCAEx(config.taxaPct, config.tempo);
            r.jurosAnoUm = C.jurosAnoUmCAEx(config.taxaPct);
            r.anosAteRegularizacao = config.anosAteRegularizacao > 0 ? config.anosAteRegularizacao : 0;
            r.valorAreaFora = areaFora * r.custoHa * r.jurosAnoUm * r.anosAteRegularizacao;
        } else {
            r.custoHa = custoHa;
            r.fator = C.fatorInterino(config.taxaPct, config.tempo);
        }
        r.valorAreaProtegida = areaInterino * r.custoHa * r.fator;
        return r;
    }

    // ---------- dano residual ----------
    // Fração permanentemente perdida dos serviços ecossistêmicos (PFE), em % do
    // custo de reposição: estimativas reunidas no trabalho
    // sobre o dano residual submetido ao SICAM 2026. A faixa (mínimo, máximo e
    // mediana) é calculada a partir destes pontos.
    var RESIDUAL_PONTOS = [
        { pct: 1.99, fonte: 'MPMT, Relatório Técnico 963/2026', nota: 'pesos iguais para os doze atributos de Poorter et al. (2021), cinco deles com déficit aos 120 anos' },
        { pct: 10, fonte: 'Poorter et al. (2021)', nota: 'déficit do atributo mais lento (biomassa e composição de espécies) aos 120 anos' },
        { pct: 14, fonte: 'Gonzaga et al. (2025)', nota: 'valor conservador a partir de Benayas et al. (2009), Moreno-Mateos et al. (2012) e Crouzeilles et al. (2016)' },
        { pct: 23, fonte: 'Moreno-Mateos et al. (2012)', nota: 'funcionamento biogeoquímico de áreas úmidas restauradas' },
        { pct: 26, fonte: 'Moreno-Mateos et al. (2012)', nota: 'estrutura biológica de áreas úmidas restauradas' }
    ];
    // MPMT, Relatório Técnico 963/2026 (SAT 77578): (CR × PFE) ÷ i, do método CATE II
    // (Ribas, 1996), com PFE de 1,99%, i de 6,82% e CR de R$ 41.649,33/ha.
    var RESIDUAL_CAEX = { pfePct: 1.99, taxaPct: 6.82, custo: 'plantio' };

    function residualPadrao(metodo) {
        if (metodo === 'caex') return { metodo: 'caex', pfePct: RESIDUAL_CAEX.pfePct, taxaPct: RESIDUAL_CAEX.taxaPct, custo: RESIDUAL_CAEX.custo, k: 1 };
        return { metodo: 'gonzaga', pfePct: C.faixaDeValores(RESIDUAL_PONTOS.map(function (p) { return p.pct; })).mediana, k: 1 };
    }

    // Método padrão: DR = A × PFE × k × custo de referência (estoque, sem taxa);
    // em espécie, a regra é proteger A × PFE × k hectares em perpetuidade.
    // CAEx (RT 963/2026): DR = A × (CR × PFE) ÷ i.
    function calcularResidual(config, custoHa, custoCaexHa, area) {
        var pfe = config.pfePct / 100;
        var r = { metodo: config.metodo, pfePct: config.pfePct, area: area, k: config.k || 1, faixa: null, estatisticas: null };
        if (config.metodo === 'caex') {
            r.custoHa = custoCaexHa;
            r.taxaPct = config.taxaPct;
            r.custo = config.custo;
            r.valor = area * (custoCaexHa * pfe) / (config.taxaPct / 100);
        } else {
            r.custoHa = custoHa;
            r.areaEmEspecie = area * pfe * r.k;
            r.valor = area * custoHa * pfe * r.k;
            r.estatisticas = C.faixaDeValores(RESIDUAL_PONTOS.map(function (p) { return p.pct; }));
            r.faixa = RESIDUAL_PONTOS.map(function (p) {
                return { pct: p.pct, fonte: p.fonte, nota: p.nota, valor: area * custoHa * (p.pct / 100) * r.k };
            });
            ['minimo', 'maximo', 'mediana'].forEach(function (c) {
                r.estatisticas['valor_' + c] = area * custoHa * (r.estatisticas[c] / 100) * r.k;
            });
        }
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
        // Honorários técnicos para instruir o pedido de autorização de desmatamento
        // na SEMA/MT (caracterização fitoecológica, inventário florestal e Plano de
        // Exploração Florestal) e EIA/RIMA: orçamento de empresa de consultoria
        // ambiental de Mato Grosso, data-base set./2026, para cenários de 50, 150 e
        // 1.500 ha. Cada cenário vale para a faixa de área em que se encontra; os
        // limites de 100 e 1.000 ha são da calculadora (o de 1.000 ha é o do EIA/RIMA).
        mesBaseLicenciamento: '202609',
        honorarios: [
            { ateHa: 100, cenarioHa: 50, savana: 39360.00, floresta: 44160.00 },
            { ateHa: 1000, cenarioHa: 150, savana: 76800.00, floresta: 92160.00 },
            { ateHa: Infinity, cenarioHa: 1500, savana: 245760.00, floresta: 341760.00 }
        ],
        eiaRima: 220800.00, eiaRimaAcimaDeHa: 1000,
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
    // Honorários por hectare da faixa de área, conforme a forma da vegetação.
    function honorariosDaFaixa(areaFora, forma) {
        var ref = LIA_REFERENCIA_MT;
        var faixa = ref.honorarios.filter(function (f) { return areaFora <= f.ateHa; })[0];
        return { cenarioHa: faixa.cenarioHa, porHa: C.arredondar(faixa[forma === 'savana' ? 'savana' : 'floresta'] / faixa.cenarioHa, 2) };
    }

    function liaPadrao(bioma, areaFora, atividade, anos, forma) {
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
            honorariosHa: honorariosDaFaixa(areaFora, forma || formaDaVegetacao(null, bioma, null)).porHa,
            eiaRima: areaFora > ref.eiaRimaAcimaDeHa ? ref.eiaRima : 0,
            mesBaseLicenciamento: ref.mesBaseLicenciamento,
            reposicaoHa: C.arredondar(trUPF * ref.upf, 2)
        };
    }

    // Calcula o LIA pela árvore de decisão do trabalho:
    //   área não autorizável (APP e reserva legal): Gf + Σ(L + R) + GR, com atividade; Gf + ΔVT + GR, sem ela;
    //   área autorizável (demais áreas):            CL + Σ(L + R) + GR, com atividade; CL + ΔVT + GR, sem ela.
    // As parcelas saem em valores nominais das fontes; a atualização (correção e
    // juros, pelo Manual da Justiça Federal) é feita depois, em atualizarLIA.
    // `fatorLicenciamento` leva o custo de licenciamento do mês-base ao mês do dano.
    function calcularLIA(cfg, areaFora, areaEm, fatorLicenciamento) {
        var fLic = fatorLicenciamento || 1;
        var comAtividade = cfg.atividade !== 'nenhuma';
        var t = cfg.anos;
        var fatorAnt = C.fatorAntecipacao(cfg.taxaRealPct, t);
        var fatorGR = C.fatorCapitalizacao(cfg.taxaNominalPct, t) - 1;
        function porArea(area, autorizavel) {
            var p = { area: area, autorizavel: autorizavel, produtoFlorestal: 0, licenciamento: 0, lucro: 0, renda: 0, antecipacao: 0, reposicao: 0 };
            if (!(area > 0)) { p.total = 0; return p; }
            if (autorizavel) p.licenciamento = (cfg.taxasLicenciamento + cfg.honorariosHa * area + (cfg.eiaRima || 0)) * fLic;
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
        if (areaFora > LIA_REFERENCIA_MT.eiaRimaAcimaDeHa) avisos.push('A área fora de APP e reserva legal passa de 1.000 ha, o que torna exigível o EIA/RIMA (Resolução CONAMA 01/1986, art. 2º, XVII). ' + (cfg.eiaRima > 0 ? '' : 'O custo do estudo não foi informado e ficou fora do cálculo. ') + 'A compensação do art. 36 da Lei 9.985/2000 não está no cálculo.');
        return {
            config: cfg, comAtividade: comAtividade,
            fatorAntecipacao: fatorAnt, fatorReposicao: fatorGR, fatorLicenciamento: fLic,
            autorizavel: autorizavel, naoAutorizavel: naoAutorizavel,
            total: autorizavel.total + naoAutorizavel.total, avisos: avisos
        };
    }

    // Atualiza o LIA pelo Manual da Justiça Federal, com termo no evento danoso
    // (Súmula 54/STJ). Correção e juros de cada valor contam do mês em que ele se forma:
    //   - produto florestal, licenciamento evitado e antecipação da valorização: mês do dano;
    //   - lucro e renda da terra: uma parcela por ano de atividade, no fim de cada ano;
    //   - adiamento da reposição: mês da regularização, inclusive para os juros,
    //     porque o ganho já vem capitalizado pela Selic até lá.
    function atualizarLIA(lia, ctx) {
        var grupos = [];
        function somaDe(campo) { return lia.autorizavel[campo] + lia.naoAutorizavel[campo]; }
        var noDano = somaDe('produtoFlorestal') + somaDe('licenciamento') + somaDe('antecipacao');
        if (noDano > 0) grupos.push({ rotulo: 'produto florestal, licenciamento evitado e antecipação da valorização, no mês do dano', mes: ctx.mesDano, valor: noDano });
        var anual = (somaDe('lucro') + somaDe('renda')) / (lia.config.anosAtividade || 1);
        for (var k = 1; lia.comAtividade && k <= lia.config.anosAtividade; k++) {
            var mes = C.somarMeses(ctx.mesDano, 12 * k);
            grupos.push({ rotulo: 'lucro e renda da terra do ano ' + k, mes: mes > ctx.mesCalculo ? ctx.mesCalculo : mes, valor: anual });
        }
        var gr = somaDe('reposicao');
        if (gr > 0) {
            var mesReg = C.somarMeses(ctx.mesDano, 12 * lia.config.anos);
            if (mesReg > ctx.mesCalculo) mesReg = ctx.mesCalculo;
            grupos.push({ rotulo: 'adiamento da reposição, no mês da regularização', mes: mesReg, termoJuros: mesReg, valor: gr });
        }
        var p = { valor: 0, correcao: 0, juros: 0, total: 0, grupos: [] };
        grupos.forEach(function (g) {
            var valor = C.arredondar(g.valor, 2);
            var linha = { rotulo: g.rotulo, mes: g.mes, valor: valor, principalCorrigido: valor, juros: 0, total: valor };
            if (ctx.atualizar && valor > 0) {
                var a;
                if (ctx.manual) {
                    var principal = C.truncar(valor * ctx.manual.coeficiente, 2);
                    a = { principalCorrigido: principal, juros: C.truncar(principal * ctx.manual.jurosPatrimonial / 100, 2) };
                } else {
                    a = C.atualizarParcela(ctx.series, { valor: valor, mesValor: g.mes, mesTermoJuros: g.termoJuros || ctx.mesDano, mesCalculo: ctx.mesCalculo });
                }
                linha.principalCorrigido = a.principalCorrigido;
                linha.juros = a.juros;
                linha.total = C.arredondar(a.principalCorrigido + a.juros, 2);
            }
            p.valor += linha.valor; p.correcao += linha.principalCorrigido - linha.valor; p.juros += linha.juros; p.total += linha.total;
            p.grupos.push(linha);
        });
        ['valor', 'correcao', 'juros', 'total'].forEach(function (c) { p[c] = C.arredondar(p[c], 2); });
        return p;
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
        // Custo de Timotheo et al. (Nota Técnica do CAEx) no mesmo mês de referência
        // do custo do DAMNUM, para os métodos do CAEx.
        function custoTimotheo(chave) {
            var valor = CUSTOS_TIMOTHEO[chave].valor;
            if (custo.fator === null) return valor;
            return C.arredondar(C.reindexar(valor, series, MES_BASE_TIMOTHEO, custo.mesReferencia), 2);
        }
        // Sem configuração própria, vale o método de Gonzaga et al. com a taxa e o tempo informados.
        var configInterino = entrada.interino || { metodo: 'gonzaga', forma: null, taxaPct: entrada.taxaInterinoPct, tempo: entrada.tempoRecuperacao };
        var interino = calcularInterino(configInterino, custo.valorHa, configInterino.metodo === 'caex' ? custoTimotheo(configInterino.resiliencia) : null, areaInterino, fora);
        var valorInterino = interino.valorAreaProtegida + interino.valorAreaFora;
        var configResidual = entrada.residual || residualPadrao('gonzaga');
        var residual = calcularResidual(configResidual, custo.valorHa, configResidual.metodo === 'caex' ? custoTimotheo(configResidual.custo) : null, total);

        var parametros = Object.assign({}, entrada.parametros);
        parametros.precoSocialCO2BRL = C.arredondar(parametros.precoSocialCO2USD * parametros.cotacaoDolar, 2);
        parametros.precoMercadoCO2BRL = C.arredondar(parametros.precoMercadoCO2USD * parametros.cotacaoDolar, 2);

        var parcelas = {
            material: parcelaPatrimonial(entrada.entendimento === 'irdr' ? 0 : valorMaterialGonzaga, areaMaterial, ctx),
            interino: parcelaPatrimonial(valorInterino, areaInterino, ctx),
            residual: parcelaPatrimonial(residual.valor, total, ctx),
            mercado: parcelaCarbono(C.danoCarbono(total, entrada.estoque.tC, parametros.precoMercadoCO2BRL), ctx),
            social: parcelaCarbono(C.danoCarbono(total, entrada.estoque.tC, parametros.precoSocialCO2BRL), ctx)
        };

        // Lucro do ilícito ambiental: exige a data do dano (o intervalo conta dela).
        var lia = null;
        if (entrada.lia && dataInformada) {
            // Custos de licenciamento orçados em mês posterior ao do dano são trazidos
            // ao mês do dano pelo IPCA-15, para não contar a inflação duas vezes.
            var base = entrada.lia.mesBaseLicenciamento, fLic = 1;
            if (atualizar && !entrada.manual && base && mesDano < base) {
                var mesAte = base > mesCalculo ? mesCalculo : base;
                // IPCA-15 do mês em curso ainda não publicado: usa o último disponível.
                while (mesAte > mesDano && typeof series.ipca15_indice[mesAte] !== 'number') mesAte = C.somarMeses(mesAte, -1);
                fLic = C.reindexar(1, series, mesAte, mesDano);
            }
            lia = calcularLIA(entrada.lia, fora, em, fLic);
        }
        if (lia) parcelas.lia = atualizarLIA(lia, ctx);

        function somar(campo, lista) {
            return C.arredondar(lista.reduce(function (s, p) { return s + p[campo]; }, 0), 2);
        }
        var todas = [parcelas.material, parcelas.interino, parcelas.residual, parcelas.mercado, parcelas.social];
        if (lia) todas.push(parcelas.lia);
        var totais = { original: somar('valor', todas), correcao: somar('correcao', todas), juros: somar('juros', todas), atualizado: somar('total', todas) };

        // Entendimento alternativo, como na versão 6: no IRDR 13/TJMT o material e
        // o interino ficam em zero; em Gonzaga et al. entram os dois.
        var alt = entrada.entendimento === 'gonzaga'
            ? { material: parcelaPatrimonial(0, areaMaterial, ctx), interino: parcelaPatrimonial(0, areaInterino, ctx) }
            : { material: parcelaPatrimonial(valorMaterialGonzaga, areaMaterial, ctx), interino: parcelaPatrimonial(valorInterino, areaInterino, ctx) };
        var altTodas = [alt.material, alt.interino, parcelas.residual, parcelas.mercado, parcelas.social];
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
            residual: residual,
            timotheo: { mesBase: MES_BASE_TIMOTHEO, custos: CUSTOS_TIMOTHEO },
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
                ? { metodo: entrada.interino.metodo, forma: entrada.interino.forma, taxaPct: entrada.interino.taxaPct, tempo: entrada.interino.tempo, resiliencia: entrada.interino.resiliencia || null, anosAteRegularizacao: entrada.interino.anosAteRegularizacao || 0 }
                : { metodo: 'gonzaga', taxaPct: entrada.taxaInterinoPct, tempo: entrada.tempoRecuperacao },
            precoSocialCO2USD: entrada.parametros.precoSocialCO2USD,
            precoMercadoCO2USD: entrada.parametros.precoMercadoCO2USD,
            cotacaoDolar: entrada.parametros.cotacaoDolar,
            estoqueTC: entrada.estoque.tC,
            origemEstoque: entrada.estoque.origem,
            opcaoExtrapatrimonial: entrada.opcaoExtrapatrimonial,
            residual: entrada.residual || null,
            lia: entrada.lia || null,
            manual: entrada.manual || null
        });
    }

    return {
        CUSTOS_PORTARIA_118: CUSTOS_PORTARIA_118,
        BIOMA_QCN: BIOMA_QCN,
        LIA_REFERENCIA_MT: LIA_REFERENCIA_MT,
        liaPadrao: liaPadrao,
        honorariosDaFaixa: honorariosDaFaixa,
        calcularLIA: calcularLIA,
        atualizarLIA: atualizarLIA,
        CUSTOS_TIMOTHEO: CUSTOS_TIMOTHEO,
        MES_BASE_TIMOTHEO: MES_BASE_TIMOTHEO,
        RESIDUAL_PONTOS: RESIDUAL_PONTOS,
        RESIDUAL_CAEX: RESIDUAL_CAEX,
        residualPadrao: residualPadrao,
        calcularResidual: calcularResidual,
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
