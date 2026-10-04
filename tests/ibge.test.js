// Indicação da fitofisionomia pelo mapa de vegetação do IBGE. As respostas abaixo
// foram copiadas de consultas reais ao WFS em 04/10/2026; o teste não usa rede.
const test = require('node:test');
const assert = require('node:assert');
const IBGE = require('../js/ibge-vegetacao.js');
const qcn = require('../data/estoques_qcn_fitofisionomias.json').biomas;

const PASTAGEM_MT = { leg_carga: 'Ap.S', leg_uantr: 'Ap', nm_uantr: 'Pecuária (pastagens)', veg_pretet: 'S', nm_pretet: 'Savana', leg_sup: 'Área Antrópica Dominante' };
const MANAUS = { leg_carga: 'Iu.D', leg_uantr: 'Iu', nm_uantr: 'Influência urbana', veg_pretet: 'D', nm_pretet: 'Floresta Ombrófila Densa', leg_sup: 'Área Antrópica Dominante' };
const SEMPRE_VERDE = { leg_carga: 'Hse+Vs+Ap', leg_uveg: 'Hse', nm_uveg: 'Floresta Estacional Sempre Verde Submontana com dossel emergente', veg_pretet: 'H', nm_pretet: 'Floresta Estacional Sempre-Verde', leg_sup: 'Vegetação Natural Dominante' };

test('URL da consulta: WFS 1.0.0, longitude antes da latitude, sem geometria', () => {
    const url = IBGE.urlDoPonto(-55.5, -12.5);
    assert.match(url, /version=1\.0\.0/);
    assert.match(url, /propertyName=/);
    assert.ok(decodeURIComponent(url).includes('INTERSECTS(geom,POINT(-55.5 -12.5))'));
});

test('área antropizada no Cerrado: só a região Savana, com faixa de estoques', () => {
    const r = IBGE.interpretar(PASTAGEM_MT, qcn['Cerrado'].fitofisionomias);
    assert.strictEqual(r.tipo, 'regiao');
    assert.deepStrictEqual(r.candidatas.map(c => c.sigla).sort(), ['S', 'Sa', 'Sd', 'Sg', 'Sp']);
    assert.ok(r.minimo < r.maximo);
    assert.match(r.descricao, /antropizada \(Pecuária \(pastagens\)\)/);
    assert.match(r.descricao, /cabe ao usuário/);
});

test('área antropizada na Amazônia: formações da Floresta Ombrófila Densa', () => {
    const r = IBGE.interpretar(MANAUS, qcn['Amazônia'].fitofisionomias);
    assert.strictEqual(r.tipo, 'regiao');
    assert.deepStrictEqual(r.candidatas.map(c => c.sigla).sort(), ['Da', 'Db', 'Dm', 'Ds']);
});

test('vegetação natural com formação na tabela: uma linha indicada', () => {
    const props = { leg_carga: 'Sd+Sa', leg_uveg: 'Sd', nm_uveg: 'Savana Florestada', veg_pretet: 'S', nm_pretet: 'Savana', leg_sup: 'Vegetação Natural Dominante' };
    const r = IBGE.interpretar(props, qcn['Cerrado'].fitofisionomias);
    assert.strictEqual(r.tipo, 'formacao');
    assert.strictEqual(r.candidatas.length, 1);
    assert.strictEqual(r.candidatas[0].sigla, 'Sd');
    assert.strictEqual(r.candidatas[0].tC, qcn['Cerrado'].fitofisionomias[r.candidatas[0].indice].total_tC_ha);
});

test('legenda com subformação: usa o maior prefixo que existe na tabela', () => {
    const props = { leg_carga: 'Dse', leg_uveg: 'Dse', nm_uveg: 'Floresta Ombrófila Densa Submontana com dossel emergente', veg_pretet: 'D' };
    const r = IBGE.interpretar(props, qcn['Amazônia'].fitofisionomias);
    assert.strictEqual(r.tipo, 'formacao');
    assert.strictEqual(r.candidatas[0].sigla, 'Ds');
});

test('Floresta Estacional Sempre-Verde (norte de MT): sem linha na tabela, e o relato diz isso', () => {
    const r = IBGE.interpretar(SEMPRE_VERDE, qcn['Amazônia'].fitofisionomias);
    assert.strictEqual(r.tipo, 'sem-correspondencia');
    assert.strictEqual(r.candidatas.length, 0);
    assert.match(r.descricao, /Hse/);
    assert.match(r.descricao, /não tem linha na tabela/);
});

test('bioma que não tem a região: sem correspondência', () => {
    const r = IBGE.interpretar(MANAUS, qcn['Pantanal'].fitofisionomias);
    assert.strictEqual(r.tipo, 'sem-correspondencia');
});

test('ponto fora do mapa', () => {
    assert.strictEqual(IBGE.interpretar(null, qcn['Cerrado'].fitofisionomias).tipo, 'fora');
});
