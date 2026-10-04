// DAMNUM — estoque de carbono pelo mapa do Quarto Inventário Nacional por estado
// (item 1.6-A). Tudo roda no navegador: o polígono e a coordenada do usuário
// não saem da máquina; do servidor só se leem faixas de bytes do arquivo PMTiles.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DamnumMapa = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Desligado enquanto data/qcn_estoques.pmtiles não existir (os arquivos por
    // estado do INPE ainda não foram obtidos). Com false, a interface não mostra
    // a seção "Localização do desmatamento" e usa a tabela do item 1.6.
    var MAPA_QCN_ATIVO = false;
    var URL_PMTILES = 'data/qcn_estoques.pmtiles';
    var URL_LIBS = 'vendor/damnum-geo.js';
    var CAMADA = 'qcn';
    var CAMPO_ESTOQUE = 'c_v_4i'; // estoque total da vegetação, tC/ha (sem carbono do solo)
    var LIMITE_TILES = 4000;
    var RAIO_VIZINHANCA_M = 100;
    var TOLERANCIA_AREA = 0.01; // 1%

    var AVISO_COORDENADA = 'Estimativa aproximada: o estoque foi obtido a partir de uma coordenada, e não do polígono da área desmatada. Classes vizinhas podem ter estoques diferentes. Sempre que possível, informe o polígono.';

    // ---------- tiles ----------

    function tileDeLonLat(lon, lat, z) {
        var n = Math.pow(2, z);
        var x = Math.floor((lon + 180) / 360 * n);
        var rad = lat * Math.PI / 180;
        var y = Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n);
        return { x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1) };
    }

    function bboxDoTile(x, y, z) {
        var n = Math.pow(2, z);
        function lat(yy) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI; }
        return [x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)];
    }

    function ehPoligono(f) {
        return f && f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
    }

    // ---------- fontes de feições ----------

    // Fonte PMTiles: lê os tiles do zoom máximo que cobrem o bbox, converte em
    // GeoJSON e recorta cada feição no limite exato do tile, para que a faixa de
    // sobreposição (buffer) entre tiles vizinhos não seja contada duas vezes.
    function criarFontePMTiles(libs, origem) {
        var arquivo = new libs.PMTiles(origem);
        var cabecalho = null;

        async function obterCabecalho() {
            if (!cabecalho) cabecalho = await arquivo.getHeader();
            return cabecalho;
        }

        async function feicoesNoBBox(bbox) {
            var h = await obterCabecalho();
            var z = h.maxZoom;
            var a = tileDeLonLat(bbox[0], bbox[3], z);
            var b = tileDeLonLat(bbox[2], bbox[1], z);
            var total = (b.x - a.x + 1) * (b.y - a.y + 1);
            if (total > LIMITE_TILES) {
                throw new Error('A área informada cobre ' + total + ' quadros do mapa; o limite é ' + LIMITE_TILES + '. Divida o polígono.');
            }
            var tarefas = [];
            for (var x = a.x; x <= b.x; x++) {
                for (var y = a.y; y <= b.y; y++) tarefas.push(lerTile(z, x, y));
            }
            var blocos = await Promise.all(tarefas);
            return [].concat.apply([], blocos);
        }

        async function lerTile(z, x, y) {
            var resposta = await arquivo.getZxy(z, x, y);
            if (!resposta || !resposta.data) return [];
            var vt = new libs.VectorTile(new libs.Pbf(new Uint8Array(resposta.data)));
            var camada = vt.layers[CAMADA] || vt.layers[Object.keys(vt.layers)[0]];
            if (!camada) return [];
            var limite = bboxDoTile(x, y, z);
            var saida = [];
            for (var i = 0; i < camada.length; i++) {
                var f = camada.feature(i).toGeoJSON(x, y, z);
                if (!ehPoligono(f)) continue;
                var recorte = libs.bboxClip(f, limite);
                if (!ehPoligono(recorte) || recorte.geometry.coordinates.length === 0) continue;
                recorte.properties = f.properties;
                saida.push(recorte);
            }
            return saida;
        }

        async function metadados() {
            var h = await obterCabecalho();
            var m = await arquivo.getMetadata();
            return { maxZoom: h.maxZoom, descricao: m };
        }

        return { feicoesNoBBox: feicoesNoBBox, metadados: metadados };
    }

    // Fonte em memória (testes): feições GeoJSON já prontas.
    function criarFonteGeoJSON(libs, feicoes) {
        return {
            feicoesNoBBox: async function (bbox) {
                return feicoes.filter(function (f) {
                    var b = libs.bbox(f);
                    return !(b[0] > bbox[2] || b[2] < bbox[0] || b[1] > bbox[3] || b[3] < bbox[1]);
                });
            },
            metadados: async function () { return { maxZoom: null, descricao: { name: 'memória' } }; }
        };
    }

    // ---------- consultas ----------

    function areaHa(libs, geo) {
        return libs.area(geo) / 10000;
    }

    function resumoPropriedades(p) {
        return {
            id: p.id, uf: p.uf, mun_nome: p.mun_nome, c_pret: p.c_pret, cagrpret: p.cagrpret,
            c_v_4i: typeof p[CAMPO_ESTOQUE] === 'number' ? p[CAMPO_ESTOQUE] : parseFloat(p[CAMPO_ESTOQUE])
        };
    }

    // Polígono: média do estoque ponderada pela área de cada classe cruzada.
    async function consultarPoligono(libs, fonte, geo, mediaPonderadaPorArea) {
        var poligonos = libs.flatten(geo).features.filter(ehPoligono);
        if (poligonos.length === 0) throw new Error('O arquivo não contém polígono.');
        var areaTotal = 0;
        var porId = {};
        for (var i = 0; i < poligonos.length; i++) {
            var alvo = poligonos[i];
            areaTotal += areaHa(libs, alvo);
            var feicoes = await fonte.feicoesNoBBox(libs.bbox(alvo));
            feicoes.forEach(function (f) {
                var corte = libs.intersect(libs.featureCollection([alvo, f]));
                if (!corte) return;
                var a = areaHa(libs, corte);
                if (!(a > 0)) return;
                var chave = String(f.properties.id);
                if (!porId[chave]) porId[chave] = Object.assign(resumoPropriedades(f.properties), { area_ha: 0 });
                porId[chave].area_ha += a;
            });
        }
        var partes = Object.keys(porId).map(function (k) { return porId[k]; })
            .sort(function (p, q) { return q.area_ha - p.area_ha; });
        var media = mediaPonderadaPorArea(partes);
        var coberta = media ? media.area_ha : 0;
        return {
            tipo: 'poligono',
            area_ha: areaTotal,
            partes: partes,
            area_coberta_ha: coberta,
            pct_descoberto: areaTotal > 0 ? Math.max(0, (1 - coberta / areaTotal) * 100) : 100,
            estoque_tC_ha: media ? media.estoque : null
        };
    }

    // Coordenada: estoque do polígono que contém o ponto, com as classes vizinhas
    // a menos de 100 m.
    async function consultarPonto(libs, fonte, lon, lat) {
        var grau = 0.002; // cerca de 220 m, o bastante para alcançar vizinhos a 100 m
        var feicoes = await fonte.feicoesNoBBox([lon - grau, lat - grau, lon + grau, lat + grau]);
        var ponto = libs.point([lon, lat]);
        var achado = null;
        var vizinhas = {};
        feicoes.forEach(function (f) {
            if (!achado && libs.booleanPointInPolygon(ponto, f)) { achado = f; }
        });
        feicoes.forEach(function (f) {
            if (achado && String(f.properties.id) === String(achado.properties.id)) return;
            var d = distanciaAteBorda(libs, ponto, f);
            if (d === null || d > RAIO_VIZINHANCA_M) return;
            var chave = String(f.properties.id);
            if (!vizinhas[chave] || d < vizinhas[chave].distancia_m) {
                vizinhas[chave] = Object.assign(resumoPropriedades(f.properties), { distancia_m: d });
            }
        });
        var listaVizinhas = Object.keys(vizinhas).map(function (k) { return vizinhas[k]; })
            .sort(function (p, q) { return p.distancia_m - q.distancia_m; });
        return {
            tipo: 'coordenada',
            lon: lon, lat: lat,
            poligono: achado ? resumoPropriedades(achado.properties) : null,
            estoque_tC_ha: achado ? resumoPropriedades(achado.properties).c_v_4i : null,
            vizinhas: listaVizinhas,
            aviso: AVISO_COORDENADA
        };
    }

    function distanciaAteBorda(libs, ponto, feicao) {
        var menor = null;
        var linhas = libs.polygonToLine(feicao);
        var lista = linhas.type === 'FeatureCollection' ? linhas.features : [linhas];
        lista.forEach(function (linha) {
            libs.flatten(linha).features.forEach(function (trecho) {
                var d = libs.pointToLineDistance(ponto, trecho, { units: 'meters' });
                if (menor === null || d < menor) menor = d;
            });
        });
        return menor;
    }

    // Compara a área calculada com a digitada (tolerância de 1%).
    function divergenciaDeArea(areaCalculadaHa, areaDigitadaHa) {
        if (!(areaDigitadaHa > 0) || !(areaCalculadaHa > 0)) return null;
        var relativa = Math.abs(areaCalculadaHa - areaDigitadaHa) / areaDigitadaHa;
        return { relativa: relativa, diverge: relativa > TOLERANCIA_AREA };
    }

    // ---------- leitura do arquivo do usuário (navegador) ----------

    // Aceita GeoJSON, KML, KMZ e shapefile zipado. Devolve FeatureCollection só
    // com polígonos, em WGS 84.
    async function lerArquivoGeometria(libs, arquivo) {
        var nome = (arquivo.name || '').toLowerCase();
        var geo;
        if (/\.(geojson|json)$/.test(nome)) {
            geo = JSON.parse(await arquivo.text());
        } else if (/\.kml$/.test(nome)) {
            geo = libs.kml(new DOMParser().parseFromString(await arquivo.text(), 'text/xml'));
        } else if (/\.kmz$/.test(nome)) {
            var conteudo = libs.unzipSync(new Uint8Array(await arquivo.arrayBuffer()));
            var interno = Object.keys(conteudo).filter(function (n) { return /\.kml$/i.test(n); })[0];
            if (!interno) throw new Error('O arquivo KMZ não contém KML.');
            geo = libs.kml(new DOMParser().parseFromString(new TextDecoder().decode(conteudo[interno]), 'text/xml'));
        } else if (/\.zip$/.test(nome)) {
            geo = await libs.shp(await arquivo.arrayBuffer());
            if (Array.isArray(geo)) {
                geo = libs.featureCollection([].concat.apply([], geo.map(function (g) { return g.features; })));
            }
        } else {
            throw new Error('Formato não aceito. Use KML, KMZ, GeoJSON ou shapefile zipado (.zip).');
        }
        return normalizar(libs, geo);
    }

    function normalizar(libs, geo) {
        var feicoes;
        if (geo.type === 'FeatureCollection') feicoes = geo.features;
        else if (geo.type === 'Feature') feicoes = [geo];
        else feicoes = [{ type: 'Feature', properties: {}, geometry: geo }];
        feicoes = feicoes.filter(ehPoligono);
        if (feicoes.length === 0) throw new Error('O arquivo não contém polígono.');
        return libs.featureCollection(feicoes);
    }

    // Carrega vendor/damnum-geo.js só quando o mapa ou o polígono forem usados.
    var promessaLibs = null;
    function carregarLibs() {
        if (typeof DamnumGeoLibs !== 'undefined') return Promise.resolve(DamnumGeoLibs);
        if (!promessaLibs) {
            promessaLibs = new Promise(function (resolver, rejeitar) {
                var s = document.createElement('script');
                s.src = URL_LIBS;
                s.onload = function () { resolver(DamnumGeoLibs); };
                s.onerror = function () { promessaLibs = null; rejeitar(new Error('Não foi possível carregar as bibliotecas de mapa.')); };
                document.head.appendChild(s);
            });
        }
        return promessaLibs;
    }

    return {
        MAPA_QCN_ATIVO: MAPA_QCN_ATIVO,
        URL_PMTILES: URL_PMTILES,
        CAMADA: CAMADA,
        AVISO_COORDENADA: AVISO_COORDENADA,
        tileDeLonLat: tileDeLonLat,
        bboxDoTile: bboxDoTile,
        criarFontePMTiles: criarFontePMTiles,
        criarFonteGeoJSON: criarFonteGeoJSON,
        areaHa: areaHa,
        consultarPoligono: consultarPoligono,
        consultarPonto: consultarPonto,
        divergenciaDeArea: divergenciaDeArea,
        lerArquivoGeometria: lerArquivoGeometria,
        normalizar: normalizar,
        carregarLibs: carregarLibs
    };
});
