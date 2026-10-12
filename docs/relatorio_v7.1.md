# DAMNUM 7.1 — relatório de entrega (11/10/2026)

Ramo `v7`, commits locais, sem push. Nada foi publicado: nem o site, nem os blocos no Drive ou na Cloudflare. O mapa está desligado (`MAPA_QCN_ATIVO = false`), e a versão no ar continua a 7.0.

Escopo: prompt da versão 7.1 (dados do Inventário em blocos estáticos) com o adendo "Estoque de carbono pelo polígono no dano climático". A tarefa agendada da 7.1, de 07/10, tinha sido aberta sem executar nada; as fases 0 a 3 foram feitas agora.

## Decisões da Fase 0 (detalhe em `docs/fase0_dados.md`)

* D é o campo `ctotal4inv` da pasta "Carbono da Vegetação Pretérita". `c_v_4i` não é usado: na Amazônia de MT vem zerado em toda a vegetação nativa em pé em 2016 (30.000 registros amostrados).
* Amazônia: blocos raster, do TIFF do INPE (pixels de 0,002245°, cerca de 250 m), porque o vetor traz as áreas naturais em branco. Cerrado e Pantanal: blocos vetoriais.
* Zero, "sem dado" e em branco são "sem dado"; a parte do polígono nessa situação recebe a reserva.
* Na sobreposição entre o raster da Amazônia e o vetor de outro bioma, vale o vetor.

## Blocos de Mato Grosso

| | Blocos | Tamanho | Célula | Maior bloco |
|---|---|---|---|---|
| Amazônia (raster) | 74 | 11,4 MB | 1° | 309 KB (`amr_121_81`) |
| Cerrado (vetor) | 608 | 5,4 MB | 0,25° | 54 KB |
| Pantanal (vetor) | 121 | 1,9 MB | 0,25° | 100 KB |
| Total | 803 | 18,7 MB | | |

Geração: 1 minuto no Mac. Geometrias inválidas corrigidas: 270 anéis no Cerrado e 232 no Pantanal. Tabela por município e classe: 1.339 linhas, 141 municípios (79 KB).

Correspondência das classes com a tabela por fitofisionomia (`data/crosswalk_c_pret.json`): 68 classes; 7 do Cerrado sem linha na tabela (ONs, ONts, SNm, SNs, SNts, SOs, SOts); 34 com diferença acima de 0,5 tC/ha entre a média do mapa e o total da tabela, o que é esperado na Amazônia, onde o mapa varia pixel a pixel.

## Aceite com dados reais (`docs/aceite_mt_v7.1.md`)

Cinco polígonos e cinco coordenadas em MT, escolhidos por mim, porque os KML dos autores não foram fornecidos. O cálculo independente não usou QGIS: foi uma estatística zonal por grade de 500 × 500 pontos sobre os arquivos originais do INPE (`tools/aceite_mt.py`). Diferença máxima em D: 0,016% (tolerância: 0,5%). As cinco coordenadas devolvem o valor e a classe do dado original. O ponto −55,5 / −12,5 devolve 58,39 tC/ha, como na Fase 0.

## O que mudou no código

* `js/mapa-qcn.js`: reescrito. `criarFonteBlocos` (versão, índice, blocos, SHA-256, cache no navegador), `consultarPoligono` (vetor e raster, com fração de pixel), `consultarPonto`, `verificarDisponibilidade`, `configurar`. Sai a leitura de PMTiles.
* `js/valoracao.js`: `resolverEstoque` (ordem: usuário; mapa por polígono ou coordenada; município e fitofisionomia; fitofisionomia; média do bioma), `estoqueDoMapa`, `estoqueDoMunicipio`.
* `js/relatorio.js`: `blocoMapa` (tipo de entrada, área do polígono, classes cruzadas com área e D, D final, campo, fonte, versão dos dados, blocos usados, aviso da coordenada, motivo quando o mapa não é usado).
* `script.js` e `index.html`: `iniciarMapa`, seção de localização (polígono preferencial, coordenada na falta dele), seletor de município, nota sobre a Floresta Estacional Sempre-Verde. Sai a consulta ao IBGE (`js/ibge-vegetacao.js` removido).
* `tools/`: `preprocessar_blocos.py`, `shp_leitor.py`, `fase0_amostrar_dbf.py`, `crosswalk_c_pret.py`, `servidor_local_dados.js`, `aceite_mt.py`, `aceite_mt.js`, `_headers_dados`. Sai `preprocessar_qcn.sh`.
* `vendor/damnum-geo.js`: regenerado sem PMTiles (217 KB).

## Testes

80 testes, todos passando (`npm test`). Novos: `tests/mapa.test.js` (13), `tests/mapa_servidor.test.js` (7) e `tests/estoque_entrada.test.js` (7), com blocos sintéticos de valores fictícios. Cobrem os cinco testes do adendo, o contrato dos arquivos contra o servidor local, a interceptação de `fetch` para privacidade e a queda do servidor no meio do cálculo.

Verificação no navegador, contra o servidor local de blocos: polígono da transição Amazônia/Cerrado, 71,87 tC/ha em 0,25 s; coordenada de teste, 58,39 tC/ha com o aviso; servidor derrubado, reserva aplicada e avisada na tela e no relatório.

## Limites e tempos

* Cloudflare Pages, plano gratuito (documentação consultada em 11/10/2026): 20.000 arquivos por site, 25 MiB por arquivo, 100 regras no `_headers`. Os blocos de MT cabem com folga.
* Tempo de download: só medido em rede local (poucos milissegundos por bloco). A medição com cache frio e quente na Cloudflare fica para depois do GO.
* Demais estados: a fonte é por bioma e já está baixada para Amazônia, Cerrado e Pantanal. Pela proporção de área, o Brasil inteiro ficaria na ordem de 150 a 200 MB e de 7 a 8 mil blocos; é estimativa, não medição. Faltam os arquivos da Caatinga, da Mata Atlântica e do Pampa (153 MB compactados).

## Divergências em relação aos prompts

1. Fonte: vegetação pretérita em vez de Shapes_UF; por isso os blocos não trazem município nem `c_v_4i` (ver `docs/fase0_dados.md`).
2. Downloads fora da lista autorizada: vegetação pretérita do Pantanal (8,8 MB) e malha municipal do Inventário (88 MB).
3. `metodologia.html` e `changelog.html` não existem mais; o texto equivalente é o Manual no Google Docs, que alimenta o site no ar. Não foi alterado, porque descreveria um recurso ainda desligado; o texto novo está pronto no item 7 de `MISSAO-publicar-dados-damnum.md`.
4. Os blocos são JSON compactado com gzip (inteiros de 16 bits no raster), e não um binário próprio.
5. GDAL e tippecanoe não foram instalados; o roteiro usa shapely e rasterio, por `pip`.

## Pendências

* Diferença entre `ctotal4inv` e a soma dos compartimentos em 77% dos polígonos do Cerrado, sem explicação na fonte.
* Aceite com os cinco KML dos autores e com QGIS.
* Fase 4 (tabelas pequenas em planilha do Drive): não implementada.
* Comparação com a ferramenta da CCAL: depende de acesso dos autores.
* Cópia para o Drive, publicação na Cloudflare e medição dos tempos: depois do GO.
