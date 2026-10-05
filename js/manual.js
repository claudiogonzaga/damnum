// DAMNUM — página do manual colaborativo.
// O texto fica num Google Docs aberto a comentários e sugestões. Esta página o
// lê, mostra com um sumário e leva ao documento quem quiser contribuir.
(function () {
    'use strict';

    // Documento do manual no Google Drive dos autores, compartilhado como
    // "qualquer pessoa com o link pode comentar" (comentar inclui sugerir).
    var MANUAL_DOC_ID = '1Diu0GZxO423uIhulJWfmuiVeNpm0RcUcGhQQoiAeOwY';
    var URL_DOC = 'https://docs.google.com/document/d/' + MANUAL_DOC_ID;
    var URL_EDITAR = URL_DOC + '/edit';
    var URL_HTML = URL_DOC + '/export?format=html';
    var URL_QUADRO = URL_DOC + '/preview';

    var TAGS_ACEITAS = ['H1', 'H2', 'H3', 'H4', 'P', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'A', 'B', 'STRONG', 'I', 'EM', 'SUP', 'SUB', 'BR', 'HR', 'SPAN'];

    // O Google exporta negrito e itálico como classes CSS. Lê as regras para
    // devolver a marcação.
    function estilosDasClasses(doc) {
        var mapa = {};
        var css = Array.prototype.map.call(doc.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
        var regra = /\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g;
        var m;
        while ((m = regra.exec(css))) {
            mapa[m[1]] = {
                negrito: /font-weight:\s*(700|bold)/.test(m[2]),
                italico: /font-style:\s*italic/.test(m[2])
            };
        }
        return mapa;
    }

    // Links externos do Docs vêm embrulhados em google.com/url?q=...
    function limparLink(href) {
        try {
            var u = new URL(href, URL_DOC);
            if (u.hostname === 'www.google.com' && u.pathname === '/url' && u.searchParams.get('q')) u = new URL(u.searchParams.get('q'));
            return /^https?:$/.test(u.protocol) ? u.href : null;
        } catch (erro) {
            return null;
        }
    }

    // Copia só as tags aceitas, sem atributos (exceto o destino dos links).
    function copiarLimpo(origem, destino, estilos) {
        Array.prototype.forEach.call(origem.childNodes, function (no) {
            if (no.nodeType === Node.TEXT_NODE) {
                destino.appendChild(document.createTextNode(no.textContent));
                return;
            }
            if (no.nodeType !== Node.ELEMENT_NODE) return;
            if (TAGS_ACEITAS.indexOf(no.tagName) === -1) {
                if (no.tagName !== 'SCRIPT' && no.tagName !== 'STYLE') copiarLimpo(no, destino, estilos);
                return;
            }
            var novo;
            if (no.tagName === 'SPAN') {
                var negrito = false, italico = false;
                (no.getAttribute('class') || '').split(/\s+/).forEach(function (c) {
                    if (estilos[c]) { negrito = negrito || estilos[c].negrito; italico = italico || estilos[c].italico; }
                });
                novo = destino;
                if (negrito) { novo = novo.appendChild(document.createElement('strong')); }
                if (italico) { novo = novo.appendChild(document.createElement('em')); }
                copiarLimpo(no, novo, estilos);
                return;
            }
            novo = document.createElement(no.tagName.toLowerCase());
            if (no.tagName === 'A') {
                var href = limparLink(no.getAttribute('href') || '');
                if (!href) { copiarLimpo(no, destino, estilos); return; }
                novo.href = href;
                novo.target = '_blank';
                novo.rel = 'noopener';
            }
            copiarLimpo(no, novo, estilos);
            if (novo.tagName === 'P' && !novo.textContent.trim()) return; // parágrafo vazio
            destino.appendChild(novo);
        });
    }

    // Âncora estável a partir do texto do título (ex.: "Atualização monetária"
    // vira #atualizacao-monetaria), para que links de outras páginas funcionem.
    function ancora(texto, usadas) {
        var base = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'secao';
        var id = base, n = 2;
        while (usadas[id]) id = base + '-' + (n++);
        usadas[id] = true;
        return id;
    }

    function montarSumario(conteudo, sumario) {
        var lista = document.createElement('ul');
        var usadas = {};
        var titulos = conteudo.querySelectorAll('h1, h2');
        Array.prototype.forEach.call(titulos, function (h, i) {
            if (i === 0 && h.tagName === 'H1') { h.className = 'manual-titulo'; return; } // título do documento
            h.id = ancora(h.textContent, usadas);
            var item = document.createElement('li');
            item.className = h.tagName === 'H2' ? 'nivel-2' : 'nivel-1';
            var link = document.createElement('a');
            link.href = '#' + h.id;
            link.textContent = h.textContent;
            item.appendChild(link);
            lista.appendChild(item);
        });
        sumario.innerHTML = '';
        sumario.appendChild(lista);
    }

    function mostrarQuadro(motivo) {
        console.warn('Manual: leitura direta indisponível (' + motivo + '); usando o quadro do Google Docs.');
        document.getElementById('manualLeitura').style.display = 'none';
        var quadro = document.getElementById('manualQuadro');
        quadro.style.display = '';
        quadro.querySelector('iframe').src = URL_QUADRO;
    }

    async function carregar() {
        var conteudo = document.getElementById('manualConteudo');
        try {
            var resposta = await fetch(URL_HTML);
            if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
            var doc = new DOMParser().parseFromString(await resposta.text(), 'text/html');
            var limpo = document.createDocumentFragment();
            copiarLimpo(doc.body, limpo, estilosDasClasses(doc));
            if (!limpo.querySelector('h1, h2, p')) throw new Error('documento vazio');
            conteudo.innerHTML = '';
            conteudo.appendChild(limpo);
            montarSumario(conteudo, document.getElementById('manualSumario'));
            if (location.hash) {
                var alvo = document.getElementById(location.hash.slice(1));
                if (alvo) alvo.scrollIntoView();
            }
        } catch (erro) {
            mostrarQuadro(erro.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.link-contribuir'), function (a) { a.href = URL_EDITAR; });
        carregar();
    });
})();
