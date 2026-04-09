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

// Função para registrar uma nova valoração na planilha Google Sheets
async function registrarValoracaoGlobal(bioma, area) {
    try {
        // Obter o IP do usuário (opcional)
        let ip = "anônimo";
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            ip = ipData.ip;
        } catch (error) {
            console.log("Não foi possível obter o IP, usando 'anônimo'");
        }

        // Criar iframe oculto para fazer a requisição (evita problemas de CORS)
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        
        // URL com parâmetros na query string
        const url = `${CONTADOR_API_URL}?bioma=${encodeURIComponent(bioma)}&area=${encodeURIComponent(area)}&ip=${encodeURIComponent(ip)}`;
        
        iframe.src = url;
        document.body.appendChild(iframe);
        
        // Remove o iframe após alguns segundos
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 5000);

        // Também incrementa o contador local como backup
        incrementarContadorLocal();
        
        // Tenta obter o total global após um pequeno delay
        setTimeout(obterTotalGlobal, 2000);
    } catch (error) {
        console.error("Erro ao registrar valoração global:", error);
        // Em caso de erro, incrementa apenas localmente
        incrementarContadorLocal();
    }
}

// Função para obter o total atual de valorações da planilha
async function obterTotalGlobal() {
    try {
        const response = await fetch(CONTADOR_API_URL);
        const data = await response.json();
        
        if (data && data.total !== undefined) {
            // Atualiza o contador na tela com o total global
            document.getElementById('contadorValoracao').textContent = data.total;
            
            // Salva o valor no localStorage também como backup
            localStorage.setItem('contadorValoracoes', data.total);
            return data.total;
        }
    } catch (error) {
        console.error("Erro ao obter total global de valorações:", error);
    }
    
    // Em caso de erro, retorna o valor local
    return parseInt(localStorage.getItem('contadorValoracoes') || '0');
}

// Função para incrementar o contador local (backup)
function incrementarContadorLocal() {
    const valorAtual = parseInt(localStorage.getItem('contadorValoracoes') || '0');
    const novoValor = valorAtual + 1;
    localStorage.setItem('contadorValoracoes', novoValor);
    document.getElementById('contadorValoracao').textContent = novoValor;
}

// Dados extraídos da planilha Excel (valores base - Portaria 118/2022 IBAMA, outubro/2022)
const valoresBiomasOriginais = {
    'CERRADO': { 'menor_valor': 1580.50, 'media': 11538.92, 'maior_valor': 17948.50 },
    'FLORESTA AMAZÔNICA': { 'menor_valor': 1745.75, 'media': 6010.33, 'maior_valor': 15170.17 },
    'PANTANAL MATO-GROSSENSE': { 'menor_valor': 981.00, 'media': 16220.67, 'maior_valor': 29334.00 },
    'CAATINGA': { 'menor_valor': 1536.00, 'media': 11198.38, 'maior_valor': 20860.75 },
    'PAMPAS': { 'menor_valor': 2090.00, 'media': 12285.25, 'maior_valor': 23008.25 },
    'MATA ATLÂNTICA': { 'menor_valor': 1521.00, 'media': 15737.26, 'maior_valor': 24302.00 }
};

// Valores corrigidos pelo IPCA (serão atualizados ao carregar a página)
const valoresBiomasBase = JSON.parse(JSON.stringify(valoresBiomasOriginais));

// IPCA: índice de outubro/2022 (base da Portaria 118/2022)
const IPCA_BASE_PERIODO = '202210';
const IPCA_BASE_INDICE = 6407.93;

// Variável global para armazenar info da correção
let correcaoIPCA = {
    fator: 1.0,
    periodoBase: 'outubro/2022',
    periodoAtual: null,
    indiceBase: IPCA_BASE_INDICE,
    indiceAtual: null,
    sucesso: false
};

// Buscar correção IPCA via API do IBGE
async function buscarCorrecaoIPCA() {
    const statusEl = document.getElementById('ipcaStatus');
    try {
        if (statusEl) {
            statusEl.textContent = '(buscando IPCA...)';
            statusEl.style.color = '#888';
        }

        // Buscar os últimos 6 meses para pegar o mais recente disponível
        const hoje = new Date();
        const periodos = [];
        for (let i = 0; i < 6; i++) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
            const p = d.getFullYear().toString() + (d.getMonth() + 1).toString().padStart(2, '0');
            periodos.push(p);
        }

        const url = 'https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/'
            + periodos.join('|')
            + '/variaveis/2266?localidades=N1[all]';

        const response = await fetch(url);
        if (!response.ok) throw new Error('Erro na requisição IBGE');

        const data = await response.json();
        const series = data[0].resultados[0].series[0].serie;

        // Encontrar o período mais recente com valor
        let periodoMaisRecente = null;
        let indiceMaisRecente = null;
        for (const periodo of periodos) {
            if (series[periodo] && series[periodo] !== '...') {
                const valor = parseFloat(series[periodo]);
                if (!isNaN(valor) && valor > 0) {
                    if (!periodoMaisRecente || periodo > periodoMaisRecente) {
                        periodoMaisRecente = periodo;
                        indiceMaisRecente = valor;
                    }
                }
            }
        }

        if (!indiceMaisRecente || !periodoMaisRecente) throw new Error('Dados IPCA indisponíveis');

        const fator = indiceMaisRecente / IPCA_BASE_INDICE;
        const mesNome = periodoMaisRecente.substring(4);
        const anoNome = periodoMaisRecente.substring(0, 4);
        const meses = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                       'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        const periodoFormatado = meses[parseInt(mesNome)] + '/' + anoNome;

        correcaoIPCA = {
            fator: fator,
            periodoBase: 'outubro/2022',
            periodoAtual: periodoFormatado,
            indiceBase: IPCA_BASE_INDICE,
            indiceAtual: indiceMaisRecente,
            sucesso: true
        };

        // Aplicar correção aos valores dos biomas
        for (const bioma of Object.keys(valoresBiomasOriginais)) {
            valoresBiomasBase[bioma].menor_valor = valoresBiomasOriginais[bioma].menor_valor * fator;
            valoresBiomasBase[bioma].media = valoresBiomasOriginais[bioma].media * fator;
            valoresBiomasBase[bioma].maior_valor = valoresBiomasOriginais[bioma].maior_valor * fator;
        }

        if (statusEl) {
            statusEl.textContent = '(valores corrigidos pelo IPCA até ' + periodoFormatado + ' — fator: ' + fator.toFixed(4) + ')';
            statusEl.style.color = '#27ae60';
        }

    } catch (error) {
        console.error('Erro ao buscar IPCA:', error);
        correcaoIPCA.sucesso = false;
        if (statusEl) {
            statusEl.textContent = '(não foi possível atualizar pelo IPCA — usando valores nominais de out/2022)';
            statusEl.style.color = '#e67e22';
        }
    }
}

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
function obterContadorValoracoes() {
    const cookieConsent = localStorage.getItem('cookieConsent');
    if (cookieConsent === 'accepted') {
        return parseInt(localStorage.getItem('contadorValoracoes') || '0');
    }
    return 0;
}

