// O Netlify (endereço antigo) publica só a página de aviso com o link para o
// endereço atual; os demais caminhos redirecionam para o mesmo caminho lá.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');

test('Netlify: publica só a pasta do aviso e redireciona o resto para o endereço novo', () => {
    const toml = fs.readFileSync(path.join(raiz, 'netlify.toml'), 'utf8');
    assert.match(toml, /publish = "netlify"/);
    assert.match(toml, /from = "\/\*"\s+to = "https:\/\/consciencia\.eco\.br\/damnum\/:splat"\s+status = 301/);
    assert.ok(!/force = true/.test(toml), 'com force, a própria página de aviso seria redirecionada');
    assert.deepStrictEqual(fs.readdirSync(path.join(raiz, 'netlify')), ['index.html']);
    const aviso = fs.readFileSync(path.join(raiz, 'netlify', 'index.html'), 'utf8');
    assert.ok(aviso.includes('href="https://consciencia.eco.br/damnum/"'));
    assert.ok(!/<script|http-equiv="refresh"/i.test(aviso), 'aviso sem script nem redirecionamento automático');
});
