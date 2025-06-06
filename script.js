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

function calcularDanoMaterial(bioma, areaForaAPP) {
    if (!bioma || !areaForaAPP || areaForaAPP <= 0) {
        return { menor: 0, media: 0, maior: 0 };
    }

    const valores = valoresBiomasBase[bioma];
    return {
        menor: areaForaAPP * valores.menor_valor,
        media: areaForaAPP * valores.media,
        maior: areaForaAPP * valores.maior_valor
    };
}

function calcularDanoInterino(bioma, areaEmAPP) {
    if (!bioma || !areaEmAPP || areaEmAPP <= 0) {
        return { menor: 0, media: 0, maior: 0 };
    }

    const parametros = obterParametrosAtuais();
    const valores = valoresBiomasBase[bioma];
    const fator = parametros.taxaJurosAnual * (parametros.tempoRecuperacao + 1) / 2;
    
    return {
        menor: areaEmAPP * valores.menor_valor * fator,
        media: areaEmAPP * valores.media * fator,
        maior: areaEmAPP * valores.maior_valor * fator
    };
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
    
    const relatorio = `RELATÓRIO DE VALORAÇÃO DOS DANOS AMBIENTAIS DECORRENTES DE DESMATAMENTO ILEGAL

Data da valoração: ${dataAtual}
Bioma: ${bioma}

PARÂMETROS UTILIZADOS

DANO CLIMÁTICO E EXTRAPATRIMONIAL
Preço Social da tonelada de CO2 (US$) Cenário SSP2/RCP6.0 para o BR (RICKE et al., 2018): US$ ${parametros.precoSocialCO2USD.toFixed(2)}
Cotação Dólar hoje: R$ ${parametros.cotacaoDolar.toFixed(2)}
Preço Social da tonelada de CO2 (R$): ${formatarMoeda(parametros.precoSocialCO2BRL)}

Preço da tonelada CO2 (US$) no Mercado Voluntário de CO2: US$ ${parametros.precoMercadoCO2USD.toFixed(2)}
Preço da tonelada CO2 (R$) no Mercado Voluntário de CO2: ${formatarMoeda(parametros.precoMercadoCO2BRL)}

ESTOQUE DE TONELADAS DE CO2/HA
${bioma}: ${estoqueCO2} tCO2/ha

Taxa de juros anual (para o dano interino): ${(parametros.taxaJurosAnual * 100).toFixed(2)}%
Tempo mínimo para recuperação dos serviços ecossistêmicos básicos: ${parametros.tempoRecuperacao} anos

DANOS AMBIENTAIS

Dano ecológico, dano material, dano direto:
Mínimo: ${formatarMoeda(resultados.danoMaterial.menor)}
Média: ${formatarMoeda(resultados.danoMaterial.media)}
Máximo: ${formatarMoeda(resultados.danoMaterial.maior)}

Dano interino (em relação às áreas que serão recuperadas):
Mínimo: ${formatarMoeda(resultados.danoInterino.menor)}
Média: ${formatarMoeda(resultados.danoInterino.media)}
Máximo: ${formatarMoeda(resultados.danoInterino.maior)}

Dano Extrapatrimonial (proxy preço do carbono no mercado voluntário): ${formatarMoeda(resultados.danoExtrapatrimonialMercado)}

Dano Extrapatrimonial (CSC - Cenário SSP2/RCP6.0 para o Brasil, cf. RICKE et al., 2018): ${formatarMoeda(resultados.danoExtrapatrimonialSocial)}

CENÁRIOS QUANTO À REPARAÇÃO

Hipótese da recuperação da área desmatada (recuperação in situ)
Quando houver recuperação da área desmatada (recuperação in situ) por danos em área de reserva legal (ARL), área de preservação permanente (APP) ou áreas excedentes caso ele opte pela reparação in natura e in situ, degradador deverá indenizar os danos interinos no valor de ${formatarMoeda(resultados.danoInterino.media)} (além de indenizar os danos extrapatrimoniais). Neste cenário, o proprietário deverá apresentar e executar Projeto de Recuperação de Áreas Degradadas (PRADA) ou laudo de constatação de reparação do dano ambiental. Alternativamente, a parte requerida poderá realizar a compensação ecológica do dano interino e extrapatrimonial (veja a seguir).

Hipótese da não recuperação da área ilegalmente desmatada (desmatamento ilegal fora de ARL e APP a ser regularizado)
Quando não houver reparação in situ (área passível de exploração), deverá ser realizada a compensação ecológica ou o pagamento de indenização, para que o proprietário possa regularizar a exploração da área. Neste caso, a valoração (dano material) varia de ${formatarMoeda(resultados.danoMaterial.menor)} a ${formatarMoeda(resultados.danoMaterial.maior)}, tendo como média ${formatarMoeda(resultados.danoMaterial.media)}. Também deverão ser reparados os danos climáticos, estimados em ${formatarMoeda(resultados.danoExtrapatrimonialSocial)} e extrapatrimoniais (${formatarMoeda(resultados.danoExtrapatrimonialMercado)}).

COMPENSAÇÃO ECOLÓGICA
Alternativamente, propõe-se a compensação ecológica dos danos materiais nos seguintes termos: instituição, no próprio imóvel ou imóvel de terceiro no mesmo bioma, estado da federação e preferencialmente, no mesmo município ou município contíguo, de RPPN, servidão ambiental perpétua ou aquisição e doação ao poder público de área em unidade de conservação igual à área ilegalmente desmatada (arredondada), isto é ${areaArredondada} hectares, remanescendo o pagamento de indenização por danos extrapatrimoniais (que poderá ser reduzido a critério do promotor de Justiça, conforme a relevância da área protegida a ser criada) no valor de ${formatarMoeda(resultados.danoExtrapatrimonialMercado)}.

O valor dos danos extrapatrimoniais remanescente também poderá ser reduzido com o aumento da área a ser protegida, descontando-se o valor dos custos médios de reparação para cada hectare adicional de vegetação nativa no montante do dano extrapatrimonial (isto é, ${formatarMoeda(valoresBiomasBase[bioma].media)} por hectare fora de ARL acrescentado na RPPN além da área desmatada).

Regras para a instituição de RPPN:
1) A RPPN deverá abranger a área de reserva legal do imóvel, embora a ARL abrangida não será computada para fins da compensação ecológica;
2) A área protegida deverá, salvo absoluta impossibilidade, (2.1) consistir-se de um único bloco de vegetação nativa e (2.2) ser lindeira à área de reserva legal ou área de preservação permanente existente no imóvel, visando diminuir os efeitos da fragmentação de habitats e efeitos de borda;

Na hipótese de RPPN, toda a área protegida continuará ser de propriedade da parte requerida, que poderá aferir renda com a venda de créditos de carbono e cotas de reserva ambiental (CRA) para imóveis com déficit de áreas de reserva legal.

REFERÊNCIAS BIBLIOGRÁFICAS

GONZAGA, Claudio Angelo Correa; ROQUETTE, José Guilherme; BRASILEIRO, Andrea Castelo Branco; SINISGALLI, Paulo Antonio de Almeida. Valoração e compensação ecológica dos danos ambientais causados pelo desmatamento ilegal. Anais do V Simpósio Interdisciplinar de Ciência Ambiental da USP (SICAM), 5., 2024, São Paulo. São Paulo: IEE-USP, 2025. p. 210-217. Disponível em <https://damnum.netlify.app/metodologia.pdf>.

BRASIL. Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis – IBAMA. Portaria nº 118, de 3 de outubro de 2022. Institui Procedimento Operacional Padrão (POP) para Estimativa dos Custos de Implantação e Manutenção de Projeto de Recuperação Ambiental nos Biomas Brasileiros, para Compor Valor Mínimo da Reparação por Danos Ambientais à Vegetação Nativa, em Processos Administrativos no âmbito do Ibama. Disponível em: <https://www.ibama.gov.br/component/legislacao/?view=legislacao&force=1&legislacao=139171>.

RICKE, Katharine et al. Country-level social cost of carbon. Nature Climate Change, v. 8, n. 10, p. 895-900, 2018. Disponível em: <https://www.nature.com/articles/s41558-018-0282-y>.`;

    return relatorio;
}

function baixarRelatorioPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Configurações de margem (A4: 210x297mm)
    const margemSuperior = 30; // 3cm
    const margemEsquerda = 30; // 3cm
    const margemInferior = 20; // 2cm
    const margemDireita = 20; // 2cm
    const larguraTexto = 210 - margemEsquerda - margemDireita; // 160mm
    const alturaTexto = 297 - margemSuperior - margemInferior; // 247mm
    
    const textoRelatorio = document.getElementById('textoRelatorio').textContent;
    const linhas = textoRelatorio.split('\n');
    
    let y = margemSuperior;
    let paginaAtual = 1;
    
    // Função para adicionar cabeçalho
    function adicionarCabecalho() {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`DAMNUM - Valoração de Danos Ambientais - Página ${paginaAtual}`, 105, 15, { align: 'center' });
    }
    
    // Adicionar cabeçalho na primeira página
    adicionarCabecalho();
    
    // Configurações de texto
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    // Processar cada linha
    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        
        // Verificar se é um título principal (tudo maiúsculo)
        if (linha === linha.toUpperCase() && linha.trim() && !linha.includes(':') && linha.length > 5) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            
            // Verificar se precisa de nova página
            if (y > 270) {
                doc.addPage();
                paginaAtual++;
                y = margemSuperior;
                adicionarCabecalho();
            }
            
            doc.text(linha, margemEsquerda, y);
            y += 7;
            
            // Voltar para configuração normal
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            continue;
        }
        
        // Verificar se é um subtítulo
        if (linha.trim() && !linha.includes(':') && linha.length > 3 && linha === linha.trim()) {
            doc.setFont('helvetica', 'bold');
            
            // Verificar se precisa de nova página
            if (y > 270) {
                doc.addPage();
                paginaAtual++;
                y = margemSuperior;
                adicionarCabecalho();
            }
            
            doc.text(linha, margemEsquerda, y);
            y += 6;
            
            // Voltar para configuração normal
            doc.setFont('helvetica', 'normal');
            continue;
        }
        
        // Verificar se é uma linha em branco
        if (!linha.trim()) {
            y += 4;
            continue;
        }
        
        // Verificar se precisa de nova página
        if (y > 270) {
            doc.addPage();
            paginaAtual++;
            y = margemSuperior;
            adicionarCabecalho();
        }
        
        // Texto normal
        const splitText = doc.splitTextToSize(linha, larguraTexto);
        doc.text(splitText, margemEsquerda, y);
        y += 5 * splitText.length;
    }
    
    // Salvar o PDF
    const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    doc.save(`DAMNUM_Relatorio_${dataAtual}.pdf`);
}

