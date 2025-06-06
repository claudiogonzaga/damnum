# DAMNUM - Contador Global com Google Sheets

## Implementação do Contador Global

O sistema DAMNUM agora possui um contador global que registra todas as valorações realizadas em uma planilha do Google Sheets. Isso permite um registro centralizado e persistente de todas as valorações feitas por todos os usuários do sistema.

### Como Funciona

1. **Registro de Valorações**: Cada vez que um usuário gera um relatório de valoração, o sistema:
   - Registra a data/hora da valoração
   - Registra o bioma selecionado
   - Registra a área total valorada
   - Tenta obter o IP do usuário (anônimo se não for possível)
   - Envia esses dados para a planilha do Google Sheets

2. **Contador Global**: O contador exibido no rodapé do site agora mostra o número total de valorações registradas na planilha, em vez de apenas as valorações feitas no navegador local.

3. **Backup Local**: O sistema mantém um contador local como backup, caso haja problemas de conexão com a planilha.

### Planilha do Google Sheets

A planilha está configurada em:
https://docs.google.com/spreadsheets/d/1iSMPGb5G0oweF4mPazzu7pM17zZMrSFwgGpSN0VYk9Q/

Colunas da planilha:
- **DATA HORA**: Data e hora da valoração
- **IP**: Endereço IP do usuário (anônimo se não disponível)
- **BIOMA**: Bioma selecionado para a valoração
- **AREA**: Área total valorada (em hectares)

### Google Apps Script

O sistema utiliza um Google Apps Script para interagir com a planilha. O script está configurado para:

1. **Receber dados** (método POST): Adiciona uma nova linha na planilha com os dados da valoração
2. **Fornecer o total** (método GET): Retorna o número total de valorações registradas

URL do Apps Script:
`https://script.google.com/macros/s/AKfycbzeD3w1Z4U5XdfM-9hod7pjNjZAwL4zTDK37P-3csJO9MVrd54naMkkZM1QwcjaAOl90Q/exec`

### Implementação Técnica

A implementação utiliza uma abordagem que evita problemas de CORS (Cross-Origin Resource Sharing):

1. Para **registrar valorações**, o sistema cria um iframe oculto que faz a requisição para o Google Apps Script
2. Para **obter o total**, o sistema faz uma requisição direta ao Google Apps Script

### Manutenção

Para manter o contador funcionando corretamente:

1. **Não exclua linhas** da planilha do Google Sheets
2. **Não altere a estrutura** das colunas
3. **Não revogue o acesso** do Google Apps Script à planilha
4. **Não altere a URL** do Apps Script no código JavaScript

### Personalização

Se desejar alterar a planilha ou o script:

1. Crie uma nova planilha com a mesma estrutura
2. Crie um novo Google Apps Script com o mesmo código
3. Atualize a URL `CONTADOR_API_URL` no arquivo `script.js`

## Alterações Realizadas

1. Adicionadas novas funções no arquivo `script.js`:
   - `registrarValoracaoGlobal(bioma, area)`: Registra uma valoração na planilha
   - `obterTotalGlobal()`: Obtém o total de valorações da planilha
   - Modificada a função `calcularValoracao()` para registrar na planilha
   - Modificada a função `DOMContentLoaded` para obter o total global ao carregar a página

2. Adicionada constante `CONTADOR_API_URL` com a URL do Google Apps Script

## Próximos Passos

1. **Monitoramento**: Verifique periodicamente a planilha para garantir que os registros estão sendo feitos corretamente
2. **Backup**: Faça backups regulares da planilha para evitar perda de dados
3. **Análise**: Use os dados coletados para análises estatísticas sobre o uso do sistema

---

© 2025 Claudio Angelo Correa Gonzaga e Bianca Pazini. Todos os direitos reservados.

