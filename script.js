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

// Dados extraídos da planilha Excel (valores base)
const valoresBiomasBase = {
    'CERRADO': {
        'menor_valor': 1580.50,
        'media': 11538.92,
        'maior_valor': 17948.50
    },
    'FLORESTA AMAZÔNICA': {
        'menor_valor': 1745.75,
        'media': 6010.33,
        'maior_valor': 15170.17
    },
    'PANTANAL MATO-GROSSENSE': {
        'menor_valor': 981.00,
        'media': 16220.67,
        'maior_valor': 29334.00
    },
    'CAATINGA': {
        'menor_valor': 1536.00,
        'media': 11198.38,
        'maior_valor': 20860.75
    },
    'PAMPAS': {
        'menor_valor': 2090.00,
        'media': 12285.25,
        'maior_valor': 23008.25
    },
    'MATA ATLÂNTICA': {
        'menor_valor': 1521.00,
        'media': 15737.26,
        'maior_valor': 24302.00
    }
};

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

function gerarRelatorioCompleto(bioma, areaForaAPP, areaEmAPP, resultados) {
    const parametros = obterParametrosAtuais();
    const areaTotal = (areaForaAPP || 0) + (areaEmAPP || 0);
    const areaArredondada = Math.ceil(areaForaAPP || 0);
    const estoqueCO2 = obterEstoqueCO2PorBioma(bioma);
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    const entendimento = obterEntendimento();
    const valores = valoresBiomasBase[bioma];
    const fator = parametros.taxaJurosAnual * (parametros.tempoRecuperacao + 1) / 2;

    const nomeEntendimento = entendimento === 'irdr'
        ? 'IRDR 13/TJMT (PJe 1019783-07.2025.8.11.0000)'
        : 'Gonzaga et al. (2025)';

    const separador = '---------------------------------------------------';

    let memoriaCalculo = `MEMORIA DE CALCULO

${separador}
 DADOS DO CASO
${separador}

  Bioma selecionado: ${bioma}
  Entendimento adotado: ${nomeEntendimento}
  Area desmatada fora de APP e ARL (A1): ${(areaForaAPP || 0).toFixed(4)} ha
  Area desmatada em APP e ARL (A2): ${(areaEmAPP || 0).toFixed(4)} ha
  Area total desmatada (A1 + A2): ${areaTotal.toFixed(4)} ha

${separador}
 PARAMETROS UTILIZADOS
${separador}

  Custo medio de reparacao por hectare (Portaria 118/2022 - IBAMA):
    Custo medio (Cmed): ${formatarMoeda(valores.media)}/ha

  Preco Social CO2 (US$): US$ ${parametros.precoSocialCO2USD.toFixed(2)}
  Cotacao Dolar: R$ ${parametros.cotacaoDolar.toFixed(2)}
  Preco Social CO2 (R$): ${formatarMoeda(parametros.precoSocialCO2BRL)}
    Calculo: US$ ${parametros.precoSocialCO2USD.toFixed(2)} x R$ ${parametros.cotacaoDolar.toFixed(2)} = ${formatarMoeda(parametros.precoSocialCO2BRL)}

  Preco Mercado Voluntario CO2 (US$): US$ ${parametros.precoMercadoCO2USD.toFixed(2)}
  Preco Mercado Voluntario CO2 (R$): ${formatarMoeda(parametros.precoMercadoCO2BRL)}
    Calculo: US$ ${parametros.precoMercadoCO2USD.toFixed(2)} x R$ ${parametros.cotacaoDolar.toFixed(2)} = ${formatarMoeda(parametros.precoMercadoCO2BRL)}

  Estoque de CO2 do bioma ${bioma}: ${estoqueCO2} tCO2/ha

  Taxa de juros anual (i): ${(parametros.taxaJurosAnual * 100).toFixed(2)}%
  Tempo de recuperacao (t): ${parametros.tempoRecuperacao} anos

`;

    // --- 1. DANO MATERIAL ---
    memoriaCalculo += `${separador}
 1. DANO MATERIAL (Dano Ecologico / Dano Direto)
${separador}

  Formula: Dano Material = A1 x Custo de Reparacao/ha

  Onde:
    A1 = Area desmatada fora de APP e ARL = ${(areaForaAPP || 0).toFixed(4)} ha
`;

    if (!areaForaAPP || areaForaAPP <= 0) {
        memoriaCalculo += `
  Nao ha area fora de APP/ARL informada, portanto:
    Dano Material = R$ 0,00
`;
    } else if (entendimento === 'irdr') {
        memoriaCalculo += `
  Entendimento IRDR 13/TJMT: todo o dano material para area fora de APP e ARL e igual a zero (remanesce apenas o dano extrapatrimonial).

    Dano Material = R$ 0,00
`;
    } else {
        memoriaCalculo += `
  Calculo:
    ${(areaForaAPP).toFixed(4)} ha x ${formatarMoeda(valores.media)}/ha = ${formatarMoeda(resultados.danoMaterial)}

  DANO MATERIAL = ${formatarMoeda(resultados.danoMaterial)}
`;
    }

    // --- 2. DANO INTERINO ---
    memoriaCalculo += `
${separador}
 2. DANO INTERINO
${separador}

  Formula: Dano Interino = A2 x Custo de Reparacao/ha x Fator

  Onde:
    A2 = Area desmatada em APP e ARL = ${(areaEmAPP || 0).toFixed(4)} ha
    Fator = i x (t + 1) / 2

  Calculo do Fator:
    Fator = ${parametros.taxaJurosAnual} x (${parametros.tempoRecuperacao} + 1) / 2
    Fator = ${parametros.taxaJurosAnual} x ${parametros.tempoRecuperacao + 1} / 2
    Fator = ${fator.toFixed(4)}
`;

    if (!areaEmAPP || areaEmAPP <= 0) {
        memoriaCalculo += `
  Nao ha area em APP/ARL informada, portanto:
    Dano Interino = R$ 0,00
`;
    } else {
        memoriaCalculo += `
  Calculo:
    ${(areaEmAPP).toFixed(4)} ha x ${formatarMoeda(valores.media)}/ha x ${fator.toFixed(4)} = ${formatarMoeda(resultados.danoInterino)}

  DANO INTERINO = ${formatarMoeda(resultados.danoInterino)}
`;
    }

    // --- 3. DANO EXTRAPATRIMONIAL ---
    memoriaCalculo += `
${separador}
 3. DANO EXTRAPATRIMONIAL
${separador}

  3a) Mercado Voluntario de Carbono
  Formula: (A1 + A2) x Preco CO2 Mercado (R$) x Estoque CO2/ha

  Calculo:
    ${areaTotal.toFixed(4)} ha x ${formatarMoeda(parametros.precoMercadoCO2BRL)}/tCO2 x ${estoqueCO2} tCO2/ha
    = ${formatarMoeda(resultados.danoExtrapatrimonialMercado)}

  DANO EXTRAPATRIMONIAL (Mercado Voluntario) = ${formatarMoeda(resultados.danoExtrapatrimonialMercado)}

  3b) Custo Social do Carbono (CSC - Cenario SSP2/RCP6.0)
  Formula: (A1 + A2) x Preco Social CO2 (R$) x Estoque CO2/ha

  Calculo:
    ${areaTotal.toFixed(4)} ha x ${formatarMoeda(parametros.precoSocialCO2BRL)}/tCO2 x ${estoqueCO2} tCO2/ha
    = ${formatarMoeda(resultados.danoExtrapatrimonialSocial)}

  DANO CLIMATICO (Custo Social do Carbono) = ${formatarMoeda(resultados.danoExtrapatrimonialSocial)}

`;

    // --- 4. TOTAIS ---
    memoriaCalculo += `${separador}
 4. TOTAL
${separador}

  Formula: Total = Dano Material + Dano Interino + Dano Extrapatrimonial (mercado) + Dano Climatico

  Calculo:
    ${formatarMoeda(resultados.danoMaterial)} + ${formatarMoeda(resultados.danoInterino)} + ${formatarMoeda(resultados.danoExtrapatrimonialMercado)} + ${formatarMoeda(resultados.danoExtrapatrimonialSocial)}
    = ${formatarMoeda(resultados.total)}

  VALOR TOTAL = ${formatarMoeda(resultados.total)}

`;

    // --- Cenários de reparação ---
    memoriaCalculo += `${separador}
 CENARIOS QUANTO A REPARACAO
${separador}

1) Hipotese da recuperacao da area desmatada (recuperacao in situ):
Quando houver recuperacao da area desmatada (recuperacao in situ) por danos em area de reserva legal (ARL), area de preservacao permanente (APP) ou areas excedentes caso ele opte pela reparacao in natura e in situ, degradador devera indenizar os danos interinos no valor de ${formatarMoeda(resultados.danoInterino)} (alem de indenizar os danos extrapatrimoniais). Neste cenario, o proprietario devera apresentar e executar Projeto de Recuperacao de Areas Degradadas (PRADA) ou laudo de constatacao de reparacao do dano ambiental. Alternativamente, a parte requerida podera realizar a compensacao ecologica do dano interino e extrapatrimonial (veja a seguir).

2) Hipotese da nao recuperacao da area ilegalmente desmatada (desmatamento ilegal fora de ARL e APP a ser regularizado):
Quando nao houver reparacao in situ (area passivel de exploracao), devera ser realizada a compensacao ecologica ou o pagamento de indenizacao, para que o proprietario possa regularizar a exploracao da area. Neste caso, a valoracao (dano material) e de ${formatarMoeda(resultados.danoMaterial)}. Tambem deverao ser reparados os danos climaticos, estimados em ${formatarMoeda(resultados.danoExtrapatrimonialSocial)} e extrapatrimoniais (${formatarMoeda(resultados.danoExtrapatrimonialMercado)}).

COMPENSACAO ECOLOGICA
Alternativamente, propoe-se a compensacao ecologica dos danos materiais nos seguintes termos: instituicao, no proprio imovel ou imovel de terceiro no mesmo bioma, estado da federacao e preferencialmente, no mesmo municipio ou municipio contiguo, de RPPN, servidao ambiental perpetua ou aquisicao e doacao ao poder publico de area em unidade de conservacao igual a area ilegalmente desmatada (arredondada), isto e ${areaArredondada} hectares, remanescendo o pagamento de indenizacao por danos extrapatrimoniais (que podera ser reduzido a criterio do promotor de Justica, conforme a relevancia da area protegida a ser criada) no valor de ${formatarMoeda(resultados.danoExtrapatrimonialMercado)}.

O valor dos danos extrapatrimoniais remanescente tambem podera ser reduzido com o aumento da area a ser protegida, descontando-se o valor dos custos medios de reparacao para cada hectare adicional de vegetacao nativa no montante do dano extrapatrimonial (isto e, ${formatarMoeda(valoresBiomasBase[bioma].media)} por hectare fora de ARL acrescentado na RPPN alem da area desmatada).

Regras para a instituicao de RPPN:
1) A RPPN devera abranger a area de reserva legal do imovel, embora a ARL abrangida nao sera computada para fins da compensacao ecologica;
2) A area protegida devera, salvo absoluta impossibilidade, (2.1) consistir-se de um unico bloco de vegetacao nativa e (2.2) ser lindeira a area de reserva legal ou area de preservacao permanente existente no imovel, visando diminuir os efeitos da fragmentacao de habitats e efeitos de borda;

Na hipotese de RPPN, toda a area protegida continuara ser de propriedade da parte requerida, que podera aferir renda com a venda de creditos de carbono e cotas de reserva ambiental (CRA) para imoveis com deficit de areas de reserva legal.

${separador}
 REFERENCIAS BIBLIOGRAFICAS
${separador}

GONZAGA, Claudio Angelo Correa; ROQUETTE, Jose Guilherme; BRASILEIRO, Andrea Castelo Branco; SINISGALLI, Paulo Antonio de Almeida. Valoracao e compensacao ecologica dos danos ambientais causados pelo desmatamento ilegal. Anais do V Simposio Interdisciplinar de Ciencia Ambiental da USP (SICAM), 5., 2024, Sao Paulo. Sao Paulo: IEE-USP, 2025. p. 210-217. Disponivel em <https://damnum.netlify.app/metodologia.pdf>.

BRASIL. Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renovaveis - IBAMA. Portaria n. 118, de 3 de outubro de 2022. Institui Procedimento Operacional Padrao (POP) para Estimativa dos Custos de Implantacao e Manutencao de Projeto de Recuperacao Ambiental nos Biomas Brasileiros, para Compor Valor Minimo da Reparacao por Danos Ambientais a Vegetacao Nativa, em Processos Administrativos no ambito do Ibama. Disponivel em: <https://www.ibama.gov.br/component/legislacao/?view=legislacao&force=1&legislacao=139171>.

RICKE, Katharine et al. Country-level social cost of carbon. Nature Climate Change, v. 8, n. 10, p. 895-900, 2018. Disponivel em: <https://www.nature.com/articles/s41558-018-0282-y>.

${separador}
 NOTA
${separador}
Os valores de custo de reparacao por hectare utilizados neste relatorio correspondem a media dos custos de implantacao e manutencao de projetos de recuperacao ambiental (Portaria 118/2022 - IBAMA). Para referencia, os valores minimo e maximo para o bioma ${bioma} sao, respectivamente, ${formatarMoeda(valores.menor_valor)}/ha e ${formatarMoeda(valores.maior_valor)}/ha.`;

    const cabecalho = `RELATORIO DE VALORACAO DOS DANOS AMBIENTAIS DECORRENTES DE DESMATAMENTO ILEGAL

Data da valoracao: ${dataAtual}
Bioma: ${bioma}
Entendimento: ${nomeEntendimento}
DAMNUM v. 5.0

`;

    return cabecalho + memoriaCalculo;
}

function baixarRelatorioPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    // Margens (A4: 210x297mm)
    const mSup = 30;
    const mEsq = 30;
    const mInf = 25;
    const mDir = 20;
    const largura = 210 - mEsq - mDir;
    const alturaMax = 297 - mInf;

    const textoRelatorio = document.getElementById('textoRelatorio').textContent;
    const linhas = textoRelatorio.split('\n');

    let y = mSup;
    let pag = 1;

    function cabecalhoRodape() {
        // Cabecalho
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text('DAMNUM - Valoracao de Danos Ambientais', 105, 12, { align: 'center' });
        // Rodape
        doc.text('Pagina ' + pag, 105, 290, { align: 'center' });
        // Linha separadora do cabecalho
        doc.setDrawColor(180);
        doc.setLineWidth(0.3);
        doc.line(mEsq, 15, 210 - mDir, 15);
        doc.setTextColor(0);
    }

    function novaPagina() {
        doc.addPage();
        pag++;
        y = mSup;
        cabecalhoRodape();
    }

    function verificarEspaco(necessario) {
        if (y + necessario > alturaMax) {
            novaPagina();
        }
    }

    cabecalhoRodape();

    const tamanhoNormal = 10;
    const tamanhoTitulo = 12;
    const alturaLinha = 5;

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];

        // Linha separadora (---)
        if (linha.trim().match(/^-{10,}$/)) {
            verificarEspaco(6);
            doc.setDrawColor(100);
            doc.setLineWidth(0.5);
            doc.line(mEsq, y, 210 - mDir, y);
            y += 4;
            continue;
        }

        // Linha em branco
        if (!linha.trim()) {
            y += 3;
            continue;
        }

        // Titulo de secao (ex: " 1. DANO MATERIAL ..." ou "MEMORIA DE CALCULO" etc)
        const ehTituloSecao = /^\s*(MEMORIA DE CALCULO|DADOS DO CASO|PARAMETROS UTILIZADOS|\d+\.\s+[A-Z]+|CENARIOS QUANTO|REFERENCIAS BIBLIOGRAFICAS|NOTA|COMPENSACAO ECOLOGICA|RELATORIO DE VALORACAO)/.test(linha);
        const ehResultado = /^\s*(DANO MATERIAL|DANO INTERINO|DANO EXTRAPATRIMONIAL|DANO CLIMATICO|VALOR TOTAL)\s*=/.test(linha);

        if (ehTituloSecao) {
            verificarEspaco(10);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(tamanhoTitulo);
            const splitTitulo = doc.splitTextToSize(linha.trim(), largura);
            doc.text(splitTitulo, mEsq, y);
            y += alturaLinha * splitTitulo.length + 2;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(tamanhoNormal);
            continue;
        }

        if (ehResultado) {
            verificarEspaco(10);
            // Fundo destacado
            const splitRes = doc.splitTextToSize(linha.trim(), largura - 4);
            const alturaBg = alturaLinha * splitRes.length + 2;
            doc.setFillColor(230, 240, 230);
            doc.rect(mEsq - 1, y - 4, largura + 2, alturaBg + 2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(tamanhoNormal);
            doc.text(splitRes, mEsq + 1, y);
            y += alturaBg + 1;
            doc.setFont('helvetica', 'normal');
            continue;
        }

        // Texto normal
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(tamanhoNormal);
        const splitText = doc.splitTextToSize(linha, largura);
        verificarEspaco(alturaLinha * splitText.length);
        doc.text(splitText, mEsq, y);
        y += alturaLinha * splitText.length;
    }

    const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    doc.save('DAMNUM_Relatorio_' + dataAtual + '.pdf');
}

function copiarRelatorio() {
    const textoRelatorio = document.getElementById('textoRelatorio').textContent;
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

    // Gerar relatório
    const resultados = {
        danoMaterial,
        danoInterino,
        danoExtrapatrimonialMercado,
        danoExtrapatrimonialSocial,
        total
    };

    const relatorio = gerarRelatorioCompleto(bioma, areaForaAPP, areaEmAPP, resultados);
    document.getElementById('textoRelatorio').textContent = relatorio;

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

