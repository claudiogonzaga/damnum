// damnum.consciencia.eco.br → consciencia.eco.br/damnum/, preservando caminho e consulta
// (ex.: /metodologia.pdf, citado em relatórios). O app é servido pelo portal em /damnum/,
// que repassa o projeto Pages "damnum"; este Worker só atende a rota do subdomínio.
export default {
    fetch(request) {
        const url = new URL(request.url);
        return Response.redirect('https://consciencia.eco.br/damnum' + url.pathname + url.search, 301);
    }
};