function baixarRelatorioDOCX() {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
    
    const textoRelatorio = document.getElementById('textoRelatorio').textContent;
    const linhas = textoRelatorio.split('\n');
    
    const children = [];
    
    linhas.forEach(linha => {
        // Linha em branco
        if (!linha.trim()) {
            children.push(new Paragraph({
                text: '',
                spacing: { after: 100 }
            }));
            return;
        }
        
        // Título principal (tudo maiúsculo)
        if (linha === linha.toUpperCase() && linha.trim() && !linha.includes(':') && linha.length > 5) {
            children.push(new Paragraph({
                text: linha,
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 300, after: 200 }
            }));
            return;
        }
        
        // Parâmetros com valores
        if (linha.includes('US$') || linha.includes('R$') || linha.includes('tCO2/ha') || 
            linha.includes('%') || (linha.includes('anos') && linha.includes(':'))) {
            const partes = linha.split(':');
            if (partes.length === 2) {
                children.push(new Paragraph({
                    children: [
                        new TextRun({ text: partes[0] + ': ' }),
                        new TextRun({ text: partes[1].trim(), bold: true })
                    ],
                    spacing: { after: 100 }
                }));
            } else {
                children.push(new Paragraph({
                    text: linha,
                    spacing: { after: 100 }
                }));
            }
            return;
        }
        
        // Valores médios (destaque)
        if (linha.includes('Média:')) {
            children.push(new Paragraph({
                children: [new TextRun({ text: linha, bold: true })],
                shading: { fill: "DDDDDD" },
                spacing: { after: 100 }
            }));
            return;
        }
        
        // Texto normal
        children.push(new Paragraph({
            text: linha,
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 100 }
        }));
    });
    
    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: convertInchesToTwip(1.18), // 3cm
                        right: convertInchesToTwip(0.79), // 2cm
                        bottom: convertInchesToTwip(0.79), // 2cm
                        left: convertInchesToTwip(1.18) // 3cm
                    }
                }
            },
            children: children
        }]
    });
    
    Packer.toBlob(doc).then(blob => {
        const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        saveAs(blob, `DAMNUM_Relatorio_${dataAtual}.docx`);
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

    // Calcular totais
    const totais = {
        menor: danoMaterial.menor + danoInterino.menor + danoExtrapatrimonialMercado,
        media: danoMaterial.media + danoInterino.media + danoExtrapatrimonialMercado,
        maior: danoMaterial.maior + danoInterino.maior + danoExtrapatrimonialMercado
    };

    // Atualizar interface
    document.getElementById('danoMaterialMenor').textContent = formatarMoeda(danoMaterial.menor);
    document.getElementById('danoMaterialMedia').textContent = formatarMoeda(danoMaterial.media);
    document.getElementById('danoMaterialMaior').textContent = formatarMoeda(danoMaterial.maior);

    document.getElementById('danoInterinoMenor').textContent = formatarMoeda(danoInterino.menor);
    document.getElementById('danoInterinoMedia').textContent = formatarMoeda(danoInterino.media);
    document.getElementById('danoInterinoMaior').textContent = formatarMoeda(danoInterino.maior);

    document.getElementById('danoExtrapatrimonialMercado').textContent = formatarMoeda(danoExtrapatrimonialMercado);
    document.getElementById('danoExtrapatrimonialSocial').textContent = formatarMoeda(danoExtrapatrimonialSocial);

    document.getElementById('totalMenor').textContent = formatarMoeda(totais.menor);
    document.getElementById('totalMedia').textContent = formatarMoeda(totais.media);
    document.getElementById('totalMaior').textContent = formatarMoeda(totais.maior);

    // Gerar relatório
    const resultados = {
        danoMaterial,
        danoInterino,
        danoExtrapatrimonialMercado,
        danoExtrapatrimonialSocial,
        totais
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

    // Listener para download DOCX
    document.getElementById('btnDownloadDOCX').addEventListener('click', baixarRelatorioDOCX);

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

