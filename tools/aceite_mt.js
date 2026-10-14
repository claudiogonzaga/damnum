#!/usr/bin/env node
// Aceite da versão 7.1 com dados reais de Mato Grosso: roda o cliente do DAMNUM
// (js/mapa-qcn.js) contra o servidor local de blocos e compara com o cálculo
// independente de tools/aceite_mt.py. Tolerância: 0,5% no estoque (D).
// Uso: node tools/aceite_mt.js <pasta dos blocos ou endereço publicado> tools/aceite_mt_casos.json esperado.json
const fs = require('node:fs');
const Mapa = require('../js/mapa-qcn.js');
const libs = require('../vendor/damnum-geo.js');
const { criarServidor } = require('./servidor_local_dados.js');

(async () => {
    const [pasta, arqCasos, arqEsperado] = process.argv.slice(2);
    const casos = JSON.parse(fs.readFileSync(arqCasos, 'utf8'));
    const esperado = JSON.parse(fs.readFileSync(arqEsperado, 'utf8'));
    // O primeiro argumento é a pasta dos blocos (servida aqui mesmo) ou o
    // endereço em que eles já estão publicados.
    const remoto = /^https?:/.test(pasta);
    const servidor = remoto ? null : criarServidor(pasta, '*');
    if (servidor) await new Promise(r => servidor.listen(0, '127.0.0.1', r));
    const fonte = Mapa.criarFonteBlocos(libs, { baseUrl: remoto ? pasta : 'http://127.0.0.1:' + servidor.address().port, versao: 'v1', cache: null });
    let falhas = 0;
    console.log('| Polígono | Área (ha) | D do DAMNUM | D independente | Diferença | Classes |');
    console.log('|---|---|---|---|---|---|');
    for (let i = 0; i < casos.poligonos.length; i++) {
        const p = casos.poligonos[i], e = esperado.poligonos[i];
        const r = await Mapa.consultarPoligono(libs, fonte, { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: p.coords } });
        const dif = Math.abs(r.estoque_tC_ha - e.d) / e.d * 100;
        if (!(dif <= 0.5)) falhas++;
        console.log('| ' + [p.nome, r.area_ha.toFixed(2), r.estoque_tC_ha.toFixed(3), e.d.toFixed(3), dif.toFixed(3) + '%' + (dif <= 0.5 ? '' : ' FALHOU'),
            r.partes.slice(0, 5).map(x => x.c_pret + ' ' + x.area_ha.toFixed(1) + ' ha').join('; ')].join(' | ') + ' |');
    }
    console.log('\n| Coordenada | DAMNUM | Dado original |');
    console.log('|---|---|---|');
    for (let i = 0; i < casos.coordenadas.length; i++) {
        const c = casos.coordenadas[i], e = esperado.coordenadas[i];
        const r = await Mapa.consultarPonto(libs, fonte, c.lon, c.lat);
        const alvo = e.achados.filter(a => a.bioma !== 'Amazônia')[0] || e.achados[0];
        const ok = alvo && Math.abs(r.estoque_tC_ha - alvo.d) <= 0.006 && (alvo.c_pret === '' || alvo.c_pret === r.classe.c_pret);
        if (!ok) falhas++;
        console.log('| ' + [c.nome + ' (' + c.lat + ', ' + c.lon + ')', r.estoque_tC_ha + ' tC/ha, ' + r.classe.c_pret + ' (' + r.classe.formato + ')',
            alvo ? alvo.d.toFixed(4) + ' tC/ha' + (alvo.c_pret ? ', ' + alvo.c_pret : '') + (ok ? '' : ' FALHOU') : 'sem dado'].join(' | ') + ' |');
    }
    if (servidor) servidor.close();
    console.log('\n' + (falhas ? falhas + ' caso(s) fora da tolerância' : 'Todos os casos dentro da tolerância.'));
    process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
