// Gera, em memória, um arquivo PMTiles v3 mínimo (sem compressão) a partir de
// feições GeoJSON. Só para os testes: os valores de c_v_4i são FICTÍCIOS.
const geojsonvt = require('geojson-vt');
const vtpbf = require('vt-pbf');
const { zxyToTileId } = require('pmtiles');
const Mapa = require('../js/mapa-qcn.js');

const geojsonVt = geojsonvt.default || geojsonvt;

function varint(n, saida) {
    while (n > 0x7f) { saida.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
    saida.push(n);
}

function gerarPMTiles(feicoes, zoom) {
    const indice = new geojsonVt({ type: 'FeatureCollection', features: feicoes },
        { maxZoom: zoom, indexMaxZoom: zoom, indexMaxPoints: 0, extent: 4096, buffer: 64, tolerance: 0 });
    let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
    feicoes.forEach(f => f.geometry.coordinates[0].forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }));
    const a = Mapa.tileDeLonLat(minLon, maxLat, zoom);
    const b = Mapa.tileDeLonLat(maxLon, minLat, zoom);
    const tiles = [];
    for (let x = a.x; x <= b.x; x++) {
        for (let y = a.y; y <= b.y; y++) {
            const t = indice.getTile(zoom, x, y);
            if (!t || t.features.length === 0) continue;
            const dados = Buffer.from(vtpbf.fromGeojsonVt({ [Mapa.CAMADA]: t }, { version: 2 }));
            tiles.push({ id: zxyToTileId(zoom, x, y), dados });
        }
    }
    tiles.sort((p, q) => p.id - q.id);

    // Diretório raiz: ids (delta), run lengths, tamanhos, offsets.
    const dir = [];
    varint(tiles.length, dir);
    let anterior = 0;
    tiles.forEach(t => { varint(t.id - anterior, dir); anterior = t.id; });
    tiles.forEach(() => varint(1, dir));
    tiles.forEach(t => varint(t.dados.length, dir));
    let offset = 0;
    tiles.forEach(t => { varint(offset + 1, dir); offset += t.dados.length; });
    const diretorio = Buffer.from(dir);
    const metadados = Buffer.from(JSON.stringify({
        name: 'QCN sintético (teste)', description: 'Valores de c_v_4i fictícios',
        vector_layers: [{ id: Mapa.CAMADA, fields: { c_v_4i: 'Number' } }]
    }));
    const dadosTiles = Buffer.concat(tiles.map(t => t.dados));

    const cab = Buffer.alloc(127);
    cab.write('PMTiles', 0, 'ascii');
    cab.writeUInt8(3, 7);
    const u64 = (v, pos) => cab.writeBigUInt64LE(BigInt(v), pos);
    u64(127, 8); u64(diretorio.length, 16);
    u64(127 + diretorio.length, 24); u64(metadados.length, 32);
    u64(0, 40); u64(0, 48);
    u64(127 + diretorio.length + metadados.length, 56); u64(dadosTiles.length, 64);
    u64(tiles.length, 72); u64(tiles.length, 80); u64(tiles.length, 88);
    cab.writeUInt8(1, 96);          // agrupado
    cab.writeUInt8(1, 97);          // diretórios sem compressão
    cab.writeUInt8(1, 98);          // tiles sem compressão
    cab.writeUInt8(1, 99);          // MVT
    cab.writeUInt8(zoom, 100); cab.writeUInt8(zoom, 101);
    cab.writeInt32LE(Math.round(minLon * 1e7), 102); cab.writeInt32LE(Math.round(minLat * 1e7), 106);
    cab.writeInt32LE(Math.round(maxLon * 1e7), 110); cab.writeInt32LE(Math.round(maxLat * 1e7), 114);
    cab.writeUInt8(zoom, 118);
    cab.writeInt32LE(Math.round((minLon + maxLon) / 2 * 1e7), 119);
    cab.writeInt32LE(Math.round((minLat + maxLat) / 2 * 1e7), 123);
    return Buffer.concat([cab, diretorio, metadados, dadosTiles]);
}

// Fonte de bytes para a biblioteca pmtiles, no lugar das requisições HTTP range.
function fonteEmMemoria(buffer) {
    return {
        getKey: () => 'memoria',
        getBytes: async (offset, length) => {
            const fatia = buffer.subarray(offset, offset + length);
            return { data: fatia.buffer.slice(fatia.byteOffset, fatia.byteOffset + fatia.byteLength) };
        }
    };
}

module.exports = { gerarPMTiles, fonteEmMemoria };
