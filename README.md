# DAMNUM

Ferramenta de valoração de danos ambientais decorrentes de desmatamento ilegal.

Autoria: Claudio Angelo Correa Gonzaga e José Guilherme Roquette.
Metodologia: Gonzaga et al., Anais do V SICAM/USP (2025), disponível em `metodologia.pdf`.

Site estático, publicado em https://damnum.consciencia.eco.br. Não há etapa de build: o que está no repositório é o que vai ao ar.

## Organização

- `index.html`, `script.js`, `style.css`: a calculadora.
- `js/calculo.js`: correção, juros, custo na data do dano e estoque (sem rede e sem DOM).
- `js/valoracao.js`: monta a valoração a partir da entrada e das séries.
- `js/relatorio.js`: relatório no formato do art. 524 do CPC e tabela mês a mês (CSV).
- `js/series.js`: consulta às séries (Banco Central, IBGE), com reserva.
- `js/mapa-qcn.js`: estoque pelo mapa do Quarto Inventário por estado. Desligado por `MAPA_QCN_ATIVO = false` até existir `data/qcn_estoques.pmtiles`.
- `data/`: tabela de estoques do Quarto Inventário e séries de referência embutidas.
- `vendor/damnum-geo.js`: bibliotecas de mapa, geradas por `tools/build_vendor.sh`.
- `tools/preprocessar_qcn.sh`: gera o PMTiles a partir dos arquivos por estado do INPE (exige GDAL e tippecanoe).
- `changelog.html`: versões e pendências.

## Testes

```
npm install
npm test
```

Os testes não usam rede. Eles reproduzem o exemplo do Manual de Cálculos da Justiça Federal (CJF, 2026, p. 52) e conferem as médias do Quarto Inventário.

## Séries embutidas

`data/series_referencia.json` guarda a Selic mensal, a taxa legal e o IPCA-15. A calculadora só recorre a esse arquivo quando a fonte oficial não responde, e só se ele cobrir todo o período do cálculo. Convém atualizá-lo todo mês.
