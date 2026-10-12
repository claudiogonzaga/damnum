# Fase 0 — validação dos dados do Quarto Inventário (DAMNUM 7.1)

Data das consultas: 11/10/2026. Servidor: `https://dataserver-coids.inpe.br/ccst/p4cn/4%20Inventario-CN/` (no ar, sem cadastro). Os arquivos baixados ficaram fora do repositório (`_insumos_v7/` e o disco externo `DRIVE_EXTERNO_MAC`, porque o disco interno tinha 11 GB livres).

Conclusão em uma linha: o estoque de carbono da vegetação original (D) vem do campo `ctotal4inv` da pasta "Carbono da Vegetação Pretérita", e não de `c_v_4i` dos arquivos por estado. Na Amazônia ele só existe por inteiro no arquivo raster; no Cerrado e no Pantanal, no vetor.

## a) Significado dos campos

Fontes: `Manual_dados_espaciais_UF.pdf` (MCTI/SIRENE) e `Metadado vegetação pretérita.xlsx` (pasta da vegetação pretérita).

| Campo | Onde | Significado na fonte |
|---|---|---|
| `c_pret` | Shapes_UF | vegetação pretérita (sigla da fitofisionomia) |
| `cagrpret` | Shapes_UF | classe de vegetação pretérita agrupada (F, G, OFL, sem A) |
| `c_agb`, `c_bgb`, `c_dw`, `c_litter` | Shapes_UF | carbono da biomassa viva acima do solo, abaixo do solo, da madeira morta e da serapilheira (tC/ha) |
| `c_v_4i` | Shapes_UF | estoque de carbono total da vegetação (tC/ha) |
| `cagr_1994` … `cagr_2016` | Shapes_UF | classe de uso da terra no ano, agrupada conforme a legenda das matrizes. `cagr_2016` dá o uso em 2016 |
| `c_pretorig` | pretérita | fitofisionomia original (contém a classe água) |
| `c_pretvizi` | pretérita | fitofisionomia preenchida com a vizinha (sem a classe água) |
| `categorig`, `categvizi` | pretérita | categoria da vegetação: F = floresta; OFL = outras formações lenhosas; G = gramínea |
| `cagb`, `cbgb`, `cdw`, `clitter` | pretérita | os quatro compartimentos (tC/ha) |
| `ctotal4inv` | pretérita | carbono total da vegetação acima e abaixo do solo (tC/ha); o carbono do solo está em outro mapa |
| `tipo` | pretérita, só Amazônia | "Natural": valores vindos diretamente do mapa CCST/EBA; "Antropizada": mediana, por fitofisionomia, dos valores do mapa CCST/EBA em áreas naturais |

O `.dbf` de MT Amazônia tem 118 colunas: id, bioma, uf, mun_geocod, mun_nome, cagr_s, cagr_v, c_solo, c_pret, c_litter, c_dw, c_agb, c_bgb, c_v_4i, cagrpret, cagr_1994, cagr_2002, cagr_2005, cagr_2010, cagr_2016, uc_ti, ano_ucti, avref94, avref02, avref05, avref10, incref02, incref05, incref10, incref16, avagr94, avagr02, avagr05, avagr10, incrag02, incrag05, incrag10, incrper16, incrsem16, avsec, remf, remg, remofl, remfsec1 a remfsec4, remgsec, remoflsec, fc1994, fc2002, fc2005, fc2010, fc2016, avap, avapd, area_ha, pgsolo9402, pgsolo0205, pgsolo0510, pgsolo1016, cn_veg, cn_rpa, n_min (4 períodos), n2odir (4), pcveg (4), gcveg (4), es/e/r/el (4 períodos cada), fcsagb (4), fcscdw (4), csagb e cscdw (4 períodos cada), cposcs_02, _05, _10, _16, parte, layer, path. Os de Cerrado e Pantanal têm 82 e 79 colunas (sem o ano de 2005).

Sobre a pastagem com `c_v_4i` = 131,98 e `c_pret` = As: o valor é o da vegetação original convertida. Na Amazônia, todo polígono já convertido da mesma fitofisionomia tem o mesmo valor (ver item b), que é a mediana descrita no metadado para o tipo "Antropizada".

## b) Onde `c_v_4i` é zero

Amostra por faixa de bytes, sem baixar os `.dbf`: 60 blocos de 100 registros, espalhados do início ao fim de cada arquivo (6.000 registros por arquivo, 30.000 no total). Script: `tools/fase0_amostrar_dbf.py`.

