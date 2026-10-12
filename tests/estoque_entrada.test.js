// Estoque de carbono pelo polígono no dano climático (adendo à versão 7.1):
// polígono preferencial, coordenada na falta dele, reserva sem os dois. O mapa
// é sintético e os estoques são FICTÍCIOS.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../js/calculo.js');
const V = require('../js/valoracao.js');
const R = require('../js/relatorio.js');
const Mapa = require('../js/mapa-qcn.js');
const libs = require('../vendor/damnum-geo.js');
const S = require('./blocos_sinteticos.js');
const series = require('../data/series_referencia.json');
const qcn = require('../data/estoques_qcn_fitofisionomias.json');

const fonte = () => Mapa.criarFonteMemoria(libs, S.mapaSintetico());
const INFO = { versao: 'v1', gerado_em: '2026-01-01', data_download: '2026-01-01', campo: 'ctotal4inv',
    fontes: [{ bioma: 'Cerrado', uso: 'estoque (ctotal4inv)', arquivo: 'sintetico.shp', url: 'https://exemplo.invalid/sintetico', modificado_no_servidor: '2021-06-25' }] };
const MAPA_LIGADO = { disponivel: true, motivo: '', falha: '', info: INFO };
const MAPA_DESLIGADO = { disponivel: false, motivo: 'A consulta ao mapa do Quarto Inventário está desligada nesta versão.', falha: '' };
const POLIGONO = S.poligono(-55.415, -12.605, -55.395, -12.595); // 3/4 a 100 e 1/4 a 20: D = 80
const tabela = () => V.estoqueDaTabela(qcn, 'CERRADO', '');
const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);

function calcular(estoque) {
    return V.calcular({
        versao: '7.1', bioma: 'CERRADO', entendimento: 'gonzaga',
        dataCalculo: new Date(2026, 5, 15), dataDano: new Date(2019, 5, 15),
        areas: { fora: 10, em: 2 }, reparacaoInSitu: true, taxaInterinoPct: 6, tempoRecuperacao: 15,
        parametros: { precoSocialCO2USD: 24.20, precoMercadoCO2USD: 5.00, cotacaoDolar: 5.00, origemCotacao: 'teste' },
        estoque, opcaoExtrapatrimonial: 'reais', manual: null, identificacao: {}, consultas: [], hash: 'teste', lia: null
    }, series);
}

test('mesmo caso com polígono, com coordenada no centro e sem localização: cada relatório mostra a entrada e usa o seu D', async () => {
    const comPoligono = V.resolverEstoque({ usuario: null, tabela: tabela(), municipio: null, mapa: MAPA_LIGADO,
        consulta: await Mapa.consultarPoligono(libs, fonte(), POLIGONO) });
    const comCoordenada = V.resolverEstoque({ usuario: null, tabela: tabela(), municipio: null, mapa: MAPA_LIGADO,
        consulta: await Mapa.consultarPonto(libs, fonte(), -55.405, -12.60) }); // centro do polígono, na classe 1
    const semLocal = V.resolverEstoque({ usuario: null, tabela: tabela(), municipio: null, mapa: MAPA_LIGADO, consulta: null });
    perto(comPoligono.tC, 80, 1e-6);
    assert.strictEqual(comCoordenada.tC, 100);
    assert.strictEqual(semLocal.tC, 47.75);
    assert.deepStrictEqual([comPoligono.entrada, comCoordenada.entrada, semLocal.entrada], ['polígono', 'coordenada', 'reserva']);
    for (const [estoque, rotulo] of [[comPoligono, 'polígono'], [comCoordenada, 'coordenada'], [semLocal, 'reserva']]) {
        const r = calcular(estoque);
        // Dano climático: área × D × 3,67 × preço, com o D da entrada.
        assert.strictEqual(r.parcelas.social.valor, C.arredondar(12 * estoque.tC * 3.67 * 121.00, 2));
        assert.strictEqual(r.parcelas.mercado.valor, C.arredondar(12 * estoque.tC * 3.67 * 25.00, 2));
        const html = R.gerarHTML(r);
        assert.ok(html.includes('Tipo de entrada</td>') || html.includes('Tipo de entrada'), 'falta o tipo de entrada');
        assert.match(html, new RegExp('Tipo de entrada[^<]*</t[dh]>\\s*<td[^>]*>' + rotulo));
    }
    assert.match(semLocal.avisoMapa, /Não foram informados polígono nem coordenada; usada a reserva: média do bioma Cerrado/);
    assert.ok(R.gerarHTML(calcular(semLocal)).includes('Não foram informados polígono nem coordenada'));
});

