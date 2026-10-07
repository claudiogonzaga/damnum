// Função para converter número para algarismo romano
function converterParaRomano(num) {
    if (num === 0) return 'I';
    const valores = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const simbolos = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
    
    let resultado = '';
    for (let i = 0; i < valores.length; i++) {
        while (num >= valores[i]) {
            resultado += simbolos[i];
            num -= valores[i];
        }
    }
    return resultado;
}

// URL do Google Apps Script para o contador global
const CONTADOR_API_URL = "https://script.google.com/macros/s/AKfycbzeD3w1Z4U5XdfM-9hod7pjNjZAwL4zTDK37P-3csJO9MVrd54naMkkZM1QwcjaAOl90Q/exec";

// Registra uma valoração na planilha do contador global. Envia só o bioma e a
// área; o parâmetro `ip` segue com valor fixo para não alterar a estrutura da
// planilha. Nenhum dado pessoal é coletado.
async function registrarValoracaoGlobal(bioma, area) {
    try {
        // Iframe oculto para fazer a requisição (evita problemas de CORS)
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `${CONTADOR_API_URL}?bioma=${encodeURIComponent(bioma)}&area=${encodeURIComponent(area)}&ip=${encodeURIComponent('anônimo')}`;
        document.body.appendChild(iframe);

        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 5000);

        // O contador já foi incrementado por quem chamou (calcularValoracao);
        // não incrementar de novo aqui, sob pena de contar duas vezes.
        setTimeout(obterTotalGlobal, 2000);
    } catch (error) {
        console.error("Erro ao registrar valoração global:", error);
    }
}

// Função para obter o total atual de valorações da planilha
async function obterTotalGlobal() {
    try {
        const response = await fetch(CONTADOR_API_URL);
        const texto = await response.text();

        let data;
        try {
            data = JSON.parse(texto);
        } catch (erroJson) {
            // O Apps Script devolve uma página HTML de erro quando quebra;
            // sem esta checagem o JSON.parse estouraria silenciosamente.
            console.error('Contador global: resposta não é JSON (Apps Script com erro?):', texto.slice(0, 300));
            return contadorExibido;
        }

        if (data && data.total !== undefined) {
            return definirContador(data.total);
        }
        console.error('Contador global: resposta sem campo "total":', data);
    } catch (error) {
        console.error('Erro ao obter total global de valorações:', error);
    }

    return contadorExibido;
}

const VERSAO_DAMNUM = '7.0';

// Mapeamento de biomas para imagens
const biomaParaImagem = {
    'CERRADO': 'images/biomas/cerrado.jpg',
    'FLORESTA AMAZÔNICA': 'images/biomas/amazonia.jpg',
    'PANTANAL MATO-GROSSENSE': 'images/biomas/pantanal.jpg',
    'CAATINGA': 'images/biomas/caatinga.jpg',
    'PAMPAS': 'images/biomas/pampas.jpg',
    'MATA ATLÂNTICA': 'images/biomas/mata_atlantica.jpg'
};

// Imagens dos biomas para slideshow
const imagensBiomas = [
    'images/biomas/cerrado.jpg',
    'images/biomas/amazonia.jpg',
    'images/biomas/mata_atlantica.jpg',
    'images/biomas/pantanal.jpg',
    'images/biomas/caatinga.jpg',
    'images/biomas/pampas.jpg'
];

let slideshowAtivo = true;
let indiceSlideshowAtual = 0;
let intervalSlideshow;

// Gerenciamento de Cookies
function verificarCookies() {
    const cookieConsent = localStorage.getItem('cookieConsent');
    if (!cookieConsent) {
        setTimeout(() => {
            document.getElementById('cookieBar').style.display = 'block';
        }, 1000);
    }
}

function aceitarCookies() {
    localStorage.setItem('cookieConsent', 'accepted');
    document.getElementById('cookieBar').style.display = 'none';
}

function rejeitarCookies() {
    localStorage.setItem('cookieConsent', 'rejected');
    // Limpar qualquer dado armazenado
    localStorage.removeItem('contadorValoracoes');
    document.getElementById('cookieBar').style.display = 'none';
    // Recarregar página para aplicar mudanças
    location.reload();
}

// Contador de Valorações
//
// `contadorExibido` é a única fonte de verdade do número na tela. O total de
// valorações do site não é dado pessoal, então a exibição nunca depende do
// consentimento de cookies — só a gravação do backup em localStorage depende.
let contadorExibido = 0;

function obterContadorValoracoes() {
    return contadorExibido;
}

function definirContador(valor) {
    contadorExibido = parseInt(valor, 10) || 0;
    if (localStorage.getItem('cookieConsent') === 'accepted') {
        localStorage.setItem('contadorValoracoes', String(contadorExibido));
    }
    atualizarExibicaoContador();
    return contadorExibido;
}

function incrementarContador() {
    return definirContador(contadorExibido + 1);
}

function restaurarContadorLocal() {
    if (localStorage.getItem('cookieConsent') === 'accepted') {
        contadorExibido = parseInt(localStorage.getItem('contadorValoracoes') || '0', 10) || 0;
    }
    atualizarExibicaoContador();
}