function incrementarContador() {
    const cookieConsent = localStorage.getItem('cookieConsent');
    if (cookieConsent === 'accepted') {
        const contador = obterContadorValoracoes() + 1;
        localStorage.setItem('contadorValoracoes', contador.toString());
        atualizarExibicaoContador();
        return contador;
    }
    return 0;
}

function atualizarExibicaoContador() {
    const contador = obterContadorValoracoes();
    document.getElementById('contadorValoracao').textContent = contador;
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

function obterParametrosAtuais() {
    return {
        precoSocialCO2USD: parseFloat(document.getElementById('precoSocialCO2USD').value) || 24.20,
        cotacaoDolar: parseFloat(document.getElementById('cotacaoDolar').value) || 5.71,
        precoSocialCO2BRL: parseFloat(document.getElementById('precoSocialCO2BRL').value) || 138.18,
        precoMercadoCO2USD: parseFloat(document.getElementById('precoMercadoCO2USD').value) || 5.00,
        precoMercadoCO2BRL: parseFloat(document.getElementById('precoMercadoCO2BRL').value) || 28.55,
        estoqueCO2Caatinga: parseFloat(document.getElementById('estoqueCO2Caatinga').value) || 105.33,
        estoqueCO2Cerrado: parseFloat(document.getElementById('estoqueCO2Cerrado').value) || 75,
        estoqueCO2Amazonia: parseFloat(document.getElementById('estoqueCO2Amazonia').value) || 166,
        estoqueCO2MataAtlantica: parseFloat(document.getElementById('estoqueCO2MataAtlantica').value) || 105.33,
        estoqueCO2Pampas: parseFloat(document.getElementById('estoqueCO2Pampas').value) || 105.33,
        estoqueCO2Pantanal: parseFloat(document.getElementById('estoqueCO2Pantanal').value) || 75,
        estoqueCO2Media: parseFloat(document.getElementById('estoqueCO2Media').value) || 105.33,
        taxaJurosAnual: parseFloat(document.getElementById('taxaJurosAnual').value) || 0.06,
        tempoRecuperacao: parseFloat(document.getElementById('tempoRecuperacao').value) || 15
    };
}

function obterEstoqueCO2PorBioma(bioma) {
    const parametros = obterParametrosAtuais();
    const mapeamento = {
        'CAATINGA': parametros.estoqueCO2Caatinga,
        'CERRADO': parametros.estoqueCO2Cerrado,
        'FLORESTA AMAZÔNICA': parametros.estoqueCO2Amazonia,
        'MATA ATLÂNTICA': parametros.estoqueCO2MataAtlantica,
        'PAMPAS': parametros.estoqueCO2Pampas,
        'PANTANAL MATO-GROSSENSE': parametros.estoqueCO2Pantanal
    };
    return mapeamento[bioma] || parametros.estoqueCO2Media;
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

    // Mostrar apenas o campo de estoque de CO2 do bioma selecionado
    document.querySelectorAll('.estoque-co2-item').forEach(function(el) {
        if (bioma && el.getAttribute('data-bioma') === bioma) {
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    });
}

function obterEntendimento() {
    const el = document.getElementById('entendimento');
    return el ? el.value : 'gonzaga';
}

function calcularDanoMaterial(bioma, areaForaAPP) {
    if (!bioma || !areaForaAPP || areaForaAPP <= 0) return 0;

    const entendimento = obterEntendimento();
    if (entendimento === 'irdr') return 0;

    return areaForaAPP * valoresBiomasBase[bioma].media;
}

function calcularDanoInterino(bioma, areaEmAPP) {
    if (!bioma || !areaEmAPP || areaEmAPP <= 0) return 0;

    const parametros = obterParametrosAtuais();
    const fator = parametros.taxaJurosAnual * (parametros.tempoRecuperacao + 1) / 2;
    return areaEmAPP * valoresBiomasBase[bioma].media * fator;
}

function calcularDanoExtrapatrimonialMercado(bioma, areaForaAPP, areaEmAPP) {
    if (!bioma) return 0;
    
    const areaTotal = (areaForaAPP || 0) + (areaEmAPP || 0);
    if (areaTotal <= 0) return 0;

    const parametros = obterParametrosAtuais();
    const estoqueCO2 = obterEstoqueCO2PorBioma(bioma);
    return areaTotal * parametros.precoMercadoCO2BRL * estoqueCO2;
}

function calcularDanoExtrapatrimonialSocial(bioma, areaForaAPP, areaEmAPP) {
    if (!bioma) return 0;
    
    const areaTotal = (areaForaAPP || 0) + (areaEmAPP || 0);
    if (areaTotal <= 0) return 0;

    const parametros = obterParametrosAtuais();
    const estoqueCO2 = obterEstoqueCO2PorBioma(bioma);
    return areaTotal * parametros.precoSocialCO2BRL * estoqueCO2;
}

function obterDataDano() {
    const input = document.getElementById('dataDano');
    if (input && input.value) {
        const partes = input.value.split('-');
        return new Date(partes[0], partes[1] - 1, partes[2]);
    }
    return new Date();
}

function formatarData(data) {
    return data.toLocaleDateString('pt-BR');
}

function gerarRelatorioCompleto(bioma, areaForaAPP, areaEmAPP, resultados) {
    const parametros = obterParametrosAtuais();
    const areaTotal = (areaForaAPP || 0) + (areaEmAPP || 0);
    const areaArredondada = Math.ceil(areaForaAPP || 0);
    const estoqueCO2 = obterEstoqueCO2PorBioma(bioma);
    const dataAtual = new Date();
    const dataDano = obterDataDano();
    const usouDataHoje = !document.getElementById('dataDano').value;
    const entendimento = obterEntendimento();
    const valores = valoresBiomasBase[bioma];
    const fator = parametros.taxaJurosAnual * (parametros.tempoRecuperacao + 1) / 2;

    const nomeEntendimento = entendimento === 'irdr'
        ? 'IRDR 13/TJMT (PJe 1019783-07.2025.8.11.0000)'
        : 'Gonzaga et al. (2025)';

    const textoDataDano = usouDataHoje
        ? formatarData(dataDano) + ' (data de hoje, pois não foi informada a data do dano)'
        : formatarData(dataDano);

    let html = '<div style="font-family: \'Times New Roman\', serif; font-size: 12pt; line-height: 1.6; color: #222; max-width: 700px;">';

    // CABEÇALHO
    html += '<h2 style="text-align:center; font-size:14pt; margin-bottom:5px;">RELATÓRIO DE VALORAÇÃO DOS DANOS AMBIENTAIS DECORRENTES DE DESMATAMENTO ILEGAL</h2>';
    html += '<p style="text-align:center; font-size:11pt; color:#555;">';
    html += 'Data da valoração: ' + formatarData(dataAtual) + '<br>';
    html += 'Data do dano: ' + textoDataDano + '<br>';
    html += 'Bioma: ' + bioma + '<br>';
    html += 'Entendimento: ' + nomeEntendimento + '<br>';
    html += 'DAMNUM v. 5.1</p>';
    html += '<hr style="border:1px solid #999;">';

    // NOTA SOBRE VALORES (agora no início)
    html += '<div style="background:#f5f5dc; padding:10px 14px; border-left:4px solid #b8860b; margin:12px 0; font-size:11pt;">';
    html += '<b>Nota sobre os valores de referência:</b> Os custos de reparação por hectare utilizados neste relatório correspondem à <b>média</b> dos custos de implantação e manutenção de projetos de recuperação ambiental, conforme a Portaria 118/2022 do IBAMA. ';
    if (correcaoIPCA.sucesso) {
        html += 'Os valores originais (outubro/2022) foram <b>corrigidos pelo IPCA</b> até ' + correcaoIPCA.periodoAtual + ' (fator de correção: ' + correcaoIPCA.fator.toFixed(4) + ', índice base: ' + correcaoIPCA.indiceBase.toFixed(2) + ', índice atual: ' + correcaoIPCA.indiceAtual.toFixed(2) + '). ';
    } else {
        html += 'Os valores são nominais de outubro/2022 (não foi possível obter a correção pelo IPCA). ';
    }
    html += 'Para o bioma <b>' + bioma + '</b>, os valores mínimo e máximo (corrigidos) são, respectivamente, ' + formatarMoeda(valores.menor_valor) + '/ha e ' + formatarMoeda(valores.maior_valor) + '/ha. ';
    html += 'O valor médio adotado é de <b>' + formatarMoeda(valores.media) + '/ha</b>.</div>';

    // MEMÓRIA DE CÁLCULO
    html += '<h3 style="font-size:13pt; border-bottom:2px solid #333; padding-bottom:4px;">MEMÓRIA DE CÁLCULO</h3>';

    // DADOS DO CASO
    html += '<h4 style="font-size:12pt; color:#2c3e50;">DADOS DO CASO</h4>';
    html += '<table style="font-size:11pt; border-collapse:collapse; margin-left:10px;">';
    html += '<tr><td style="padding:2px 10px;">Bioma selecionado:</td><td><b>' + bioma + '</b></td></tr>';
    html += '<tr><td style="padding:2px 10px;">Entendimento adotado:</td><td><b>' + nomeEntendimento + '</b></td></tr>';
    html += '<tr><td style="padding:2px 10px;">Data do dano:</td><td><b>' + textoDataDano + '</b></td></tr>';
    html += '<tr><td style="padding:2px 10px;">Área desmatada fora de APP e ARL (A<sub>1</sub>):</td><td><b>' + (areaForaAPP || 0).toFixed(4) + ' ha</b></td></tr>';
    html += '<tr><td style="padding:2px 10px;">Área desmatada em APP e ARL (A<sub>2</sub>):</td><td><b>' + (areaEmAPP || 0).toFixed(4) + ' ha</b></td></tr>';
    html += '<tr><td style="padding:2px 10px;">Área total desmatada (A<sub>1</sub> + A<sub>2</sub>):</td><td><b>' + areaTotal.toFixed(4) + ' ha</b></td></tr>';
    if (resultados.reparacaoInSitu) {
        html += '<tr><td style="padding:2px 10px;">Reparação <em>in situ</em>:</td><td><b style="color:#27ae60;">Sim — será promovida</b></td></tr>';
    }
    html += '</table>';

    // PARÂMETROS UTILIZADOS
    html += '<h4 style="font-size:12pt; color:#2c3e50;">PARÂMETROS UTILIZADOS</h4>';
    html += '<table style="font-size:11pt; border-collapse:collapse; margin-left:10px;">';
    html += '<tr><td style="padding:2px 10px;">Custo médio de reparação/ha (Portaria 118/2022 – IBAMA):</td><td><b>' + formatarMoeda(valores.media) + '/ha</b></td></tr>';
    html += '<tr><td style="padding:2px 10px;">Preço Social do CO₂ (US$):</td><td>US$ ' + parametros.precoSocialCO2USD.toFixed(2) + '</td></tr>';
    html += '<tr><td style="padding:2px 10px;">Cotação do Dólar:</td><td>R$ ' + parametros.cotacaoDolar.toFixed(2) + '</td></tr>';
    html += '<tr><td style="padding:2px 10px;">Preço Social do CO₂ (R$):</td><td>' + formatarMoeda(parametros.precoSocialCO2BRL) + ' <span style="color:#666;">(US$ ' + parametros.precoSocialCO2USD.toFixed(2) + ' × R$ ' + parametros.cotacaoDolar.toFixed(2) + ')</span></td></tr>';
    html += '<tr><td style="padding:2px 10px;">Preço Mercado Voluntário CO₂ (US$):</td><td>US$ ' + parametros.precoMercadoCO2USD.toFixed(2) + '</td></tr>';
    html += '<tr><td style="padding:2px 10px;">Preço Mercado Voluntário CO₂ (R$):</td><td>' + formatarMoeda(parametros.precoMercadoCO2BRL) + ' <span style="color:#666;">(US$ ' + parametros.precoMercadoCO2USD.toFixed(2) + ' × R$ ' + parametros.cotacaoDolar.toFixed(2) + ')</span></td></tr>';
    html += '<tr><td style="padding:2px 10px;">Estoque de CO₂ do bioma ' + bioma + ':</td><td>' + estoqueCO2 + ' tCO₂/ha</td></tr>';
    html += '<tr><td style="padding:2px 10px;">Taxa de juros anual (i):</td><td>' + (parametros.taxaJurosAnual * 100).toFixed(2) + '%</td></tr>';
    html += '<tr><td style="padding:2px 10px;">Tempo de recuperação (t):</td><td>' + parametros.tempoRecuperacao + ' anos</td></tr>';
    html += '</table>';

    // 1. DANO MATERIAL
    html += '<hr style="border:0; border-top:1px solid #ccc; margin:16px 0;">';
    html += '<h4 style="font-size:12pt; color:#2c3e50;">1. DANO MATERIAL (Dano Ecológico / Dano Direto)</h4>';
    html += '<p style="margin-left:10px;"><b>Fórmula:</b> Dano Material = A<sub>1</sub> × Custo de Reparação/ha</p>';
    html += '<p style="margin-left:10px;">Onde: A<sub>1</sub> = Área desmatada fora de APP e ARL = ' + (areaForaAPP || 0).toFixed(4) + ' ha</p>';

    if (!areaForaAPP || areaForaAPP <= 0) {
        html += '<p style="margin-left:10px; color:#888;"><em>Não há área fora de APP/ARL informada, portanto: Dano Material = R$ 0,00</em></p>';
    } else if (entendimento === 'irdr') {
        html += '<p style="margin-left:10px; color:#888;"><em>Entendimento IRDR 13/TJMT: todo o dano material para área fora de APP e ARL é igual a zero (remanesce apenas o dano extrapatrimonial). Dano Material = R$ 0,00</em></p>';
    } else {
        html += '<p style="margin-left:20px;"><b>Cálculo:</b><br>';
        html += '&nbsp;&nbsp;' + (areaForaAPP).toFixed(4) + ' ha × ' + formatarMoeda(valores.media) + '/ha = ' + formatarMoeda(resultados.danoMaterial) + '</p>';
        html += '<div style="background:#e8f5e9; padding:6px 12px; margin:8px 10px; border-radius:4px; font-weight:bold;">DANO MATERIAL = ' + formatarMoeda(resultados.danoMaterial) + '</div>';
    }

    if (resultados.reparacaoInSitu) {
        html += '<div style="background:#fef9e7; padding:8px 12px; margin:8px 10px; border-left:3px solid #d4ac0d; border-radius:3px; font-size:11pt;">';
        html += '<b>Nota:</b> Havendo reparação <em>in situ</em> da área em APP/ARL, o dano material direto será reparado fisicamente (e não cobrado monetariamente, sob pena de <em>bis in idem</em>). A cobrança monetária nesse cenário refere-se ao <b>dano interino</b> (abaixo).';
        html += '</div>';
    }

    // 2. DANO INTERINO
    html += '<hr style="border:0; border-top:1px solid #ccc; margin:16px 0;">';
    html += '<h4 style="font-size:12pt; color:#2c3e50;">2. DANO INTERINO</h4>';
    html += '<p style="margin-left:10px;"><b>Fórmula:</b> Dano Interino = A<sub>2</sub> × Custo de Reparação/ha × Fator</p>';
    html += '<p style="margin-left:10px;">Onde:<br>';
    html += '&nbsp;&nbsp;A<sub>2</sub> = Área desmatada em APP e ARL = ' + (areaEmAPP || 0).toFixed(4) + ' ha<br>';
    html += '&nbsp;&nbsp;Fator = i × (t + 1) / 2</p>';
    html += '<p style="margin-left:20px;"><b>Cálculo do Fator:</b><br>';
    html += '&nbsp;&nbsp;Fator = ' + parametros.taxaJurosAnual + ' × (' + parametros.tempoRecuperacao + ' + 1) / 2<br>';
    html += '&nbsp;&nbsp;Fator = ' + parametros.taxaJurosAnual + ' × ' + (parametros.tempoRecuperacao + 1) + ' / 2<br>';
    html += '&nbsp;&nbsp;Fator = ' + fator.toFixed(4) + '</p>';

    if (!areaEmAPP || areaEmAPP <= 0) {
        html += '<p style="margin-left:10px; color:#888;"><em>Não há área em APP/ARL informada, portanto: Dano Interino = R$ 0,00</em></p>';
    } else {
        html += '<p style="margin-left:20px;"><b>Cálculo:</b><br>';
        html += '&nbsp;&nbsp;' + (areaEmAPP).toFixed(4) + ' ha × ' + formatarMoeda(valores.media) + '/ha × ' + fator.toFixed(4) + ' = ' + formatarMoeda(resultados.danoInterino) + '</p>';
        html += '<div style="background:#e8f5e9; padding:6px 12px; margin:8px 10px; border-radius:4px; font-weight:bold;">DANO INTERINO = ' + formatarMoeda(resultados.danoInterino) + '</div>';
    }

    // 3. DANO EXTRAPATRIMONIAL
    html += '<hr style="border:0; border-top:1px solid #ccc; margin:16px 0;">';
    html += '<h4 style="font-size:12pt; color:#2c3e50;">3. DANO EXTRAPATRIMONIAL</h4>';

    // 3.1
    html += '<p style="margin-left:10px;"><b>3.1) Mercado Voluntário de Carbono</b></p>';
    html += '<p style="margin-left:10px;"><b>Fórmula:</b> (A<sub>1</sub> + A<sub>2</sub>) × Preço CO₂ Mercado (R$) × Estoque CO₂/ha</p>';
    html += '<p style="margin-left:20px;"><b>Cálculo:</b><br>';
    html += '&nbsp;&nbsp;' + areaTotal.toFixed(4) + ' ha × ' + formatarMoeda(parametros.precoMercadoCO2BRL) + '/tCO₂ × ' + estoqueCO2 + ' tCO₂/ha<br>';
    html += '&nbsp;&nbsp;= ' + formatarMoeda(resultados.danoExtrapatrimonialMercado) + '</p>';
    html += '<div style="background:#e8f5e9; padding:6px 12px; margin:8px 10px; border-radius:4px; font-weight:bold;">DANO EXTRAPATRIMONIAL (Mercado Voluntário) = ' + formatarMoeda(resultados.danoExtrapatrimonialMercado) + '</div>';

    // 3.2
    html += '<p style="margin-left:10px;"><b>3.2) Custo Social do Carbono (CSC – Cenário SSP2/RCP6.0)</b></p>';
    html += '<p style="margin-left:10px;"><b>Fórmula:</b> (A<sub>1</sub> + A<sub>2</sub>) × Preço Social CO₂ (R$) × Estoque CO₂/ha</p>';
    html += '<p style="margin-left:20px;"><b>Cálculo:</b><br>';
    html += '&nbsp;&nbsp;' + areaTotal.toFixed(4) + ' ha × ' + formatarMoeda(parametros.precoSocialCO2BRL) + '/tCO₂ × ' + estoqueCO2 + ' tCO₂/ha<br>';
    html += '&nbsp;&nbsp;= ' + formatarMoeda(resultados.danoExtrapatrimonialSocial) + '</p>';
    html += '<div style="background:#e8f5e9; padding:6px 12px; margin:8px 10px; border-radius:4px; font-weight:bold;">DANO CLIMÁTICO (Custo Social do Carbono) = ' + formatarMoeda(resultados.danoExtrapatrimonialSocial) + '</div>';

    // 4. TOTAL
    html += '<hr style="border:0; border-top:1px solid #ccc; margin:16px 0;">';
    html += '<h4 style="font-size:12pt; color:#2c3e50;">4. TOTAL</h4>';
    html += '<p style="margin-left:10px;"><b>Fórmula:</b> Total = Dano Material + Dano Interino + Dano Extrapatrimonial (mercado) + Dano Climático</p>';
    html += '<p style="margin-left:20px;"><b>Cálculo:</b><br>';
    html += '&nbsp;&nbsp;' + formatarMoeda(resultados.danoMaterial) + ' + ' + formatarMoeda(resultados.danoInterino) + ' + ' + formatarMoeda(resultados.danoExtrapatrimonialMercado) + ' + ' + formatarMoeda(resultados.danoExtrapatrimonialSocial) + '<br>';
    html += '&nbsp;&nbsp;= ' + formatarMoeda(resultados.total) + '</p>';
    html += '<div style="background:#c8e6c9; padding:10px 14px; margin:8px 10px; border-radius:4px; font-size:13pt; font-weight:bold; text-align:center;">VALOR TOTAL = ' + formatarMoeda(resultados.total) + '</div>';

    // CENÁRIOS DE REPARAÇÃO
    html += '<hr style="border:1px solid #999; margin:20px 0;">';
    html += '<h3 style="font-size:13pt; border-bottom:2px solid #333; padding-bottom:4px;">CENÁRIOS QUANTO À REPARAÇÃO</h3>';

    html += '<p><b>1) Hipótese da recuperação da área desmatada (recuperação <em>in situ</em>):</b></p>';
    html += '<p style="text-align:justify;">Quando houver recuperação da área desmatada (recuperação <em>in situ</em>) por danos em área de reserva legal (ARL), área de preservação permanente (APP) ou áreas excedentes caso ele opte pela reparação <em>in natura</em> e <em>in situ</em>, degradador deverá indenizar os danos interinos no valor de ' + formatarMoeda(resultados.danoInterino) + ' (além de indenizar os danos extrapatrimoniais). Neste cenário, o proprietário deverá apresentar e executar Projeto de Recuperação de Áreas Degradadas (PRADA) ou laudo de constatação de reparação do dano ambiental. Alternativamente, a parte requerida poderá realizar a compensação ecológica do dano interino e extrapatrimonial (veja a seguir).</p>';

    html += '<p><b>2) Hipótese da não recuperação da área ilegalmente desmatada (desmatamento ilegal fora de ARL e APP a ser regularizado):</b></p>';
    html += '<p style="text-align:justify;">Quando não houver reparação <em>in situ</em> (área passível de exploração), deverá ser realizada a compensação ecológica ou o pagamento de indenização, para que o proprietário possa regularizar a exploração da área. Neste caso, a valoração (dano material) é de ' + formatarMoeda(resultados.danoMaterial) + '. Também deverão ser reparados os danos climáticos, estimados em ' + formatarMoeda(resultados.danoExtrapatrimonialSocial) + ' e extrapatrimoniais (' + formatarMoeda(resultados.danoExtrapatrimonialMercado) + ').</p>';

    html += '<p><b>COMPENSAÇÃO ECOLÓGICA</b></p>';
    html += '<p style="text-align:justify;">Alternativamente, propõe-se a compensação ecológica dos danos materiais nos seguintes termos: instituição, no próprio imóvel ou imóvel de terceiro no mesmo bioma, estado da federação e preferencialmente, no mesmo município ou município contíguo, de RPPN, servidão ambiental perpétua ou aquisição e doação ao poder público de área em unidade de conservação igual à área ilegalmente desmatada (arredondada), isto é ' + areaArredondada + ' hectares, remanescendo o pagamento de indenização por danos extrapatrimoniais (que poderá ser reduzido a critério do promotor de Justiça, conforme a relevância da área protegida a ser criada) no valor de ' + formatarMoeda(resultados.danoExtrapatrimonialMercado) + '.</p>';

    html += '<p style="text-align:justify;">O valor dos danos extrapatrimoniais remanescente também poderá ser reduzido com o aumento da área a ser protegida, descontando-se o valor dos custos médios de reparação para cada hectare adicional de vegetação nativa no montante do dano extrapatrimonial (isto é, ' + formatarMoeda(valoresBiomasBase[bioma].media) + ' por hectare fora de ARL acrescentado na RPPN além da área desmatada).</p>';

    html += '<p><b>Regras para a instituição de RPPN:</b></p>';
    html += '<p style="text-align:justify;">1) A RPPN deverá abranger a área de reserva legal do imóvel, embora a ARL abrangida não será computada para fins da compensação ecológica;<br>';
    html += '2) A área protegida deverá, salvo absoluta impossibilidade, (2.1) consistir-se de um único bloco de vegetação nativa e (2.2) ser lindeira à área de reserva legal ou área de preservação permanente existente no imóvel, visando diminuir os efeitos da fragmentação de habitats e efeitos de borda.</p>';

    html += '<p style="text-align:justify;">Na hipótese de RPPN, toda a área protegida continuará ser de propriedade da parte requerida, que poderá aferir renda com a venda de créditos de carbono e cotas de reserva ambiental (CRA) para imóveis com déficit de áreas de reserva legal.</p>';

    // REFERÊNCIAS
    html += '<hr style="border:1px solid #999; margin:20px 0;">';
    html += '<h3 style="font-size:13pt; border-bottom:2px solid #333; padding-bottom:4px;">REFERÊNCIAS BIBLIOGRÁFICAS</h3>';

    html += '<p style="text-align:justify; font-size:10pt;">GONZAGA, Claudio Angelo Correa; ROQUETTE, José Guilherme; BRASILEIRO, Andrea Castelo Branco; SINISGALLI, Paulo Antonio de Almeida. Valoração e compensação ecológica dos danos ambientais causados pelo desmatamento ilegal. <em>Anais do V Simpósio Interdisciplinar de Ciência Ambiental da USP (SICAM)</em>, 5., 2024, São Paulo. São Paulo: IEE-USP, 2025. p. 210-217. Disponível em &lt;https://damnum.netlify.app/metodologia.pdf&gt;.</p>';

    html += '<p style="text-align:justify; font-size:10pt;">BRASIL. Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis – IBAMA. Portaria nº 118, de 3 de outubro de 2022. Institui Procedimento Operacional Padrão (POP) para Estimativa dos Custos de Implantação e Manutenção de Projeto de Recuperação Ambiental nos Biomas Brasileiros, para Compor Valor Mínimo da Reparação por Danos Ambientais à Vegetação Nativa, em Processos Administrativos no âmbito do Ibama. Disponível em: &lt;https://www.ibama.gov.br/component/legislacao/?view=legislacao&amp;force=1&amp;legislacao=139171&gt;.</p>';

    html += '<p style="text-align:justify; font-size:10pt;">RICKE, Katharine et al. Country-level social cost of carbon. <em>Nature Climate Change</em>, v. 8, n. 10, p. 895-900, 2018. Disponível em: &lt;https://www.nature.com/articles/s41558-018-0282-y&gt;.</p>';

    html += '</div>';
    return html;
}

function baixarRelatorioPDF() {
    const elemento = document.getElementById('textoRelatorio');
    const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');

    const opt = {
        margin: [25, 20, 20, 25],
        filename: 'DAMNUM_Relatorio_' + dataAtual + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Mostrar indicador de carregamento
    const btn = document.getElementById('btnDownloadPDF');
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = 'Gerando PDF...';
    btn.disabled = true;

    html2pdf().set(opt).from(elemento).save().then(function() {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }).catch(function(err) {
        console.error('Erro ao gerar PDF:', err);
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
        alert('Erro ao gerar o PDF. Tente novamente.');
    });
}

function copiarRelatorio() {
    const textoRelatorio = document.getElementById('textoRelatorio').innerText;
    navigator.clipboard.writeText(textoRelatorio).then(function() {
        const btn = document.getElementById('btnCopiar');
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '&#10003; Copiado!';
        btn.style.backgroundColor = '#27ae60';
        setTimeout(function() {
            btn.innerHTML = textoOriginal;
            btn.style.backgroundColor = '';
        }, 2000);
    }).catch(function() {
        // Fallback para navegadores mais antigos
        const textarea = document.createElement('textarea');
        textarea.value = textoRelatorio;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        const btn = document.getElementById('btnCopiar');
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '&#10003; Copiado!';
        btn.style.backgroundColor = '#27ae60';
        setTimeout(function() {
            btn.innerHTML = textoOriginal;
            btn.style.backgroundColor = '';
        }, 2000);
    });
}

function calcularValoracao() {
    const bioma = document.getElementById('bioma').value;
    const areaForaAPP = parseFloat(document.getElementById('areaForaAPP').value) || 0;
    const areaEmAPP = parseFloat(document.getElementById('areaEmAPP').value) || 0;

    if (!bioma) {
        alert('Por favor, selecione um bioma.');
        return;
    }

    if (areaForaAPP <= 0 && areaEmAPP <= 0) {
        alert('Por favor, informe pelo menos uma área desmatada.');
        return;
    }

    // Incrementar contador local
    incrementarContador();
    
    // Registrar valoração na planilha global
    const areaTotal = areaForaAPP + areaEmAPP;
    registrarValoracaoGlobal(bioma, areaTotal);

    // Calcular todos os danos
    const danoMaterial = calcularDanoMaterial(bioma, areaForaAPP);
    const danoInterino = calcularDanoInterino(bioma, areaEmAPP);
    const danoExtrapatrimonialMercado = calcularDanoExtrapatrimonialMercado(bioma, areaForaAPP, areaEmAPP);
    const danoExtrapatrimonialSocial = calcularDanoExtrapatrimonialSocial(bioma, areaForaAPP, areaEmAPP);
    const total = danoMaterial + danoInterino + danoExtrapatrimonialMercado + danoExtrapatrimonialSocial;

    // Atualizar interface
    document.getElementById('danoMaterialMedia').textContent = formatarMoeda(danoMaterial);
    document.getElementById('danoInterinoMedia').textContent = formatarMoeda(danoInterino);
    document.getElementById('danoExtrapatrimonialMercado').textContent = formatarMoeda(danoExtrapatrimonialMercado);
    document.getElementById('danoExtrapatrimonialSocial').textContent = formatarMoeda(danoExtrapatrimonialSocial);
    document.getElementById('totalMedia').textContent = formatarMoeda(total);

    // Mostrar nota do dano material quando há área em APP com reparação in situ
    const reparacaoInSitu = document.getElementById('reparacaoInSitu').checked;
    const notaDanoMaterial = document.getElementById('notaDanoMaterial');
    notaDanoMaterial.style.display = (areaEmAPP > 0 && reparacaoInSitu) ? '' : 'none';

    // Gerar relatório
    const resultados = {
        danoMaterial,
        danoInterino,
        danoExtrapatrimonialMercado,
        danoExtrapatrimonialSocial,
        total,
        reparacaoInSitu: reparacaoInSitu && areaEmAPP > 0
    };

    const relatorio = gerarRelatorioCompleto(bioma, areaForaAPP, areaEmAPP, resultados);
    document.getElementById('textoRelatorio').innerHTML = relatorio;

    // Mostrar resultado
    document.getElementById('resultado').style.display = 'block';
    document.getElementById('resultado').scrollIntoView({ behavior: 'smooth' });
}

function atualizarParametrosCalculados() {
    const precoSocialUSD = parseFloat(document.getElementById('precoSocialCO2USD').value) || 24.20;
    const precoMercadoUSD = parseFloat(document.getElementById('precoMercadoCO2USD').value) || 5.00;
    const cotacaoDolar = parseFloat(document.getElementById('cotacaoDolar').value) || 5.71;
    
    document.getElementById('precoSocialCO2BRL').value = (precoSocialUSD * cotacaoDolar).toFixed(2);
    document.getElementById('precoMercadoCO2BRL').value = (precoMercadoUSD * cotacaoDolar).toFixed(2);
    
    // Calcular média dos estoques de CO2
    const estoques = [
        parseFloat(document.getElementById('estoqueCO2Caatinga').value) || 105.33,
        parseFloat(document.getElementById('estoqueCO2Cerrado').value) || 75,
        parseFloat(document.getElementById('estoqueCO2Amazonia').value) || 166,
        parseFloat(document.getElementById('estoqueCO2MataAtlantica').value) || 105.33,
        parseFloat(document.getElementById('estoqueCO2Pampas').value) || 105.33,
        parseFloat(document.getElementById('estoqueCO2Pantanal').value) || 75
    ];
    
    const media = estoques.reduce((a, b) => a + b, 0) / estoques.length;
    document.getElementById('estoqueCO2Media').value = media.toFixed(2);
}

// Buscar cotacao do dolar automaticamente
async function buscarCotacaoDolar() {
    const statusEl = document.getElementById('cotacaoStatus');
    const avisoEl = document.getElementById('cotacaoAviso');
    const inputEl = document.getElementById('cotacaoDolar');

    try {
        statusEl.textContent = '(buscando...)';
        statusEl.style.color = '#888';

        const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
        if (!response.ok) throw new Error('Erro na requisicao');

        const data = await response.json();
        const cotacao = parseFloat(data.USDBRL.bid);

        if (isNaN(cotacao) || cotacao <= 0) throw new Error('Valor invalido');

        inputEl.value = cotacao.toFixed(2);
        statusEl.textContent = '(atualizado automaticamente)';
        statusEl.style.color = '#27ae60';
        avisoEl.style.display = 'none';

        // Atualizar os campos calculados em BRL
        atualizarParametrosCalculados();
    } catch (error) {
        console.error('Erro ao buscar cotacao do dolar:', error);
        statusEl.textContent = '(valor padrao)';
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
    
    // Tentar obter o contador global primeiro
    try {
        const total = await obterTotalGlobal();
        document.getElementById('contadorValoracao').textContent = total;
    } catch (error) {
        console.error("Erro ao obter contador global:", error);
        // Em caso de erro, usar o contador local
        atualizarExibicaoContador();
    }
    
    // Listeners da barra de cookies
    document.getElementById('acceptCookies').addEventListener('click', aceitarCookies);
    document.getElementById('rejectCookies').addEventListener('click', rejeitarCookies);
    
    // Inicializar slideshow
    iniciarSlideshow();

    // Buscar cotacao do dolar e correção IPCA automaticamente
    buscarCotacaoDolar();
    buscarCorrecaoIPCA();

    // Listener para mudança de bioma
    biomaSelect.addEventListener('change', function() {
        atualizarImagemBioma(this.value);
    });
    
    // Listeners para parâmetros
    document.getElementById('precoSocialCO2USD').addEventListener('input', atualizarParametrosCalculados);
    document.getElementById('precoMercadoCO2USD').addEventListener('input', atualizarParametrosCalculados);
    document.getElementById('cotacaoDolar').addEventListener('input', atualizarParametrosCalculados);
    
    // Listeners para estoques de CO2
    ['estoqueCO2Caatinga', 'estoqueCO2Cerrado', 'estoqueCO2Amazonia', 'estoqueCO2MataAtlantica', 'estoqueCO2Pampas', 'estoqueCO2Pantanal'].forEach(id => {
        document.getElementById(id).addEventListener('input', atualizarParametrosCalculados);
    });
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        calcularValoracao();
    });

    // Listener para download PDF
    document.getElementById('btnDownloadPDF').addEventListener('click', baixarRelatorioPDF);

    // Listener para copiar relatorio
    document.getElementById('btnCopiar').addEventListener('click', copiarRelatorio);

    // Mostrar/esconder checkbox de reparação in situ conforme área APP
    document.getElementById('areaEmAPP').addEventListener('input', function() {
        const container = document.getElementById('checkboxReparacaoContainer');
        const valor = parseFloat(this.value) || 0;
        container.style.display = valor > 0 ? '' : 'none';
        if (valor <= 0) {
            document.getElementById('reparacaoInSitu').checked = true; // resetar ao esconder
        }
    });

    // Permitir apenas números positivos nos campos de área
    const areaInputs = document.querySelectorAll('#areaForaAPP, #areaEmAPP');
    areaInputs.forEach(input => {
        input.addEventListener('input', function() {
            if (this.value < 0) {
                this.value = 0;
            }
        });
    });

    // Permitir apenas números positivos nos parâmetros
    const parametroInputs = document.querySelectorAll('.parametro-item input:not([readonly])');
    parametroInputs.forEach(input => {
        input.addEventListener('input', function() {
            if (this.value < 0) {
                this.value = 0;
            }
        });
    });
});

