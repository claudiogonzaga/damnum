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
            linhas.push(linha('Parâmetros e fontes', num(r.areas.em, 4) + ' ha × ' + moeda(r.custo.valorHa) + '/ha × ' + num(it.fator, 4) + ', com i = ' + num(it.taxaPct, 2) + '% ao ano e t = ' + num(it.tempo, it.tempo % 1 ? 1 : 0) + ' anos' + (forma ? ' (' + forma + ')' : '') + '. ' + (caex
                ? 'A Nota adota como taxa a média da série histórica do IPCA de 1995 a 2023 (6,82%) e, como tempo de recuperação, 100 anos para floresta e 30 anos para cerrado. A Nota usa custos de reposição próprios (Timotheo et al., 2017); aqui a fórmula é aplicada ao custo de recuperação do DAMNUM (Portaria Ibama 118/2022).'
                : (it.estatisticas ? 'O tempo padrão é a mediana dos tempos de recuperação publicados (quadro abaixo).' : '') + ' Custo por hectare: o mesmo do dano material.')));
        }
        if (it.valorAreaFora > 0) {
            linhas.push(linha('Área fora de APP e reserva legal', num(r.areas.fora, 4) + ' ha × ' + moeda(r.custo.valorHa) + '/ha × ' + num(it.jurosAnoUm, 6) + ' (juros do ano 1, i ÷ (1 + i)) × ' + num(it.anosAteRegularizacao, 0) + ' anos entre o desmatamento e o pedido de regularização = ' + moeda(it.valorAreaFora) + ' (Nota Técnica, item 1.7). A própria Nota registra que há duas posições sobre a existência de dano indenizável nessa área.' + (r.parcelas.material.valor > 0 ? ' Atenção: neste cálculo a mesma área também recebe dano material; confira se as duas parcelas devem ser cumuladas.' : '')));
            if (temProtegida) linhas.push(linha('Área em APP e reserva legal', moeda(it.valorAreaProtegida)));
        }
        linhas.push(linha('Valor original e data-base', '<b>' + moeda(p.valor) + '</b>, em ' + C.rotuloMes(r.custo.mesReferencia)));
        linhas = linhas.concat(textoAtualizacaoPatrimonial(r, p));
        html += tabela(linhas);

        if (!caex && temProtegida && it.faixa && it.faixa.length) {
            var e = it.estatisticas;
            var th = TD + ' background:#f5f5f5;';
            html += '<p style="font-size:11pt; text-align:justify;"><b>Faixa do dano interino conforme o tempo de recuperação</b> (' + forma + '; taxa de ' + num(it.taxaPct, 2) + '% ao ano; valores na data-base, antes da atualização):</p>';
            html += '<table style="font-size:10pt; border-collapse:collapse; width:100%; border:1px solid #ccc;"><tr><th style="' + th + ' text-align:left;">Atributo recuperado</th><th style="' + th + ' text-align:left;">Fonte</th><th style="' + th + '">Tempo (anos)</th><th style="' + th + '">Dano interino</th></tr>';
            it.faixa.forEach(function (f) {
                html += '<tr><td style="' + TD + '">' + esc(f.atributo) + (f.nota ? ' <span style="color:#666;">(' + esc(f.nota) + ')</span>' : '') + '</td><td style="' + TD + '">' + esc(f.fonte) + '</td><td style="' + TDR + '">' + num(f.anos, 0) + '</td><td style="' + TDR + '">' + moeda(f.valor) + '</td></tr>';
            });
            function resumo(rotulo, anos, valor, destaque) {
                return '<tr style="background:' + (destaque ? '#e8f5e9' : '#fafafa') + ';"><td style="' + TD + '" colspan="2"><b>' + rotulo + '</b></td><td style="' + TDR + '"><b>' + num(anos, anos % 1 ? 1 : 0) + '</b></td><td style="' + TDR + '"><b>' + moeda(valor) + '</b></td></tr>';
            }
            html += resumo('Mínimo', e.minimo, e.valor_minimo) + resumo('Mediana', e.mediana, e.valor_mediana, true) + resumo('Máximo', e.maximo, e.valor_maximo) + '</table>';
            html += '<p style="font-size:10pt; color:#555; text-align:justify;">' + (it.tempo === e.mediana
                ? 'O valor adotado corresponde à mediana.'
                : 'O valor adotado usa t = ' + num(it.tempo, it.tempo % 1 ? 1 : 0) + ' anos, informado pelo usuário, e não a mediana.') +
                (e.quantidade === 1 ? ' Há um único tempo publicado para esta forma de vegetação; não há faixa.' : '') + '</p>';
        }
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

    function blocoEstoque(r) {
        var e = r.estoque;
        var html = subtitulo('Estoque de carbono');
        var linhas = [];
        linhas.push(linha('Origem do estoque', esc(e.descricaoOrigem)));
        if (e.sigla) linhas.push(linha('Fitofisionomia', esc(e.sigla) + ' — ' + esc(e.nome)));
        linhas.push(linha('Estoque de carbono', '<b>' + num(e.tC, 2) + ' tC/ha</b>'));
        linhas.push(linha('Emissão equivalente', num(e.tC, 2) + ' tC/ha × 3,67 = <b>' + num(C.carbonoParaCO2(e.tC), 2) + ' tCO₂/ha</b> (Protocolo para Julgamento de Ações Ambientais, 2º escopo, CNJ, 2024, p. 59, nota 31)'));
        linhas.push(linha('Fonte', esc(e.fonte)));
        if (e.regra) linhas.push(linha('Regra de média', esc(e.regra)));
        if (e.subvalores && e.subvalores.length) {
            linhas.push(linha('Subvalores da fitofisionomia', e.subvalores.map(function (s) {
                return esc(s.estado || s.local || '') + ': ' + num(s.total, 2) + ' tC/ha';
            }).join('; ')));
        }
        if (e.indicacaoIBGE) {
            var i = e.indicacaoIBGE;
            var escolha;
            if (i.tipo === 'formacao') escolha = i.escolhaEntreIndicadas ? ' O usuário manteve a fitofisionomia indicada.' : ' O usuário não adotou a fitofisionomia indicada.';
            else if (i.tipo === 'regiao') escolha = i.escolhaEntreIndicadas ? ' O usuário escolheu a formação entre as dessa região (faixa de ' + num(i.minimo, 2) + ' a ' + num(i.maximo, 2) + ' tC/ha).' : ' O usuário não escolheu formação dessa região (faixa de ' + num(i.minimo, 2) + ' a ' + num(i.maximo, 2) + ' tC/ha).';
            else escolha = '';
            linhas.push(linha('Indicação da fitofisionomia', 'Consulta ao mapa de vegetação do IBGE na coordenada de latitude ' + num(i.lat, 6) + ' e longitude ' + num(i.lon, 6) + ', em ' + esc(i.quando) + (i.legendaIBGE ? ' (legenda ' + esc(i.legendaIBGE) + ')' : '') + '. ' + esc(i.descricao) + escolha + ' A indicação vem do IBGE, e não do mapa do Quarto Inventário; o estoque é o da tabela. Fonte: ' + esc(i.fonte) + '.'));
        }
        html += tabela(linhas);
        if (e.mapa && e.mapa.tipo === 'poligono') {
            html += '<p style="font-size:11pt;">Área calculada do polígono: ' + num(e.mapa.area_ha, 4) + ' ha. Polígonos do Quarto Inventário cruzados:</p>';
            var cab = ['id', 'UF', 'Município', 'c_pret', 'cagrpret', 'Área de interseção (ha)', 'c_v_4i (tC/ha)'];
            html += '<table style="font-size:10pt; border-collapse:collapse; width:100%; border:1px solid #ccc;"><tr>' +
                cab.map(function (c) { return '<th style="' + TD + ' background:#f5f5f5;">' + c + '</th>'; }).join('') + '</tr>' +
                e.mapa.partes.map(function (p) {
                    return '<tr><td style="' + TD + '">' + esc(p.id) + '</td><td style="' + TD + '">' + esc(p.uf) + '</td><td style="' + TD + '">' + esc(p.mun_nome) + '</td><td style="' + TD + '">' + esc(p.c_pret) + '</td><td style="' + TD + '">' + esc(p.cagrpret) + '</td><td style="' + TDR + '">' + num(p.area_ha, 4) + '</td><td style="' + TDR + '">' + num(p.c_v_4i, 2) + '</td></tr>';
                }).join('') + '</table>';
            html += '<p style="font-size:11pt;">Média ponderada pela área: ' + num(e.mapa.estoque_tC_ha, 2) + ' tC/ha. Parte do polígono fora da cobertura do mapa: ' + num(e.mapa.pct_descoberto, 2) + '%' + (e.mapa.pct_descoberto > 0.005 ? ', à qual se aplicou ' + esc(e.reservaDescoberta) + '.' : '.') + '</p>';
        }
        if (e.mapa && e.mapa.tipo === 'coordenada') {
            html += '<p style="font-size:11pt;">Coordenada: latitude ' + num(e.mapa.lat, 6) + ', longitude ' + num(e.mapa.lon, 6) + '. Polígono do Inventário: id ' + esc(e.mapa.poligono.id) + ', ' + esc(e.mapa.poligono.mun_nome) + '/' + esc(e.mapa.poligono.uf) + ', c_pret ' + esc(e.mapa.poligono.c_pret) + ' (' + esc(e.mapa.poligono.cagrpret) + ').</p>';
            var aviso = esc(e.mapa.aviso);
            if (e.mapa.vizinhas.length) {
                aviso += ' Classes a menos de 100 m do ponto: ' + e.mapa.vizinhas.map(function (v) {
                    return esc(v.c_pret) + ' (' + num(v.c_v_4i, 2) + ' tC/ha, a ' + num(v.distancia_m, 0) + ' m)';
                }).join('; ') + '.';
            }
            html += nota(aviso);
        }
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
        html += blocoMaterial(r) + blocoInterino(r) + blocoEstoque(r);
        html += blocoCarbono(r, 'mercado', '2.3', 'Dano extrapatrimonial (mercado voluntário de carbono)', 'Preço no mercado voluntário', r.parametros.precoMercadoCO2USD, r.parametros.precoMercadoCO2BRL, 'piso do Fundo Amazônia, Protocolo do CNJ, 2024, p. 66');
        html += blocoCarbono(r, 'social', '2.4', 'Dano climático (custo social do carbono)', 'Custo social do carbono', r.parametros.precoSocialCO2USD, r.parametros.precoSocialCO2BRL, 'cenário SSP2/RCP6.0, Ricke et al., 2018');
        r.avisosPiso.forEach(function (a) { html += nota(esc(a)); });
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
        [['Dano material', p.material], ['Dano interino', p.interino], ['Dano extrapatrimonial (mercado voluntário)', p.mercado], ['Dano climático (custo social do carbono)', p.social]].forEach(function (par) {
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
        [['Dano material', a.material], ['Dano interino', a.interino], ['Dano extrapatrimonial (mercado voluntário)', r.parcelas.mercado], ['Dano climático (custo social do carbono)', r.parcelas.social]].forEach(function (par) {
            html += '<tr><td style="' + TD + '">' + par[0] + '</td><td style="' + TDR + '">' + moeda(par[1].valor) + '</td><td style="' + TDR + '">' + moeda(par[1].total) + '</td></tr>';
        });
        html += '<tr style="background:#f0f7f0;"><td style="' + TD + '"><b>Total</b></td><td style="' + TDR + '"><b>' + moeda(a.totalOriginal) + '</b></td><td style="' + TDR + '"><b>' + moeda(a.totalAtualizado) + '</b></td></tr></table>';
        return html;
    }

    function secaoCenarios(r) {
        var p = r.parcelas;
        var html = titulo('CENÁRIOS QUANTO À REPARAÇÃO');
        html += '<p><b>1) Hipótese da recuperação da área desmatada (recuperação <em>in situ</em>):</b></p>';
        html += '<p style="text-align:justify;">Quando houver recuperação da área desmatada (recuperação <em>in situ</em>) por danos em área de reserva legal (ARL), área de preservação permanente (APP) ou áreas excedentes caso ele opte pela reparação <em>in natura</em> e <em>in situ</em>, o degradador deverá indenizar os danos interinos no valor de ' + moeda(p.interino.valor) + ' (além de indenizar os danos extrapatrimoniais). Neste cenário, o proprietário deverá apresentar e executar Projeto de Recuperação de Áreas Degradadas (PRADA) ou laudo de constatação de reparação do dano ambiental. Alternativamente, a parte requerida poderá realizar a compensação ecológica do dano interino e extrapatrimonial (veja a seguir).</p>';
        html += '<p><b>2) Hipótese da não recuperação da área ilegalmente desmatada (desmatamento ilegal fora de ARL e APP a ser regularizado):</b></p>';
        html += '<p style="text-align:justify;">Quando não houver reparação <em>in situ</em> (área passível de exploração), deverá ser realizada a compensação ecológica ou o pagamento de indenização, para que o proprietário possa regularizar a exploração da área. Neste caso, a valoração (dano material) é de ' + moeda(p.material.valor) + '. Também deverão ser reparados os danos climáticos, estimados em ' + moeda(p.social.valor) + ' e extrapatrimoniais (' + moeda(p.mercado.valor) + ').</p>';
        html += '<p><b>COMPENSAÇÃO ECOLÓGICA</b></p>';
        html += '<p style="text-align:justify;">Alternativamente, propõe-se a compensação ecológica dos danos materiais nos seguintes termos: instituição, no próprio imóvel ou imóvel de terceiro no mesmo bioma, estado da federação e preferencialmente, no mesmo município ou município contíguo, de RPPN, servidão ambiental perpétua ou aquisição e doação ao poder público de área em unidade de conservação igual à área ilegalmente desmatada (arredondada), isto é ' + Math.ceil(r.areas.fora) + ' hectares, remanescendo o pagamento de indenização por danos extrapatrimoniais (que poderá ser reduzido a critério do promotor de Justiça, conforme a relevância da área protegida a ser criada) no valor de ' + moeda(p.mercado.valor) + '.</p>';
        html += '<p style="text-align:justify;">O valor dos danos extrapatrimoniais remanescente também poderá ser reduzido com o aumento da área a ser protegida, descontando-se o valor dos custos médios de reparação para cada hectare adicional de vegetação nativa no montante do dano extrapatrimonial (isto é, ' + moeda(r.custo.valorHa) + ' por hectare fora de ARL acrescentado na RPPN além da área desmatada).</p>';
        html += '<p><b>Regras para a instituição de RPPN (ou servidão ambiental perpétua):</b></p>';
        html += '<p style="text-align:justify;">1) A RPPN deverá abranger a área de reserva legal do imóvel, embora a ARL abrangida não será computada para fins da compensação ecológica;<br>';
        html += '2) A área protegida deverá, salvo absoluta impossibilidade, (2.1) consistir-se de um único bloco de vegetação nativa e (2.2) ser lindeira à área de reserva legal ou área de preservação permanente existente no imóvel, visando diminuir os efeitos da fragmentação de habitats e efeitos de borda.</p>';
        html += '<p style="text-align:justify;">Na hipótese de RPPN, toda a área protegida continuará sendo de propriedade da parte requerida, que poderá aferir renda com a venda de créditos de carbono e cotas de reserva ambiental (CRA) para imóveis com déficit de áreas de reserva legal.</p>';
        return html;
    }

    // ---------- 7 e 8 ----------

    function secaoMetadados(r) {
        var linhas = [];
        linhas.push(linha('Versão do DAMNUM', esc(r.versao) + ' — <a href="' + SITE + '/" target="_blank" style="color:#1a5276;">' + SITE + '</a>'));
        linhas.push(linha('Data e hora do cálculo', r.dataCalculo.toLocaleString('pt-BR')));
        linhas.push(linha('Entendimento escolhido', nomeEntendimento(r.entendimento)));
        linhas.push(linha('Fitofisionomia e fonte do estoque', (r.estoque.sigla ? esc(r.estoque.sigla) + ' — ' + esc(r.estoque.nome) + '. ' : '') + esc(r.estoque.descricaoOrigem) + ' (' + num(r.estoque.tC, 2) + ' tC/ha)'));
        linhas.push(linha('Método do dano interino', r.interino.metodo === 'caex' ? 'Nota Técnica 03/2022 do CAEx Ambiental/MPMT (Roquette)' : 'Gonzaga et al. (2025)'));
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
        if (r.interino.metodo === 'caex') {
            html += '<p style="' + p + '">MINISTÉRIO PÚBLICO DO ESTADO DE MATO GROSSO. Centro de Apoio Técnico à Execução Ambiental. <em>Nota Técnica n. 03, de 31 de maio de 2022</em>. Atualizada em 17 jan. 2024. Dispõe sobre metodologia padrão para valoração monetária dos danos ambientais causados por desmatamentos no Estado de Mato Grosso. Cuiabá: CAEx Ambiental, 2024.</p>';
        } else if (r.interino.faixa && r.interino.faixa.length) {
            (r.interino.referencias || []).forEach(function (ref) { html += '<p style="' + p + '">' + esc(ref) + '</p>'; });
        }
        html += '<p style="' + p + '">RICKE, Katharine et al. Country-level social cost of carbon. <em>Nature Climate Change</em>, v. 8, n. 10, p. 895-900, 2018. Disponível em: &lt;https://www.nature.com/articles/s41558-018-0282-y&gt;.</p>';
        return html;
    }

    function gerarHTML(r) {
        var html = '<div style="font-family: \'Times New Roman\', serif; font-size: 12pt; line-height: 1.6; color: #222; max-width: 760px;">';
        html += '<h2 style="text-align:center; font-size:14pt; margin-bottom:5px;">RELATÓRIO DE VALORAÇÃO DOS DANOS AMBIENTAIS DECORRENTES DE DESMATAMENTO ILEGAL</h2>';
        html += '<p style="text-align:center; font-size:11pt; color:#555;">Demonstrativo discriminado e atualizado (art. 524 do Código de Processo Civil)<br>DAMNUM v. ' + esc(r.versao) + ' — ' + data(r.dataCalculo) + '</p>';
        html += secaoIdentificacao(r);
        html += secaoDemonstrativo(r);
        html += secaoTabelaMensal(r);
        html += secaoDescontosBensTotais(r);
        html += secaoAlternativo(r);
        html += secaoCenarios(r);
        html += secaoMetadados(r);
        html += secaoAviso();
        html += secaoReferencias(r);
        return html + '</div>';
    }

    return { gerarHTML: gerarHTML, gerarCSV: gerarCSV, linhasMensais: linhasMensais };
});