function atualizarExibicaoContador() {
    document.getElementById('contadorValoracao').textContent = contadorExibido;
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

function iniciarSlideshow() {
    if (!slideshowAtivo || imagensBiomas.length === 0) return;
    
    intervalSlideshow = setInterval(() => {
        if (slideshowAtivo) {
            indiceSlideshowAtual = (indiceSlideshowAtual + 1) % imagensBiomas.length;
            const imagemAtual = imagensBiomas[indiceSlideshowAtual];
            atualizarImagemSlideshow(imagemAtual);
        }
    }, 3000); // Muda a cada 3 segundos
}

function pararSlideshow() {
    slideshowAtivo = false;
    if (intervalSlideshow) {
        clearInterval(intervalSlideshow);
    }
}

function atualizarImagemSlideshow(imagemSrc) {
    const biomaImage = document.getElementById('biomaImage');
    
    biomaImage.style.opacity = '0';
    setTimeout(() => {
        biomaImage.src = imagemSrc;
        biomaImage.alt = 'Biomas Brasileiros';
        biomaImage.style.opacity = '1';
    }, 250);
}

function atualizarImagemBioma(bioma) {
    if (bioma && biomaParaImagem[bioma]) {
        pararSlideshow();

        const biomaImage = document.getElementById('biomaImage');

        biomaImage.style.opacity = '0';
        setTimeout(() => {
            biomaImage.src = biomaParaImagem[bioma];
            biomaImage.alt = `Bioma ${bioma}`;
            biomaImage.style.opacity = '1';
        }, 250);
    } else {
        // Voltar ao slideshow se nenhum bioma selecionado
        slideshowAtivo = true;
        iniciarSlideshow();
    }
}

function obterEntendimento() {
    const el = document.getElementById('entendimento');
    return el ? el.value : 'gonzaga';
}

// Data do dano informada no formulário, ou null.
function obterDataDano() {
    const input = document.getElementById('dataDano');
    if (input && input.value) {
        const partes = input.value.split('-');
        return new Date(partes[0], partes[1] - 1, partes[2]);
    }
    return null;
}

function numeroBR(valor, casas) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(valor);
}

function valorCampo(id) {
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
}

// ============================================================
// ESTOQUE DE CARBONO (Quarto Inventário Nacional)
// ============================================================

let tabelaQCN = null;      // data/estoques_qcn_fitofisionomias.json
let consultaMapa = null;   // resultado da consulta ao mapa por estado (polígono ou coordenada)
let poligonoUsuario = null;
let consultaIBGE = null;
let temposRecuperacao = null; // data/tempos_recuperacao.json (dano interino)   // indicação da fitofisionomia pelo mapa de vegetação do IBGE

async function carregarTabelaQCN() {
    try {
        const resposta = await fetch('data/estoques_qcn_fitofisionomias.json');
        if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
        tabelaQCN = await resposta.json();
        preencherFitofisionomias(document.getElementById('bioma').value);
    } catch (erro) {
        console.error('Erro ao carregar a tabela de estoques do QCN:', erro);
        document.getElementById('origemEstoque').textContent = 'Não foi possível carregar a tabela de estoques. Recarregue a página ou informe o estoque do caso.';
    }
}

async function carregarTemposRecuperacao() {
    try {
        const resposta = await fetch('data/tempos_recuperacao.json');
        if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
        temposRecuperacao = await resposta.json();
        atualizarPadroesInterino(true);
    } catch (erro) {
        console.error('Erro ao carregar os tempos de recuperação:', erro);
        document.getElementById('notaTempoRecuperacao').textContent = 'Não foi possível carregar os tempos de recuperação publicados. Informe o tempo.';
    }
}

// Ajusta a forma da vegetação, a taxa e o tempo do dano interino aos padrões do
// método escolhido. Campos que o usuário alterou só voltam ao padrão com `forcar`
// (troca de método).
function atualizarPadroesInterino(forcar) {
    const metodo = valorCampo('metodoInterino');
    const bioma = document.getElementById('bioma').value;
    const campoForma = document.getElementById('formaVegetacao');
    const campoTaxa = document.getElementById('taxaJurosAnual');
    const campoTempo = document.getElementById('tempoRecuperacao');
    if (bioma && !campoForma.dataset.editado) {
        campoForma.value = DamnumValoracao.formaDaVegetacao(tabelaQCN, bioma, valorCampo('fitofisionomia'));
    }
    document.getElementById('itemAnosRegularizacao').style.display = metodo === 'caex' ? '' : 'none';
    document.getElementById('notaMetodoInterino').textContent = metodo === 'caex'
        ? 'Custo × Σ i ÷ (1 + i)ᵃ, do ano 1 ao ano t. Taxa: média do IPCA de 1995 a 2023.'
        : 'Custo × i × (t + 1) ÷ 2. Método padrão, do artigo do SICAM.';
    if (!temposRecuperacao) return;
    const padrao = DamnumValoracao.interinoPadrao(metodo, campoForma.value, temposRecuperacao);
    if (forcar || !campoTaxa.dataset.editado) { campoTaxa.value = padrao.taxaPct; delete campoTaxa.dataset.editado; }
    if (forcar || !campoTempo.dataset.editado) { campoTempo.value = padrao.tempo; delete campoTempo.dataset.editado; }
    const nota = document.getElementById('notaTempoRecuperacao');
    if (metodo === 'caex') {
        nota.textContent = 'Nota Técnica 03/2022: 100 anos para floresta e 30 anos para cerrado.';
    } else {
        const f = DamnumCalc.faixaDeTempos(padrao.pontos);
        nota.textContent = f.quantidade > 1
            ? 'Tempos publicados: de ' + numeroBR(f.minimo, 0) + ' a ' + numeroBR(f.maximo, 0) + ' anos (' + f.quantidade + ' estimativas). Padrão: a mediana, ' + numeroBR(f.mediana, f.mediana % 1 ? 1 : 0) + ' anos. O relatório mostra toda a faixa.'
            : 'Um único tempo publicado para esta forma de vegetação: ' + numeroBR(f.mediana, 0) + ' anos.';
    }
    validarTaxaInterino();
}

// Configuração do dano interino a partir dos campos da tela.
function lerInterino() {
    const metodo = valorCampo('metodoInterino');
    const forma = valorCampo('formaVegetacao');
    return {
        metodo,
        forma,
        pontos: temposRecuperacao ? temposRecuperacao.formas[forma].pontos : [],
        referencias: temposRecuperacao ? temposRecuperacao.referencias : [],
        taxaPct: parseFloat(valorCampo('taxaJurosAnual')),
        tempo: parseFloat(valorCampo('tempoRecuperacao')),
        anosAteRegularizacao: metodo === 'caex' ? (parseFloat(valorCampo('anosRegularizacao')) || 0) : 0
    };
}

