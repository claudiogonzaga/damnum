#!/bin/sh
# Gera vendor/damnum-geo.js, o pacote único com as bibliotecas de mapa usadas por
# js/mapa-qcn.js (PMTiles, vector tiles, turf, leitura de KML/KMZ e shapefile).
# Rodar na raiz do repositório depois de `npm install`.
set -e
npx esbuild tools/vendor_entry.js \
    --bundle --minify --format=iife --global-name=DamnumGeoLibs --platform=browser \
    --legal-comments=eof \
    --footer:js="if(typeof module==='object'&&module.exports){module.exports=DamnumGeoLibs;}" \
    --outfile=vendor/damnum-geo.js
ls -l vendor/damnum-geo.js
