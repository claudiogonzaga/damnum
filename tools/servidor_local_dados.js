#!/usr/bin/env node
// Servidor local dos blocos do mapa, para desenvolvimento e testes (DAMNUM 7.1).
// Serve uma pasta com a mesma estrutura de caminhos da publicação
// (<raiz>/v1/versao.json, indice.json, blocos/<chave>.gz, municipio_cpret.json) e
// os mesmos cabeçalhos do arquivo _headers. Sem dependências.
//
// Uso: node tools/servidor_local_dados.js <pasta> [porta] [origem permitida]
// Não registra as consultas.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function cabecalhos(caminho, origem) {
    const h = { 'Access-Control-Allow-Origin': origem, 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    if (/\/blocos\/[^/]+\.gz$/.test(caminho)) {
        // Bloco imutável: o gzip é o próprio arquivo (sem Content-Encoding), para o
        // SHA-256 do índice valer sobre os bytes recebidos.
        h['Content-Type'] = 'application/octet-stream';
        h['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
        h['Content-Type'] = 'application/json; charset=utf-8';
        h['Cache-Control'] = 'public, max-age=300';
    }
    return h;
}

function criarServidor(raiz, origem) {
    raiz = path.resolve(raiz);
    return http.createServer((req, res) => {
        const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const arquivo = path.join(raiz, caminho);
        const permitido = /^\/v\d+\/(versao\.json|indice\.json|municipio_cpret\.json|blocos\/[A-Za-z0-9_]+\.gz)$/.test(caminho);
        if (req.method !== 'GET' || !permitido || !arquivo.startsWith(raiz + path.sep) || !fs.existsSync(arquivo)) {
            res.writeHead(404, { 'Access-Control-Allow-Origin': origem, 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Não encontrado');
            return;
        }
        let conteudo;
        try {
            conteudo = fs.readFileSync(arquivo);
        } catch (erro) {
            res.writeHead(500, { 'Access-Control-Allow-Origin': origem, 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Falha ao ler o arquivo');
            return;
        }
        res.writeHead(200, cabecalhos(caminho, origem));
        res.end(conteudo);
    });
}

if (require.main === module) {
    const [pasta, porta, origem] = process.argv.slice(2);
    if (!pasta) {
        console.error('Uso: node tools/servidor_local_dados.js <pasta> [porta] [origem permitida]');
        process.exit(1);
    }
    criarServidor(pasta, origem || '*').listen(Number(porta) || 8772, '127.0.0.1', function () {
        console.log('Blocos de ' + path.resolve(pasta) + ' em http://127.0.0.1:' + this.address().port);
    });
}

module.exports = { criarServidor, cabecalhos };