function preencherFitofisionomias(bioma, manterIBGE) {
    const select = document.getElementById('fitofisionomia');
    if (!manterIBGE) {
        consultaIBGE = null;
        document.getElementById('resultadoIBGE').style.display = 'none';
    }
    document.getElementById('grupoIBGE').style.display = bioma && tabelaQCN ? '' : 'none';
    const mostrar = !!(bioma && tabelaQCN);
    document.getElementById('grupoFitofisionomia').style.display = mostrar ? '' : 'none';
    document.getElementById('grupoEstoqueUsuario').style.display = bioma ? '' : 'none';
    document.getElementById('grupoLocalizacao').style.display = bioma && DamnumMapa.MAPA_QCN_ATIVO ? '' : 'none';
    select.innerHTML = '';
    if (mostrar) {
        const dados = tabelaQCN.biomas[DamnumValoracao.BIOMA_QCN[bioma]];
        const padrao = document.createElement('option');
        padrao.value = '';
        padrao.textContent = 'Não sei / média do bioma (QCN): ' + numeroBR(dados.media_ponderada_tC_ha, 2) + ' tC/ha';
        select.appendChild(padrao);
        const criarOpcao = (f, i) => {
            const opcao = document.createElement('option');
            opcao.value = String(i);
            opcao.textContent = f.sigla + ' — ' + f.nome + ' (' + numeroBR(f.total_tC_ha, 2) + ' tC/ha)';
            return opcao;
        };
        // Linhas indicadas pelo IBGE para a coordenada, no topo da lista.
        const indicadas = consultaIBGE ? consultaIBGE.candidatas.map(c => c.indice) : [];
        let destino = select;
        if (indicadas.length) {
            const grupo = document.createElement('optgroup');
            grupo.label = 'Indicadas pelo IBGE para a coordenada';
            indicadas.forEach(i => grupo.appendChild(criarOpcao(dados.fitofisionomias[i], i)));
            select.appendChild(grupo);
            destino = document.createElement('optgroup');
            destino.label = 'Demais fitofisionomias do bioma';
            select.appendChild(destino);
        }
        dados.fitofisionomias.forEach((f, i) => {
            if (typeof f.total_tC_ha !== 'number' || indicadas.indexOf(i) !== -1) return;
            destino.appendChild(criarOpcao(f, i));
        });
    }
    atualizarPainelEstoque();
    atualizarPadroesInterino(false);
}

// Decide o estoque do caso pela ordem de reserva: (4) informado pelo usuário,
// que prevalece; (1) mapa por estado; (2) fitofisionomia; (3) média do bioma.
// Lança Error com mensagem para o usuário se faltar dado obrigatório.
function resolverEstoque(bioma) {
    const secundaria = document.getElementById('vegetacaoSecundaria').checked;
    let estoque;
    if (document.getElementById('usarEstoqueUsuario').checked) {
        const tC = parseFloat(valorCampo('estoqueUsuario'));
        const fonte = valorCampo('fonteEstoqueUsuario');
        if (!(tC > 0)) throw new Error('Informe o estoque de carbono do caso, em tC/ha, ou desmarque a opção.');
        if (!fonte) throw new Error('Informe a fonte do estoque de carbono informado.');
        estoque = DamnumValoracao.estoqueDoUsuario(tC, fonte);
    } else {
        if (!tabelaQCN) throw new Error('A tabela de estoques de carbono não foi carregada. Recarregue a página ou informe o estoque do caso.');
        const tabela = DamnumValoracao.estoqueDaTabela(tabelaQCN, bioma, valorCampo('fitofisionomia'));
        if (consultaMapa && typeof consultaMapa.estoque_tC_ha === 'number') {
            estoque = DamnumValoracao.estoqueDoMapa(consultaMapa, tabela);
        } else {
            estoque = tabela;
            if (consultaIBGE) {
                estoque.indicacaoIBGE = Object.assign({}, consultaIBGE, {
                    escolhaEntreIndicadas: consultaIBGE.candidatas.some(c => String(c.indice) === valorCampo('fitofisionomia'))
                });
            }
        }
    }
    estoque.secundaria = secundaria;
    return estoque;
}

function atualizarPainelEstoque() {
    const bioma = document.getElementById('bioma').value;
    const campoEstoque = document.getElementById('estoqueCarbono');
    const campoEmissao = document.getElementById('emissaoEquivalente');
    const origem = document.getElementById('origemEstoque');
    document.getElementById('camposEstoqueUsuario').style.display = document.getElementById('usarEstoqueUsuario').checked ? '' : 'none';
    document.getElementById('avisoSecundaria').style.display = document.getElementById('vegetacaoSecundaria').checked ? '' : 'none';
    const custo = document.getElementById('custoRecuperacao');
    custo.value = bioma ? formatarMoeda(DamnumValoracao.CUSTOS_PORTARIA_118[bioma].media) : '';
    try {
        if (!bioma) throw new Error('Selecione o bioma.');
        const e = resolverEstoque(bioma);
        campoEstoque.value = numeroBR(e.tC, 2);
        campoEmissao.value = numeroBR(DamnumCalc.carbonoParaCO2(e.tC), 2);
        origem.textContent = 'Origem: ' + e.descricaoOrigem + '.';
    } catch (erro) {
        campoEstoque.value = '';
        campoEmissao.value = '';
        origem.textContent = erro.message;
    }
}

// ============================================================
// INDICAÇÃO DA FITOFISIONOMIA PELO MAPA DE VEGETAÇÃO DO IBGE
// Solução provisória enquanto o mapa do Quarto Inventário não está disponível.
// ============================================================