| Arquivo (registros) | `c_v_4i` = 0 | Por uso em 2016 (`cagr_2016`) |
|---|---|---|
| MT Amazônia 1 (414.494) | 22,4% | FNM 835 de 836; FM 235 de 235; A 271 de 271; OFLNM 5 de 5. Ap, Ac e FSec: nenhum zero |
| MT Amazônia 2 (799.788) | 10,1% | FNM 471 de 472; FM 32 de 32; A 81 de 81; OFLNM 20 de 21. Ap, Ac, FSec, CANA: nenhum zero |
| MT Amazônia 3 (894.212) | 13,6% | FNM 378 de 381; FM 261 de 261; A 168 de 169; OFLM 6 de 6; OFLNM 2 de 2. Ap, Ac, FSec: nenhum zero |
| MT Cerrado (722.172) | 0% | nenhum zero em nenhuma classe |
| MT Pantanal (76.142) | 0% | nenhum zero em nenhuma classe |

Leitura:

* Na Amazônia, `c_v_4i` vem zerado em praticamente toda a vegetação nativa ainda em pé em 2016 (FNM, FM, OFLNM, OFLM). É o que o Manual avisa: "os valores de carbono dos polígonos de vegetação preservada até 2016 não são apresentados nos arquivos shapefile". Onde não é zero (áreas já convertidas), há um único valor por fitofisionomia: As 131,98; Ds 201,12; Da 130,71; Aa 145,29; Fs 88,86; ON 58,39; SN 57,63; SO 131,23; Sd 149,86; Sa 173,05.
* No Cerrado e no Pantanal, `c_v_4i` está preenchido em todas as classes. No Cerrado o valor varia de polígono a polígono (Sa: 176 valores distintos na amostra, de 31,0 a 48,5 tC/ha); no Pantanal há um valor por fitofisionomia.
* Em 150 polígonos sorteados de MT Cerrado, `c_v_4i` foi igual ao `ctotal4inv` do vetor da vegetação pretérita no mesmo ponto em todos os 150. As duas fontes dão o mesmo número no Cerrado.

## c) Pasta de vegetação pretérita

Todos os seis biomas têm arquivo.

| Bioma | Arquivos | Observado |
|---|---|---|
| Amazônia | ZIP de GeoPackage (2,9 GB), ZIP de shapefile (752 MB; 3,1 GB aberto, 23 partes, 102.098 registros), TIFF (506 MB) e LEIA-ME | baixados o shapefile e o TIFF |
| Cerrado | RAR de 58 MB: shapefile de 7.890 registros | baixado |
| Pantanal | RAR de 8,8 MB: shapefile de 37 registros | baixado |
| Caatinga, Mata Atlântica, Pampa | RAR de 33 MB, 104 MB e 16 MB | não baixados |

Sistema de coordenadas de todos: SIRGAS 2000 geográfico (EPSG:4674). O DAMNUM trata SIRGAS 2000 e WGS 84 como equivalentes (diferença inferior a 1 m).

TIFF da Amazônia: uma banda, `float32`, 13.799 × 9.605 pixels de 0,002245° (cerca de 250 m), valor de "sem dado" −9999, sem compressão interna. O LEIA-ME diz: "estoque de carbono total de vegetação, acima e abaixo do solo, em tC/ha". Na caixa de Mato Grosso: 35,6% dos pixels sem dado (fora do bioma), 0,46% dos válidos com valor zero, valores de 0,58 a 628,11 tC/ha, média de 103,26 tC/ha.

Vetor da Amazônia: nos registros de tipo "Natural" os cinco campos de carbono vêm em branco (asteriscos no `.dbf`); só os de tipo "Antropizada" trazem número. Nas cinco partes que tocam Mato Grosso (13, 14, 15, 19 e 20; 36.509 registros), 21.250 registros naturais estão em branco. O valor das áreas naturais só existe no raster.

`ctotal4inv` = `cagb` + `cbgb` + `cdw` + `clitter`?

* Pantanal: confere em 35 de 37 registros.
* Cerrado: confere em 1.634 de 7.890. Em 6.041 o total é menor que a soma (diferença mediana de 1,66 tC/ha) e em 215 é maior. O mesmo se vê em Shapes_UF. **Pendência**: a fonte não explica a diferença. O DAMNUM usa o total (`ctotal4inv`), que é o campo que a fonte define como estoque total, e não a soma.

