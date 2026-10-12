# DAMNUM

Ferramenta de valoração de danos ambientais decorrentes de desmatamento ilegal.

Autoria: Claudio Angelo Correa Gonzaga e José Guilherme Roquette.
Metodologia: Gonzaga et al., Anais do V SICAM/USP (2025), disponível em `metodologia.pdf`.

Site estático, publicado em https://damnum.consciencia.eco.br. Não há etapa de build: o que está no repositório é o que vai ao ar.

## Organização

- `index.html`, `script.js`, `style.css`: a calculadora.
- `js/calculo.js`: correção, juros, custo na data do dano e estoque (sem rede e sem DOM).
- `js/valoracao.js`: monta a valoração a partir da entrada e das séries. Traz também os dois métodos do dano interino e do dano residual (padrão e CAEx/MPMT, este com os custos de Timotheo et al. em `CUSTOS_TIMOTHEO`) e o lucro do ilícito ambiental (LIA), com os parâmetros de referência de Mato Grosso em `LIA_REFERENCIA_MT`.
- `js/relatorio.js`: relatório no formato do art. 524 do CPC e tabela mês a mês (CSV).
- `js/series.js`: consulta às séries (Banco Central, IBGE), com reserva.
- `js/mapa-qcn.js`: estoque pelo mapa do Quarto Inventário, por polígono ou por coordenada, lido de blocos estáticos em `DADOS_BASE_URL`. Desligado por `MAPA_QCN_ATIVO = false` até a publicação dos blocos (roteiro em `MISSAO-publicar-dados-damnum.md`). O polígono e a coordenada não saem do navegador.
- `data/`: tabela de estoques do Quarto Inventário, séries de referência embutidas, a correspondência entre as classes do mapa e a tabela (`crosswalk_c_pret.json`) e os metadados dos blocos gerados (`mapa_v1/`). Os blocos e os arquivos do INPE não são versionados.
- `vendor/damnum-geo.js`: bibliotecas de mapa, geradas por `tools/build_vendor.sh`.
- `tools/preprocessar_blocos.py`: gera os blocos do mapa a partir da pasta "Carbono da Vegetação Pretérita" do INPE (numpy, shapely e rasterio, por `pip`). `tools/servidor_local_dados.js` serve os blocos no Mac; `tools/aceite_mt.py` e `tools/aceite_mt.js` conferem o resultado contra os arquivos originais.
- `docs/fase0_dados.md`: validação dos dados do Inventário e regra do estoque.
- `manual.html`, `js/manual.js`: Manual e Metodologia (inclui o histórico de versões), colaborativo. O texto fica num Google Docs compartilhado como "qualquer pessoa pode comentar"; a página o lê (exportação em HTML), monta o sumário e leva a quem quiser sugerir. Se a leitura falhar, mostra o documento em quadro.

## Testes

```
npm install
npm test
```

Os testes não usam a internet (os do mapa sobem um servidor local com blocos sintéticos). Eles reproduzem o exemplo do Manual de Cálculos da Justiça Federal (CJF, 2026, p. 52) e conferem as médias do Quarto Inventário.

## Séries embutidas

`data/series_referencia.json` guarda a Selic mensal, a taxa legal e o IPCA-15. A calculadora só recorre a esse arquivo quando a fonte oficial não responde, e só se ele cobrir todo o período do cálculo. Convém atualizá-lo todo mês.
