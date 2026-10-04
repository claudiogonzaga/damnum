// Entrada do pacote vendor/damnum-geo.js (bibliotecas de leitura de mapas).
// Gerado por tools/build_vendor.sh; as versões ficam em package.json.
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { area } from '@turf/area';
import { intersect } from '@turf/intersect';
import { bbox } from '@turf/bbox';
import { bboxClip } from '@turf/bbox-clip';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { pointToLineDistance } from '@turf/point-to-line-distance';
import { polygonToLine } from '@turf/polygon-to-line';
import { flatten } from '@turf/flatten';
import { featureCollection, point } from '@turf/helpers';
import { kml } from '@tmcw/togeojson';
import shp from 'shpjs';
import { unzipSync } from 'fflate';

export {
    PMTiles, VectorTile, Pbf,
    area, intersect, bbox, bboxClip, booleanPointInPolygon, pointToLineDistance, polygonToLine, flatten,
    featureCollection, point,
    kml, shp, unzipSync
};
