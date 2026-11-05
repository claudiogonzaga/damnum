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
    var URL_LIBS = 'vendor/damnum-geo.js?v=7.1.13';
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
        var buscar = opcoes.buscar || function (url, init) { return init ? fetch(url, init) : fetch(url); };
        var cache = opcoes.cache || cacheDoNavegador(versao);
        var raiz = base + '/' + versao + '/';
        var promessaVersao = null, promessaIndice = null;
        var decodificados = {};

        // Os JSON de metadados são pequenos e mudam a cada versão dos dados: no
        // navegador, sempre se revalida a cópia guardada.
        async function json(nome) {
            var r = typeof document !== 'undefined' ? await buscar(raiz + nome, { cache: 'no-cache' }) : await buscar(raiz + nome);
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
            blocos: Object.keys(chaves).sort(),
            arquivo: geo.resumo || null
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

    // ---------- coordenada em vários formatos ----------

    // Aceita graus decimais (-12.5, -12,5, 12.5 S) e graus, minutos e segundos
    // (12°30'15"S, 12 30 15 S, 12°30,25' S), com hemisfério N, S, L, E, O ou W ou
    // com sinal. `eixo` é 'lat' ou 'lon'. Devolve o número em graus decimais, ou
    // null se o texto não for uma coordenada válida para o eixo.
    function lerCoordenada(texto, eixo) {
        if (texto === null || texto === undefined) return null;
        var t = String(texto).trim().toUpperCase().replace(/[−–—]/g, '-').replace(/[′’´`]/g, "'").replace(/[″”“]|''/g, '"');
        if (!t) return null;
        var negativo = /^-/.test(t);
        var hemisferio = (t.match(/[NSLEOW]/) || [''])[0];
        if (/[SOW]/.test(hemisferio)) negativo = true;
        if (/[NLE]/.test(hemisferio) && negativo) return null;
        if (eixo === 'lat' && /[LEOW]/.test(hemisferio)) return null;
        if (eixo === 'lon' && /[NS]/.test(hemisferio)) return null;
        var numeros = (t.replace(/^-/, '').match(/\d+(?:[.,]\d+)?/g) || []).map(function (n) { return parseFloat(n.replace(',', '.')); });
        if (numeros.length === 0 || numeros.length > 3) return null;
        // "-12,5" e "12.5" têm um número só; vírgula decimal sem símbolos de minuto.
        var graus = numeros[0], minutos = numeros[1] || 0, segundos = numeros[2] || 0;
        if (numeros.length > 1 && (minutos >= 60 || segundos >= 60 || graus % 1 !== 0)) return null;
        var valor = graus + minutos / 60 + segundos / 3600;
        if (negativo) valor = -valor;
        var limite = eixo === 'lat' ? 90 : 180;
        if (!(Math.abs(valor) <= limite)) return null;
        return Math.round(valor * 1e7) / 1e7;
    }

    // ---------- leitura do arquivo do usuário (navegador) ----------

    // Aceita GeoJSON, KML, KMZ e shapefile zipado. Devolve uma lista de coleções,
    // cada uma com o nome de origem: o zip do CAR traz um shapefile por tema.
    async function lerColecoes(libs, arquivo) {
        var nome = (arquivo.name || '').toLowerCase();
        var base = (arquivo.name || '').replace(/\.[^.]+$/, '');
        if (/\.(geojson|json)$/.test(nome)) {
            return [{ nome: base, geo: JSON.parse(await arquivo.text()) }];
        }
        if (/\.kml$/.test(nome)) {
            return [{ nome: base, geo: libs.kml(new DOMParser().parseFromString(await arquivo.text(), 'text/xml')) }];
        }
        if (/\.kmz$/.test(nome)) {
            var conteudo = libs.unzipSync(new Uint8Array(await arquivo.arrayBuffer()));
            var interno = Object.keys(conteudo).filter(function (n) { return /\.kml$/i.test(n); })[0];
            if (!interno) throw new Error('O arquivo KMZ não contém KML.');
            return [{ nome: base, geo: libs.kml(new DOMParser().parseFromString(new TextDecoder().decode(conteudo[interno]), 'text/xml')) }];
        }
        if (/\.zip$/.test(nome)) {
            var lidos = await libs.shp(await arquivo.arrayBuffer());
            // No zip, cada shapefile é um tema (APP, RESERVA_LEGAL...): o nome dele diz o que é.
            return (Array.isArray(lidos) ? lidos : [lidos]).map(function (g) { return { nome: g.fileName || base, geo: g, tema: !!g.fileName }; });
        }
        throw new Error('Formato não aceito. Use KML, KMZ, GeoJSON ou shapefile zipado (.zip).');
    }

    function feicoesDe(geo) {
        if (geo.type === 'FeatureCollection') return geo.features;
        if (geo.type === 'Feature') return [geo];
        return [{ type: 'Feature', properties: {}, geometry: geo }];
    }

    // Devolve FeatureCollection só com polígonos, em WGS 84.
    async function lerArquivoGeometria(libs, arquivo) {
        var colecoes = await lerColecoes(libs, arquivo);
        return normalizar(libs, libs.featureCollection([].concat.apply([], colecoes.map(function (c) { return feicoesDe(c.geo); }))));
    }

    // Partes poligonais de uma geometria: entra em GeometryCollection (é como o
    // leitor de KML entrega a MultiGeometry) e conta o que não é polígono.
    function partesPoligonais(geometria, ignorados) {
        if (!geometria) return [];
        if (geometria.type === 'Polygon' || geometria.type === 'MultiPolygon') return [geometria];
        if (geometria.type === 'GeometryCollection') {
            return [].concat.apply([], (geometria.geometries || []).map(function (g) { return partesPoligonais(g, ignorados); }));
        }
        ignorados[geometria.type] = (ignorados[geometria.type] || 0) + 1;
        return [];
    }

    // Só longitude e latitude: a altitude do KML (x, y, 0) não entra na conta.
    function semAltitude(c) {
        return typeof c[0] === 'number' ? [c[0], c[1]] : c.map(semAltitude);
    }

    function nomeDaFeicao(p, n) {
        var nome = p.name || p.Name || p.NAME || p.nome || p.Nome || p.NOME;
        return nome ? String(nome).trim() : 'polígono ' + n;
    }

    var NOMES_IGNORADOS = { Point: ['ponto', 'pontos'], MultiPoint: ['grupo de pontos', 'grupos de pontos'], LineString: ['linha', 'linhas'], MultiLineString: ['grupo de linhas', 'grupos de linhas'] };
    function descreverIgnorados(ignorados) {
        var itens = Object.keys(ignorados).map(function (t) {
            var n = ignorados[t], nomes = NOMES_IGNORADOS[t] || [t, t];
            return n + ' ' + nomes[n === 1 ? 0 : 1];
        });
        return itens.length < 2 ? itens.join('') : itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1];
    }

    // Une os polígonos do arquivo: a área sobreposta conta uma vez só. O resumo
    // (cada polígono com nome e área, soma, sobreposição, o que foi ignorado)
    // segue com a geometria para a tela e para o relatório.
    function unirPartes(libs, partes, ignorados) {
        var resumo = {
            poligonos: partes.length,
            partes: partes.map(function (f) { return { nome: f.properties.nome, area_ha: areaHa(libs, f) }; }),
            ignorados: ignorados,
            descricaoIgnorados: descreverIgnorados(ignorados),
            uniao: false,
            sobreposicao_ha: 0,
            aviso: ''
        };
        resumo.area_soma_ha = resumo.partes.reduce(function (s, p) { return s + p.area_ha; }, 0);
        var saida = libs.featureCollection(partes);
        if (partes.length > 1) {
            try {
                var u = libs.union(libs.featureCollection(partes));
                if (u) {
                    u.properties = { nome: 'união dos polígonos do arquivo' };
                    saida = libs.featureCollection([u]);
                    resumo.uniao = true;
                    var sobra = resumo.area_soma_ha - areaHa(libs, u);
                    resumo.sobreposicao_ha = sobra > 1e-4 ? sobra : 0; // abaixo de 1 m² é arredondamento
                }
            } catch (erro) {
                resumo.aviso = 'Não foi possível unir os polígonos (' + erro.message + '); se houver sobreposição entre eles, a área sobreposta conta duas vezes.';
            }
        }
        resumo.area_ha = areaHa(libs, saida);
        saida.resumo = resumo;
        saida.pecas = partes;
        return saida;
    }

    function normalizar(libs, geo) {
        var ignorados = {}, partes = [];
        feicoesDe(geo).forEach(function (f, i) {
            var atributos = f.properties || {};
            var nome = nomeDaFeicao(atributos, i + 1);
            var aneis = [];
            partesPoligonais(f.geometry, ignorados).forEach(function (g) {
                (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(function (p) { aneis.push(p); });
            });
            aneis.forEach(function (p, k) {
                partes.push({ type: 'Feature', properties: { nome: aneis.length > 1 ? nome + ' (' + (k + 1) + ')' : nome, feicao: i, nomeFeicao: nome, atributos: atributos },
                    geometry: { type: 'Polygon', coordinates: semAltitude(p) } });
            });
        });
        if (partes.length === 0) {
            throw new Error('O arquivo não contém polígono' + (Object.keys(ignorados).length ? ': tem só ' + descreverIgnorados(ignorados) : '') + '.');
        }
        return unirPartes(libs, partes, ignorados);
    }

    // Cada feição do arquivo (com todos os seus polígonos) como uma área à parte,
    // para valorar uma de cada vez, por exemplo quando as datas do dano diferem.
    function separarFeicoes(libs, geo) {
        var grupos = [], posicao = {};
        (geo.pecas || []).forEach(function (f) {
            var k = f.properties.feicao;
            if (!(k in posicao)) {
                posicao[k] = grupos.length;
                grupos.push({ nome: f.properties.nomeFeicao, atributos: f.properties.atributos || {}, partes: [] });
            }
            grupos[posicao[k]].partes.push(f);
        });
        return grupos.map(function (g) {
            var saida = unirPartes(libs, g.partes, {});
            saida.nome = g.nome;
            saida.atributos = g.atributos;
            return saida;
        });
    }

    // ---------- data do dano nos atributos ----------

    // Campos de data de bases de desmatamento: PRODES (image_date), DETER
    // (view_date), MapBiomas Alerta (data de detecção), KML (timestamp). Só data
    // completa preenche o campo; o ano sozinho não diz o dia e fica como pista.
    var CAMPOS_DATA = /^(image_?date|view_?date|date|data|data_?(do_?)?dano|dt_?dano|data_?desmat\w*|data_?detec\w*|dt_?detec\w*|detect\w*|data_?imagem|dt_?imagem|timestamp|when)$/i;
    var CAMPOS_ANO = /^(year|ano|ano_?desmat\w*|ano_?prodes|ano_?detec\w*)$/i;

    function lerData(v) {
        function montar(a, m, d) {
            var data = new Date(a, m - 1, d);
            return a >= 1985 && data.getFullYear() === a && data.getMonth() === m - 1 && data.getDate() === d ? data : null;
        }
        if (v instanceof Date) return isNaN(v) ? null : montar(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
        var t = String(v == null ? '' : v).trim(), m;
        if ((m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?!\d)/))) return montar(+m[1], +m[2], +m[3]);
        if ((m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?!\d)/))) return montar(+m[3], +m[2], +m[1]);
        if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) return montar(+m[1], +m[2], +m[3]);
        return null;
    }

    // Devolve { data, campo }, { data: null, ano, campo } ou null.
    function dataDaFeicao(atributos) {
        var achada = null, ano = null;
        Object.keys(atributos || {}).forEach(function (campo) {
            var v = atributos[campo];
            if (!achada && CAMPOS_DATA.test(campo)) {
                var d = lerData(v);
                if (d) achada = { data: d, campo: campo };
            }
            if (!ano && CAMPOS_ANO.test(campo)) {
                var n = parseInt(v, 10);
                if (String(n) === String(v).trim() && n >= 1985 && n <= 2100) ano = { data: null, ano: n, campo: campo };
            }
        });
        return achada || ano;
    }

    // ---------- áreas territorialmente protegidas (recorte do polígono) ----------

    var CATEGORIAS_PROTEGIDAS = [
        { chave: 'app', nome: 'APP', teste: /(^|[^a-z])apps?([^a-z]|$)|preserva[cç][aã]o[ _-]*permanente/i },
        { chave: 'rl', nome: 'reserva legal', teste: /reserva[ _-]*legal|(^|[^a-z])a?rl([^a-z]|$)/i },
        { chave: 'uc', nome: 'unidade de conservação', teste: /unidades?[ _-]*de[ _-]*conserva|(^|[^a-z])ucs?([^a-z]|$)|cnuc|rppn|parque[ _-]*(nacional|estadual|municipal)|esta[cç][aã]o[ _-]*ecol|reserva[ _-]*biol/i },
        { chave: 'ti', nome: 'terra indígena', teste: /ind[ií]gena|(^|[^a-z])tis?([^a-z]|$)/i }
    ];
    var SEM_CATEGORIA = { chave: 'outra', nome: 'área protegida sem categoria no arquivo' };
    // Temas do CAR que não são área territorialmente protegida (perímetro do
    // imóvel, vegetação nativa, área consolidada...): ficam fora do recorte.
    var TEMAS_FORA = /im[oó]ve(l|is)|vegeta[cç][aã]o[ _-]*nativa|remanescente|consolidad|uso[ _-]*restrito|servid[aã]o|hidrografia|pousio|[aá]rea[ _-]*l[ií]quida|amortecimento/i;
    // APA: unidade de conservação de uso sustentável, em que a supressão pode ser
    // autorizada. Entra no recorte, com aviso.
    var APA = /prote[cç][aã]o[ _-]*ambiental|(^|[^a-z])apa([^a-z]|$)/i;
    // No CNUC, o campo "limite" separa a UC ("UC") da zona de amortecimento ("ZA").
    function zonaDeAmortecimento(atributos) {
        var v = atributos && (atributos.limite || atributos.LIMITE);
        return /^\s*za\s*$/i.test(String(v || ''));
    }
    // Atributos que descrevem a feição, no CAR, no CNUC, na FUNAI e no KML.
    var CAMPOS_DESCRITIVOS = /^(tema|nom_?tema|des_?tema|categoria\w*|tipo|classe|name|nome|nome_?uc\w*|terrai_?nom|descricao)$/i;

    function categoriaDoTexto(texto) {
        var t = String(texto || '');
        for (var i = 0; i < CATEGORIAS_PROTEGIDAS.length; i++) {
            if (CATEGORIAS_PROTEGIDAS[i].teste.test(t)) return CATEGORIAS_PROTEGIDAS[i];
        }
        return null;
    }

    function textoDescritivo(atributos) {
        return Object.keys(atributos || {}).filter(function (k) { return CAMPOS_DESCRITIVOS.test(k); })
            .map(function (k) { return String(atributos[k]); }).join(' | ');
    }

    // Camada de áreas protegidas a partir das coleções lidas. No shapefile do CAR,
    // que vem um por tema, a categoria é a do tema; nos demais arquivos (KML,
    // GeoJSON), a da feição, e o nome do arquivo só vale na falta dela. Temas que
    // não são área protegida são contados e deixados de fora.
    function camadaDeColecoes(libs, colecoes, nomeArquivo) {
        var feicoes = [], contagem = {}, ignoradas = {}, apas = 0;
        colecoes.forEach(function (c) {
            var doArquivo = categoriaDoTexto(c.nome);
            var arquivoFora = !!c.tema && !doArquivo && TEMAS_FORA.test(c.nome);
            feicoesDe(c.geo).forEach(function (f) {
                var geoms = partesPoligonais(f.geometry, {});
                if (!geoms.length) return;
                if (zonaDeAmortecimento(f.properties)) {
                    ignoradas['zona de amortecimento'] = (ignoradas['zona de amortecimento'] || 0) + 1;
                    return;
                }
                var texto = textoDescritivo(f.properties);
                var daFeicao = categoriaDoTexto(texto);
                var categoria = c.tema ? (doArquivo || (arquivoFora ? null : daFeicao)) : (daFeicao || doArquivo);
                if (!categoria && (arquivoFora || TEMAS_FORA.test(texto))) {
                    var tema = arquivoFora ? c.nome : (texto.split(' | ')[0] || 'sem nome');
                    ignoradas[tema] = (ignoradas[tema] || 0) + 1;
                    return;
                }
                categoria = categoria || SEM_CATEGORIA;
                contagem[categoria.chave] = (contagem[categoria.chave] || 0) + 1;
                var apa = APA.test(texto);
                if (apa) apas++;
                geoms.forEach(function (g) {
                    var feature = { type: 'Feature', properties: { categoria: categoria.chave }, geometry: { type: g.type, coordinates: semAltitude(g.coordinates) } };
                    feicoes.push({ categoria: categoria, feature: feature, bbox: libs.bbox(feature), apa: apa });
                });
            });
        });
        var descricaoIgnoradas = Object.keys(ignoradas).map(function (t) { return t + ' (' + ignoradas[t] + ')'; }).join(', ');
        if (!feicoes.length) {
            throw new Error('O arquivo não traz polígono de área protegida' + (descricaoIgnoradas ? '; só ' + descricaoIgnoradas + ', que não são área protegida' : '') + '.');
        }
        return { nomeArquivo: nomeArquivo || '', feicoes: feicoes, contagem: contagem, ignoradas: ignoradas, descricaoIgnoradas: descricaoIgnoradas, apas: apas };
    }

    async function lerCamadaProtegida(libs, arquivo) {
        return camadaDeColecoes(libs, await lerColecoes(libs, arquivo), arquivo.name || '');
    }

    // Sem camada, o nome dos polígonos do próprio arquivo pode dizer a categoria
    // ("APP do córrego", "Reserva legal"). Devolve a camada desses polígonos, ou
    // null se nenhum nome indicar área protegida.
    function camadaDosNomes(libs, geo) {
        var feicoes = [], contagem = {};
        (geo.pecas || []).forEach(function (f) {
            var categoria = categoriaDoTexto(f.properties.nome);
            if (!categoria) return;
            contagem[categoria.chave] = (contagem[categoria.chave] || 0) + 1;
            feicoes.push({ categoria: categoria, feature: f, bbox: libs.bbox(f) });
        });
        return feicoes.length ? { nomeArquivo: '', feicoes: feicoes, contagem: contagem, ignoradas: {}, descricaoIgnoradas: '', pelosNomes: true } : null;
    }

    // Quanto do polígono desmatado cai nas áreas protegidas da camada. Os pedaços
    // são unidos antes da conta, para que APP e reserva legal sobrepostas contem
    // uma vez só; por isso a soma por categoria pode passar da área protegida.
    function recortarProtegidas(libs, geo, camada) {
        var total = areaHa(libs, geo);
        var caixa = libs.bbox(geo);
        var alvos = geo.features.filter(ehPoligono);
        var pedacos = [], porCategoria = {}, falhas = 0, emAPA = 0;
        camada.feicoes.forEach(function (c) {
            if (!caixasSeTocam(c.bbox, caixa)) return;
            alvos.forEach(function (a) {
                var i = null;
                try { i = libs.intersect(libs.featureCollection([a, c.feature])); } catch (erro) { falhas++; }
                if (!i) return;
                var ha = areaHa(libs, i);
                if (!(ha > 0)) return;
                pedacos.push(i);
                if (c.apa) emAPA += ha;
                var k = c.categoria.chave;
                porCategoria[k] = porCategoria[k] || { chave: k, nome: c.categoria.nome, area_ha: 0 };
                porCategoria[k].area_ha += ha;
            });
        });
        var soma = pedacos.reduce(function (s, p) { return s + areaHa(libs, p); }, 0);
        var em = soma, aviso = '';
        if (pedacos.length > 1) {
            try {
                var u = libs.union(libs.featureCollection(pedacos));
                em = u ? areaHa(libs, u) : 0;
            } catch (erro) {
                aviso = 'Não foi possível unir as áreas protegidas (' + erro.message + '); a sobreposição entre elas pode ter sido contada duas vezes.';
            }
        }
        if (falhas) aviso += (aviso ? ' ' : '') + falhas + ' polígono(s) da camada não puderam ser cruzados com a área desmatada.';
        if (emAPA > 1e-4) aviso += (aviso ? ' ' : '') + 'Parte do polígono (até ' + emAPA.toFixed(4).replace('.', ',') + ' ha) está em Área de Proteção Ambiental (APA), unidade de uso sustentável em que a supressão pode ser autorizada; confira se essa parte deve contar como área territorialmente protegida.';
        em = Math.min(em, total);
        if (em < 1e-4) em = 0; // abaixo de 1 m² é arredondamento
        var ordem = CATEGORIAS_PROTEGIDAS.map(function (c) { return c.chave; }).concat([SEM_CATEGORIA.chave]);
        return {
            arquivo: camada.nomeArquivo,
            pelosNomes: !!camada.pelosNomes,
            total_ha: total,
            em_ha: em,
            fora_ha: Math.max(total - em, 0),
            categorias: ordem.filter(function (k) { return porCategoria[k]; }).map(function (k) { return porCategoria[k]; }),
            sobreposicao_ha: soma - em > 1e-4 ? soma - em : 0,
            descricaoIgnoradas: camada.descricaoIgnoradas || '',
            aviso: aviso
        };
    }

    // Área comum a duas geometrias (para avisar de áreas repetidas no carrinho).
    function sobreposicaoHa(libs, geoA, geoB) {
        if (!caixasSeTocam(libs.bbox(geoA), libs.bbox(geoB))) return 0;
        var total = 0;
        geoA.features.filter(ehPoligono).forEach(function (a) {
            geoB.features.filter(ehPoligono).forEach(function (b) {
                var i = null;
                try { i = libs.intersect(libs.featureCollection([a, b])); } catch (erro) { i = null; }
                if (i) total += areaHa(libs, i);
            });
        });
        return total > 1e-4 ? total : 0;
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
        lerCoordenada: lerCoordenada,
        biomaDaConsulta: biomaDaConsulta,
        areaHa: areaHa,
        consultarPoligono: consultarPoligono,
        consultarPonto: consultarPonto,
        divergenciaDeArea: divergenciaDeArea,
        lerArquivoGeometria: lerArquivoGeometria,
        normalizar: normalizar,
        separarFeicoes: separarFeicoes,
        descreverIgnorados: descreverIgnorados,
        lerData: lerData,
        dataDaFeicao: dataDaFeicao,
        CATEGORIAS_PROTEGIDAS: CATEGORIAS_PROTEGIDAS,
        categoriaDoTexto: categoriaDoTexto,
        camadaDeColecoes: camadaDeColecoes,
        lerCamadaProtegida: lerCamadaProtegida,
        camadaDosNomes: camadaDosNomes,
        recortarProtegidas: recortarProtegidas,
        sobreposicaoHa: sobreposicaoHa,
        carregarLibs: carregarLibs
    };
});
