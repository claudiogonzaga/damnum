// Aviso de cookies e Google Analytics (GA4) de consciencia.eco.br.
// O portal e o DAMNUM (servido em /damnum/) têm cada um uma cópia deste arquivo: mudou um, mude o outro.
// A escolha vale para o site todo, porque as páginas dividem o localStorage de consciencia.eco.br.
(function () {
    'use strict';

    var ID_MEDICAO = 'G-MD5QMGX9EC';
    // 'todos' ou 'necessarios'. O 'cookieConsent' antigo ("Permitir Necessários") não vale como aceite do Analytics.
    var CHAVE = 'cookiesEscolha';
    // Lido pelo contador do DAMNUM: 'accepted' guarda o backup do contador neste navegador, 'rejected' o apaga.
    var CHAVE_CONTADOR = 'cookieConsent';

    function ler() {
        try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
    }

    function gravar(escolha) {
        try {
            localStorage.setItem(CHAVE, escolha);
            localStorage.setItem(CHAVE_CONTADOR, escolha === 'todos' ? 'accepted' : 'rejected');
            if (escolha !== 'todos') localStorage.removeItem('contadorValoracoes');
        } catch (e) { /* sem armazenamento: a escolha vale só nesta página */ }
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

    function carregarAnalytics() {
        if (window.analyticsCarregado) return;
        window.analyticsCarregado = true;
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID_MEDICAO;
        document.head.appendChild(s);
        window.gtag('js', new Date());
        window.gtag('config', ID_MEDICAO, { allow_google_signals: false, allow_ad_personalization_signals: false });
    }

    var FONTE = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    var CSS = [
        '#aviso-cookies{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;padding:16px 20px calc(16px + env(safe-area-inset-bottom));background:rgba(16,22,30,.98);color:#f3efe6;border-top:1px solid rgba(255,255,255,.2);box-shadow:0 -8px 28px rgba(0,0,0,.4);font:15px/1.5 ' + FONTE + ';text-align:left}',
        '#aviso-cookies *{box-sizing:border-box}',
        '#aviso-cookies [hidden]{display:none !important}',
        '#aviso-cookies .ac-conteudo{max-width:980px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:14px 28px}',
        '#aviso-cookies .ac-texto{flex:1 1 380px;min-width:0}',
        '#aviso-cookies h2{margin:0 0 4px;padding:0;font:600 16px/1.3 ' + FONTE + ';letter-spacing:normal;text-transform:none;color:inherit}',
        '#aviso-cookies p{margin:0;padding:0;font:inherit;color:inherit}',
        '#aviso-cookies ul{margin:6px 0 0;padding:0 0 0 20px;list-style:disc}',
        '#aviso-cookies li{margin:2px 0;font:inherit;color:inherit}',
        '#aviso-cookies .ac-botoes{display:flex;flex-wrap:wrap;gap:10px}',
        '#aviso-cookies button{margin:0;padding:10px 18px;min-height:44px;border:2px solid #e6c36a;border-radius:8px;font:600 15px/1.2 ' + FONTE + ';letter-spacing:normal;text-transform:none;cursor:pointer}',
        '#aviso-cookies .ac-principal{background:#e6c36a;color:#1b1b1b}',
        '#aviso-cookies .ac-secundario{background:transparent;color:#f3efe6;border-color:rgba(243,239,230,.65)}',
        '#aviso-cookies .ac-principal:hover{background:#f0d283;border-color:#f0d283}',
        '#aviso-cookies .ac-secundario:hover{background:rgba(255,255,255,.1)}',
        '#aviso-cookies button:focus-visible{outline:3px solid #fff;outline-offset:2px}',
        '@media (max-width:560px){#aviso-cookies .ac-botoes{width:100%}#aviso-cookies button{flex:1 1 100%}}'
    ].join('\n');

    // Primeiro nível: Aceitar e Gerenciar preferências. Segundo nível: as categorias, Só os necessários e Aceitar tudo.
    var HTML = [
        '<div class="ac-conteudo">',
        '<div class="ac-texto">',
        '<h2>Cookies</h2>',
        '<p class="ac-nivel1">Usamos o Google Analytics para contar as visitas e saber de que regiões elas vêm. Ele grava cookies de medição de audiência, e só depois da sua permissão. Não usamos cookies de publicidade.</p>',
        '<div class="ac-nivel2" hidden>',
        '<p>Escolha o que permitir:</p>',
        '<ul>',
        '<li><strong>Necessários</strong>, sempre ativos: guardam neste navegador a escolha que você fizer aqui.</li>',
        '<li><strong>Estatísticas</strong>: o Google Analytics conta as visitas e mostra de que regiões elas vêm.</li>',
        '</ul>',
        '</div>',
        '</div>',
        '<div class="ac-botoes ac-nivel1">',
        '<button type="button" class="ac-principal" data-ac="todos">Aceitar</button>',
        '<button type="button" class="ac-secundario" data-ac="gerenciar">Gerenciar preferências</button>',
        '</div>',
        '<div class="ac-botoes ac-nivel2" hidden>',
        '<button type="button" class="ac-principal" data-ac="necessarios">Só os necessários</button>',
        '<button type="button" class="ac-principal" data-ac="todos">Aceitar tudo</button>',
        '</div>',
        '</div>'
    ].join('');

    function mostrarAviso() {
        var estilo = document.createElement('style');
        estilo.textContent = CSS;
        document.head.appendChild(estilo);

        var aviso = document.createElement('div');
        aviso.id = 'aviso-cookies';
        aviso.setAttribute('role', 'region');
        aviso.setAttribute('aria-label', 'Aviso de cookies');
        aviso.innerHTML = HTML;
        document.body.appendChild(aviso);

        function mostrarNivel(nivel) {
            var primeiro = aviso.querySelectorAll('.ac-nivel1');
            var segundo = aviso.querySelectorAll('.ac-nivel2');
            for (var i = 0; i < primeiro.length; i++) primeiro[i].hidden = nivel !== 1;
            for (var j = 0; j < segundo.length; j++) segundo[j].hidden = nivel !== 2;
        }

        function escolher(escolha) {
            gravar(escolha);
            if (escolha === 'todos') carregarAnalytics();
            if (aviso.parentNode) aviso.parentNode.removeChild(aviso);
        }

        aviso.addEventListener('click', function (evento) {
            var alvo = evento.target && evento.target.closest ? evento.target.closest('[data-ac]') : null;
            if (!alvo) return;
            var acao = alvo.getAttribute('data-ac');
            if (acao === 'todos' || acao === 'necessarios') escolher(acao);
            else if (acao === 'gerenciar') {
                mostrarNivel(2);
                aviso.querySelector('[data-ac="necessarios"]').focus();
            }
        });
    }

    var escolhaGuardada = ler();
    if (escolhaGuardada === 'todos') carregarAnalytics();
    if (!escolhaGuardada) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrarAviso);
        else mostrarAviso();
    }
})();