async function consultarVegetacaoIBGE() {
    const bioma = document.getElementById('bioma').value;
    const saida = document.getElementById('resultadoIBGE');
    const lat = parseFloat(valorCampo('ibgeLatitude'));
    const lon = parseFloat(valorCampo('ibgeLongitude'));
    saida.style.display = '';
    if (isNaN(lat) || isNaN(lon) || lat < -34 || lat > 6 || lon < -74 || lon > -34) {
        saida.textContent = 'Informe latitude e longitude em graus decimais, dentro do Brasil (ex.: -12.5 e -55.5).';
        return;
    }
    const botao = document.getElementById('btnConsultarIBGE');
    botao.disabled = true;
    saida.textContent = 'Consultando o IBGE...';
    try {
        const props = await DamnumIBGE.consultarPonto(lon, lat);
        const fitofisionomias = tabelaQCN.biomas[DamnumValoracao.BIOMA_QCN[bioma]].fitofisionomias;
        const r = DamnumIBGE.interpretar(props, fitofisionomias);
        r.lat = lat;
        r.lon = lon;
        r.quando = new Date().toLocaleString('pt-BR');
        r.fonte = DamnumIBGE.FONTE;
        consultaIBGE = r;
        preencherFitofisionomias(bioma, true);
        let texto = r.descricao;
        if (r.tipo === 'formacao') {
            document.getElementById('fitofisionomia').value = String(r.candidatas[0].indice);
            texto += ' A fitofisionomia foi selecionada na lista; confira.';
        } else if (r.tipo === 'regiao') {
            texto += ' Formações dessa região na tabela: ' + r.candidatas.map(c => c.sigla + ' (' + numeroBR(c.tC, 2) + ' tC/ha)').join('; ') + '. Faixa: de ' + numeroBR(r.minimo, 2) + ' a ' + numeroBR(r.maximo, 2) + ' tC/ha. Escolha a formação na lista acima; sem escolha, vale a média do bioma.';
        }
        saida.textContent = texto;
    } catch (erro) {
        consultaIBGE = null;
        saida.textContent = 'Não foi possível consultar o IBGE (' + erro.message + '). Escolha a fitofisionomia na lista ou use a média do bioma.';
    } finally {
        botao.disabled = false;
    }
    atualizarPainelEstoque();
}

// ============================================================
// MAPA DO QUARTO INVENTÁRIO POR ESTADO (item 1.6-A)
// Só é usado com DamnumMapa.MAPA_QCN_ATIVO = true.
// ============================================================

let fonteMapa = null;
async function obterFonteMapa() {
    const libs = await DamnumMapa.carregarLibs();
    if (!fonteMapa) fonteMapa = DamnumMapa.criarFontePMTiles(libs, new URL(DamnumMapa.URL_PMTILES, location.href).href);
    return { libs, fonte: fonteMapa };
}

async function versaoDoMapa(fonte) {
    try {
        const m = await fonte.metadados();
        const d = m.descricao || {};
        return [d.name, d.description, d.version].filter(Boolean).join('; ');
    } catch (erro) {
        return '';
    }
}

function areaDigitada() {
    return (parseFloat(valorCampo('areaForaAPP')) || 0) + (parseFloat(valorCampo('areaEmAPP')) || 0);
}

function atualizarDivergenciaArea() {
    const caixa = document.getElementById('divergenciaArea');
    if (!poligonoUsuario) { caixa.style.display = 'none'; return; }
    const d = DamnumMapa.divergenciaDeArea(poligonoUsuario.area_ha, areaDigitada());
    if (d && d.diverge) {
        document.getElementById('textoDivergenciaArea').textContent = 'A área calculada do polígono (' + numeroBR(poligonoUsuario.area_ha, 4) + ' ha) difere ' + numeroBR(d.relativa * 100, 2) + '% da área digitada (' + numeroBR(areaDigitada(), 4) + ' ha). Escolha qual prevalece:';
        caixa.style.display = '';
    } else {
        caixa.style.display = 'none';
    }
}

async function aoEscolherPoligono(evento) {
    const info = document.getElementById('infoPoligono');
    const arquivo = evento.target.files[0];
    poligonoUsuario = null;
    consultaMapa = null;
    if (!arquivo) { info.style.display = 'none'; atualizarDivergenciaArea(); atualizarPainelEstoque(); return; }
    info.style.display = '';
    info.textContent = 'Lendo o polígono...';
    try {
        const { libs, fonte } = await obterFonteMapa();
        const geo = await DamnumMapa.lerArquivoGeometria(libs, arquivo);
        const consulta = await DamnumMapa.consultarPoligono(libs, fonte, geo, DamnumCalc.mediaPonderadaPorArea);
        consulta.versaoMapa = await versaoDoMapa(fonte);
        poligonoUsuario = { area_ha: consulta.area_ha };
        let texto = 'Área calculada do polígono: ' + numeroBR(consulta.area_ha, 4) + ' ha (método geodésico). ';
        if (typeof consulta.estoque_tC_ha === 'number') {
            consultaMapa = consulta;
            texto += 'Estoque médio pelo mapa: ' + numeroBR(consulta.estoque_tC_ha, 2) + ' tC/ha, em ' + consulta.partes.length + ' polígono(s) do Inventário.';
            if (consulta.pct_descoberto > 0.005) texto += ' ' + numeroBR(consulta.pct_descoberto, 2) + '% do polígono está fora da cobertura do mapa; nessa parte vale a tabela.';
        } else {
            texto += 'O polígono está fora da cobertura do mapa; vale a tabela por fitofisionomia ou a média do bioma.';
        }
        info.textContent = texto;
    } catch (erro) {
        info.textContent = 'Não foi possível usar o polígono: ' + erro.message;
    }
    atualizarDivergenciaArea();
    atualizarPainelEstoque();
}

