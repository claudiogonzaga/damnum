// Nenhum serviço de IP no código publicado, e o contador recebe só bioma e área.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const publicados = ['script.js', 'index.html', 'metodologia.html', 'contato.html', 'changelog.html']
    .concat(fs.readdirSync(path.join(raiz, 'js')).map(f => 'js/' + f));

test('nenhuma chamada a serviço de IP', () => {
    for (const arquivo of publicados) {
        const texto = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
        assert.ok(!/ipify|ipinfo|ip-api|ipapi|myip|checkip|ifconfig\.me|icanhazip/i.test(texto), arquivo);
    }
});

test('contador: parâmetros bioma, area e ip fixo "anônimo"', () => {
    const script = fs.readFileSync(path.join(raiz, 'script.js'), 'utf8');
    const corpo = script.slice(script.indexOf('async function registrarValoracaoGlobal'), script.indexOf('async function obterTotalGlobal'));
    assert.match(corpo, /\?bioma=\$\{encodeURIComponent\(bioma\)\}&area=\$\{encodeURIComponent\(area\)\}&ip=\$\{encodeURIComponent\('anônimo'\)\}/);
    assert.ok(!/fetch\(/.test(corpo));
    assert.match(script, /registrarValoracaoGlobal\(bioma, r\.areas\.total\)/);
});

test('endpoint do contador inalterado', () => {
    const script = fs.readFileSync(path.join(raiz, 'script.js'), 'utf8');
    assert.ok(script.includes('https://script.google.com/macros/s/AKfycbzeD3w1Z4U5XdfM-9hod7pjNjZAwL4zTDK37P-3csJO9MVrd54naMkkZM1QwcjaAOl90Q/exec'));
});

test('taxa do dano interino: rótulo em percentual e padrão 6', () => {
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    assert.match(html, /id="taxaJurosAnual" value="6" step="0.1" min="0" max="30"/);
    assert.match(html, /Taxa de juros anual do dano interino \(%\)/);
});
