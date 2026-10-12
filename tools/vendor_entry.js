// Entrada do pacote vendor/damnum-geo.js (interseção de polígonos, leitura de KML/KMZ e shapefile, descompactação dos blocos).
// Gerado por tools/build_vendor.sh; as versões ficam em package.json.
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
import { unzipSync, gunzipSync } from 'fflate';

export {
    area, intersect, bbox, bboxClip, booleanPointInPolygon, pointToLineDistance, polygonToLine, flatten,
    featureCollection, point,
    kml, shp, unzipSync, gunzipSync
};
