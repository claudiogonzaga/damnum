// Contrato dos arquivos do mapa contra o servidor local, privacidade e falha de
// rede (versão 7.1). Os blocos são sintéticos, com estoques FICTÍCIOS.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const Mapa = require('../js/mapa-qcn.js');
const V = require('../js/valoracao.js');
const libs = require('../vendor/damnum-geo.js');
const S = require('./blocos_sinteticos.js');
const { criarServidor } = require('../tools/servidor_local_dados.js');

const ORIGEM = 'https://damnum.consciencia.eco.br';

async function subir(extras) {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'damnum-blocos-'));
    const indice = S.publicar(pasta, S.mapaSintetico(), extras);
    const servidor = criarServidor(pasta, ORIGEM);
    await new Promise(r => servidor.listen(0, '127.0.0.1', r));
    return { pasta, indice, servidor, base: 'http://127.0.0.1:' + servidor.address().port };
}

function fechar(a) {
    return new Promise(r => { a.servidor.closeAllConnections(); a.servidor.close(r); });
}

test('contrato: caminhos, versão, SHA-256 e cabeçalhos de CORS e de cache', async () => {
    const a = await subir();
    try {
        const v = await fetch(a.base + '/v1/versao.json');
        assert.strictEqual(v.status, 200);
        assert.strictEqual(v.headers.get('access-control-allow-origin'), ORIGEM);
        assert.match(v.headers.get('content-type'), /application\/json/);
        assert.strictEqual((await v.json()).versao, 'v1');
        const i = await (await fetch(a.base + '/v1/indice.json')).json();
        assert.deepStrictEqual(i.blocos.map(b => b.chave).sort(), ['amr_124_77', 'cev_498_309']);
        for (const meta of i.blocos) {
            const r = await fetch(a.base + '/v1/blocos/' + meta.chave + '.gz');
            assert.strictEqual(r.status, 200);
            assert.strictEqual(r.headers.get('access-control-allow-origin'), ORIGEM);
            assert.match(r.headers.get('cache-control'), /max-age=31536000, immutable/);
            assert.strictEqual(r.headers.get('content-encoding'), null);
            const bytes = Buffer.from(await r.arrayBuffer());
            assert.strictEqual(bytes.length, meta.bytes);
            assert.strictEqual(crypto.createHash('sha256').update(bytes).digest('hex'), meta.sha256);
            const bloco = JSON.parse(Buffer.from(libs.gunzipSync(new Uint8Array(bytes))).toString('utf8'));
            assert.strictEqual(bloco.chave, meta.chave);
            assert.strictEqual(bloco.versao, 'v1');
            assert.deepStrictEqual(bloco.bbox, meta.bbox);
        }
        assert.strictEqual((await fetch(a.base + '/v1/blocos/inexistente_1_1.gz')).status, 404);
        assert.strictEqual((await fetch(a.base + '/v1/../../etc/passwd')).status, 404);
        assert.strictEqual((await fetch(a.base + '/v1/municipio_cpret.json')).status, 200);
    } finally { await fechar(a); }
});

test('o cliente lê a versão, o índice e só os blocos que a caixa do polígono toca', async () => {
    const a = await subir();
    try {
        const pedidos = [];
        const fonte = Mapa.criarFonteBlocos(libs, { baseUrl: a.base, versao: 'v1', cache: null, buscar: u => { pedidos.push(u.replace(a.base, '')); return fetch(u); } });
        const r = await Mapa.consultarPoligono(libs, fonte, S.poligono(-55.415, -12.605, -55.395, -12.595));
        assert.ok(Math.abs(r.estoque_tC_ha - 80) < 1e-6);
        assert.deepStrictEqual(pedidos, ['/v1/indice.json', '/v1/blocos/cev_498_309.gz']);
        // Repetir o polígono não refaz a rede.
        await Mapa.consultarPoligono(libs, fonte, S.poligono(-55.415, -12.605, -55.395, -12.595));
        assert.strictEqual(pedidos.length, 2);
        assert.strictEqual((await fonte.info()).versao, 'v1');
    } finally { await fechar(a); }
});

test('bloco adulterado é recusado pelo SHA-256', async () => {
    const a = await subir();
    try {
        const arquivo = path.join(a.pasta, 'v1', 'blocos', 'cev_498_309.gz');
        const bytes = fs.readFileSync(arquivo);
        bytes[bytes.length - 9] ^= 0xff;
        fs.writeFileSync(arquivo, bytes);
        const fonte = Mapa.criarFonteBlocos(libs, { baseUrl: a.base, versao: 'v1', cache: null });
        await assert.rejects(Mapa.consultarPoligono(libs, fonte, S.poligono(-55.415, -12.605, -55.395, -12.595)), /não confere com o índice/);
    } finally { await fechar(a); }
});