async function aoInformarCoordenada() {
    const aviso = document.getElementById('avisoCoordenada');
    if (poligonoUsuario) return; // o polígono prevalece sobre a coordenada
    const lat = parseFloat(valorCampo('latitude'));
    const lon = parseFloat(valorCampo('longitude'));
    consultaMapa = null;
    if (isNaN(lat) || isNaN(lon)) { aviso.style.display = 'none'; atualizarPainelEstoque(); return; }
    aviso.style.display = '';
    aviso.textContent = 'Consultando o mapa...';
    try {
        const { libs, fonte } = await obterFonteMapa();
        const consulta = await DamnumMapa.consultarPonto(libs, fonte, lon, lat);
        consulta.versaoMapa = await versaoDoMapa(fonte);
        if (consulta.poligono) {
            consultaMapa = consulta;
            let texto = consulta.aviso + ' Estoque no ponto: ' + numeroBR(consulta.estoque_tC_ha, 2) + ' tC/ha (' + consulta.poligono.c_pret + ').';
            if (consulta.vizinhas.length) {
                texto += ' Classes a menos de 100 m: ' + consulta.vizinhas.map(v => v.c_pret + ' (' + numeroBR(v.c_v_4i, 2) + ' tC/ha)').join('; ') + '.';
            }
            aviso.textContent = texto;
        } else {
            aviso.textContent = 'A coordenada está fora da cobertura do mapa; vale a tabela por fitofisionomia ou a média do bioma.';
        }
    } catch (erro) {
        aviso.textContent = 'Não foi possível consultar o mapa: ' + erro.message;
    }
    atualizarPainelEstoque();
}

// ============================================================
// PARÂMETROS
// ============================================================

let origemCotacao = 'valor padrão da calculadora';

function obterParametrosAtuais() {
    return {
        precoSocialCO2USD: parseFloat(valorCampo('precoSocialCO2USD')),
        precoMercadoCO2USD: parseFloat(valorCampo('precoMercadoCO2USD')),
        cotacaoDolar: parseFloat(valorCampo('cotacaoDolar')),
        origemCotacao: origemCotacao
    };
}