test('polígono em duas classes: o relatório lista as classes, a área e o D de cada uma, o D final, o campo e a fonte', async () => {
    const consulta = await Mapa.consultarPoligono(libs, fonte(), POLIGONO);
    const e = V.resolverEstoque({ usuario: null, tabela: tabela(), municipio: null, mapa: MAPA_LIGADO, consulta });
    // Conferência à mão: (180 ha × 100 + 60 ha × 20) ÷ 240 ha = 80 tC/ha.
    perto(consulta.partes[0].area_ha * 100 + consulta.partes[1].area_ha * 20, 80 * consulta.area_ha, 1e-6);
    const html = R.gerarHTML(calcular(e));
    ['Classes do mapa cruzadas', 'Área calculada do polígono', 'vetor (polígono 1)', 'vetor (polígono 2)', '>Fa<', '>Sa<', '100,00', '20,00',
        'Média ponderada pela área: 80,00 tC/ha', 'Estoque final: <b>80,00 tC/ha</b>', 'ctotal4inv', 'Versão dos dados', 'sintetico.shp',
        'Blocos do mapa usados', 'cev_498_309', 'processados no navegador'].forEach(t => assert.ok(html.includes(t), 'falta: ' + t));
});

test('coordenada: o aviso de aproximação aparece na tela e no relatório', async () => {
    const AVISO = 'Valor aproximado: o estoque foi obtido para um ponto, não para a área do dano. Envie o polígono para um cálculo mais preciso.';
    assert.strictEqual(Mapa.AVISO_COORDENADA, AVISO);
    const consulta = await Mapa.consultarPonto(libs, fonte(), -55.4005, -12.60);
    assert.strictEqual(consulta.aviso, AVISO);
    const e = V.resolverEstoque({ usuario: null, tabela: tabela(), municipio: null, mapa: MAPA_LIGADO, consulta });
    const html = R.gerarHTML(calcular(e));
    assert.ok(html.includes(AVISO));
    assert.ok(html.includes('Classes a menos de 100 m do ponto: Sa (20,00 tC/ha'));
    assert.ok(html.includes('consulta por coordenada (valor aproximado)'));
    // Na tela, o texto exibido começa pelo aviso que vem da consulta.
    const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.match(script, /let texto = consulta\.aviso \+ ' Estoque no ponto: '/);
    assert.match(script, /aviso\.textContent = texto;/);
});

test('estoque informado pelo usuário prevalece sobre o do mapa', async () => {
    const consulta = await Mapa.consultarPoligono(libs, fonte(), POLIGONO);
    const e = V.resolverEstoque({ usuario: { tC: 61.5, fonte: 'laudo do caso' }, tabela: tabela(), municipio: null, mapa: MAPA_LIGADO, consulta });
    assert.strictEqual(e.tC, 61.5);
    assert.strictEqual(e.origem, 'usuario');
    assert.strictEqual(e.mapa, undefined);
    const r = calcular(e);
    assert.strictEqual(r.parcelas.social.valor, C.arredondar(12 * 61.5 * 3.67 * 121.00, 2));
    assert.ok(R.gerarHTML(r).includes('estoque informado pelo usuário'));
});