test('interruptor: desligado não consulta a rede; ligado exige o endereço e a versão esperada', async () => {
    const a = await subir();
    const original = Object.assign({}, Mapa.CONFIG);
    let chamadas = 0;
    const buscar = u => { chamadas++; return fetch(u); };
    try {
        Mapa.configurar({ ativo: false });
        let d = await Mapa.verificarDisponibilidade(libs, { buscar });
        assert.strictEqual(d.disponivel, false);
        assert.strictEqual(chamadas, 0);
        Mapa.configurar({ ativo: true, baseUrl: '' });
        d = await Mapa.verificarDisponibilidade(libs, { buscar });
        assert.strictEqual(d.disponivel, false);
        assert.strictEqual(chamadas, 0);
        Mapa.configurar({ ativo: true, baseUrl: a.base, versao: 'v1' });
        d = await Mapa.verificarDisponibilidade(libs, { buscar, cache: null });
        assert.strictEqual(d.disponivel, true);
        assert.strictEqual(d.info.campo, 'ctotal4inv');
        Mapa.configurar({ versao: 'v2' });
        d = await Mapa.verificarDisponibilidade(libs, { buscar, cache: null });
        assert.strictEqual(d.disponivel, false);
        assert.match(d.motivo, /indisponível/);
    } finally { Mapa.configurar(original); await fechar(a); }
});

test('privacidade: nenhum pedido leva latitude, longitude, geometria ou área do usuário', async () => {
    const a = await subir();
    try {
        // Coordenadas com dígitos próprios, fáceis de achar num pedido.
        const lon = -55.4137219, lat = -12.6042873;
        const alvo = S.poligono(lon, lat, lon + 0.0123457, lat + 0.0061729);
        const area = Mapa.areaHa(libs, alvo);
        const pedidos = [];
        const buscar = (url, opcoes) => { pedidos.push({ url: String(url), opcoes }); return fetch(url, opcoes); };
        const fonte = Mapa.criarFonteBlocos(libs, { baseUrl: a.base, versao: 'v1', cache: null, buscar });
        await fonte.info();
        await Mapa.consultarPoligono(libs, fonte, alvo);
        await Mapa.consultarPonto(libs, fonte, lon, lat);
        assert.ok(pedidos.length >= 3);
        const proibidos = ['55.41', '12.60', '5541', '1260', String(area).slice(0, 6), 'coordinates', 'Polygon', 'lat', 'lon', 'area', 'geom'];
        for (const p of pedidos) {
            const caminho = p.url.replace(a.base, '');
            assert.match(caminho, /^\/v1\/(versao\.json|indice\.json|blocos\/[a-z]+_\d+_\d+\.gz)$/, caminho);
            assert.ok(!caminho.includes('?') && !caminho.includes('#'), caminho);
            assert.strictEqual(p.opcoes, undefined, 'pedido com corpo ou cabeçalho próprio');
            for (const termo of proibidos) assert.ok(!caminho.includes(termo), caminho + ' contém ' + termo);
        }
    } finally { await fechar(a); }
});

test('privacidade: o código publicado não envia a coordenada a serviço externo', () => {
    const raiz = path.join(__dirname, '..');
    const arquivos = ['script.js', 'index.html'].concat(fs.readdirSync(path.join(raiz, 'js')).map(f => 'js/' + f));
    for (const arq of arquivos) {
        const texto = fs.readFileSync(path.join(raiz, arq), 'utf8');
        assert.ok(!/geoservicos\.ibge|DamnumIBGE|ibge-vegetacao/.test(texto), arq + ' ainda consulta o IBGE');
    }
    assert.ok(!fs.existsSync(path.join(raiz, 'js', 'ibge-vegetacao.js')));
    // Os únicos fetch de script.js: cotação, tabela local, contador e a tabela por município do servidor de blocos.
    const script = fs.readFileSync(path.join(raiz, 'script.js'), 'utf8');
    assert.ok(!/fetch\([^)]*(latitude|longitude|lat\b|lon\b|poligono|geo)/i.test(script));
    // O endereço dos blocos não se confunde com o do contador.
    assert.ok(!/script\.google\.com/.test(fs.readFileSync(path.join(raiz, 'js', 'mapa-qcn.js'), 'utf8')));
});

test('falha de rede no meio do cálculo: a consulta falha e a reserva é aplicada e avisada', async () => {
    const a = await subir();
    const fonte = Mapa.criarFonteBlocos(libs, { baseUrl: a.base, versao: 'v1', cache: null });
    const info = await fonte.info();
    await fonte.indice();
    await fechar(a); // o servidor cai antes de o bloco ser pedido
    let falha = '';
    let consulta = null;
    try {
        consulta = await Mapa.consultarPoligono(libs, fonte, S.poligono(-55.415, -12.605, -55.395, -12.595));
    } catch (erro) {
        falha = erro.message;
    }
    assert.strictEqual(consulta, null);
    assert.ok(falha.length > 0);
    const tabela = { origem: 'bioma', tC: 47.75, descricaoOrigem: 'média do bioma Cerrado (tabela do Quarto Inventário Nacional)', fonte: 'teste' };
    const e = V.resolverEstoque({ usuario: null, tabela, municipio: null, consulta, mapa: { disponivel: true, falha, info } });
    assert.strictEqual(e.tC, 47.75);
    assert.strictEqual(e.entrada, 'reserva');
    assert.match(e.avisoMapa, /^Consulta ao mapa indisponível \(.+\); usada a reserva: média do bioma Cerrado/);
});
