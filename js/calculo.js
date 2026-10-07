// DAMNUM — núcleo de cálculo (sem acesso a rede nem ao DOM).
// Carregado no navegador como window.DamnumCalc e nos testes pelo require() do Node.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DamnumCalc = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Protocolo para Julgamento de Ações Ambientais, 2º escopo (CNJ, 2024), p. 59, nota 31.
    var FATOR_C_PARA_CO2 = 3.67;
    // Mesmo Protocolo, p. 66 (Recomendação CNJ 156/2024): piso do Fundo Amazônia.
    var PISO_PRECO_CARBONO_USD = 5.00;

    // Portaria Ibama 118/2022: valores com base em outubro de 2022.
    var MES_BASE_PORTARIA = '202210';

    // Manual de Cálculos da Justiça Federal (CJF, 2026), itens 4.2.1.1 e 4.2.2,
    // devedor não enquadrado como Fazenda Pública.
    var MES_INICIO_IPCAE_MENSAL = '200101'; // IPCA-E mensal (IPCA-15) a partir de jan./2001
    var MES_FIM_JUROS_MEIO = '200212';      // 0,5% a.m., simples, até dez./2002
    var MES_INICIO_SELIC = '200301';        // Selic de jan./2003 a ago./2024
    var MES_FIM_SELIC = '202408';
    var MES_INICIO_TAXA_LEGAL = '202409';   // taxa legal a partir de set./2024
    // No exemplo da p. 52 do Manual, a correção pelo IPCA-15 volta a correr com a
    // variação de ago./2024 (ver coeficienteCorrecao).
    var MES_RETOMADA_IPCA15 = '202408';

    function ErroSerie(mensagem, serie, mes) {
        var e = new Error(mensagem);
        e.name = 'ErroSerie';
        e.serie = serie;
        e.mes = mes;
        return e;
    }

    // ---------- meses no formato 'AAAAMM' ----------

    function mesDeData(data) {
        return String(data.getFullYear()) + String(data.getMonth() + 1).padStart(2, '0');
    }

    function somarMeses(mes, n) {
        var ano = parseInt(mes.slice(0, 4), 10);
        var m = parseInt(mes.slice(4), 10) - 1 + n;
        ano += Math.floor(m / 12);
        m = ((m % 12) + 12) % 12;
        return String(ano) + String(m + 1).padStart(2, '0');
    }

    function intervaloMeses(inicio, fim) {
        var lista = [];
        for (var k = inicio; k <= fim; k = somarMeses(k, 1)) lista.push(k);
        return lista;
    }

    function maiorMes(a, b) { return a > b ? a : b; }

    var NOMES_MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
    function rotuloMes(mes) {
        return NOMES_MESES[parseInt(mes.slice(4), 10) - 1] + '/' + mes.slice(0, 4);
    }

    // ---------- arredondamento ----------

    // O Manual trunca as casas decimais em cada etapa (obs. ao exemplo da p. 52).
    // A folga de 1e-7 absorve o erro de ponto flutuante (ex.: 1459.06 * 100).
    function truncar(valor, casas) {
        var f = Math.pow(10, casas);
        return Math.floor(valor * f + 1e-7) / f;
    }

    function arredondar(valor, casas) {
        var f = Math.pow(10, casas);
        return Math.round(valor * f) / f;
    }

    function exigir(serie, nome, mes) {
        var v = serie ? serie[mes] : undefined;
        if (typeof v !== 'number' || isNaN(v)) {
            throw ErroSerie('Série ' + nome + ' sem valor para ' + rotuloMes(mes) + '.', nome, mes);
        }
        return v;
    }

    // ---------- correção monetária (Manual, item 4.2.1) ----------

    // Coeficiente de correção de um valor do mês `mesValor` até o mês `mesCalculo`.
    //
    // Regra reproduzida do exemplo "2) Devedor não enquadrado como Fazenda Pública"
    // (Manual, p. 52), conferida até a 10ª casa decimal:
    //   - entram as variações mensais do IPCA-E (IPCA-15) do mês do valor até o mês
    //     anterior ao do cálculo;
    //   - ficam de fora as variações dos meses em que a Selic incide como juros
    //     (item 4.2.1, Nota 2), isto é, do mês seguinte ao termo inicial dos juros
    //     até jul./2024;
    //   - a variação de ago./2024 volta a entrar (IPCA-15, Lei 14.905/2024).
    // `mesTermoJuros` nulo significa correção pura, sem Selic a excluir.
    function coeficienteCorrecao(series, mesValor, mesTermoJuros, mesCalculo) {
        if (mesValor < MES_INICIO_IPCAE_MENSAL) {
            throw ErroSerie('Correção anterior a jan./2001 exige indexadores (Ufir e anteriores) que o DAMNUM não calcula.', 'ipca15_var', mesValor);
        }
        var inicioSelic = null;
        if (mesTermoJuros) {
            inicioSelic = maiorMes(maiorMes(somarMeses(mesTermoJuros, 1), somarMeses(mesValor, 1)), MES_INICIO_SELIC);
        }
        var coef = 1;
        var meses = [];
        intervaloMeses(mesValor, somarMeses(mesCalculo, -1)).forEach(function (k) {
            var sobSelic = inicioSelic !== null && k >= inicioSelic && k < MES_RETOMADA_IPCA15;
            if (sobSelic) {
                meses.push({ mes: k, variacao: null, incluido: false });
                return;
            }
            var v = exigir(series.ipca15_var, 'IPCA-15 (variação mensal)', k);
            coef *= 1 + v / 100;
            meses.push({ mes: k, variacao: v, incluido: true });
        });
        return { coeficiente: arredondar(coef, 10), meses: meses };
    }

    // ---------- juros de mora (Manual, item 4.2.2) ----------

    // Percentual de juros, capitalização simples (soma das taxas mensais).
    // Os juros correm do mês seguinte ao termo inicial até o mês do cálculo:
    //   - até dez./2002: 0,5% a.m.;
    //   - de jan./2003 a ago./2024: Selic do próprio mês; se o cálculo cair nesse
    //     período, 1% no mês do pagamento (Nota 1, alínea b);
    //   - a partir de set./2024: taxa legal, aplicada no mês posterior ao de sua
    //     competência (Nota 7). A taxa legal divulgada pelo Banco Central para o
    //     mês de referência R entra no mês R + 1. Conferido com o exemplo da p. 52:
    //     14,57% = soma das taxas de referência ago./2024 a maio/2026.
    function percentualJuros(series, mesTermoJuros, mesValor, mesCalculo) {
        var inicio = somarMeses(maiorMes(mesTermoJuros, mesValor), 1);
        var soma = 0;
        var meses = [];
        intervaloMeses(inicio, mesCalculo).forEach(function (m) {
            var taxa, tipo;
            if (m <= MES_FIM_JUROS_MEIO) {
                taxa = 0.5; tipo = '0,5% a.m.';
            } else if (m <= MES_FIM_SELIC) {
                if (m === mesCalculo) {
                    taxa = 1; tipo = '1% no mês do pagamento';
                } else {
                    taxa = exigir(series.selic, 'Selic mensal (SGS 4390)', m); tipo = 'Selic';
                }
            } else {
                taxa = exigir(series.taxa_legal, 'taxa legal (SGS 29543)', somarMeses(m, -1)); tipo = 'taxa legal';
            }
            soma += taxa;
            meses.push({ mes: m, taxa: taxa, tipo: tipo });
        });
        return { percentual: truncar(soma, 2), percentualBruto: soma, meses: meses };
    }

    // Atualiza uma parcela pelo roteiro do Manual: principal corrigido (truncado),
    // juros sobre o principal corrigido (truncados), total.
    function atualizarParcela(series, parcela) {
        var corr = coeficienteCorrecao(series, parcela.mesValor, parcela.mesTermoJuros, parcela.mesCalculo);
        var jur = percentualJuros(series, parcela.mesTermoJuros, parcela.mesValor, parcela.mesCalculo);
        var principal = truncar(parcela.valor * corr.coeficiente, 2);
        var juros = truncar(principal * jur.percentual / 100, 2);
        return {
            valorOriginal: parcela.valor,
            coeficiente: corr.coeficiente,
            principalCorrigido: principal,
            percentualJuros: jur.percentual,
            juros: juros,
            total: arredondar(principal + juros, 2),
            mesesCorrecao: corr.meses,
            mesesJuros: jur.meses
        };
    }

    // ---------- juros sobre parcelas extrapatrimoniais (item 1.5) ----------

    // As parcelas extrapatrimoniais são calculadas a preços da data do cálculo
    // (arbitramento, Súmula 362/STJ) e por isso não recebem correção. Os juros
    // fluem desde o evento danoso (Súmula 54/STJ).
    //   - de set./2024 em diante: taxa legal;
    //   - antes: `opcao` 'reais' (Selic do mês deduzida do IPCA-15 do mês, piso
    //     zero; 0,5% até dez./2002) ou 'nenhum'.
    function jurosExtrapatrimonial(series, mesDano, mesCalculo, opcao) {
        var soma = 0;
        var meses = [];
        intervaloMeses(somarMeses(mesDano, 1), mesCalculo).forEach(function (m) {
            var taxa, tipo;
            if (m >= MES_INICIO_TAXA_LEGAL) {
                taxa = exigir(series.taxa_legal, 'taxa legal (SGS 29543)', somarMeses(m, -1)); tipo = 'taxa legal';
            } else if (opcao !== 'reais') {
                taxa = 0; tipo = 'não computado';
            } else if (m <= MES_FIM_JUROS_MEIO) {
                taxa = 0.5; tipo = '0,5% a.m.';
            } else {
                var s = exigir(series.selic, 'Selic mensal (SGS 4390)', m);
                var v = exigir(series.ipca15_var, 'IPCA-15 (variação mensal)', m);
                taxa = Math.max(s - v, 0); tipo = 'Selic − IPCA-15';
            }
            soma += taxa;
            meses.push({ mes: m, taxa: taxa, tipo: tipo });
        });
        return { percentual: truncar(soma, 2), percentualBruto: soma, meses: meses };
    }

    // ---------- custo de recuperação na data do dano (item 1.3) ----------

    // Leva o valor da Portaria Ibama 118/2022 (out./2022) ao mês indicado pelo
    // número-índice do IPCA-15 (SIDRA, tabela 3065, variável 1117).
    function custoNoMes(valorPortaria, series, mes) {
        var base = exigir(series.ipca15_indice, 'IPCA-15 (número-índice)', MES_BASE_PORTARIA);
        var alvo = exigir(series.ipca15_indice, 'IPCA-15 (número-índice)', mes);
        var fator = alvo / base;
        return { valor: valorPortaria * fator, indiceBase: base, indiceMes: alvo, fator: fator };
    }

    function ultimoMesDisponivel(serie) {
        var chaves = Object.keys(serie).sort();
        return chaves[chaves.length - 1];
    }

    // ---------- dano interino ----------

    // Método de Gonzaga et al. (2025): juros sobre o custo de recuperação, com
    // decréscimo linear do dano ao longo do tempo de recuperação.
    // DI = custo × i × (t + 1) / 2. A taxa entra em percentual.
    function fatorInterino(taxaPercentual, tempoAnos) {
        return (taxaPercentual / 100) * (tempoAnos + 1) / 2;
    }

    // Método da Nota Técnica 03/2022 do CAEx Ambiental/MPMT (atualizada em
    // 17/01/2024), item 1.5: soma dos juros decrescentes sobre o custo de
    // reposição, DI = Σ (a = 1..t) CR × i / (1 + i)^a = CR × [1 − (1 + i)^−t].
    // Conferido com o Quadro 1 da Nota: 9.999,84 × fator(6,82%; 100) = 9.986,20
    // e 9.999,84 × fator(6,82%; 30) = 8.618,13.
    function fatorInterinoCAEx(taxaPercentual, tempoAnos) {
        var i = taxaPercentual / 100;
        var soma = 0;
        for (var a = 1; a <= tempoAnos; a++) soma += i / Math.pow(1 + i, a);
        return soma;
    }

    // Mesma Nota, item 1.7 e Quadro 2: juros do ano 1, i / (1 + i), usados na área
    // fora de APP e reserva legal, multiplicados pelos anos entre o desmatamento
    // e o pedido de regularização. Conferido: 9.999,84 × 0,0682 / 1,0682 = 638,45.
    function jurosAnoUmCAEx(taxaPercentual) {
        var i = taxaPercentual / 100;
        return i / (1 + i);
    }

    function mediana(valores) {
        var v = valores.slice().sort(function (a, b) { return a - b; });
        if (v.length === 0) return null;
        var meio = Math.floor(v.length / 2);
        return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
    }

    // Faixa dos tempos de recuperação publicados: mínimo, máximo e mediana.
    function faixaDeTempos(pontos) {
        var anos = pontos.map(function (p) { return p.anos; });
        if (anos.length === 0) return null;
        return { minimo: Math.min.apply(null, anos), maximo: Math.max.apply(null, anos), mediana: mediana(anos), quantidade: anos.length };
    }

    function validarTaxaInterino(taxaPercentual) {
        return typeof taxaPercentual === 'number' && !isNaN(taxaPercentual) && taxaPercentual >= 0 && taxaPercentual <= 30;
    }

    // ---------- estoque de carbono (item 1.6) ----------

    var CATEGORIAS_MEDIA_BIOMA = ['F', 'G', 'OFL'];

    function carbonoParaCO2(tC) { return tC * FATOR_C_PARA_CO2; }

    // Média do bioma: totais ponderados pela % no bioma, só F, G e OFL.
    function mediaPonderadaBioma(fitofisionomias) {
        var somaPeso = 0, soma = 0;
        fitofisionomias.forEach(function (f) {
            if (CATEGORIAS_MEDIA_BIOMA.indexOf(f.categoria) === -1) return;
            if (typeof f.pct_bioma !== 'number' || typeof f.total_tC_ha !== 'number') return;
            somaPeso += f.pct_bioma;
            soma += f.pct_bioma * f.total_tC_ha;
        });
        return somaPeso > 0 ? soma / somaPeso : null;
    }

    // Média ponderada pela área das classes cruzadas (item 1.6-A).
    // `partes`: [{ area_ha, c_v_4i }]. Retorna null se nenhuma área tiver estoque.
    function mediaPonderadaPorArea(partes) {
        var somaArea = 0, soma = 0;
        partes.forEach(function (p) {
            if (!(p.area_ha > 0) || typeof p.c_v_4i !== 'number' || isNaN(p.c_v_4i)) return;
            somaArea += p.area_ha;
            soma += p.area_ha * p.c_v_4i;
        });
        return somaArea > 0 ? { estoque: soma / somaArea, area_ha: somaArea } : null;
    }

    function danoCarbono(areaHa, estoqueTC, precoPorTCO2) {
        return areaHa * estoqueTC * FATOR_C_PARA_CO2 * precoPorTCO2;
    }

    function abaixoDoPisoCNJ(precoUSD) {
        return typeof precoUSD === 'number' && !isNaN(precoUSD) && precoUSD < PISO_PRECO_CARBONO_USD;
    }

    return {
        FATOR_C_PARA_CO2: FATOR_C_PARA_CO2,
        PISO_PRECO_CARBONO_USD: PISO_PRECO_CARBONO_USD,
        MES_BASE_PORTARIA: MES_BASE_PORTARIA,
        MES_INICIO_IPCAE_MENSAL: MES_INICIO_IPCAE_MENSAL,
        MES_FIM_SELIC: MES_FIM_SELIC,
        MES_INICIO_TAXA_LEGAL: MES_INICIO_TAXA_LEGAL,
        mesDeData: mesDeData,
        somarMeses: somarMeses,
        intervaloMeses: intervaloMeses,
        rotuloMes: rotuloMes,
        truncar: truncar,
        arredondar: arredondar,
        coeficienteCorrecao: coeficienteCorrecao,
        percentualJuros: percentualJuros,
        atualizarParcela: atualizarParcela,
        jurosExtrapatrimonial: jurosExtrapatrimonial,
        custoNoMes: custoNoMes,
        ultimoMesDisponivel: ultimoMesDisponivel,
        fatorInterino: fatorInterino,
        fatorInterinoCAEx: fatorInterinoCAEx,
        jurosAnoUmCAEx: jurosAnoUmCAEx,
        mediana: mediana,
        faixaDeTempos: faixaDeTempos,
        validarTaxaInterino: validarTaxaInterino,
        carbonoParaCO2: carbonoParaCO2,
        mediaPonderadaBioma: mediaPonderadaBioma,
        mediaPonderadaPorArea: mediaPonderadaPorArea,
        danoCarbono: danoCarbono,
        abaixoDoPisoCNJ: abaixoDoPisoCNJ
    };
});
