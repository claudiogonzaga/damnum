// DAMNUM — estoque de carbono pelo mapa do Quarto Inventário Nacional (versão 7.1).
// O mapa é servido em blocos estáticos (células de grade). Tudo o mais roda no
// navegador: o polígono e a coordenada do usuário não saem da máquina; ao
// servidor de dados só se pedem a versão, o índice e os blocos que cobrem a área.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DamnumMapa = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Interruptor. Com false, a interface não oferece polígono nem coordenada e o
    // estoque vem da tabela. Ligado em 13/10/2026, com os blocos da Amazônia Legal
    // publicados (ver MISSAO-publicar-dados-damnum.md).
    var MAPA_QCN_ATIVO = true;
    // Endereço dos blocos. É outro serviço, separado do contador de valorações.
    var DADOS_BASE_URL = 'https://damnum-dados.pages.dev';
    var VERSAO_DADOS = 'v1';
    var CAMPO_ESTOQUE = 'ctotal4inv'; // carbono total da vegetação pretérita, tC/ha (docs/fase0_dados.md)

    var CONFIG = { ativo: MAPA_QCN_ATIVO, baseUrl: DADOS_BASE_URL, versao: VERSAO_DADOS };
    // O sufixo muda a cada publicação, para o navegador não usar cópia antiga.
    var URL_LIBS = 'vendor/damnum-geo.js?v=7.1.4';
    var LIMITE_BLOCOS = 400;
    var LIMITE_PIXELS = 250000;
    var RAIO_VIZINHANCA_M = 100;
    var TOLERANCIA_AREA = 0.01; // 1%

    var AVISO_COORDENADA = 'Valor aproximado: o estoque foi obtido para um ponto, não para a área do dano. Envie o polígono para um cálculo mais preciso.';

    function configurar(c) {
        Object.keys(c).forEach(function (k) { CONFIG[k] = c[k]; });
        return CONFIG;
    }

    function ehPoligono(f) {
        return f && f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
    }

    function caixasSeTocam(a, b) {
        return !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
    }

    // Zero, vazio ou "sem dado" não é estoque: é ausência de dado (Fase 0, item e).
    function temDado(d) {
        return typeof d === 'number' && !isNaN(d) && d > 0;
    }

    // ---------- blocos ----------

    function decodificarAnel(anel, escala) {
        var x = anel[0], y = anel[1];
        var saida = [[x / escala, y / escala]];
        for (var i = 2; i < anel.length; i += 2) {
            x += anel[i];
            y += anel[i + 1];
            saida.push([x / escala, y / escala]);
        }
        return saida;
    }

    // Prepara um bloco lido (objeto JSON) para consulta.
    function decodificarBloco(libs, bloco) {
        if (bloco.formato === 'vetor') {
            bloco.feicoesGeo = bloco.feicoes.map(function (f) {
                var poligonos = f.pol.map(function (p) { return p.map(function (a) { return decodificarAnel(a, bloco.escala); }); });
                var geo = {
                    type: 'Feature',
                    properties: { id: f.id, c_pret: f.c_pret, categ: f.categ, d: f.d, bioma: bloco.bioma },
                    geometry: poligonos.length === 1 ? { type: 'Polygon', coordinates: poligonos[0] } : { type: 'MultiPolygon', coordinates: poligonos }
                };
                geo.caixa = libs.bbox(geo);
                return geo;
            });
        } else if (bloco.formato !== 'raster') {
            throw new Error('Formato de bloco desconhecido: ' + bloco.formato);
        }
        return bloco;
    }

    function hex(buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }

    // Fonte de blocos publicada em <baseUrl>/<versao>/. `opcoes.buscar` substitui
    // o fetch (testes); `opcoes.cache` é um armazenamento com get(url) e put(url, bytes).
    function criarFonteBlocos(libs, opcoes) {
        opcoes = opcoes || {};
        var base = String(opcoes.baseUrl || CONFIG.baseUrl).replace(/\/+$/, '');
        var versao = opcoes.versao || CONFIG.versao;
        var buscar = opcoes.buscar || function (url) { return fetch(url); };
        var cache = opcoes.cache || cacheDoNavegador(versao);
        var raiz = base + '/' + versao + '/';
        var promessaVersao = null, promessaIndice = null;
        var decodificados = {};

        async function json(nome) {
            var r = await buscar(raiz + nome);
            if (!r.ok) throw new Error('O servidor de dados respondeu ' + r.status + ' para ' + nome + '.');
            return r.json();
        }

        function info() {
            if (!promessaVersao) {
                promessaVersao = json('versao.json').then(function (v) {
                    if (v.versao !== versao) throw new Error('O servidor de dados está na versão ' + v.versao + ', e o DAMNUM espera a ' + versao + '.');
                    return v;
                });
                promessaVersao.catch(function () { promessaVersao = null; });
            }
            return promessaVersao;
        }

        function indice() {
            if (!promessaIndice) {
                promessaIndice = json('indice.json').then(function (i) {
                    if (i.versao !== versao) throw new Error('Índice de blocos de outra versão (' + i.versao + ').');
                    return i.blocos;
                });
                promessaIndice.catch(function () { promessaIndice = null; });
            }
            return promessaIndice;
        }

        async function bytesDoBloco(meta) {
            var url = raiz + 'blocos/' + meta.chave + '.gz';
            var guardado = cache ? await cache.get(url) : null;
            if (guardado) return guardado;
            var r = await buscar(url);
            if (!r.ok) throw new Error('O servidor de dados respondeu ' + r.status + ' para o bloco ' + meta.chave + '.');
            var bytes = await r.arrayBuffer();
            var resumo = hex(await crypto.subtle.digest('SHA-256', bytes));
            if (resumo !== meta.sha256) throw new Error('O bloco ' + meta.chave + ' não confere com o índice (SHA-256).');
            if (cache) await cache.put(url, bytes);
            return bytes;
        }

        function bloco(meta) {
            if (!decodificados[meta.chave]) {
                decodificados[meta.chave] = bytesDoBloco(meta).then(function (bytes) {
                    var texto = new TextDecoder().decode(libs.gunzipSync(new Uint8Array(bytes)));
                    return decodificarBloco(libs, JSON.parse(texto));
                });
                decodificados[meta.chave].catch(function () { delete decodificados[meta.chave]; });
            }
            return decodificados[meta.chave];
        }

        // Camada leve com os limites dos seis biomas, para identificar o bioma em
        // todo o Brasil (versao.json traz o arquivo e o SHA-256).
        var promessaBiomas = null;
        function biomas() {
            if (!promessaBiomas) {
                promessaBiomas = info().then(function (v) {
                    if (!v.biomas_limites) return null;
                    var meta = { chave: v.biomas_limites.arquivo.replace(/^blocos\//, '').replace(/\.gz$/, ''), sha256: v.biomas_limites.sha256 };
                    return bytesDoBloco(meta).then(function (bytes) {
                        return decodificarBiomas(libs, JSON.parse(new TextDecoder().decode(libs.gunzipSync(new Uint8Array(bytes)))));
                    });
                });
                promessaBiomas.catch(function () { promessaBiomas = null; });
            }
            return promessaBiomas;
        }

        async function blocosNaCaixa(caixa) {
            var metas = (await indice()).filter(function (m) { return caixasSeTocam(m.bbox, caixa); });
            if (metas.length > LIMITE_BLOCOS) {
                throw new Error('A área informada cobre ' + metas.length + ' blocos do mapa; o limite é ' + LIMITE_BLOCOS + '. Divida o polígono.');
            }
            return Promise.all(metas.map(bloco));
        }

        return { blocosNaCaixa: blocosNaCaixa, info: info, indice: indice, biomas: biomas };
    }

    // Blocos já baixados e conferidos ficam no navegador (Cache API), com a versão
    // dos dados no nome: um polígono repetido não refaz a rede.
    function cacheDoNavegador(versao) {
        if (typeof caches === 'undefined') return null;
        var nome = 'damnum-dados-' + versao;
        return {
            get: async function (url) {
                try {
                    var r = await (await caches.open(nome)).match(url);
                    return r ? r.arrayBuffer() : null;
                } catch (e) { return null; }
            },
            put: async function (url, bytes) {
                try { await (await caches.open(nome)).put(url, new Response(bytes)); } catch (e) { /* sem cache */ }
            }
        };
    }

    // Fonte em memória (testes): blocos já em objeto, no formato publicado.
    function criarFonteMemoria(libs, blocos, descricao, biomas) {
        var prontos = blocos.map(function (b) { return decodificarBloco(libs, JSON.parse(JSON.stringify(b))); });
        var limites = biomas ? decodificarBiomas(libs, JSON.parse(JSON.stringify(biomas))) : null;
        return {
            blocosNaCaixa: async function (caixa) {
                return prontos.filter(function (b) { return caixasSeTocam(b.bbox, caixa); });
            },
            info: async function () { return descricao || { versao: 'memória', campo: CAMPO_ESTOQUE, fontes: [] }; },
            biomas: async function () { return limites; }
        };
    }

    // ---------- bioma pela localização ----------

    function decodificarBiomas(libs, dados) {
        return dados.biomas.map(function (b) {
            var geo = {
                type: 'Feature', properties: { bioma: b.nome },
                geometry: { type: 'MultiPolygon', coordinates: b.pol.map(function (p) { return p.map(function (a) { return decodificarAnel(a, dados.escala); }); }) }
            };
            geo.caixa = libs.bbox(geo);
            return geo;
        });
    }

    // Bioma da consulta ao mapa: no polígono, o de maior área com dado; na
    // coordenada, o da classe encontrada.
    function biomaDaConsulta(consulta) {
        if (!consulta) return null;
        if (consulta.tipo === 'coordenada') return consulta.classe ? consulta.classe.bioma : null;
        var porBioma = {};
        (consulta.partes || []).forEach(function (p) { porBioma[p.bioma] = (porBioma[p.bioma] || 0) + p.area_ha; });
        var nomes = Object.keys(porBioma).sort(function (a, b) { return porBioma[b] - porBioma[a]; });
        return nomes[0] || null;
    }

    // Bioma pela camada de limites: o do ponto; no polígono, o que contém a maior
    // parte de uma amostra de pontos (centro e vértices).
    async function identificarBioma(libs, fonte, alvo) {
        var limites = fonte.biomas ? await fonte.biomas() : null;
        if (!limites) return null;
        var pontos;
        if (Array.isArray(alvo)) {
            pontos = [alvo];
        } else {
            pontos = [];
            libs.flatten(alvo).features.filter(ehPoligono).forEach(function (f) {
                var c = libs.bbox(f);
                pontos.push([(c[0] + c[2]) / 2, (c[1] + c[3]) / 2]);
                var aneis = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(function (p) { return p[0]; });
                aneis.forEach(function (a) {
                    var passo = Math.max(1, Math.floor(a.length / 40));
                    for (var i = 0; i < a.length; i += passo) pontos.push(a[i]);
                });
            });
        }
        var votos = {};
        pontos.forEach(function (p) {
            var ponto = libs.point(p);
            for (var i = 0; i < limites.length; i++) {
                var c = limites[i].caixa;
                if (p[0] < c[0] || p[0] > c[2] || p[1] < c[1] || p[1] > c[3]) continue;
                if (libs.booleanPointInPolygon(ponto, limites[i])) { votos[limites[i].properties.bioma] = (votos[limites[i].properties.bioma] || 0) + 1; break; }
            }
        });
        var nomes = Object.keys(votos).sort(function (a, b) { return votos[b] - votos[a]; });
        return nomes[0] || null;
    }

    // O mapa pode ser usado? Exige o interruptor, o endereço e a versão esperada.
    async function verificarDisponibilidade(libs, opcoes) {
        if (!CONFIG.ativo) return { disponivel: false, motivo: 'A consulta ao mapa do Quarto Inventário está desligada nesta versão.' };
        if (!CONFIG.baseUrl) return { disponivel: false, motivo: 'O endereço dos dados do mapa não está configurado.' };
        try {
            var fonte = criarFonteBlocos(libs, opcoes);
            var v = await fonte.info();
            return { disponivel: true, fonte: fonte, info: v };
        } catch (erro) {
            return { disponivel: false, motivo: 'Consulta ao mapa indisponível (' + erro.message + ').' };
        }
    }

    // ---------- consultas ----------

    function areaHa(libs, geo) {
        return libs.area(geo) / 10000;
    }

    function retanguloDoPixel(b, linha, coluna) {
        return [b.x0 + coluna * b.passo, b.y0 - (linha + 1) * b.passo, b.x0 + (coluna + 1) * b.passo, b.y0 - linha * b.passo];
    }

    // Polígono: média do estoque ponderada pela área de cada classe cruzada. Nos
    // blocos raster, a área é a fração de cada pixel dentro do polígono.
    async function consultarPoligono(libs, fonte, geo) {
        var poligonos = libs.flatten(geo).features.filter(ehPoligono);
        if (poligonos.length === 0) throw new Error('O arquivo não contém polígono.');
        var areaTotal = 0, semDado = 0;
        var porChave = {};
        var chaves = {};

        function acumular(chave, descricao, area, d) {
            if (!porChave[chave]) porChave[chave] = Object.assign({ area_ha: 0, soma: 0 }, descricao);
            porChave[chave].area_ha += area;
            porChave[chave].soma += area * d;
        }

        for (var i = 0; i < poligonos.length; i++) {
            var alvo = poligonos[i];
            var caixa = libs.bbox(alvo);
            areaTotal += areaHa(libs, alvo);
            var blocos = await fonte.blocosNaCaixa(caixa);
            // Os blocos vetoriais vêm primeiro: na faixa em que o raster da Amazônia
            // se sobrepõe ao vetor de outro bioma, vale o vetor, e a área do pixel já
            // coberta por ele é descontada, para não contar a mesma área duas vezes.
            blocos = blocos.filter(function (b) { return b.formato === 'vetor'; }).concat(blocos.filter(function (b) { return b.formato !== 'vetor'; }));
            var cortesVetor = [];
            blocos.forEach(function (b) {
                chaves[b.chave] = true;
                if (b.formato === 'vetor') {
                    b.feicoesGeo.forEach(function (f) {
                        if (!caixasSeTocam(f.caixa, caixa)) return;
                        var corte = libs.intersect(libs.featureCollection([alvo, f]));
                        if (!corte) return;
                        var a = areaHa(libs, corte);
                        if (!(a > 0)) return;
                        corte.caixa = libs.bbox(corte);
                        cortesVetor.push(corte);
                        if (!temDado(f.properties.d)) { semDado += a; return; }
                        acumular('v|' + b.bioma + '|' + f.properties.id,
                            { formato: 'vetor', bioma: b.bioma, id: f.properties.id, c_pret: f.properties.c_pret, categ: f.properties.categ },
                            a, f.properties.d);
                    });
                    return;
                }
                var c0 = Math.max(0, Math.floor((caixa[0] - b.x0) / b.passo));
                var c1 = Math.min(b.colunas - 1, Math.floor((caixa[2] - b.x0) / b.passo));
                var l0 = Math.max(0, Math.floor((b.y0 - caixa[3]) / b.passo));
                var l1 = Math.min(b.linhas - 1, Math.floor((b.y0 - caixa[1]) / b.passo));
                if (c1 < c0 || l1 < l0) return;
                if ((c1 - c0 + 1) * (l1 - l0 + 1) > LIMITE_PIXELS) {
                    throw new Error('A área informada cobre pixels demais do mapa. Divida o polígono.');
                }
                for (var l = l0; l <= l1; l++) {
                    for (var c = c0; c <= c1; c++) {
                        var v = b.valores[l * b.colunas + c];
                        if (v === b.sem_dado) continue; // fora da cobertura
                        var pixel = retanguloDoPixel(b, l, c);
                        var corte = libs.bboxClip(alvo, pixel);
                        if (!ehPoligono(corte) || corte.geometry.coordinates.length === 0) continue;
                        var a = areaHa(libs, corte);
                        for (var k2 = 0; k2 < cortesVetor.length && a > 0; k2++) {
                            if (!caixasSeTocam(cortesVetor[k2].caixa, pixel)) continue;
                            var comum = libs.bboxClip(cortesVetor[k2], pixel);
                            if (ehPoligono(comum) && comum.geometry.coordinates.length) a -= areaHa(libs, comum);
                        }
                        if (!(a > 1e-9)) continue;
                        if (v === 0) { semDado += a; continue; }
                        var k = b.legenda[b.classes[l * b.colunas + c]] || ['', ''];
                        acumular('r|' + b.bioma + '|' + k[0], { formato: 'raster', bioma: b.bioma, c_pret: k[0], categ: k[1] }, a, v / b.escala);
                    }
                }
            });
        }
        var partes = Object.keys(porChave).map(function (k) {
            var p = porChave[k];
            p.d = p.soma / p.area_ha;
            delete p.soma;
            return p;
        }).sort(function (p, q) { return q.area_ha - p.area_ha; });
        var coberta = 0, soma = 0;
        partes.forEach(function (p) { coberta += p.area_ha; soma += p.area_ha * p.d; });
        return {
            tipo: 'poligono',
            area_ha: areaTotal,
            partes: partes,
            area_coberta_ha: coberta,
            area_sem_dado_ha: semDado,
            pct_descoberto: areaTotal > 0 ? Math.max(0, (1 - coberta / areaTotal) * 100) : 100,
            pct_sem_dado: areaTotal > 0 ? semDado / areaTotal * 100 : 0,
            estoque_tC_ha: coberta > 0 ? soma / coberta : null,
            campo: CAMPO_ESTOQUE,
            blocos: Object.keys(chaves).sort()
        };
    }

    function metrosEntre(lon, lat, lon2, lat2) {
        var dy = (lat2 - lat) * 110574;
        var dx = (lon2 - lon) * 111320 * Math.cos(lat * Math.PI / 180);
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Coordenada: estoque da classe do mapa no ponto, com as classes vizinhas a
    // menos de 100 m.
    async function consultarPonto(libs, fonte, lon, lat) {
        var grau = 0.004; // cerca de 440 m: alcança vizinhos a 100 m e o pixel de 250 m
        var blocos = await fonte.blocosNaCaixa([lon - grau, lat - grau, lon + grau, lat + grau]);
        var ponto = libs.point([lon, lat]);
        var candidatos = [];
        var chaves = {};
        blocos.forEach(function (b) {
            if (b.formato === 'vetor') {
                b.feicoesGeo.forEach(function (f) {
                    var contem = libs.booleanPointInPolygon(ponto, f);
                    var d = contem ? 0 : distanciaAteBorda(libs, ponto, f);
                    if (d === null || d > RAIO_VIZINHANCA_M) return;
                    chaves[b.chave] = true;
                    candidatos.push({ formato: 'vetor', bioma: b.bioma, id: f.properties.id, c_pret: f.properties.c_pret, categ: f.properties.categ, d: f.properties.d, contem: contem, distancia_m: d });
                });
                return;
            }
            var folga = b.passo;
            var c0 = Math.max(0, Math.floor((lon - folga - b.x0) / b.passo)), c1 = Math.min(b.colunas - 1, Math.floor((lon + folga - b.x0) / b.passo));
            var l0 = Math.max(0, Math.floor((b.y0 - lat - folga) / b.passo)), l1 = Math.min(b.linhas - 1, Math.floor((b.y0 - lat + folga) / b.passo));
            for (var l = l0; l <= l1; l++) {
                for (var c = c0; c <= c1; c++) {
                    var v = b.valores[l * b.colunas + c];
                    if (v === b.sem_dado) continue;
                    var r = retanguloDoPixel(b, l, c);
                    var contem = lon >= r[0] && lon < r[2] && lat > r[1] && lat <= r[3];
                    var d = contem ? 0 : metrosEntre(lon, lat, Math.min(Math.max(lon, r[0]), r[2]), Math.min(Math.max(lat, r[1]), r[3]));
                    if (d > RAIO_VIZINHANCA_M) continue;
                    chaves[b.chave] = true;
                    var k = b.legenda[b.classes[l * b.colunas + c]] || ['', ''];
                    candidatos.push({ formato: 'raster', bioma: b.bioma, c_pret: k[0], categ: k[1], d: v / b.escala, contem: contem, distancia_m: d });
                }
            }
        });
        var contidos = candidatos.filter(function (c) { return c.contem; });
        // Em faixa de sobreposição entre biomas, vale o vetor; depois, a fonte que tem dado.
        contidos.sort(function (p, q) { return (p.formato === 'vetor' ? 0 : 1) - (q.formato === 'vetor' ? 0 : 1); });
        var achado = contidos.filter(function (c) { return temDado(c.d); })[0] || contidos[0] || null;
        var vizinhas = {};
        candidatos.forEach(function (c) {
            if (c.contem || !achado) return;
            // No raster, cada pixel tem o seu valor: só interessa a troca de classe.
            var outra = c.c_pret !== achado.c_pret || (c.formato === 'vetor' && Math.abs((c.d || 0) - (achado.d || 0)) > 0.005);
            if (!outra) return;
            var chave = c.formato === 'vetor' ? c.c_pret + '|' + c.d : c.c_pret;
            if (!vizinhas[chave] || c.distancia_m < vizinhas[chave].distancia_m) vizinhas[chave] = c;
        });
        var lista = Object.keys(vizinhas).map(function (k) { return vizinhas[k]; })
            .sort(function (p, q) { return p.distancia_m - q.distancia_m; });
        return {
            tipo: 'coordenada',
            lon: lon, lat: lat,
            classe: achado,
            sem_dado: !!achado && !temDado(achado.d),
            estoque_tC_ha: achado && temDado(achado.d) ? achado.d : null,
            vizinhas: lista,
            aviso: AVISO_COORDENADA,
            campo: CAMPO_ESTOQUE,
            blocos: Object.keys(chaves).sort()
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
        DADOS_BASE_URL: DADOS_BASE_URL,
        VERSAO_DADOS: VERSAO_DADOS,
        CAMPO_ESTOQUE: CAMPO_ESTOQUE,
        CONFIG: CONFIG,
        configurar: configurar,
        AVISO_COORDENADA: AVISO_COORDENADA,
        temDado: temDado,
        decodificarBloco: decodificarBloco,
        criarFonteBlocos: criarFonteBlocos,
        criarFonteMemoria: criarFonteMemoria,
        verificarDisponibilidade: verificarDisponibilidade,
        identificarBioma: identificarBioma,
        biomaDaConsulta: biomaDaConsulta,
        areaHa: areaHa,
        consultarPoligono: consultarPoligono,
        consultarPonto: consultarPonto,
        divergenciaDeArea: divergenciaDeArea,
        lerArquivoGeometria: lerArquivoGeometria,
        normalizar: normalizar,
        carregarLibs: carregarLibs
    };
});
