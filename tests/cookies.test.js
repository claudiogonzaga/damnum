// Aviso de cookies (js/cookies.js): o Analytics só carrega depois do aceite, e o 'cookieConsent' antigo não vale como aceite.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const codigo = fs.readFileSync(path.join(raiz, 'js', 'cookies.js'), 'utf8');

function executar(inicial, sinal) {
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
    janela.document = { currentScript: sinal, readyState: 'complete', head: elemento('head'), body: elemento('body'), createElement: elemento, addEventListener() {} };
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

test('o aviso tem Só os necessários e Aceitar no primeiro nível, com o mesmo peso', () => {
    const a = executar({});
    const html = a.aviso().innerHTML;
    assert.match(html, /<button type="button" class="ac-principal" data-ac="necessarios">Só os necessários<\/button>/);
    assert.match(html, /<button type="button" class="ac-principal" data-ac="todos">Aceitar<\/button>/);
    assert.ok(!/gerenciar|ac-secundario|hidden/i.test(html));
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

const sem_aviso = { getAttribute: (nome) => (nome === 'data-aviso' ? 'nao' : null) };

test('página com data-aviso="nao" e sem escolha: não mostra o aviso e não carrega o Analytics', () => {
    const a = executar({}, sem_aviso);
    assert.strictEqual(a.aviso(), undefined);
    assert.strictEqual(a.analytics(), 0);
    assert.deepStrictEqual(a.armazenamento, {});
});

test('página com data-aviso="nao" segue a escolha feita na principal', () => {
    assert.strictEqual(executar({ cookiesEscolha: 'todos' }, sem_aviso).analytics(), 1);
    assert.strictEqual(executar({ cookiesEscolha: 'necessarios' }, sem_aviso).analytics(), 0);
});

test('só a principal mostra o aviso; manual e contato seguem a escolha, sem tag do Analytics nem barra antiga', () => {
    for (const pagina of ['index.html', 'manual.html', 'contato.html']) {
        const html = fs.readFileSync(path.join(raiz, pagina), 'utf8');
        assert.ok(!/googletagmanager/.test(html), pagina);
        assert.ok(!/id="cookieBar"/.test(html), pagina);
        const esperado = pagina === 'index.html'
            ? /<script src="js\/cookies\.js\?v=[0-9.]+"><\/script>/
            : /<script src="js\/cookies\.js\?v=[0-9.]+" data-aviso="nao"><\/script>/;
        assert.match(html, esperado, pagina);
    }
});
