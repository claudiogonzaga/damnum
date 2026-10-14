# Missão: publicar os dados do mapa do Quarto Inventário (DAMNUM 7.1)

**Executada em 13/10/2026, com o "GO" dos autores.** Os blocos da Amazônia Legal (1.862 blocos, 100 MB; maior bloco: 362 KB) estão em `https://damnum-dados.pages.dev/v1/`, projeto `damnum-dados` do Cloudflare Pages, na conta que hospeda o DAMNUM. A cópia de origem está no Google Drive, em `_CIÊNCIA/ENVIRONMENTAL SCIENCES/ENV_TECH/DAMNUM Dados/`. O site está com `MAPA_QCN_ATIVO = true`.

O roteiro abaixo fica como registro e serve para publicar uma nova versão dos dados (por exemplo, outros estados): nova versão, nova pasta (`v2`), sem alterar a `v1`.

Tempos medidos em 13/10/2026, a partir do Mac dos autores: bloco vetorial pequeno, 0,19 s; bloco raster típico (96 KB), 0,26 s; maior bloco (362 KB), 0,69 s na primeira leitura e 0,33 s na segunda.

Comandos usados:

```bash
python3 tools/preprocessar_blocos.py --uf AMAZONIA_LEGAL --versao v1 --amazonia <pasta> --cerrado <shp> --pantanal <shp> --municipios <pasta> --saida <saida> --data-download 2026-10-11
npx wrangler pages project create damnum-dados --production-branch main --force
npx wrangler pages deploy <pasta com v1/, _headers, index.html e 404.html> --project-name damnum-dados --branch main
node tools/aceite_mt.js https://damnum-dados.pages.dev tools/aceite_mt_casos.json <esperado.json>
```

## 1. Conferir os blocos

```bash
node tools/aceite_mt.js _insumos_v7/blocos tools/aceite_mt_casos.json _insumos_v7/fase0/aceite_esperado.json
```

Deve terminar com "Todos os casos dentro da tolerância." O primeiro argumento também pode ser o endereço publicado.

## 2. Copiar a origem para o Google Drive

Pasta `DAMNUM Dados/v1/`, na mesma conta da pasta "DAMNUM WebAPP - Aplicativo" (confirmar a conta; não adivinhar). Copiar a pasta `_insumos_v7/blocos/v1/` inteira e os scripts `tools/preprocessar_blocos.py`, `tools/shp_leitor.py` e `tools/crosswalk_c_pret.py`. Essa cópia não é lida pelo site: serve de origem e de backup.

## 3. Criar o projeto de dados no Cloudflare Pages

1. Usar só a conta da Cloudflare que já hospeda o DAMNUM. Não mexer em DNS, nameservers nem segurança.
2. Criar um projeto novo do Pages (sugestão de nome: `damnum-dados`), por envio direto, sem ligar a repositório git.
3. Montar a pasta a enviar: o conteúdo de `_insumos_v7/blocos/` (a pasta `v1` inteira) mais o arquivo `tools/_headers_dados`, renomeado para `_headers`, na raiz.
4. Enviar pelo painel ou por `npx wrangler pages deploy <pasta> --project-name damnum-dados`.

Limites conferidos na documentação da Cloudflare em 11/10/2026 (plano gratuito do Pages): 20.000 arquivos por site, 25 MiB por arquivo, 100 regras no `_headers`. Os blocos de MT ficam muito abaixo disso. Se o Pages não servir, a alternativa é o R2 com domínio público e a mesma estrutura; se o R2 pedir cartão, parar e pedir decisão.

## 4. Conferir a publicação numa janela anônima do Chrome

* `<endereço>/v1/versao.json` responde com `"versao": "v1"`.
* `<endereço>/v1/blocos/amr_124_77.gz` baixa um arquivo de cerca de 170 KB.
* Nos dois, o cabeçalho `Access-Control-Allow-Origin` é `https://damnum.consciencia.eco.br`. O bloco tem `Cache-Control: public, max-age=31536000, immutable` e não tem `Content-Encoding` (o gzip é o próprio arquivo; o site confere o SHA-256 dos bytes recebidos).
* Uma chave inexistente responde 404.

Medir e anotar o tempo de download de um bloco típico e do maior (`amr_121_81`), com cache frio e quente.

## 5. Ligar o mapa no site

Em `js/mapa-qcn.js`:

```js
var MAPA_QCN_ATIVO = true;
var DADOS_BASE_URL = 'https://<endereço do projeto de dados>';
```

`DADOS_BASE_URL` não é o endereço do contador de valorações e não pode ser confundido com ele.

Testar em `localhost` antes do push: o `_headers` só libera o domínio de produção, então, para o teste local, usar o servidor local (`node tools/servidor_local_dados.js _insumos_v7/blocos 8773 http://localhost:8771`) e, no console do navegador, `DamnumMapa.configurar({ativo: true, baseUrl: 'http://127.0.0.1:8773'}); iniciarMapa();`.

## 6. Aceite depois de publicado

1. Com o polígono de teste (transição Amazônia/Cerrado, em `tools/aceite_mt_casos.json`), o site deve mostrar 71,87 tC/ha.
2. Na coordenada −12,5 / −55,5, 58,39 tC/ha, classe Fs, com o aviso de valor aproximado.
3. Repetir os cinco polígonos dos autores (KML) contra um cálculo no QGIS sobre os arquivos originais, com tolerância de 0,5%.

## 7. Atualizar o Manual (Google Docs)

Trocar, na seção 7, o parágrafo "Está em preparo a consulta ao mapa do Quarto Inventário Nacional por estado..." por:

> O estoque de carbono é obtido do mapa do Quarto Inventário para o polígono da área do dano (média ponderada pela área) ou, na falta dele, para a coordenada informada, com aviso de aproximação. A fonte é a pasta "Carbono da Vegetação Pretérita" do Inventário (INPE/MCTI), campo ctotal4inv: na Amazônia, o arquivo raster, com pixels de cerca de 250 m; no Cerrado e no Pantanal, o arquivo vetorial. O campo c_v_4i dos arquivos por estado não é usado, porque vem zerado na vegetação da Amazônia ainda em pé em 2016. Valor zero ou em branco é tratado como "sem dado": a parte do polígono nessa situação recebe a tabela por fitofisionomia ou a média do bioma. Os dados são públicos, foram obtidos sem cadastro em 11/10/2026 e não trazem licença nomeada; cita-se a fonte. O polígono e a coordenada ficam no navegador; o site só baixa os blocos do mapa que cobrem a área. Por ora o mapa cobre Mato Grosso.

Tirar também o parágrafo sobre a consulta ao mapa de vegetação do IBGE, que saiu do código, e acrescentar a versão 7.1 à seção de versões.

## Plano B, se o servidor do INPE sair do ar

Pedido de acesso à informação pelo Fala.BR, dirigido ao MCTI, pelos arquivos da pasta "4 Inventario-CN". Não protocolar sem decisão dos autores.
