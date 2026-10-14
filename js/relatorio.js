// DAMNUM — relatório de valoração no formato do art. 524 do CPC, com memória de
// cálculo. Recebe o objeto de resultado montado em script.js e devolve HTML e CSV.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./calculo.js'));
    } else {
        root.DamnumRelatorio = factory(root.DamnumCalc);
    }
})(typeof self !== 'undefined' ? self : this, function (C) {
    'use strict';

    var SITE = 'https://damnum.consciencia.eco.br';

    function moeda(v) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    }
    function num(v, casas) {
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);
    }
    function data(d) { return d.toLocaleDateString('pt-BR'); }
    function esc(t) {
        return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    var TD = 'padding:4px 10px; border:1px solid #ccc;';
    var TDR = TD + ' text-align:right;';
    function titulo(t) {
        return '<hr style="border:1px solid #999; margin:20px 0;"><h3 style="font-size:13pt; border-bottom:2px solid #333; padding-bottom:4px;">' + t + '</h3>';
    }
    function subtitulo(t) { return '<h4 style="font-size:12pt; color:#2c3e50; margin-top:16px;">' + t + '</h4>'; }
    function linha(rotulo, valor) {
        return '<tr><td style="' + TD + ' width:42%;">' + rotulo + '</td><td style="' + TD + '">' + valor + '</td></tr>';
    }
    function tabela(linhas) {
        return '<table style="font-size:11pt; border-collapse:collapse; margin:8px 0; width:100%; border:1px solid #ccc;">' + linhas.join('') + '</table>';
    }
    function nota(texto, cor) {
        var cores = { amarelo: ['#fef9e7', '#d4ac0d'], vermelho: ['#fce4ec', '#c62828'], verde: ['#e8f5e9', '#27ae60'] }[cor || 'amarelo'];
        return '<div style="background:' + cores[0] + '; padding:8px 12px; margin:8px 0; border-left:4px solid ' + cores[1] + '; border-radius:3px; font-size:11pt; text-align:justify;">' + texto + '</div>';
    }

    function nomeEntendimento(e) {
        return e === 'irdr' ? 'IRDR 13/TJMT (PJe 1019783-07.2025.8.11.0000)' : 'Gonzaga et al. (2025)';
    }

    // ---------- 1. Identificação ----------

    function secaoIdentificacao(r) {
        var id = r.identificacao;
        var linhas = [];
        if (r.numeroProcesso) linhas.push(linha('Processo ou procedimento', '<b>' + esc(r.numeroProcesso) + '</b>'));
        if (id.credorNome || id.credorDoc) linhas.push(linha('Credor / exequente', esc(id.credorNome) + (id.credorDoc ? ' — CPF/CNPJ ' + esc(id.credorDoc) : '')));
        if (id.devedorNome || id.devedorDoc) linhas.push(linha('Devedor / executado', esc(id.devedorNome) + (id.devedorDoc ? ' — CPF/CNPJ ' + esc(id.devedorDoc) : '')));
        linhas.push(linha('Bioma', esc(r.bioma)));
        linhas.push(linha('Entendimento adotado', nomeEntendimento(r.entendimento)));
        linhas.push(linha('Data do dano', r.dataInformada ? data(r.dataDano) : 'não informada (valores na data do cálculo)'));
        linhas.push(linha('Data do cálculo', data(r.dataCalculo)));
        linhas.push(linha('Área desmatada fora de APP e ARL (A<sub>1</sub>)', num(r.areas.fora, 4) + ' ha'));
        linhas.push(linha('Área desmatada em APP e ARL (A<sub>2</sub>)', num(r.areas.em, 4) + ' ha'));
        linhas.push(linha('Área total (A<sub>1</sub> + A<sub>2</sub>)', num(r.areas.total, 4) + ' ha'));
        if (r.areas.em > 0) linhas.push(linha('Reparação <em>in situ</em> da área em APP e ARL', r.reparacaoInSitu ? 'sim, será promovida' : 'não será promovida'));
        var html = titulo('1. IDENTIFICAÇÃO') + tabela(linhas);
        if (!(id.credorNome || id.credorDoc || id.devedorNome || id.devedorDoc)) {
            html += '<p style="font-size:10pt; color:#666;">Nome e CPF/CNPJ do credor e do devedor (art. 524, I, do CPC): não informados. O preenchimento é opcional e só é exigido no requerimento de cumprimento de sentença.</p>';
        }
        if (r.areas.observacao) html += nota(esc(r.areas.observacao));
        return html;
    }

    // ---------- 2. Demonstrativo por parcela ----------

    function textoAtualizacaoPatrimonial(r, p) {
        var linhas = [];
        var a = p.atualizacao;
        if (!r.atualizacao.aplicada) {
            linhas.push(linha('Índice de correção (art. 524, II)', 'não aplicado: ' + esc(r.atualizacao.motivo)));
            linhas.push(linha('Juros e taxas (art. 524, III)', 'não aplicados'));
            linhas.push(linha('Valor atualizado', '<b>' + moeda(p.valor) + '</b>'));
            return linhas;
        }
        if (r.atualizacao.manual) {
            linhas.push(linha('Índice de correção (art. 524, II)', 'coeficiente informado pelo usuário: ' + num(a.coeficiente, 10) + '. Fonte: ' + esc(r.atualizacao.manual.fonte)));
            linhas.push(linha('Juros e taxas (art. 524, III)', 'percentual informado pelo usuário: ' + num(a.percentualJuros, 2) + '%. Fonte: ' + esc(r.atualizacao.manual.fonte)));
        } else {
            linhas.push(linha('Índice de correção (art. 524, II)', descricaoCorrecao(r) + ' Coeficiente: <b>' + num(a.coeficiente, 10) + '</b>'));
            linhas.push(linha('Juros e taxas (art. 524, III)', descricaoJurosPatrimonial(r) + ' Percentual acumulado: <b>' + num(a.percentualJuros, 2) + '%</b>'));
        }
        linhas.push(linha('Termo inicial e final da correção (art. 524, IV)', C.rotuloMes(r.mesDano) + ' (efetivo prejuízo, Súmula 43/STJ) a ' + C.rotuloMes(r.mesCalculo)));
        linhas.push(linha('Termo inicial e final dos juros (art. 524, IV)', C.rotuloMes(r.mesDano) + ' (evento danoso, Súmula 54/STJ) a ' + C.rotuloMes(r.mesCalculo) + '; os juros correm a partir do mês seguinte ao do termo inicial'));
        linhas.push(linha('Capitalização dos juros (art. 524, V)', 'simples, mensal (soma das taxas mensais)'));
        linhas.push(linha('Principal corrigido', moeda(a.principalCorrigido)));
        linhas.push(linha('Juros de mora', moeda(a.juros)));
        linhas.push(linha('Valor atualizado', '<b>' + moeda(a.total) + '</b>'));
        return linhas;
    }

    function descricaoCorrecao(r) {
        var partes = [];
        if (r.mesDano < '202408') {
            partes.push('IPCA-E (IPCA-15/IBGE) do mês do dano; depois, enquanto a Selic incide como juros (até jul./2024), não há indexador de correção, porque a Selic já engloba juros e correção (Manual de Cálculos da Justiça Federal, CJF, 2026, item 4.2.1, Nota 2)');
            partes.push('IPCA-15/IBGE a partir da variação de ago./2024 (art. 389, parágrafo único, do Código Civil, com a redação da Lei 14.905/2024; Resolução CMN 5.171/2024)');
        } else {
            partes.push('IPCA-15/IBGE (art. 389, parágrafo único, do Código Civil, com a redação da Lei 14.905/2024; Resolução CMN 5.171/2024; Manual de Cálculos da Justiça Federal, CJF, 2026, item 4.2.1.1)');
        }
        return partes.join('; ') + '.';
    }

    function descricaoJurosPatrimonial(r) {
        var partes = [];
        if (r.mesDano < '200212') partes.push('0,5% ao mês até dez./2002 (arts. 1.062 a 1.064 do Código Civil de 1916)');
        if (r.mesDano < '202408') partes.push('taxa Selic de ' + (r.mesDano < '200301' ? 'jan./2003' : C.rotuloMes(C.somarMeses(r.mesDano, 1))) + ' a ago./2024 (art. 406 do Código Civil; Manual, item 4.2.2)');
        partes.push('taxa legal, isto é, Selic deduzida do IPCA-15, de ' + (r.mesDano < '202408' ? 'set./2024' : C.rotuloMes(C.somarMeses(r.mesDano, 1))) + ' em diante, aplicada no mês posterior ao de sua competência (art. 406 do Código Civil, com a redação da Lei 14.905/2024; Resolução CMN 5.171/2024; Manual, item 4.2.2, Nota 7)');
        return partes.join('; ') + '.';
    }

    function blocoMaterial(r) {
        var p = r.parcelas.material;
        var html = subtitulo('2.1 Dano material (dano ecológico direto)');
        var linhas = [];
        if (r.entendimento === 'irdr') {
            html += '<p style="text-align:justify;">Pelo entendimento do IRDR 13/TJMT, o desmatamento em área não especialmente protegida não configura dano material indenizável. Dano material = ' + moeda(0) + '.</p>';
            return html;
        }
        if (!(p.area > 0)) {
            html += '<p>Não há área sujeita a dano material. Dano material = ' + moeda(0) + '.</p>';
            return html;
        }
        linhas.push(linha('Fórmula', (r.reparacaoInSitu || !(r.areas.em > 0) ? 'A<sub>1</sub>' : '(A<sub>1</sub> + A<sub>2</sub>)') + ' × custo de recuperação por hectare'));
        linhas.push(linha('Parâmetros e fontes', num(p.area, 4) + ' ha × ' + moeda(r.custo.valorHa) + '/ha. ' + textoCusto(r)));
        linhas.push(linha('Valor original e data-base', '<b>' + moeda(p.valor) + '</b>, em ' + C.rotuloMes(r.custo.mesReferencia)));
        linhas = linhas.concat(textoAtualizacaoPatrimonial(r, p));
        html += tabela(linhas);
        if (r.areas.em > 0) {
            html += nota(r.reparacaoInSitu
                ? '<b>Nota:</b> havendo reparação <em>in situ</em> da área em APP/ARL, o dano material direto será reparado fisicamente (e não cobrado monetariamente, sob pena de <em>bis in idem</em>). A cobrança monetária nesse cenário refere-se ao <b>dano interino</b>.'
                : '<b>Nota:</b> como a reparação <em>in situ</em> não é possível e não será promovida, o dano material deverá ser compensado ou indenizado. O valor acima inclui a área em APP/ARL (' + num(r.areas.em, 4) + ' ha).');
        }
        return html;
    }

    function textoCusto(r) {
        var c = r.custo;
        var t = 'Custo médio de implantação e manutenção de projeto de recuperação no bioma, conforme a Portaria Ibama 118/2022: ' + moeda(c.portaria.media) + '/ha em out./2022 (mínimo ' + moeda(c.portaria.menor_valor) + ', máximo ' + moeda(c.portaria.maior_valor) + '). ';
        if (c.fator === null) {
            t += 'Não foi possível obter o número-índice do IPCA-15; o valor ficou na base de out./2022.';
        } else {
            t += 'Levado a ' + C.rotuloMes(c.mesReferencia) + ' pelo número-índice do IPCA-15 (IBGE, SIDRA, tabela 3065): ' + num(c.indiceMes, 2) + ' ÷ ' + num(c.indiceBase, 2) + ' = ' + num(c.fator, 6) + '.';
        }
        return t;
    }

    var ROTULO_FORMA = { floresta: 'formação florestal', savana: 'formação savânica ou campestre' };

    function blocoInterino(r) {
        var p = r.parcelas.interino;
        var it = r.interino;
        var html = subtitulo('2.2 Dano interino');
        var temProtegida = r.areas.em > 0 && r.reparacaoInSitu;
        if (!temProtegida && !(it.valorAreaFora > 0)) {
            if (!(r.areas.em > 0)) return html + '<p>Não há área em APP e ARL informada. Dano interino = ' + moeda(0) + '.</p>';
            return html + '<p style="text-align:justify;">Como a reparação <em>in situ</em> não será promovida, não há dano interino a calcular (o dano material já inclui a área em APP/ARL). Dano interino = ' + moeda(0) + '.</p>';
        }
        var caex = it.metodo === 'caex';
        var forma = it.forma ? ROTULO_FORMA[it.forma] : '';
        var linhas = [];
        linhas.push(linha('Método', caex
            ? 'Nota Técnica 03/2022 do CAEx Ambiental do MPMT (atualizada em 17/01/2024), método defendido por José Guilherme Roquette: soma dos juros decrescentes sobre o custo de reposição durante o tempo de recuperação.'
            : 'Gonzaga et al. (2025): juros sobre o custo de recuperação, com decréscimo linear do dano ao longo do tempo de recuperação. É o método padrão da calculadora.'));
        if (temProtegida) {
            linhas.push(linha('Fórmula', caex
                ? 'A<sub>2</sub> × Σ<sub>a = 1..t</sub> [custo × i ÷ (1 + i)<sup>a</sup>] (Nota Técnica, item 1.5)'
                : 'A<sub>2</sub> × custo de recuperação por hectare × i × (t + 1) ÷ 2'));
            linhas.push(linha('Parâmetros e fontes', num(r.areas.em, 4) + ' ha × ' + moeda(it.custoHa) + '/ha × ' + num(it.fator, 4) + ', com i = ' + num(it.taxaPct, 2) + '% ao ano e t = ' + num(it.tempo, it.tempo % 1 ? 1 : 0) + ' anos' + (forma ? ' (' + forma + ')' : '') + '. ' + (caex
                ? 'A Nota adota como taxa a média da série histórica do IPCA de 1995 a 2023 (6,82%) e, como tempo de recuperação, 100 anos para floresta e 30 anos para cerrado. ' + textoTimotheo(r, it.resiliencia)
                : 'Custo por hectare: o mesmo do dano material. O tempo de 15 anos é o mínimo adotado no trabalho; informe tempo maior quando o caso o justificar.')));
        }
        if (it.valorAreaFora > 0) {
            linhas.push(linha('Área passível de exploração (fora de APP e reserva legal), até a regularização', num(r.areas.fora, 4) + ' ha × ' + moeda(it.custoHa) + '/ha × ' + num(it.jurosAnoUm, 6) + ' (juros do ano 1, i ÷ (1 + i)) × ' + num(it.anosAteRegularizacao, 0) + ' anos entre o desmatamento e o pedido de regularização = ' + moeda(it.valorAreaFora) + ' (Nota Técnica, item 1.7). A própria Nota registra que há duas posições sobre a existência de dano indenizável nessa área.' + (r.parcelas.material.valor > 0 ? ' Atenção: neste cálculo a mesma área também recebe dano material; confira se as duas parcelas devem ser cumuladas.' : '')));
            if (temProtegida) linhas.push(linha('Área em APP e reserva legal, até a recuperação', moeda(it.valorAreaProtegida)));
        }
        linhas.push(linha('Valor original e data-base', '<b>' + moeda(p.valor) + '</b>, em ' + C.rotuloMes(r.custo.mesReferencia)));
        linhas = linhas.concat(textoAtualizacaoPatrimonial(r, p));
        html += tabela(linhas);

        return html;
    }

    // Custo de Timotheo et al. usado nos métodos do CAEx, com a ressalva do mês-base.
    function textoTimotheo(r, chave) {
        var c = r.timotheo.custos[chave];
        return 'Custo de reposição: ' + moeda(c.valor) + '/ha (' + c.rotulo + '; Timotheo et al., 2017, na Nota Técnica 03/2022 do CAEx, com valores "atualizados conforme o IPCA no período 2017-2023")' +

            ', pelo valor da Nota, sem reajuste.';
    }

    // Dano residual: fração dos serviços ecossistêmicos que não se recupera.
    function blocoResidual(r) {
        var p = r.parcelas.residual;
        var d = r.residual;
        var caex = d.metodo === 'caex';
        var html = subtitulo('2.3 Dano residual');
        if (!(d.area > 0)) {
            return html + '<p style="text-align:justify;">' + (r.areas.em > 0
                ? 'Como a reparação <em>in situ</em> não será promovida, não há dano residual a calcular: ele é a parcela que a restauração não devolve.'
                : 'Não há área com reparação <em>in situ</em> informada.') + ' Dano residual = ' + moeda(0) + '.</p>';
        }
        html += '<p style="text-align:justify;">Parcela dos serviços ecossistêmicos que não volta ao estado anterior mesmo depois de concluída a restauração. Não se confunde com o dano interino, que mede a perda durante a recuperação.</p>';
        var linhas = [];
        linhas.push(linha('Método', caex
            ? 'Ministério Público de Mato Grosso, CAEx Ambiental (Relatório Técnico 963/2026), método defendido por José Guilherme Roquette: a perda anual permanente é tratada como renda perpétua e dividida pela taxa de juros (método CATE II; Ribas, 1996).'
            : 'Gonzaga et al. (trabalho submetido ao SICAM 2026): o percentual que não se recupera, aplicado ao custo de recuperação da área. É o método padrão da calculadora.'));
        linhas.push(linha('Fórmula', caex ? 'A × (custo de reposição × PFE) ÷ i' : 'A × custo de recuperação por hectare × PFE × k'));
        linhas.push(linha('Parâmetros e fontes', num(d.area, 4) + ' ha × ' + moeda(d.custoHa) + '/ha × ' + num(d.pfePct, 2) + '%' + (caex
            ? ' ÷ ' + num(d.taxaPct, 2) + '%. PFE (perda de funções ecossistêmicas): pesos iguais para os doze atributos de Poorter et al. (2021), cinco deles com déficit aos 120 anos. Taxa: média do IPCA de 1995 a 2023. ' + textoTimotheo(r, d.custo)
            : (d.k !== 1 ? ' × ' + num(d.k, 2) : '') + '. PFE é a fração permanentemente perdida; o padrão é a mediana das estimativas publicadas (quadro abaixo). Custo por hectare: o mesmo do dano material' + (d.k !== 1 ? '; k é o fator de equivalência informado pelo usuário' : '') + '.')));
        if (!caex) linhas.push(linha('Reparação em espécie', 'Antes do dinheiro, a regra é proteger em caráter perpétuo área de vegetação nativa equivalente: ' + num(d.area, 4) + ' ha × ' + num(d.pfePct, 2) + '%' + (d.k !== 1 ? ' × ' + num(d.k, 2) : '') + ' = <b>' + num(d.areaEmEspecie, 4) + ' ha</b>. O valor em dinheiro vale quando essa proteção não for possível.'));
        linhas.push(linha('Valor original e data-base', '<b>' + moeda(p.valor) + '</b>, em ' + C.rotuloMes(r.custo.mesReferencia)));
        linhas = linhas.concat(textoAtualizacaoPatrimonial(r, p));
        html += tabela(linhas);

        if (!caex && d.faixa) {
            var e = d.estatisticas;
            var th = TD + ' background:#f5f5f5;';
            html += '<p style="font-size:11pt; text-align:justify;"><b>Faixa do dano residual conforme o percentual que não se recupera</b> (valores na data-base, antes da atualização):</p>';
            html += '<table style="font-size:10pt; border-collapse:collapse; width:100%; border:1px solid #ccc;"><tr><th style="' + th + ' text-align:left;">Fonte</th><th style="' + th + ' text-align:left;">Base da estimativa</th><th style="' + th + '">Não recuperado (%)</th><th style="' + th + '">Dano residual</th></tr>';
            d.faixa.forEach(function (f) {
                html += '<tr><td style="' + TD + '">' + esc(f.fonte) + '</td><td style="' + TD + '">' + esc(f.nota) + '</td><td style="' + TDR + '">' + num(f.pct, 2) + '</td><td style="' + TDR + '">' + moeda(f.valor) + '</td></tr>';
            });
            function resumo(rotulo, pct, valor, destaque) {
                return '<tr style="background:' + (destaque ? '#e8f5e9' : '#fafafa') + ';"><td style="' + TD + '" colspan="2"><b>' + rotulo + '</b></td><td style="' + TDR + '"><b>' + num(pct, 2) + '</b></td><td style="' + TDR + '"><b>' + moeda(valor) + '</b></td></tr>';
            }
            html += resumo('Mínimo', e.minimo, e.valor_minimo) + resumo('Mediana', e.mediana, e.valor_mediana, true) + resumo('Máximo', e.maximo, e.valor_maximo) + '</table>';
            html += '<p style="font-size:10pt; color:#555; text-align:justify;">' + (d.pfePct === e.mediana
                ? 'O valor adotado corresponde à mediana.'
                : 'O valor adotado usa ' + num(d.pfePct, 2) + '%, informado pelo usuário, e não a mediana.') + ' As estimativas de Moreno-Mateos et al. (2012) referem-se a áreas úmidas e entram como limite superior. A faixa é exploratória: reúne estimativas de fontes e de ecossistemas diferentes, não equivale a intervalo estatístico e não prova, por si, perda permanente no caso concreto.</p>';
        }
        return html;
    }

    // Lucro do ilícito ambiental (LIA): seis parcelas, combinadas pela situação
    // jurídica da área e pela existência de atividade agropecuária.
    function blocoLIA(r) {
        var l = r.lia;
        if (!l) return '';
        var c = l.config;
        var html = subtitulo('2.6 Lucro do ilícito ambiental (LIA)');
        html += '<p style="text-align:justify;">Restituição do proveito econômico do infrator, a "mais-valia ecológica ilícita" (STJ, REsp 1.145.083/MG e REsp 1.198.727/MG), que se cumula com a reparação do dano. Método de Gonzaga, Roquette, Silva e Sinisgalli (trabalho submetido ao SICAM 2026). O LIA mede o ganho do infrator, e não a perda da sociedade.</p>';
        var linhas = [];
        linhas.push(linha('Intervalo', num(c.anos, 0) + ' anos, do ano do desmatamento ao ano da regularização ou da recomposição (' + esc(r.liaAnoRegularizacao) + ')'));
        linhas.push(linha('Atividade agropecuária', l.comAtividade
            ? 'sim (' + esc(c.rotuloAtividade || c.atividade) + '); presume-se o uso de toda a área desmatada desde o desmatamento, cabendo ao infrator provar uso parcial ou cessado (Súmula 618/STJ; CPC, art. 373, § 1º)'
            : 'não; a terra entra pela antecipação da valorização'));
        linhas.push(linha('Composição', 'área autorizável (fora de APP e reserva legal): CL + ' + (l.comAtividade ? 'Σ(L + R)' : 'ΔVT') + ' + GR; área não autorizável (APP e reserva legal): Gf + ' + (l.comAtividade ? 'Σ(L + R)' : 'ΔVT') + ' + GR'));
        html += tabela(linhas);

        var th = TD + ' background:#f5f5f5;';
        html += '<table style="font-size:10pt; border-collapse:collapse; width:100%; border:1px solid #ccc;"><tr><th style="' + th + ' text-align:left;">Parcela</th><th style="' + th + ' text-align:left;">Cálculo</th><th style="' + th + '">Área autorizável (' + num(l.autorizavel.area, 4) + ' ha)</th><th style="' + th + '">Área não autorizável (' + num(l.naoAutorizavel.area, 4) + ' ha)</th></tr>';
        function ln(rotulo, calculo, campo) {
            html += '<tr><td style="' + TD + '">' + rotulo + '</td><td style="' + TD + '">' + calculo + '</td><td style="' + TDR + '">' + moeda(l.autorizavel[campo]) + '</td><td style="' + TDR + '">' + moeda(l.naoAutorizavel[campo]) + '</td></tr>';
        }
        ln('Gf — produto florestal retirado', 'área × ' + num(c.volumeM3, 0) + ' m³/ha × ' + moeda(c.precoMadeira) + '/m³; só na área não autorizável', 'produtoFlorestal');
        ln('CL — licenciamento evitado', 'taxas de ' + moeda(c.taxasLicenciamento) + ' + honorários de ' + moeda(c.honorariosHa) + '/ha' + (c.eiaRima > 0 ? ' + EIA/RIMA de ' + moeda(c.eiaRima) : '') + (l.fatorLicenciamento !== 1 ? ', valores de ' + C.rotuloMes(c.mesBaseLicenciamento) + ' trazidos ao mês do dano pelo IPCA-15 (× ' + num(l.fatorLicenciamento, 4) + ')' : '') + '; só na área autorizável', 'licenciamento');
        if (l.comAtividade) {
            ln('ΣL — lucro da atividade', 'área × EBITDA de ' + moeda(c.ebitda) + '/ha/ano × ' + num(c.anosAtividade, 0) + ' anos', 'lucro');
            ln('ΣR — renda da terra', 'área × arrendamento deduzido de ' + moeda(c.arrendamento) + '/ha/ano × ' + num(c.anosAtividade, 0) + ' anos', 'renda');
        } else {
            ln('ΔVT — antecipação da valorização', 'área × ΔV de ' + moeda(c.valorizacao) + '/ha × [1 − (1 + ' + num(c.taxaRealPct, 2) + '%)<sup>−' + num(c.anos, 0) + '</sup>] = × ' + num(l.fatorAntecipacao, 4), 'antecipacao');
        }
        ln('GR — adiamento da reposição florestal', 'área × taxa de reposição de ' + moeda(c.reposicaoHa) + '/ha × [(1 + ' + num(c.taxaNominalPct, 2) + '%)<sup>' + num(c.anos, 0) + '</sup> − 1] = × ' + num(l.fatorReposicao, 4), 'reposicao');
        html += '<tr style="background:#f0f7f0;"><td style="' + TD + '" colspan="2"><b>Subtotal</b></td><td style="' + TDR + '"><b>' + moeda(l.autorizavel.total) + '</b></td><td style="' + TDR + '"><b>' + moeda(l.naoAutorizavel.total) + '</b></td></tr></table>';
        var pl = r.parcelas.lia;
        if (r.atualizacao.aplicada) {
            html += '<p style="font-size:11pt; text-align:justify;"><b>Atualização</b> até ' + C.rotuloMes(r.mesCalculo) + ', pelo Manual de Cálculos da Justiça Federal (CJF, 2026), item 4.2. O que o infrator ganhou no mês do dano recebe correção e juros desde o evento danoso (Súmulas 43 e 54/STJ). O ganho de cada ano seguinte recebe correção e juros desde o mês em que se formou, porque não há mora sobre valor ainda inexistente.</p>';
            html += '<table style="font-size:10pt; border-collapse:collapse; width:100%; border:1px solid #ccc;"><tr><th style="' + th + ' text-align:left;">Valor</th><th style="' + th + '">Mês-base</th><th style="' + th + '">Original</th><th style="' + th + '">Corrigido</th><th style="' + th + '">Juros</th><th style="' + th + '">Atualizado</th></tr>';
            pl.grupos.forEach(function (g) {
                html += '<tr><td style="' + TD + '">' + esc(g.rotulo) + '</td><td style="' + TDR + '">' + C.rotuloMes(g.mes) + '</td><td style="' + TDR + '">' + moeda(g.valor) + '</td><td style="' + TDR + '">' + moeda(g.principalCorrigido) + '</td><td style="' + TDR + '">' + moeda(g.juros) + '</td><td style="' + TDR + '">' + moeda(g.total) + '</td></tr>';
            });
            html += '</table>';
        }
        html += '<div style="background:#e8f5e9; padding:6px 12px; margin:8px 0; border-radius:4px; font-weight:bold;">LUCRO DO ILÍCITO AMBIENTAL = ' + moeda(pl.valor) + (r.atualizacao.aplicada ? ' (atualizado: ' + moeda(pl.total) + ')' : '') + '</div>';
        html += '<p style="font-size:10pt; color:#555; text-align:justify;">Fontes dos parâmetros: ' + esc(c.fontes || 'informados pelo usuário') + ' O lucro e a renda da terra entram pelo valor de cada ano de atividade, corrigido a partir do fim desse ano; por isso devem ser informados a preços de cada período, e não a preços de hoje. O ganho de adiar a reposição florestal já vem capitalizado pela Selic até a regularização e só recebe correção e juros depois dela. A reposição florestal em si não entra no LIA, porque é obrigação autônoma.</p>';
        l.avisos.forEach(function (a) { html += nota(esc(a)); });
        if (c.referenciaMT) html += nota('Os parâmetros de referência são de <b>Mato Grosso</b> (IMEA, SENAR-MT, SEMA/MT, INCRA e Banco Central). Para outros estados, substitua-os pelos do mercado regional de terras, da rentabilidade por hectare, da tabela de taxas do órgão ambiental e da lei florestal local.');
        return html;
    }

    function blocoCarbono(r, chave, numero, nome, rotuloPreco, precoUSD, precoBRL, fontePreco) {
        var p = r.parcelas[chave];
        var e = r.estoque;
        var html = subtitulo(numero + ' ' + nome);
        var linhas = [];
        linhas.push(linha('Fórmula', '(A<sub>1</sub> + A<sub>2</sub>) × estoque de carbono (tC/ha) × 3,67 × preço (R$/tCO₂)'));
        linhas.push(linha('Parâmetros e fontes', num(r.areas.total, 4) + ' ha × ' + num(e.tC, 2) + ' tC/ha × 3,67 × ' + moeda(precoBRL) + '/tCO₂. ' + rotuloPreco + ': US$ ' + num(precoUSD, 2) + '/tCO₂ (' + fontePreco + '), convertido à cotação de R$ ' + num(r.parametros.cotacaoDolar, 2) + '. Estoque e fator 3,67: ver "Estoque de carbono".'));
        linhas.push(linha('Valor original e data-base', '<b>' + moeda(p.valor) + '</b>, a preços de ' + data(r.dataCalculo) + ' (data do cálculo, que equivale ao arbitramento)'));
        linhas.push(linha('Índice de correção (art. 524, II)', 'não há correção: o valor já está a preços da data do cálculo, e a correção do dano extrapatrimonial corre do arbitramento (Súmula 362/STJ)'));
        if (!r.atualizacao.aplicada) {
            linhas.push(linha('Juros e taxas (art. 524, III)', 'não aplicados: ' + esc(r.atualizacao.motivo)));
            linhas.push(linha('Valor atualizado', '<b>' + moeda(p.valor) + '</b>'));
        } else {
            var descricao;
            if (r.atualizacao.manual) {
                descricao = 'percentual informado pelo usuário. Fonte: ' + esc(r.atualizacao.manual.fonte) + '.';
            } else {
                descricao = 'taxa legal (Selic deduzida do IPCA-15) a partir de set./2024 (art. 406 do Código Civil, com a redação da Lei 14.905/2024; Resolução CMN 5.171/2024).';
                if (r.mesDano < '202408') {
                    descricao += r.atualizacao.opcaoExtrapatrimonial === 'reais'
                        ? ' Antes de set./2024: juros reais, isto é, Selic do mês deduzida do IPCA-15 do mês, com piso zero' + (r.mesDano < '200212' ? ' (0,5% ao mês até dez./2002)' : '') + '. A separação entre juros e correção dentro da Selic, no dano extrapatrimonial, não está pacificada; esta é a opção (a) da calculadora.'
                        : ' Antes de set./2024: juros não computados. A separação entre juros e correção dentro da Selic, no dano extrapatrimonial, não está pacificada; esta é a opção (b) da calculadora.';
                }
            }
            linhas.push(linha('Juros e taxas (art. 524, III)', descricao + ' Percentual acumulado: <b>' + num(p.percentualJuros, 2) + '%</b>'));
            linhas.push(linha('Termo inicial e final dos juros (art. 524, IV)', C.rotuloMes(r.mesDano) + ' (evento danoso, Súmula 54/STJ; Manual de Cálculos da Justiça Federal, item 4.2.2, Nota 5, b) a ' + C.rotuloMes(r.mesCalculo)));
            linhas.push(linha('Capitalização dos juros (art. 524, V)', 'simples, mensal (soma das taxas mensais)'));
            linhas.push(linha('Juros de mora', moeda(p.juros)));
            linhas.push(linha('Valor atualizado', '<b>' + moeda(p.total) + '</b>'));
        }
        return html + tabela(linhas);
    }

    // Detalhe da consulta ao mapa do Quarto Inventário: classes cruzadas, blocos
    // usados, campo e fonte do dado; ou o motivo de o mapa não ter sido usado.
    function blocoMapa(e) {
        var html = '';
        var m = e.mapa;
        if (!m) {
            if (e.avisoMapa) html += nota(esc(e.avisoMapa));
            return html;
        }
        var th = TD + ' background:#f5f5f5;';
        if (m.tipo === 'poligono') {
            html += '<p style="font-size:11pt;">Área calculada do polígono: ' + num(m.area_ha, 4) + ' ha (método geodésico). Classes do mapa cruzadas:</p>';
            html += '<table style="font-size:10pt; border-collapse:collapse; width:100%; border:1px solid #ccc;"><tr>' +
                ['Bioma', 'Classe (c_pret)', 'Categoria', 'Formato do dado', 'Área de interseção (ha)', esc(m.campo) + ' (tC/ha)'].map(function (c) { return '<th style="' + th + '">' + c + '</th>'; }).join('') + '</tr>' +
                m.partes.map(function (p) {
                    return '<tr><td style="' + TD + '">' + esc(p.bioma) + '</td><td style="' + TD + '">' + esc(p.c_pret || 'não identificada') + '</td><td style="' + TD + '">' + esc(p.categ) + '</td><td style="' + TD + '">' + (p.formato === 'raster' ? 'raster (média dos pixels)' : 'vetor (polígono ' + esc(p.id) + ')') + '</td><td style="' + TDR + '">' + num(p.area_ha, 4) + '</td><td style="' + TDR + '">' + num(p.d, 2) + '</td></tr>';
                }).join('') + '</table>';
            html += '<p style="font-size:11pt;">Média ponderada pela área: ' + num(m.estoque_tC_ha, 2) + ' tC/ha, em ' + num(m.area_coberta_ha, 4) + ' ha com dado.' +
                (m.pct_sem_dado > 0.005 ? ' Em ' + num(m.pct_sem_dado, 2) + '% do polígono a classe está sem dado no mapa.' : '') +
                (m.pct_descoberto > 0.005 ? ' Parte do polígono fora da cobertura ou sem dado: ' + num(m.pct_descoberto, 2) + '%; nela foi usada a reserva: ' + esc(e.reservaDescoberta) + '.' : ' Todo o polígono tem dado no mapa.') +
                ' Estoque final: <b>' + num(e.tC, 2) + ' tC/ha</b>.</p>';
        } else {
            html += '<p style="font-size:11pt;">Coordenada: latitude ' + num(m.lat, 6) + ', longitude ' + num(m.lon, 6) + '. Classe do mapa no ponto: ' + esc(m.classe.c_pret || 'não identificada') + ' (' + esc(m.classe.categ) + '), bioma ' + esc(m.classe.bioma) + ', dado em ' + (m.classe.formato === 'raster' ? 'raster' : 'vetor') + '; ' + esc(m.campo) + ' = ' + num(m.estoque_tC_ha, 2) + ' tC/ha.</p>';
            var aviso = esc(m.aviso);
            if (m.vizinhas.length) {
                aviso += ' Classes a menos de 100 m do ponto: ' + m.vizinhas.map(function (v) {
                    return esc(v.c_pret || 'não identificada') + ' (' + (typeof v.d === 'number' && v.d > 0 ? num(v.d, 2) + ' tC/ha' : 'sem dado') + ', a ' + num(v.distancia_m, 0) + ' m)';
                }).join('; ') + '.';
            }
            html += nota(aviso);
        }
        var d = e.dados;
        var linhas = [];
        linhas.push(linha('Campo do estoque', esc(m.campo) + ': carbono total da vegetação original, acima e abaixo do solo, em tC/ha. Valor zero ou em branco é tratado como "sem dado", e não como estoque zero.'));
        if (d) {
            linhas.push(linha('Versão dos dados', esc(d.versao) + ', gerada em ' + esc(d.gerado_em) + (d.data_download ? '; arquivos do INPE baixados em ' + esc(d.data_download) : '')));
            (d.fontes || []).forEach(function (f) {
                linhas.push(linha('Fonte (' + esc(f.bioma) + ', ' + esc(f.uso) + ')', (f.arquivo ? esc(f.arquivo) + '; ' : '') + 'modificado no servidor do INPE em ' + esc(f.modificado_no_servidor) + '. ' + esc(f.url)));
            });
        }
        linhas.push(linha('Blocos do mapa usados', esc(m.blocos.join(', '))));
        linhas.push(linha('Privacidade', 'O polígono e a coordenada foram processados no navegador. Ao servidor de dados só foram pedidos os blocos acima.'));
        return html + tabela(linhas);
    }

    function blocoEstoque(r) {
        var e = r.estoque;
        var html = subtitulo('Estoque de carbono');
        var linhas = [];
        linhas.push(linha('Tipo de entrada', esc(e.entrada || 'reserva')));
        linhas.push(linha('Origem do estoque', esc(e.descricaoOrigem)));
        if (e.sigla) linhas.push(linha('Fitofisionomia', esc(e.sigla) + (e.nome ? ' — ' + esc(e.nome) : '')));
        linhas.push(linha('Estoque de carbono', '<b>' + num(e.tC, 2) + ' tC/ha</b>'));
        linhas.push(linha('Emissão equivalente', num(e.tC, 2) + ' tC/ha × 3,67 = <b>' + num(C.carbonoParaCO2(e.tC), 2) + ' tCO₂/ha</b> (Protocolo para Julgamento de Ações Ambientais, 2º escopo, CNJ, 2024, p. 59, nota 31)'));
        linhas.push(linha('Fonte', esc(e.fonte)));
        if (e.regra) linhas.push(linha('Regra de média', esc(e.regra)));
        if (e.subvalores && e.subvalores.length) {
            linhas.push(linha('Subvalores da fitofisionomia', e.subvalores.map(function (s) {
                return esc(s.estado || s.local || '') + ': ' + num(s.total, 2) + ' tC/ha';
            }).join('; ')));
        }
        html += tabela(linhas);
        html += blocoMapa(e);
        if (e.secundaria) {
            html += nota(e.origem === 'usuario'
                ? 'A vegetação suprimida foi declarada secundária ou já degradada, e o estoque foi informado pelo usuário.'
                : 'A vegetação suprimida foi declarada secundária ou já degradada, mas o estoque usado é o da vegetação original (Quarto Inventário Nacional). O valor pode superestimar o dano nessa área.');
        }
        return html;
    }

    function secaoDemonstrativo(r) {
        var html = titulo('2. DEMONSTRATIVO DISCRIMINADO POR PARCELA');
        if (!r.dataInformada) {
            html += nota('<b>Atenção:</b> a data do dano não foi informada. Os valores estão expressos na data do cálculo e não receberam atualização judicial. A correção monetária dos danos patrimoniais corre do efetivo prejuízo (Súmula 43/STJ) e os juros de mora, do evento danoso (Súmula 54/STJ). Informe a data do dano para obter a atualização.', 'vermelho');
        }
        html += blocoMaterial(r) + blocoInterino(r) + blocoResidual(r) + blocoEstoque(r);
        html += blocoCarbono(r, 'mercado', '2.4', 'Dano extrapatrimonial (mercado voluntário de carbono)', 'Preço no mercado voluntário', r.parametros.precoMercadoCO2USD, r.parametros.precoMercadoCO2BRL, 'piso do Fundo Amazônia, Protocolo do CNJ, 2024, p. 66');
        html += blocoCarbono(r, 'social', '2.5', 'Dano climático (custo social do carbono)', 'Custo social do carbono', r.parametros.precoSocialCO2USD, r.parametros.precoSocialCO2BRL, 'cenário SSP2/RCP6.0, Ricke et al., 2018');
        r.avisosPiso.forEach(function (a) { html += nota(esc(a)); });
        html += blocoLIA(r);
        return html;
    }

    // ---------- 3. Tabela mês a mês ----------

    function linhasMensais(r) {
        if (!r.atualizacao.aplicada || r.atualizacao.manual) return [];
        var s = r.series;
        var patrimonial = r.atualizacao.referenciaPatrimonial;
        var extra = r.atualizacao.referenciaExtrapatrimonial;
        var corr = {}, jur = {}, jex = {};
        patrimonial.mesesCorrecao.forEach(function (m) { corr[m.mes] = m; });
        patrimonial.mesesJuros.forEach(function (m) { jur[m.mes] = m; });
        extra.meses.forEach(function (m) { jex[m.mes] = m; });
        var coef = 1, acJ = 0, acE = 0;
        return C.intervaloMeses(r.mesDano, r.mesCalculo).map(function (m) {
            var c = corr[m], j = jur[m], e = jex[m];
            if (c && c.incluido) coef *= 1 + c.variacao / 100;
            if (j) acJ += j.taxa;
            if (e) acE += e.taxa;
            var base;
            if (m === r.mesDano) base = 'mês do dano: só correção (IPCA-15 do mês); os juros começam no mês seguinte';
            else if (m <= '200212') base = 'CC/1916, arts. 1.062 a 1.064 (0,5% a.m.); IPCA-E';
            else if (m < '202408') base = 'CC, art. 406 (Selic, que engloba juros e correção); Manual CJF, item 4.2.1, Nota 2';
            else if (m === '202408') base = 'CC, art. 406 (Selic); IPCA-15 retomado (Lei 14.905/2024)';
            else base = 'CC, arts. 389 e 406 (Lei 14.905/2024); Res. CMN 5.171/2024 (IPCA-15 + taxa legal)';
            return {
                mes: m,
                selic: typeof s.selic[m] === 'number' && m <= C.MES_FIM_SELIC ? s.selic[m] : null,
                ipca15: typeof s.ipca15_var[m] === 'number' ? s.ipca15_var[m] : null,
                taxaLegal: m >= C.MES_INICIO_TAXA_LEGAL && typeof s.taxa_legal[C.somarMeses(m, -1)] === 'number' ? s.taxa_legal[C.somarMeses(m, -1)] : null,
                correcaoAplicada: c && c.incluido ? c.variacao : null,
                coeficiente: coef,
                jurosMes: j ? j.taxa : null,
                jurosTipo: j ? j.tipo : '',
                jurosAcumulado: acJ,
                jurosExtraMes: e ? e.taxa : null,
                jurosExtraAcumulado: acE,
                base: base
            };
        });
    }

    var CABECALHO_MENSAL = ['Mês', 'Selic (%)', 'IPCA-15 (%)', 'Taxa legal aplicada (%)', 'Correção aplicada (%)', 'Coeficiente acumulado', 'Juros patrimoniais do mês (%)', 'Juros patrimoniais acumulados (%)', 'Juros extrapatrimoniais do mês (%)', 'Juros extrapatrimoniais acumulados (%)', 'Base legal'];

    function secaoTabelaMensal(r) {
        var html = titulo('3. TABELA MÊS A MÊS');
        var linhas = linhasMensais(r);
        if (linhas.length === 0) {
            return html + '<p>' + (r.atualizacao.manual ? 'Os fatores foram informados pelo usuário; não há tabela mensal.' : 'Não houve atualização; não há tabela mensal.') + '</p>';
        }
        function v(x, casas) { return x === null ? '—' : num(x, casas); }
        html += '<p style="font-size:10pt; color:#555; text-align:justify;">Cada linha é um mês. A correção usa a variação do IPCA-15 do próprio mês, do mês do dano até o mês anterior ao do cálculo, salvo nos meses em que a Selic incide. Os juros correm a partir do mês seguinte ao do dano; a taxa legal de cada mês é a divulgada pelo Banco Central para o mês anterior (Manual de Cálculos da Justiça Federal, item 4.2.2, Nota 7). O mês do cálculo foi tratado como mês do pagamento. A mesma tabela pode ser baixada em CSV.</p>';
        html += '<table style="font-size:8pt; border-collapse:collapse; width:100%; border:1px solid #ccc;"><tr>' +
            CABECALHO_MENSAL.map(function (c) { return '<th style="padding:2px 4px; border:1px solid #ccc; background:#f5f5f5;">' + c + '</th>'; }).join('') + '</tr>';
        var td = 'padding:2px 4px; border:1px solid #ccc; text-align:right;';
        linhas.forEach(function (l) {
            html += '<tr><td style="padding:2px 4px; border:1px solid #ccc;">' + C.rotuloMes(l.mes) + '</td>' +
                '<td style="' + td + '">' + v(l.selic, 2) + '</td><td style="' + td + '">' + v(l.ipca15, 2) + '</td><td style="' + td + '">' + v(l.taxaLegal, 6) + '</td>' +
                '<td style="' + td + '">' + v(l.correcaoAplicada, 2) + '</td><td style="' + td + '">' + num(l.coeficiente, 10) + '</td>' +
                '<td style="' + td + '">' + v(l.jurosMes, 6) + '</td><td style="' + td + '">' + num(l.jurosAcumulado, 6) + '</td>' +
                '<td style="' + td + '">' + v(l.jurosExtraMes, 6) + '</td><td style="' + td + '">' + num(l.jurosExtraAcumulado, 6) + '</td>' +
                '<td style="padding:2px 4px; border:1px solid #ccc;">' + l.base + '</td></tr>';
        });
        return html + '</table>';
    }

    function gerarCSV(r) {
        function campo(x) {
            if (x === null || x === undefined) return '';
            if (typeof x === 'number') return String(x).replace('.', ',');
            return '"' + String(x).replace(/"/g, '""') + '"';
        }
        var linhas = [CABECALHO_MENSAL.map(campo).join(';')];
        linhasMensais(r).forEach(function (l) {
            linhas.push([C.rotuloMes(l.mes), l.selic, l.ipca15, l.taxaLegal, l.correcaoAplicada, C.arredondar(l.coeficiente, 10), l.jurosMes, C.arredondar(l.jurosAcumulado, 6), l.jurosExtraMes, C.arredondar(l.jurosExtraAcumulado, 6), l.base].map(campo).join(';'));
        });
        return '﻿' + linhas.join('\r\n') + '\r\n';
    }

    // ---------- 4 a 6 ----------

    function secaoDescontosBensTotais(r) {
        var id = r.identificacao;
        var html = titulo('4. DESCONTOS OBRIGATÓRIOS') + '<p>' + (id.descontos ? esc(id.descontos) : 'Não há.') + '</p>';
        html += titulo('5. BENS PASSÍVEIS DE PENHORA') + '<p>' + (id.bensPenhora ? esc(id.bensPenhora).replace(/\n/g, '<br>') : 'Não indicados.') + '</p>';
        html += titulo('6. TOTAL GERAL E TOTAL ATUALIZADO');
        var p = r.parcelas;
        var th = TD + ' background:#f5f5f5;';
        html += '<table style="font-size:11pt; border-collapse:collapse; width:100%; border:1px solid #ccc;">' +
            '<tr><th style="' + th + ' text-align:left;">Parcela</th><th style="' + th + '">Valor original</th><th style="' + th + '">Correção</th><th style="' + th + '">Juros</th><th style="' + th + '">Valor atualizado</th></tr>';
        var listaParcelas = [['Dano material', p.material], ['Dano interino', p.interino], ['Dano residual', p.residual], ['Dano extrapatrimonial (mercado voluntário)', p.mercado], ['Dano climático (custo social do carbono)', p.social]];
        if (p.lia) listaParcelas.push(['Lucro do ilícito ambiental (LIA)', p.lia]);
        listaParcelas.forEach(function (par) {
            var x = par[1];
            html += '<tr><td style="' + TD + '">' + par[0] + '</td><td style="' + TDR + '">' + moeda(x.valor) + '</td><td style="' + TDR + '">' + moeda(x.correcao) + '</td><td style="' + TDR + '">' + moeda(x.juros) + '</td><td style="' + TDR + '">' + moeda(x.total) + '</td></tr>';
        });
        var t = r.totais;
        html += '<tr style="background:#f0f7f0;"><td style="' + TD + '"><b>Total</b></td><td style="' + TDR + '"><b>' + moeda(t.original) + '</b></td><td style="' + TDR + '">' + moeda(t.correcao) + '</td><td style="' + TDR + '">' + moeda(t.juros) + '</td><td style="' + TDR + '"><b>' + moeda(t.atualizado) + '</b></td></tr></table>';
        html += '<div style="background:#c8e6c9; padding:10px 14px; margin:10px 0 4px 0; border-radius:4px; font-size:13pt; font-weight:bold; text-align:center;">TOTAL GERAL = ' + moeda(t.original) + '</div>';
        if (r.atualizacao.aplicada) {
            html += '<div style="background:#fff3cd; padding:10px 14px; margin:4px 0; border-radius:4px; font-size:13pt; font-weight:bold; text-align:center; border:2px solid #ffc107;">TOTAL ATUALIZADO ATÉ ' + C.rotuloMes(r.mesCalculo).toUpperCase() + ' = ' + moeda(t.atualizado) + '</div>';
        }
        return html;
    }

    // ---------- complementos mantidos da versão 6 ----------

    function secaoAlternativo(r) {
        var a = r.alternativo;
        var html = titulo('VALORAÇÃO PELO ENTENDIMENTO ALTERNATIVO');
        html += '<p style="text-align:justify;">' + (r.entendimento === 'gonzaga'
            ? 'Caso fosse adotado o entendimento do <b>' + nomeEntendimento('irdr') + '</b>, segundo o qual o desmatamento em área não especialmente protegida configura dano extrapatrimonial <em>in re ipsa</em>, mas não dano material indenizável, os valores seriam:'
            : 'Caso fosse adotada a metodologia de <b>' + nomeEntendimento('gonzaga') + '</b>, que considera o dano material (custo de recuperação da vegetação nativa conforme a Portaria Ibama 118/2022) como parcela indenizável autônoma, os valores seriam:') + '</p>';
        var th = TD + ' background:#f5f5f5;';
        html += '<table style="font-size:11pt; border-collapse:collapse; width:100%; border:1px solid #ccc;"><tr><th style="' + th + ' text-align:left;">Parcela</th><th style="' + th + '">Valor original</th><th style="' + th + '">Valor atualizado</th></tr>';
        var listaAlt = [['Dano material', a.material], ['Dano interino', a.interino], ['Dano residual', r.parcelas.residual], ['Dano extrapatrimonial (mercado voluntário)', r.parcelas.mercado], ['Dano climático (custo social do carbono)', r.parcelas.social]];
        if (r.parcelas.lia) listaAlt.push(['Lucro do ilícito ambiental (LIA)', r.parcelas.lia]);
        listaAlt.forEach(function (par) {
            html += '<tr><td style="' + TD + '">' + par[0] + '</td><td style="' + TDR + '">' + moeda(par[1].valor) + '</td><td style="' + TDR + '">' + moeda(par[1].total) + '</td></tr>';
        });
        html += '<tr style="background:#f0f7f0;"><td style="' + TD + '"><b>Total</b></td><td style="' + TDR + '"><b>' + moeda(a.totalOriginal) + '</b></td><td style="' + TDR + '"><b>' + moeda(a.totalAtualizado) + '</b></td></tr></table>';
        return html;
    }

    // Reparação em espécie, apresentada antes dos valores em dinheiro.
    function secaoReparacaoEmEspecie(r) {
        var p = r.parcelas;
        var c = r.compensacao;
        var material = c.itens[0];
        var th = TD + ' background:#f5f5f5;';
        var html = titulo('REPARAÇÃO EM ESPÉCIE, QUE PRECEDE A INDENIZAÇÃO');
        html += '<p style="text-align:justify;">A reparação segue esta ordem: recuperação da área no próprio local; compensação ecológica, com a proteção perpétua de área equivalente; e, só quando as duas forem impossíveis, indenização em dinheiro. "A compensação ecológica possui, portanto, precedência em relação à opção pela indenização pecuniária" (CNJ, Protocolo para Julgamento de Ações Ambientais, segundo escopo, 2024, p. 38). Os valores em dinheiro da seção 2 correspondem ao que não for reparado em espécie.</p>';
        html += '<p><b>1) Hipótese da recuperação da área desmatada (recuperação <em>in situ</em>):</b></p>';
        html += '<p style="text-align:justify;">' + (c.inSituHa > 0 ? 'Área a recuperar no próprio local: <b>' + num(c.inSituHa, 4) + ' ha</b>. ' : '') + 'Quando houver recuperação da área desmatada (recuperação <em>in situ</em>) por danos em área de reserva legal (ARL), área de preservação permanente (APP) ou áreas excedentes caso ele opte pela reparação <em>in natura</em> e <em>in situ</em>, o degradador deverá indenizar os danos interinos no valor de ' + moeda(p.interino.valor) + ' e os danos residuais no valor de ' + moeda(p.residual.valor) + ' (além de indenizar os danos extrapatrimoniais). Neste cenário, o proprietário deverá apresentar e executar Projeto de Recuperação de Áreas Degradadas (PRADA) ou laudo de constatação de reparação do dano ambiental. Alternativamente, a parte requerida poderá realizar a compensação ecológica do dano interino e extrapatrimonial (veja a seguir).</p>';
        html += '<p><b>2) Hipótese da não recuperação da área ilegalmente desmatada (desmatamento ilegal fora de ARL e APP a ser regularizado):</b></p>';
        html += '<p style="text-align:justify;">Quando não houver reparação <em>in situ</em> (área passível de exploração), deverá ser realizada a compensação ecológica ou o pagamento de indenização, para que o proprietário possa regularizar a exploração da área. Neste caso, a valoração (dano material) é de ' + moeda(p.material.valor) + '. Também deverão ser reparados os danos climáticos, estimados em ' + moeda(p.social.valor) + ' e extrapatrimoniais (' + moeda(p.mercado.valor) + ').</p>';
        html += '<p><b>COMPENSAÇÃO ECOLÓGICA</b></p>';
        html += '<p style="text-align:justify;">Área de vegetação nativa a proteger em caráter perpétuo, por parcela, e a indenização que ela substitui:</p>';
        html += '<table style="font-size:10pt; border-collapse:collapse; width:100%; border:1px solid #ccc;"><tr><th style="' + th + ' text-align:left;">Parcela</th><th style="' + th + '">Área a proteger (ha)</th><th style="' + th + ' text-align:left;">Como se chega à área</th><th style="' + th + '">Indenização substituída (valor original)</th></tr>';
        c.itens.forEach(function (i) {
            html += '<tr><td style="' + TD + '">' + i.nome + '</td><td style="' + TDR + '">' + num(i.ha, 4) + '</td><td style="' + TD + '">' + esc(i.regra) + '</td><td style="' + TDR + '">' + moeda(i.valor) + '</td></tr>';
        });
        html += '<tr style="background:#e8f5e9;"><td style="' + TD + '"><b>Total</b></td><td style="' + TDR + '"><b>' + num(c.totalHa, 4) + '</b></td><td style="' + TD + '">custo de recuperação por hectare: ' + moeda(c.custoHa) + '</td><td style="' + TDR + '"><b>' + moeda(c.itens.reduce(function (s, i) { return s + i.valor; }, 0)) + '</b></td></tr>';
        html += '<tr><td style="' + TD + '">Dano climático (custo social do carbono)</td><td style="' + TDR + '">—</td><td style="' + TD + '">sem equivalente em área no método; reparado em dinheiro</td><td style="' + TDR + '">' + moeda(p.social.valor) + '</td></tr>';
        if (p.lia) html += '<tr><td style="' + TD + '">Lucro do ilícito ambiental (LIA)</td><td style="' + TDR + '">—</td><td style="' + TD + '">restituição do proveito, em dinheiro</td><td style="' + TDR + '">' + moeda(p.lia.valor) + '</td></tr>';
        html += '</table>';
        html += '<p style="text-align:justify;">Propõe-se a compensação ecológica dos danos materiais nos seguintes termos: instituição, no próprio imóvel ou imóvel de terceiro no mesmo bioma, estado da federação e preferencialmente, no mesmo município ou município contíguo, de RPPN, servidão ambiental perpétua ou aquisição e doação ao poder público de área em unidade de conservação igual à área ilegalmente desmatada (arredondada), isto é ' + num(material.ha, 0) + ' hectares, remanescendo o pagamento de indenização por danos extrapatrimoniais (que poderá ser reduzido a critério do promotor de Justiça, conforme a relevância da área protegida a ser criada) no valor de ' + moeda(p.mercado.valor) + '.</p>';
        html += '<p style="text-align:justify;">O valor dos danos extrapatrimoniais remanescente também poderá ser reduzido com o aumento da área a ser protegida, descontando-se o valor dos custos médios de reparação para cada hectare adicional de vegetação nativa no montante do dano extrapatrimonial (isto é, ' + moeda(r.custo.valorHa) + ' por hectare fora de ARL acrescentado na RPPN além da área desmatada). É dessa regra que saem as áreas do dano interino e do dano extrapatrimonial no quadro acima.</p>';
        html += '<p><b>Regras para a instituição de RPPN (ou servidão ambiental perpétua):</b></p>';
        html += '<p style="text-align:justify;">1) A RPPN deverá abranger a área de reserva legal do imóvel, embora a ARL abrangida não será computada para fins da compensação ecológica;<br>';
        html += '2) A área protegida deverá, salvo absoluta impossibilidade, (2.1) consistir-se de um único bloco de vegetação nativa e (2.2) ser lindeira à área de reserva legal ou área de preservação permanente existente no imóvel, visando diminuir os efeitos da fragmentação de habitats e efeitos de borda.</p>';
        html += '<p style="text-align:justify;">Na hipótese de RPPN, toda a área protegida continuará sendo de propriedade da parte requerida, que poderá aferir renda com a venda de créditos de carbono e cotas de reserva ambiental (CRA) para imóveis com déficit de áreas de reserva legal.</p>';
        return html;
    }

    // Parâmetros de referência usados no cálculo, com fonte, data e a indicação
    // do que o usuário alterou.
    function secaoParametros(r) {
        var d = r.padroes;
        var linhas = [];
        function ln(nome, valor, fonte, dataRef, alterado) {
            linhas.push('<tr><td style="' + TD + '">' + nome + '</td><td style="' + TDR + '">' + valor + '</td><td style="' + TD + '">' + fonte + '</td><td style="' + TD + '">' + dataRef + '</td><td style="' + TD + '">' + (alterado === null ? '—' : (alterado ? '<b>alterado pelo usuário</b>' : 'padrão')) + '</td></tr>');
        }
        function difere(a, b) { return Math.abs((a || 0) - (b || 0)) > 1e-9; }
        ln('Custo de recuperação por hectare', moeda(r.custo.valorHa), 'Portaria Ibama 118/2022, média do bioma', 'out./2022' + (r.custo.fator === null ? '' : ', levado a ' + C.rotuloMes(r.custo.mesReferencia) + ' pelo IPCA-15'), null);
        var it = r.interino, caexI = it.metodo === 'caex';
        ln('Dano interino: taxa de juros', num(it.taxaPct, 2) + '% ao ano', caexI ? 'Nota Técnica 03/2022 do CAEx/MPMT (média do IPCA)' : 'Gonzaga et al. (2025)', caexI ? 'IPCA de 1995 a 2023; Nota atualizada em 17/01/2024' : '2025', difere(it.taxaPct, d.interino.taxaPct));
        ln('Dano interino: tempo de recuperação', num(it.tempo, it.tempo % 1 ? 1 : 0) + ' anos', caexI ? 'Nota Técnica 03/2022 do CAEx/MPMT' : 'Gonzaga et al. (2025)', caexI ? 'atualizada em 17/01/2024' : '2025', difere(it.tempo, d.interino.tempo));
        if (caexI) ln('Dano interino: custo de reposição', moeda(it.custoHa) + '/ha', 'Timotheo et al. (2017), na Nota Técnica 03/2022', 'IPCA de 2017 a 2023', it.resiliencia !== d.interino.resiliencia);
        var rs = r.residual, caexR = rs.metodo === 'caex';
        ln('Dano residual: percentual que não se recupera', num(rs.pfePct, 2) + '%', caexR ? 'Relatório Técnico 963/2026 do CAEx/MPMT' : 'mediana das estimativas publicadas (seção 2.3)', caexR ? '2026' : 'estimativas de 2012 a 2026', difere(rs.pfePct, d.residual.pfePct));
        if (caexR) ln('Dano residual: taxa de juros', num(rs.taxaPct, 2) + '% ao ano', 'Relatório Técnico 963/2026 (média do IPCA)', 'IPCA de 1995 a 2023', difere(rs.taxaPct, d.residual.taxaPct));
        else ln('Dano residual: fator de equivalência (k)', num(rs.k, 2), 'padrão da calculadora', '2026', difere(rs.k, 1));
        var e = r.estoque;
        ln('Estoque de carbono', num(e.tC, 2) + ' tC/ha', esc(e.descricaoOrigem), e.origem === 'usuario' ? 'informada pelo usuário' : (e.dados ? 'Quarto Inventário (MCTI, 2020); arquivos do INPE de 25/06/2021, baixados em ' + esc(e.dados.data_download || 'data não informada') : 'Quarto Inventário (MCTI, 2020)'), e.origem === 'usuario');
        ln('Preço no mercado voluntário', 'US$ ' + num(r.parametros.precoMercadoCO2USD, 2) + '/tCO₂', 'piso do Fundo Amazônia (CNJ, Protocolo, segundo escopo, p. 66)', 'out./2024', difere(r.parametros.precoMercadoCO2USD, d.precos.precoMercadoCO2USD));
        ln('Custo social do carbono', 'US$ ' + num(r.parametros.precoSocialCO2USD, 2) + '/tCO₂', 'Ricke et al. (2018), cenário SSP2/RCP6.0', '2018', difere(r.parametros.precoSocialCO2USD, d.precos.precoSocialCO2USD));
        ln('Cotação do dólar', 'R$ ' + num(r.parametros.cotacaoDolar, 2), esc(r.parametros.origemCotacao), data(r.dataCalculo), null);
        if (r.lia) {
            var c = r.lia.config, pl = d.lia;
            var UPF = 'UPF/MT de set./2026';
            if (r.lia.comAtividade) {
                ln('LIA: lucro operacional (EBITDA)', moeda(c.ebitda) + '/ha/ano', 'Rossi et al. (2023), SENAR-MT e IMEA', 'safras até 2022/23', difere(c.ebitda, pl.ebitda));
                ln('LIA: arrendamento deduzido', moeda(c.arrendamento) + '/ha/ano', 'IMEA, custo de produção', 'set./2026', difere(c.arrendamento, pl.arrendamento));
                ln('LIA: anos de atividade', num(c.anosAtividade, 0), 'intervalo do dano à regularização', '—', difere(c.anosAtividade, pl.anosAtividade));
            } else {
                ln('LIA: valorização da terra', moeda(c.valorizacao) + '/ha', 'informada pelo usuário (referência: INCRA, relatório de mercado de terras)', 'informada pelo usuário', null);
                ln('LIA: Selic real média', num(c.taxaRealPct, 2) + '% ao ano', 'Banco Central, SGS 4390 e 433', 'média de 2010 a 2025', difere(c.taxaRealPct, pl.taxaRealPct));
            }
            ln('LIA: taxas de licenciamento evitadas', moeda(c.taxasLicenciamento), 'SEMA/MT, Lei 11.179/2020', UPF, difere(c.taxasLicenciamento, pl.taxasLicenciamento));
            ln('LIA: honorários técnicos evitados', moeda(c.honorariosHa) + '/ha', 'orçamento de empresa de consultoria ambiental de Mato Grosso', 'set./2026', difere(c.honorariosHa, pl.honorariosHa));
            if (c.eiaRima > 0 || pl.eiaRima > 0) ln('LIA: EIA/RIMA evitado', moeda(c.eiaRima), 'orçamento de empresa de consultoria ambiental de Mato Grosso', 'set./2026', difere(c.eiaRima, pl.eiaRima));
            ln('LIA: volume de produto florestal', num(c.volumeM3, 1) + ' m³/ha', 'LC 233/2005-MT, volumes presumidos', '2005', difere(c.volumeM3, pl.volumeM3));
            ln('LIA: preço do produto florestal', moeda(c.precoMadeira) + '/m³', 'informado pelo usuário', 'informada pelo usuário', null);
            ln('LIA: taxa de reposição florestal', moeda(c.reposicaoHa) + '/ha', 'Decreto 1.313/2022-MT e LC 233/2005-MT', UPF, difere(c.reposicaoHa, pl.reposicaoHa));
            ln('LIA: Selic nominal média', num(c.taxaNominalPct, 2) + '% ao ano', 'Banco Central, SGS 4390', 'média de 2010 a 2025', difere(c.taxaNominalPct, pl.taxaNominalPct));
        }
        var th = TD + ' background:#f5f5f5; text-align:left;';
        var html = titulo('PARÂMETROS DE REFERÊNCIA');
        html += '<p style="font-size:10pt; color:#555; text-align:justify;">Todos os parâmetros abaixo são declarados e podem ser revistos. As séries de correção e de juros estão nos metadados, com a data de cada consulta.</p>';
        html += '<table style="font-size:9.5pt; border-collapse:collapse; width:100%; border:1px solid #ccc;"><tr><th style="' + th + '">Parâmetro</th><th style="' + th + '">Valor usado</th><th style="' + th + '">Fonte</th><th style="' + th + '">Data de referência</th><th style="' + th + '">Situação</th></tr>' + linhas.join('') + '</table>';
        return html;
    }

    // ---------- 7 e 8 ----------

    function secaoMetadados(r) {
        var linhas = [];
        linhas.push(linha('Versão do DAMNUM', esc(r.versao) + ' — <a href="' + SITE + '/" target="_blank" style="color:#1a5276;">' + SITE + '</a>'));
        linhas.push(linha('Data e hora do cálculo', r.dataCalculo.toLocaleString('pt-BR')));
        linhas.push(linha('Entendimento escolhido', nomeEntendimento(r.entendimento)));
        linhas.push(linha('Fitofisionomia e fonte do estoque', (r.estoque.sigla ? esc(r.estoque.sigla) + (r.estoque.nome ? ' — ' + esc(r.estoque.nome) : '') + '. ' : '') + esc(r.estoque.descricaoOrigem) + ' (' + num(r.estoque.tC, 2) + ' tC/ha)'));
        linhas.push(linha('Entrada do estoque de carbono', esc(r.estoque.entrada || 'reserva') + (r.estoque.mapa ? '; dados do mapa na versão ' + esc(r.estoque.dados ? r.estoque.dados.versao : 'não informada') : '')));
        linhas.push(linha('Método do dano interino', r.interino.metodo === 'caex' ? 'Nota Técnica 03/2022 do CAEx Ambiental/MPMT (Roquette)' : 'Gonzaga et al. (2025)'));
        linhas.push(linha('Método do dano residual', r.residual.metodo === 'caex' ? 'Relatório Técnico 963/2026 do CAEx Ambiental/MPMT (Roquette)' : 'Gonzaga et al. (2026), com ' + num(r.residual.pfePct, 2) + '% não recuperado'));
        linhas.push(linha('Lucro do ilícito ambiental (LIA)', r.lia ? 'calculado' : 'não calculado, porque a data do dano não foi informada'));
        linhas.push(linha('Juros sobre danos extrapatrimoniais antes de set./2024', r.atualizacao.opcaoExtrapatrimonial === 'reais' ? 'opção (a): juros reais, Selic deduzida do IPCA-15' : 'opção (b): não computados'));
        r.consultas.forEach(function (c) {
            linhas.push(linha('Consulta: ' + esc(c.serie), esc(c.fonte) + ' — ' + esc(c.quando) + ' — ' + esc(c.situacao)));
        });
        linhas.push(linha('Cotação do dólar', 'R$ ' + num(r.parametros.cotacaoDolar, 2) + ' — ' + esc(r.parametros.origemCotacao)));
        linhas.push(linha('Hash SHA-256 dos parâmetros de entrada', '<span style="font-family:monospace; font-size:9pt; word-break:break-all;">' + esc(r.hash) + '</span>'));
        var html = titulo('7. METADADOS') + tabela(linhas);
        if (r.consultas.some(function (c) { return c.reserva && c.situacao === 'ok'; })) {
            html += nota('Uma ou mais séries vieram das séries embutidas no DAMNUM, porque a fonte oficial não respondeu no momento do cálculo. Confira os valores na fonte oficial antes de usar o relatório em juízo.');
        }
        return html;
    }

    function secaoAviso() {
        return titulo('8. AVISO') + '<p style="text-align:justify;">Os valores deste relatório são um <b>valor de referência mínimo</b>, calculado com parâmetros publicados e sujeito a contraprova. O relatório não substitui a perícia quando o fato técnico for controvertido.</p>';
    }

    function secaoReferencias(r) {
        var p = 'text-align:justify; font-size:10pt;';
        var html = titulo('REFERÊNCIAS');
        html += '<p style="' + p + '">GONZAGA, Claudio Angelo Correa; ROQUETTE, José Guilherme; BRASILEIRO, Andrea Castelo Branco; SINISGALLI, Paulo Antonio de Almeida. Valoração e compensação ecológica dos danos ambientais causados pelo desmatamento ilegal. <em>Anais do V Simpósio Interdisciplinar de Ciência Ambiental da USP (SICAM)</em>, 5., 2024, São Paulo. São Paulo: IEE-USP, 2025. p. 210-217. Disponível em &lt;' + SITE + '/metodologia.pdf&gt;.</p>';
        html += '<p style="' + p + '">BRASIL. Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis – IBAMA. Portaria nº 118, de 3 de outubro de 2022. Institui Procedimento Operacional Padrão (POP) para Estimativa dos Custos de Implantação e Manutenção de Projeto de Recuperação Ambiental nos Biomas Brasileiros, para Compor Valor Mínimo da Reparação por Danos Ambientais à Vegetação Nativa, em Processos Administrativos no âmbito do Ibama. Disponível em: &lt;https://www.ibama.gov.br/component/legislacao/?view=legislacao&amp;force=1&amp;legislacao=139171&gt;.</p>';
        html += '<p style="' + p + '">BRASIL. Ministério da Ciência, Tecnologia e Inovações. <em>Quarta Comunicação Nacional do Brasil à Convenção-Quadro das Nações Unidas sobre Mudança do Clima. Relatório de Referência: Setor Uso da Terra, Mudança do Uso da Terra e Florestas</em>. Brasília: MCTI, 2020. Tabelas 23 a 28.</p>';
        html += '<p style="' + p + '">CONSELHO DA JUSTIÇA FEDERAL. <em>Manual de orientação de procedimentos para os cálculos na Justiça Federal</em>. Brasília: CJF, 2026. Capítulo 4, item 4.2.</p>';
        html += '<p style="' + p + '">CONSELHO NACIONAL DE JUSTIÇA. <em>Protocolo para julgamento de ações ambientais: segundo escopo</em>. Brasília: CNJ, 2024. Recomendação CNJ 156/2024.</p>';
        if (r.lia) {
            html += '<p style="' + p + '">GONZAGA, Claudio Angelo Correa; ROQUETTE, José Guilherme; SILVA, Anelise Gomes da; SINISGALLI, Paulo Antonio de Almeida. Proposta de valoração do proveito econômico do ilícito ambiental. Trabalho submetido ao Simpósio Interdisciplinar de Ciência Ambiental da USP (SICAM), 2026. Não publicado.</p>';
        }
        var usaCaex = r.interino.metodo === 'caex' || r.residual.metodo === 'caex';
        if (usaCaex) {
            html += '<p style="' + p + '">MINISTÉRIO PÚBLICO DO ESTADO DE MATO GROSSO. Centro de Apoio Técnico à Execução Ambiental. <em>Nota Técnica n. 03, de 31 de maio de 2022</em>. Atualizada em 17 jan. 2024. Dispõe sobre metodologia padrão para valoração monetária dos danos ambientais causados por desmatamentos no Estado de Mato Grosso. Cuiabá: CAEx Ambiental, 2024.</p>';
        }
        if (r.residual.metodo === 'caex') {
            html += '<p style="' + p + '">MINISTÉRIO PÚBLICO DO ESTADO DE MATO GROSSO. Centro de Apoio Técnico à Execução Ambiental. <em>Relatório Técnico n. 963/2026</em> (SAT 77578). Cuiabá: CAEx Ambiental, 2026.</p>';
        } else {
            html += '<p style="' + p + '">GONZAGA, Claudio Angelo Correa et al. DAMNUM: integração de todos os componentes do dano ambiental causado pelo desmatamento ilegal segundo a jurisprudência do STJ, com valoração hierárquica do dano residual. Trabalho submetido ao Simpósio Interdisciplinar de Ciência Ambiental da USP (SICAM), 2026. Não publicado.</p>';
            html += '<p style="' + p + '">MORENO-MATEOS, David et al. Structural and functional loss in restored wetland ecosystems. <em>PLoS Biology</em>, v. 10, n. 1, e1001247, 2012.</p>';
        }
        html += '<p style="' + p + '">POORTER, Lourens et al. Multidimensional tropical forest recovery. <em>Science</em>, v. 374, n. 6573, p. 1370-1376, 2021.</p>';
        if (usaCaex) {
            html += '<p style="' + p + '">TIMOTHEO et al. (2017), apud MINISTÉRIO PÚBLICO DO ESTADO DE MATO GROSSO, Nota Técnica n. 03/2022: custos de reposição florestal, atualizados pelo IPCA de 2017 a 2023.</p>';
        }
        html += '<p style="' + p + '">RICKE, Katharine et al. Country-level social cost of carbon. <em>Nature Climate Change</em>, v. 8, n. 10, p. 895-900, 2018. Disponível em: &lt;https://www.nature.com/articles/s41558-018-0282-y&gt;.</p>';
        return html;
    }

    function gerarHTML(r) {
        var html = '<div style="font-family: \'Times New Roman\', serif; font-size: 12pt; line-height: 1.6; color: #222; max-width: 760px;">';
        html += '<h2 style="text-align:center; font-size:14pt; margin-bottom:5px;">RELATÓRIO DE VALORAÇÃO DOS DANOS AMBIENTAIS DECORRENTES DE DESMATAMENTO ILEGAL</h2>';
        html += '<p style="text-align:center; font-size:11pt; color:#555;">Demonstrativo discriminado e atualizado (art. 524 do Código de Processo Civil)<br>DAMNUM v. ' + esc(r.versao) + ' — ' + data(r.dataCalculo) + '</p>';
        html += secaoIdentificacao(r);
        html += secaoReparacaoEmEspecie(r);
        html += secaoDemonstrativo(r);
        html += secaoTabelaMensal(r);
        html += secaoDescontosBensTotais(r);
        html += secaoAlternativo(r);
        html += secaoParametros(r);
        html += secaoMetadados(r);
        html += secaoAviso();
        html += secaoReferencias(r);
        return html + '</div>';
    }

    return { gerarHTML: gerarHTML, gerarCSV: gerarCSV, linhasMensais: linhasMensais };
});
