#!/bin/sh
# Pré-processamento do mapa do Quarto Inventário Nacional por estado (item 1.6-A).
#
# Entrada:  _insumos_v7/shapes_uf/*.shp (arquivos do INPE, sem renomear; não versionados)
# Saída:    data/qcn_estoques.pmtiles      (camada "qcn", só o zoom 14)
#           data/crosswalk_c_pret.json     (c_pret do mapa × tabela por fitofisionomia)
#           _insumos_v7/relatorio_preprocessamento.txt
#
# Exige GDAL (ogr2ogr, ogrinfo) e tippecanoe 2.17 ou mais novo (saída PMTiles):
#   brew install gdal tippecanoe
#
# ATENÇÃO: este roteiro ainda não foi executado com dados reais, porque os
# arquivos do INPE não estavam disponíveis em 04/10/2026. Confira os nomes dos
# campos na primeira execução (o roteiro para se algum faltar).
set -eu

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ENTRADA="$RAIZ/_insumos_v7/shapes_uf"
TRABALHO="$RAIZ/_insumos_v7/trabalho_qcn"
RELATORIO="$RAIZ/_insumos_v7/relatorio_preprocessamento.txt"
SAIDA="$RAIZ/data/qcn_estoques.pmtiles"
CAMPOS="id,bioma,uf,mun_geocod,mun_nome,c_pret,cagrpret,c_agb,c_bgb,c_dw,c_litter,c_v_4i"
ZOOM=14

command -v ogr2ogr >/dev/null || { echo "Falta o GDAL (ogr2ogr)."; exit 1; }
command -v tippecanoe >/dev/null || { echo "Falta o tippecanoe."; exit 1; }
ls "$ENTRADA"/*.shp >/dev/null 2>&1 || { echo "Nenhum .shp em $ENTRADA."; exit 1; }

mkdir -p "$TRABALHO"
rm -f "$TRABALHO"/*.geojsonl "$TRABALHO"/atributos.csv
: > "$RELATORIO"
echo "Pré-processamento do QCN por UF — $(date '+%d/%m/%Y %H:%M')" >> "$RELATORIO"
echo "GDAL: $(ogr2ogr --version)" >> "$RELATORIO"
echo "tippecanoe: $(tippecanoe --version 2>&1)" >> "$RELATORIO"

for SHP in "$ENTRADA"/*.shp; do
    NOME="$(basename "$SHP" .shp)"
    echo "== $NOME" | tee -a "$RELATORIO"

    # Confere se todos os campos esperados existem (nomes conforme o Manual de
    # dados espaciais por UF, MCTI/SIRENE).
    ESQUEMA="$(ogrinfo -so -al "$SHP")"
    for CAMPO in $(echo "$CAMPOS" | tr ',' ' '); do
        echo "$ESQUEMA" | grep -qi "^$CAMPO:" || { echo "Campo ausente em $NOME: $CAMPO" | tee -a "$RELATORIO"; exit 1; }
    done

    TOTAL="$(ogrinfo -so -al "$SHP" | sed -n 's/^Feature Count: //p')"
    INVALIDAS="$(ogrinfo -q -dialect sqlite -sql "SELECT COUNT(*) AS n FROM \"$NOME\" WHERE NOT ST_IsValid(geometry)" "$SHP" | sed -n 's/.*n (Integer) = //p')"
    echo "feições: $TOTAL; geometrias inválidas corrigidas: ${INVALIDAS:-não apurado}" | tee -a "$RELATORIO"

    # Passos 1 a 4: só os campos necessários, EPSG:4326, sem dissolver, geometrias corrigidas.
    ogr2ogr -f GeoJSONSeq "$TRABALHO/$NOME.geojsonl" "$SHP" \
        -select "$CAMPOS" -t_srs EPSG:4326 -makevalid -nlt PROMOTE_TO_MULTI \
        -lco RS=NO -lco COORDINATE_PRECISION=7

    # Atributos sem geometria, para o crosswalk e para a conferência de c_v_4i.
    ogr2ogr -f CSV /vsistdout/ "$SHP" -select "$CAMPOS" | \
        { if [ -s "$TRABALHO/atributos.csv" ]; then tail -n +2; else cat; fi; } >> "$TRABALHO/atributos.csv"

    echo "arquivo de origem: $(basename "$SHP"), modificado em $(date -r "$SHP" '+%d/%m/%Y')" >> "$RELATORIO"
done

# Passo 5: um único PMTiles, só no zoom 14 (cerca de 0,6 m por unidade de grade),
# sem simplificação, sem descarte de feições e sem limite de tamanho por tile.
tippecanoe --force -o "$SAIDA" -l qcn \
    --minimum-zoom=$ZOOM --maximum-zoom=$ZOOM --full-detail=12 \
    --no-feature-limit --no-tile-size-limit \
    --no-line-simplification --no-tiny-polygon-reduction \
    --buffer=8 --read-parallel \
    --name="QCN por UF" \
    --description="Quarto Inventário Nacional, dados espaciais por UF (MCTI/INPE); gerado em $(date '+%d/%m/%Y')" \
    "$TRABALHO"/*.geojsonl
echo "tippecanoe: -l qcn -Z$ZOOM -z$ZOOM --full-detail=12 --no-feature-limit --no-tile-size-limit --no-line-simplification --no-tiny-polygon-reduction --buffer=8" >> "$RELATORIO"

TAMANHO="$(wc -c < "$SAIDA")"
echo "PMTiles: $SAIDA, $TAMANHO bytes" | tee -a "$RELATORIO"
# Cloudflare Pages: 25 MiB por arquivo (https://developers.cloudflare.com/pages/platform/limits/).
if [ "$TAMANHO" -gt 26214400 ]; then
    echo "AVISO: o arquivo passa do limite de 25 MiB por arquivo do Cloudflare Pages. Não simplifique a geometria; as opções são dividir o arquivo por região ou hospedá-lo em armazenamento de objetos com HTTP range (ex.: Cloudflare R2). A decisão é dos autores." | tee -a "$RELATORIO"
fi

# Passo 6: crosswalk e conferências.
python3 "$RAIZ/tools/crosswalk_c_pret.py" "$TRABALHO/atributos.csv" \
    "$RAIZ/data/estoques_qcn_fitofisionomias.json" "$RAIZ/data/crosswalk_c_pret.json" >> "$RELATORIO"

echo "Relatório em $RELATORIO. Depois de conferir, ligue MAPA_QCN_ATIVO em js/mapa-qcn.js."