function atualizarAvisosDePiso() {
    [['precoSocialCO2USD', 'avisoPisoSocial', 'custo social do carbono'], ['precoMercadoCO2USD', 'avisoPisoMercado', 'preço no mercado voluntário']].forEach(([campo, aviso, rotulo]) => {
        const valor = parseFloat(valorCampo(campo));
        const el = document.getElementById(aviso);
        if (DamnumCalc.abaixoDoPisoCNJ(valor)) {
            el.textContent = DamnumValoracao.avisoPiso(rotulo, valor);
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    });
}

function validarTaxaInterino() {
    const taxa = parseFloat(valorCampo('taxaJurosAnual'));
    const valida = DamnumCalc.validarTaxaInterino(taxa);
    document.getElementById('avisoTaxaInterino').style.display = valida ? 'none' : '';
    return valida ? taxa : null;
}

async function sha256(texto) {
    if (!(window.crypto && crypto.subtle)) return 'indisponível neste navegador';
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function baixarRelatorioPDF() {
    var conteudo = document.getElementById('textoRelatorio').innerHTML;
    if (!conteudo || !conteudo.trim()) {
        alert('Gere o relatório primeiro clicando em "Calcular Valoração".');
        return;
    }

    var dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    var nomeArquivo = 'DAMNUM_Relatorio_' + dataAtual;

    // Abre nova janela com o relatório formatado e dispara window.print().
    // O usuário escolhe "Salvar como PDF" no diálogo de impressão do navegador.
    var w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) {
        alert('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está desativado.');
        return;
    }

    var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">';
    html += '<title>' + nomeArquivo + '</title>';
    html += '<style>';
    html += '@page { size: A4; margin: 18mm 15mm; }';
    html += 'html, body { margin: 0; padding: 0; background: white; }';
    html += 'body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.6; color: #222; padding: 20px; }';
    html += 'h2 { font-size: 14pt; text-align: center; margin-bottom: 5px; }';
    html += 'h3 { font-size: 13pt; border-bottom: 2px solid #333; padding-bottom: 4px; margin-top: 18px; page-break-after: avoid; }';
    html += 'table { border-collapse: collapse; width: 100%; margin: 10px 0; }';
    html += 'tr { page-break-inside: avoid; }';
    html += 'table, th, td { border: 1px solid #ccc; }';
    html += 'th, td { padding: 6px 10px; }';
    html += 'p { text-align: justify; }';
    html += 'hr { border: 1px solid #999; }';
    html += 'a { color: #1a5276; text-decoration: none; }';
    html += '.no-print { display: none; }';
    html += '@media print { .no-print { display: none !important; } body { padding: 0; } }';
    html += '@media screen { .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #1a5276; color: white; padding: 12px; text-align: center; z-index: 9999; font-family: sans-serif; font-size: 14px; } .print-bar button { background: white; color: #1a5276; border: none; padding: 8px 18px; border-radius: 4px; font-weight: bold; cursor: pointer; margin-left: 12px; } body { padding-top: 60px; } }';
    html += '</style></head><body>';
    html += '<div class="print-bar no-print">Use "Salvar como PDF" no diálogo de impressão. <button onclick="window.print()">Imprimir / Salvar PDF</button></div>';
    html += conteudo;
    html += '<script>window.addEventListener("load", function() { setTimeout(function() { window.print(); }, 300); });<\/script>';
    html += '</body></html>';

    w.document.open();
    w.document.write(html);
    w.document.close();
}

function copiarRelatorio() {
    const elemento = document.getElementById('textoRelatorio');
    const htmlContent = elemento.innerHTML;
    const textoPlano = elemento.innerText;

    function mostrarCopiado() {
        var btn = document.getElementById('btnCopiar');
        var textoOriginal = btn.innerHTML;
        btn.innerHTML = '&#10003; Copiado!';
        btn.style.backgroundColor = '#27ae60';
        setTimeout(function() {
            btn.innerHTML = textoOriginal;
            btn.style.backgroundColor = '';
        }, 2000);
    }

    // Tentar copiar como HTML rico (mantém formatação ao colar no Word, Google Docs, etc.)
    try {
        const blobHtml = new Blob([htmlContent], { type: 'text/html' });
        const blobText = new Blob([textoPlano], { type: 'text/plain' });
        const clipboardItem = new ClipboardItem({
            'text/html': blobHtml,
            'text/plain': blobText
        });
        navigator.clipboard.write([clipboardItem]).then(function() {
            mostrarCopiado();
        }).catch(function() {
            // Fallback: copiar só texto
            navigator.clipboard.writeText(textoPlano).then(mostrarCopiado);
        });
    } catch (e) {
        // Fallback para navegadores que não suportam ClipboardItem
        navigator.clipboard.writeText(textoPlano).then(mostrarCopiado).catch(function() {
            var textarea = document.createElement('textarea');
            textarea.value = textoPlano;
            textarea.style.cssText = 'position:fixed;opacity:0;';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            mostrarCopiado();
        });
    }
}


let ultimoResultado = null;

function baixarTabelaCSV() {
    if (!ultimoResultado) return;
    const blob = new Blob([DamnumRelatorio.gerarCSV(ultimoResultado)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'DAMNUM_tabela_mensal_' + new Date().toLocaleDateString('pt-BR').replace(/\//g, '-') + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Fatores informados pelo usuário quando as séries oficiais falham.
// Devolve null se o painel não estiver preenchido.
function lerFatoresManuais() {
    if (document.getElementById('painelFatorManual').style.display === 'none') return null;
    const coeficiente = parseFloat(valorCampo('manualCoeficiente'));
    const jurosPatrimonial = parseFloat(valorCampo('manualJurosPatrimonial'));
    const jurosExtra = parseFloat(valorCampo('manualJurosExtra'));
    const fonte = valorCampo('manualFonte');
    if (isNaN(coeficiente) && isNaN(jurosPatrimonial) && isNaN(jurosExtra) && !fonte) return null;
    if (!(coeficiente > 0) || isNaN(jurosPatrimonial) || isNaN(jurosExtra) || !fonte) {
        throw new Error('Para usar fatores manuais, preencha o coeficiente de correção, os dois percentuais de juros e a fonte.');
    }
    return { coeficiente, jurosPatrimonial, jurosExtra, fonte };
}

function mostrarErroDeSeries(mensagem) {
    document.getElementById('textoErroSeries').textContent = mensagem;
    const painel = document.getElementById('painelFatorManual');
    painel.style.display = '';
    painel.scrollIntoView({ behavior: 'smooth' });
}

async function calcularValoracao() {
    const bioma = document.getElementById('bioma').value;
    let areaForaAPP = parseFloat(valorCampo('areaForaAPP')) || 0;
    let areaEmAPP = parseFloat(valorCampo('areaEmAPP')) || 0;

    if (!bioma) {
        alert('Por favor, selecione um bioma.');
        return;
    }
    if (areaForaAPP <= 0 && areaEmAPP <= 0) {
        alert('Por favor, informe pelo menos uma área desmatada.');
        return;
    }

    const taxaInterinoPct = validarTaxaInterino();
    if (taxaInterinoPct === null) {
        alert('A taxa de juros do dano interino deve ser informada em percentual, entre 0 e 30 (ex.: 6 para 6% ao ano).');
        return;
    }

    if (!(parseFloat(valorCampo('tempoRecuperacao')) >= 1)) {
        alert('Informe o tempo de recuperação da vegetação, em anos.');
        return;
    }

    const parametros = obterParametrosAtuais();
    if (!(parametros.cotacaoDolar > 0) || isNaN(parametros.precoSocialCO2USD) || isNaN(parametros.precoMercadoCO2USD)) {
        alert('Confira os preços do carbono e a cotação do dólar.');
        return;
    }

    const dataCalculo = new Date();
    const dataDano = obterDataDano();
    if (dataDano && dataDano > dataCalculo) {
        alert('A data do dano não pode ser futura.');
        return;
    }
    if (dataDano && DamnumCalc.mesDeData(dataDano) < DamnumCalc.MES_INICIO_IPCAE_MENSAL) {
        alert('O DAMNUM atualiza danos ocorridos a partir de janeiro de 2001. Para datas anteriores, os indexadores (Ufir e anteriores) não são calculados aqui.');
        return;
    }

    let estoque, manual;
    try {
        estoque = resolverEstoque(bioma);
        manual = lerFatoresManuais();
    } catch (erro) {
        alert(erro.message);
        return;
    }

    // Área do polígono, quando o usuário decide que ela prevalece sobre a digitada.
    let observacaoArea = '';
    if (poligonoUsuario) {
        const d = DamnumMapa.divergenciaDeArea(poligonoUsuario.area_ha, areaForaAPP + areaEmAPP);
        if (d && d.diverge) {
            const prevalece = document.querySelector('input[name="areaPrevalente"]:checked').value;
            observacaoArea = 'A área calculada do polígono (' + numeroBR(poligonoUsuario.area_ha, 4) + ' ha, método geodésico) difere ' + numeroBR(d.relativa * 100, 2) + '% da área digitada (' + numeroBR(areaForaAPP + areaEmAPP, 4) + ' ha). ';
            if (prevalece === 'calculada') {
                const escala = poligonoUsuario.area_ha / (areaForaAPP + areaEmAPP);
                areaForaAPP *= escala;
                areaEmAPP *= escala;
                observacaoArea += 'Por escolha do usuário, prevaleceu a área calculada; as áreas fora e dentro de APP e ARL foram ajustadas na mesma proporção.';
            } else {
                observacaoArea += 'Por escolha do usuário, prevaleceu a área digitada.';
            }
        }
    }

    var btnCalc = document.querySelector('.btn-calcular');
    var btnTextoOriginal = btnCalc.innerHTML;
    btnCalc.innerHTML = '<span class="btn-spinner"></span> Calculando...';
    btnCalc.disabled = true;
    btnCalc.style.opacity = '0.7';

    try {
        const mesCalculo = DamnumCalc.mesDeData(dataCalculo);
        const mesDano = dataDano ? DamnumCalc.mesDeData(dataDano) : mesCalculo;
        const atualizar = !!dataDano && mesDano < mesCalculo;

        const entrada = {
            versao: VERSAO_DAMNUM,
            bioma,
            entendimento: obterEntendimento(),
            dataCalculo,
            dataDano,
            areas: { fora: areaForaAPP, em: areaEmAPP, observacao: observacaoArea },
            reparacaoInSitu: document.getElementById('reparacaoInSitu').checked,
            interino: lerInterino(),
            parametros,
            estoque,
            opcaoExtrapatrimonial: valorCampo('jurosExtrapatrimoniais'),
            manual,
            numeroProcesso: valorCampo('numeroProcesso'),
            identificacao: {
                credorNome: valorCampo('credorNome'), credorDoc: valorCampo('credorDoc'),
                devedorNome: valorCampo('devedorNome'), devedorDoc: valorCampo('devedorDoc'),
                descontos: valorCampo('descontos'), bensPenhora: valorCampo('bensPenhora')
            }
        };

        const exigencias = DamnumValoracao.exigenciasDeSeries(mesDano, mesCalculo, atualizar);
        const carga = await DamnumSeries.carregarSeries(exigencias, mesCalculo);
        entrada.consultas = carga.consultas;
        entrada.hash = await sha256(DamnumValoracao.textoCanonico(entrada));

        let r;
        try {
            r = DamnumValoracao.calcular(entrada, carga.series);
        } catch (erro) {
            if (erro.name !== 'ErroSerie') throw erro;
            mostrarErroDeSeries(erro.message + ' Consultas feitas: ' + carga.consultas.map(c => c.serie + ' — ' + c.fonte + ': ' + c.situacao).join('; ') + '.');
            return;
        }
        if (!manual) document.getElementById('painelFatorManual').style.display = 'none';

        // Contador: só depois de um cálculo concluído. Vão só o bioma e a área.
        incrementarContador();
        registrarValoracaoGlobal(bioma, r.areas.total);

        mostrarResultado(r);
    } catch (erro) {
        console.error('Erro ao calcular valoração:', erro);
        alert('Ocorreu um erro ao calcular a valoração: ' + erro.message + '\nVerifique o console do navegador para mais detalhes.');
    } finally {
        btnCalc.innerHTML = btnTextoOriginal;
        btnCalc.disabled = false;
        btnCalc.style.opacity = '';
    }
}

function mostrarResultado(r) {
    ultimoResultado = r;
    const p = r.parcelas;
    document.getElementById('danoMaterialMedia').textContent = formatarMoeda(p.material.valor);
    document.getElementById('danoInterinoMedia').textContent = formatarMoeda(p.interino.valor);
    document.getElementById('danoExtrapatrimonialMercado').textContent = formatarMoeda(p.mercado.valor);
    document.getElementById('danoExtrapatrimonialSocial').textContent = formatarMoeda(p.social.valor);
    document.getElementById('totalMedia').textContent = formatarMoeda(r.totais.original);

    const notaDanoMaterial = document.getElementById('notaDanoMaterial');
    if (r.areas.em > 0) {
        notaDanoMaterial.style.display = '';
        notaDanoMaterial.innerHTML = r.reparacaoInSitu
            ? '<strong>Nota:</strong> Se o dano é em área protegida (APP/ARL) e haverá reparação <em>in situ</em>, o dano material direto deve ser reparado <em>in situ</em> (e não cobrado monetariamente, sob pena de <em>bis in idem</em>). Nesse caso, a cobrança monetária refere-se ao <strong>dano interino</strong>.'
            : '<strong>Nota:</strong> Considerando que a reparação <em>in situ</em> não é possível e não será promovida, o dano material deverá ser compensado ou indenizado. O valor acima inclui a área em APP/ARL (' + numeroBR(r.areas.em, 4) + ' ha).';
    } else {
        notaDanoMaterial.style.display = 'none';
    }

    const correcaoContainer = document.getElementById('correcaoMonetariaContainer');
    if (r.atualizacao.aplicada) {
        document.getElementById('totalCorrigido').textContent = formatarMoeda(r.totais.atualizado);
        document.getElementById('correcaoInfo').textContent = 'Valores na data do dano, atualizados até ' + DamnumCalc.rotuloMes(r.mesCalculo) + ' conforme o Manual de Cálculos da Justiça Federal (CJF, 2026), item 4.2: correção de ' + formatarMoeda(r.totais.correcao) + ' e juros de mora de ' + formatarMoeda(r.totais.juros) + '. Os danos extrapatrimoniais recebem só juros.';
        correcaoContainer.style.display = '';
    } else {
        correcaoContainer.style.display = 'none';
    }

    const notaDataDano = document.getElementById('notaDataDano');
    if (!r.dataInformada) {
        notaDataDano.style.display = '';
        notaDataDano.innerHTML = '<strong>Atenção:</strong> Como não foi inserida a data do dano, os valores estão na data de hoje e não receberam atualização. Nos termos da <strong>Súmula 43 do STJ</strong> (<em>"Incide correção monetária sobre dívida por ato ilícito a partir da data do efetivo prejuízo"</em>) e da <strong>Súmula 54 do STJ</strong>, a correção e os juros de mora correm da data do evento danoso. <a href="manual.html#atualizacao-monetaria" target="_blank" style="color:#2c5530;">Saiba mais sobre a atualização</a>';
    } else {
        notaDataDano.style.display = 'none';
    }

    document.getElementById('textoRelatorio').innerHTML = DamnumRelatorio.gerarHTML(r);
    document.getElementById('btnCSV').style.display = DamnumRelatorio.linhasMensais(r).length ? '' : 'none';
    document.getElementById('resultado').style.display = 'block';
    document.getElementById('resultado').scrollIntoView({ behavior: 'smooth' });
}

function atualizarParametrosCalculados() {
    const p = obterParametrosAtuais();
    if (p.cotacaoDolar > 0) {
        if (!isNaN(p.precoSocialCO2USD)) document.getElementById('precoSocialCO2BRL').value = (p.precoSocialCO2USD * p.cotacaoDolar).toFixed(2);
        if (!isNaN(p.precoMercadoCO2USD)) document.getElementById('precoMercadoCO2BRL').value = (p.precoMercadoCO2USD * p.cotacaoDolar).toFixed(2);
    }
    atualizarAvisosDePiso();
}

// Buscar cotação do dólar automaticamente
async function buscarCotacaoDolar() {
    const statusEl = document.getElementById('cotacaoStatus');
    const avisoEl = document.getElementById('cotacaoAviso');
    const inputEl = document.getElementById('cotacaoDolar');

    try {
        statusEl.textContent = '(buscando...)';
        statusEl.style.color = '#888';

        const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
        if (!response.ok) throw new Error('Erro na requisição');

        const data = await response.json();
        const cotacao = parseFloat(data.USDBRL.bid);

        if (isNaN(cotacao) || cotacao <= 0) throw new Error('Valor inválido');

        inputEl.value = cotacao.toFixed(2);
        origemCotacao = 'AwesomeAPI (USD-BRL, compra), consulta em ' + new Date().toLocaleString('pt-BR');
        statusEl.textContent = '(atualizado automaticamente)';
        statusEl.style.color = '#27ae60';
        avisoEl.style.display = 'none';

        atualizarParametrosCalculados();
    } catch (error) {
        console.error('Erro ao buscar cotação do dólar:', error);
        statusEl.textContent = '(valor padrão)';
        statusEl.style.color = '#e67e22';
        avisoEl.style.display = 'block';
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', async function() {
    const form = document.getElementById('calculoForm');
    const biomaSelect = document.getElementById('bioma');

    // Verificar cookies e inicializar contador
    verificarCookies();

    // Contador: mostra o backup local na hora e tenta o total global em seguida
    restaurarContadorLocal();
    obterTotalGlobal();

    // Listeners da barra de cookies
    document.getElementById('acceptCookies').addEventListener('click', aceitarCookies);
    document.getElementById('rejectCookies').addEventListener('click', rejeitarCookies);

    iniciarSlideshow();
    buscarCotacaoDolar();
    carregarTabelaQCN();
    carregarTemposRecuperacao();
    atualizarParametrosCalculados();

    biomaSelect.addEventListener('change', function() {
        atualizarImagemBioma(this.value);
        preencherFitofisionomias(this.value);
    });

    // Estoque de carbono
    ['fitofisionomia', 'usarEstoqueUsuario', 'vegetacaoSecundaria'].forEach(id => {
        document.getElementById(id).addEventListener('change', atualizarPainelEstoque);
    });
    ['estoqueUsuario', 'fonteEstoqueUsuario'].forEach(id => {
        document.getElementById(id).addEventListener('input', atualizarPainelEstoque);
    });

    // Indicação da fitofisionomia pelo IBGE
    document.getElementById('btnConsultarIBGE').addEventListener('click', consultarVegetacaoIBGE);

    // Mapa por estado
    if (DamnumMapa.MAPA_QCN_ATIVO) {
        document.getElementById('arquivoPoligono').addEventListener('change', aoEscolherPoligono);
        document.getElementById('latitude').addEventListener('change', aoInformarCoordenada);
        document.getElementById('longitude').addEventListener('change', aoInformarCoordenada);
        ['areaForaAPP', 'areaEmAPP'].forEach(id => document.getElementById(id).addEventListener('input', atualizarDivergenciaArea));
    }

    // Parâmetros
    ['precoSocialCO2USD', 'precoMercadoCO2USD', 'cotacaoDolar'].forEach(id => {
        document.getElementById(id).addEventListener('input', atualizarParametrosCalculados);
    });
    document.getElementById('cotacaoDolar').addEventListener('change', function() {
        origemCotacao = 'informada pelo usuário';
    });
    document.getElementById('taxaJurosAnual').addEventListener('input', function() {
        this.dataset.editado = '1';
        validarTaxaInterino();
    });
    document.getElementById('tempoRecuperacao').addEventListener('input', function() { this.dataset.editado = '1'; });
    document.getElementById('metodoInterino').addEventListener('change', function() { atualizarPadroesInterino(true); });
    document.getElementById('formaVegetacao').addEventListener('change', function() {
        this.dataset.editado = '1';
        atualizarPadroesInterino(true);
    });
    document.getElementById('fitofisionomia').addEventListener('change', function() { atualizarPadroesInterino(false); });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        calcularValoracao();
    });

    document.getElementById('btnDownloadPDF').addEventListener('click', baixarRelatorioPDF);
    document.getElementById('btnCopiar').addEventListener('click', copiarRelatorio);
    document.getElementById('btnCSV').addEventListener('click', baixarTabelaCSV);

    // Mostrar/esconder checkbox de reparação in situ conforme área APP
    document.getElementById('areaEmAPP').addEventListener('input', function() {
        const container = document.getElementById('checkboxReparacaoContainer');
        const valor = parseFloat(this.value) || 0;
        container.style.display = valor > 0 ? '' : 'none';
        if (valor <= 0) {
            document.getElementById('reparacaoInSitu').checked = true; // resetar ao esconder
        }
    });

    // Permitir apenas números positivos nos campos de área e nos parâmetros
    document.querySelectorAll('#areaForaAPP, #areaEmAPP, .parametro-item input[type="number"]:not([readonly])').forEach(input => {
        input.addEventListener('input', function() {
            if (this.value < 0) {
                this.value = 0;
            }
        });
    });
});