test('com MAPA_QCN_ATIVO = false: sem opção de polígono ou coordenada, cálculo pela reserva e relatório dizendo isso', async () => {
    assert.strictEqual(Mapa.MAPA_QCN_ATIVO, false);
    const d = await Mapa.verificarDisponibilidade(libs);
    assert.strictEqual(d.disponivel, false);
    // A seção da localização nasce oculta e só aparece com o mapa disponível.
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /id="grupoLocalizacao" style="display:none;"/);
    assert.match(html, /id="grupoMunicipio" style="display:none;"/);
    const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.match(script, /getElementById\('grupoLocalizacao'\)\.style\.display = bioma && mapa\.disponivel \? '' : 'none';/);
    assert.match(script, /if \(DamnumMapa\.CONFIG\.ativo && DamnumMapa\.CONFIG\.baseUrl\)/);
    // Mesmo que houvesse uma consulta guardada, com o mapa indisponível vale a reserva.
    const consulta = await Mapa.consultarPoligono(libs, fonte(), POLIGONO);
    const e = V.resolverEstoque({ usuario: null, tabela: tabela(), municipio: null, mapa: MAPA_DESLIGADO, consulta });
    assert.strictEqual(e.tC, 47.75);
    assert.strictEqual(e.entrada, 'reserva');
    const rel = R.gerarHTML(calcular(e));
    assert.ok(rel.includes('A consulta ao mapa do Quarto Inventário está desligada nesta versão. Não há entrada por polígono nem por coordenada; usada a reserva: média do bioma Cerrado'));
    assert.ok(!rel.includes('Blocos do mapa usados'));
});

test('ordem de reserva: município e fitofisionomia antes da tabela por fitofisionomia, só com o mapa disponível', () => {
    const municipios = { versao: 'v1', uf: 'MT', campo: 'ctotal4inv', linhas: [['5100000', 'FICTÍCIO', 'Cerrado', 'Sa', 1000, 33.3]] };
    const m = V.estoqueDoMunicipio(municipios, '5100000', 'CERRADO', 'Sa');
    assert.strictEqual(m.tC, 33.3);
    assert.strictEqual(V.estoqueDoMunicipio(municipios, '5100000', 'CERRADO', 'Sd'), null);
    assert.strictEqual(V.estoqueDoMunicipio(municipios, '', 'CERRADO', 'Sa'), null);
    assert.strictEqual(V.estoqueDoMunicipio(null, '5100000', 'CERRADO', 'Sa'), null);
    const e = V.resolverEstoque({ usuario: null, tabela: tabela(), municipio: m, mapa: MAPA_LIGADO, consulta: null });
    assert.strictEqual(e.tC, 33.3);
    assert.strictEqual(e.origem, 'municipio');
    assert.ok(R.gerarHTML(calcular(e)).includes('tabela por município e fitofisionomia'));
    const semMapa = V.resolverEstoque({ usuario: null, tabela: tabela(), municipio: V.estoqueDoMunicipio(municipios, '5100000', 'CERRADO', 'Sa'), mapa: MAPA_DESLIGADO, consulta: null });
    assert.strictEqual(semMapa.tC, 47.75);
});

test('classe sem dado: o relatório diz que a reserva foi usada', async () => {
    const ponto = await Mapa.consultarPonto(libs, fonte(), -55.37, -12.60); // classe 4, floresta com valor zero
    const e = V.resolverEstoque({ usuario: null, tabela: tabela(), municipio: null, mapa: MAPA_LIGADO, consulta: ponto });
    assert.strictEqual(e.tC, 47.75);
    assert.match(e.avisoMapa, /A coordenada cai em classe sem dado no mapa; usada a reserva: média do bioma Cerrado/);
    const pol = await Mapa.consultarPoligono(libs, fonte(), S.poligono(-55.39, -12.605, -55.37, -12.595)); // metade sem dado
    const f = V.resolverEstoque({ usuario: null, tabela: tabela(), municipio: null, mapa: MAPA_LIGADO, consulta: pol });
    perto(f.tC, 0.5 * 20 + 0.5 * 47.75, 1e-4);
    const html = R.gerarHTML(calcular(f));
    assert.ok(html.includes('a classe está sem dado no mapa'));
    assert.ok(html.includes('nela foi usada a reserva: média do bioma Cerrado'));
});
