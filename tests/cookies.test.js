// Aviso de cookies (js/cookies.js): o Analytics só carrega depois do aceite, e o 'cookieConsent' antigo não vale como aceite.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const codigo = fs.readFileSync(path.join(raiz, 'js', 'cookies.js'), 'utf8');

function executar(inicial) {
    const armazenamento = Object.assign({}, inicial);
    const anexados = [];
    function elemento(tag) {
        return {
            tag, hidden: false, innerHTML: '', textContent: '', parentNode: null, ouvintes: {},
            setAttribute() {},
            appendChild(filho) { filho.parentNode = this; anexados.push(filho); return filho; },
            removeChild(filho) { filho.parentNode = null; anexados.splice(anexados.indexOf(filho), 1); return filho; },
            addEventListener(tipo, funcao) { this.ouvintes[tipo] = funcao; },
            querySelectorAll() { return []; },
            querySelector() { return { focus() {} }; }
        };
    }
    const janela = {};
    janela.window = janela;
    janela.document = { readyState: 'complete', head: elemento('head'), body: elemento('body'), createElement: elemento, addEventListener() {} };
    janela.localStorage = {
        getItem(chave) { return chave in armazenamento ? armazenamento[chave] : null; },
        setItem(chave, valor) { armazenamento[chave] = String(valor); },
        removeItem(chave) { delete armazenamento[chave]; }
    };
    vm.createContext(janela);
    vm.runInContext(codigo, janela);
    return {
        armazenamento,
        aviso: () => anexados.find(e => e.id === 'aviso-cookies'),
        analytics: () => anexados.filter(e => e.tag === 'script' && /googletagmanager\.com\/gtag\/js\?id=G-MD5QMGX9EC$/.test(e.src || '')).length,
        clicar(acao) {
            const aviso = anexados.find(e => e.id === 'aviso-cookies');
            aviso.ouvintes.click({ target: { closest: () => ({ getAttribute: () => acao }) } });
        }
    };
}

test('sem escolha guardada: mostra o aviso e não carrega o Analytics', () => {
    const a = executar({});
    assert.ok(a.aviso());
    assert.strictEqual(a.analytics(), 0);
});

test("o 'cookieConsent' antigo (Permitir Necessários) não vale como aceite do Analytics", () => {
    const a = executar({ cookieConsent: 'accepted' });
    assert.ok(a.aviso());
    assert.strictEqual(a.analytics(), 0);
});

test('Gerenciar preferências não grava escolha nem carrega o Analytics', () => {
    const a = executar({});
    a.clicar('gerenciar');
    assert.ok(a.aviso());
    assert.deepStrictEqual(a.armazenamento, {});
    assert.strictEqual(a.analytics(), 0);
});

test('Aceitar: carrega o Analytics, grava a escolha, mantém o backup do contador e some com o aviso', () => {
    const a = executar({});
    a.clicar('todos');
    assert.strictEqual(a.analytics(), 1);
    assert.strictEqual(a.armazenamento.cookiesEscolha, 'todos');
    assert.strictEqual(a.armazenamento.cookieConsent, 'accepted');
    assert.strictEqual(a.aviso(), undefined);
});

test('Só os necessários: não carrega o Analytics, grava a escolha e apaga o backup do contador', () => {
    const a = executar({ contadorValoracoes: '12' });
    a.clicar('necessarios');
    assert.strictEqual(a.analytics(), 0);
    assert.strictEqual(a.armazenamento.cookiesEscolha, 'necessarios');
    assert.strictEqual(a.armazenamento.cookieConsent, 'rejected');
    assert.ok(!('contadorValoracoes' in a.armazenamento));
    assert.strictEqual(a.aviso(), undefined);
});

test('escolha guardada "todos": carrega o Analytics direto, sem aviso', () => {
    const a = executar({ cookiesEscolha: 'todos' });
    assert.strictEqual(a.analytics(), 1);
    assert.strictEqual(a.aviso(), undefined);
});

test('escolha guardada "necessarios": não carrega o Analytics e não mostra o aviso', () => {
    const a = executar({ cookiesEscolha: 'necessarios' });
    assert.strictEqual(a.analytics(), 0);
    assert.strictEqual(a.aviso(), undefined);
});

test('as páginas usam só o módulo: sem tag do Analytics direta e sem a barra antiga', () => {
    for (const pagina of ['index.html', 'manual.html', 'contato.html']) {
        const html = fs.readFileSync(path.join(raiz, pagina), 'utf8');
        assert.ok(!/googletagmanager/.test(html), pagina);
        assert.ok(!/id="cookieBar"/.test(html), pagina);
        assert.match(html, /<script src="js\/cookies\.js\?v=[0-9.]+"><\/script>/, pagina);
    }
});