Zeros no vetor do Cerrado (13 registros): afloramento rochoso e dunas (categorias AR e DUN) e nove polígonos de classe florestal (SNs, SMm, ONs, SOs, TNts). Estes últimos são "sem dado".

## d) Ponto de teste −55,5 / −12,5 (Vera, MT)

| Fonte | Resultado |
|---|---|
| Shapes_UF, MT Amazônia 3 | registro 821.930, id 62832, município Vera, `c_pret` = Fs, `cagrpret` = F, floresta não manejada de 1994 a 2016 (FNM), `c_v_4i` = 0 e os quatro compartimentos = 0 |
| Pretérita, vetor (parte 20) | `c_pretvizi` = Fs, categoria F, tipo Natural, campos de carbono em branco |
| Pretérita, TIFF | 58,39 tC/ha no pixel que contém o ponto (linha 7915, coluna 8237); vizinhos de 22,7 a 74,5 tC/ha |
| Pretérita, vetor do Cerrado | o ponto não está no Cerrado |

O ponto confirma os itens b e c: floresta em pé, zero em `c_v_4i`, em branco no vetor e valor só no raster.

## e) Regra de D

D é o `ctotal4inv` da vegetação pretérita, que é o carbono da vegetação antes da conversão, como pedem o Protocolo do CNJ e a CCAL.

| Bioma | Fonte de D | Formato dos blocos |
|---|---|---|
| Amazônia | `CarbonoVeg_Amazonia_total_tiff_4inventario.tif`, pixel a pixel | raster, na resolução nativa (0,002245°) |
| Cerrado | `cerrado_carbono_vegetacao_preterita.shp`, campo `ctotal4inv` | vetor |
| Pantanal | `pantanal_carbono_vegetacao_preterita.shp`, campo `ctotal4inv` | vetor |

Regras fixas no código:

* Valor zero, "sem dado" (−9999) ou em branco é "sem dado", nunca estoque zero. A parte do polígono nessa situação recebe a reserva (tabela por fitofisionomia ou média do bioma) e o relatório diz isso.
* `c_v_4i` não é usado.
* Na faixa em que o raster da Amazônia se sobrepõe ao vetor do Cerrado ou do Pantanal (os pixels de 250 m passam do limite do bioma), vale o vetor, e a área do pixel já coberta por ele é descontada. No polígono de teste da transição, 1,1% dos pontos estavam nas duas fontes.
* A classe mostrada no relatório é `c_pretvizi`. Na Amazônia ela vem do vetor, convertido para a grade do raster; serve para descrever, não para calcular D.

## f) Formato dos blocos

* Amazônia: raster. É o dado original, e a média dos pixels ponderada pela área de cada pixel dentro do polígono reproduz uma estatística zonal sobre o arquivo do INPE. Como o pixel tem cerca de 6 ha, o cliente calcula a fração de cada pixel coberta pelo polígono, em vez de testar só o centro.
* Cerrado e Pantanal: vetor, porque não há raster e a interseção exata dispensa aproximação.

## Divergências em relação ao prompt da v7.1

1. O prompt previa baixar os `.dbf` e `.shp` de MT em Shapes_UF (cerca de 13 GB). Não foi preciso: a pasta da vegetação pretérita dá D para os três biomas de MT com 1,4 GB. De Shapes_UF baixei só os `.shp` e `.shx` de MT Amazônia 3 e de MT Cerrado, para o ponto de teste e para a comparação do item b.
2. Baixei dois arquivos não listados na autorização: a vegetação pretérita do Pantanal (8,8 MB), sem a qual o Pantanal de MT ficaria sem dado, e a malha municipal do Inventário (`Municipios_4inventario.rar`, 88 MB), para a tabela por município. São arquivos públicos da mesma pasta.
3. Os blocos vetoriais não trazem `uf`, `mun_geocod`, `mun_nome` nem `c_v_4i`, que são campos de Shapes_UF. Trazem os campos da vegetação pretérita.

## Pendências

* Diferença entre `ctotal4inv` e a soma dos compartimentos no Cerrado (item c).
* Licença: os arquivos não trazem licença nomeada. Registro: "dados públicos do INPE/MCTI, acesso sem cadastro em 11/10/2026, sem licença nomeada nas fontes; citar a fonte".
* Demais estados: não baixados. A pretérita é por bioma, então o mesmo roteiro serve aos outros estados da Amazônia, do Cerrado e do Pantanal sem novo download; Caatinga, Mata Atlântica e Pampa somam 153 MB compactados.
