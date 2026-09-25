// Places the NDVI preview artifact on the map from its contract-recorded `bounds`/`crs` (DP-4
// P1(b)) without a general-purpose reprojection dependency (only one new runtime dependency, the
// GeoTIFF decoder, is authorized). The freeze's analysis grid (B3) is always a WGS84 UTM zone
// (`EPSG:326xx` north / `EPSG:327xx` south), so a closed-form inverse UTM projection is sufficient
// and exact to a few metres. Any other CRS is reported as unsupported rather than guessed.

export type LonLat = {lon: number; lat: number};

const WGS84_SEMI_MAJOR_AXIS_M = 6378137.0;
const WGS84_FLATTENING = 1 / 298.257223563;
const UTM_SCALE_FACTOR = 0.9996;

export function utmToWgs84(easting: number, northing: number, crs: string): LonLat | null {
  const zone = parseUtmEpsg(crs);
  if (!zone) {
    return null;
  }
  return inverseUtm(easting, northing, zone.zone, zone.northern);
}

function parseUtmEpsg(crs: string): {zone: number; northern: boolean} | null {
  const match = /^EPSG:(\d{5})$/i.exec(crs.trim());
  if (!match?.[1]) {
    return null;
  }
  const code = Number(match[1]);
  if (code >= 32601 && code <= 32660) {
    return {zone: code - 32600, northern: true};
  }
  if (code >= 32701 && code <= 32760) {
    return {zone: code - 32700, northern: false};
  }
  return null;
}

// Standard closed-form inverse UTM projection (Snyder, "Map Projections: A Working Manual", 1987,
// the same series expansion used by most public UTM implementations) against the WGS84 ellipsoid.
function inverseUtm(easting: number, northing: number, zone: number, northern: boolean): LonLat {
  const a = WGS84_SEMI_MAJOR_AXIS_M;
  const f = WGS84_FLATTENING;
  const k0 = UTM_SCALE_FACTOR;
  const e = Math.sqrt(f * (2 - f));
  const eSquared = e * e;
  const e1Squared = eSquared / (1 - eSquared);
  const x = easting - 500000;
  const y = northern ? northing : northing - 10000000;

  const m = y / k0;
  const mu = m / (a * (1 - eSquared / 4 - (3 * eSquared ** 2) / 64 - (5 * eSquared ** 3) / 256));

  const e1 = (1 - Math.sqrt(1 - eSquared)) / (1 + Math.sqrt(1 - eSquared));
  const footprintLatitude =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const c1 = e1Squared * Math.cos(footprintLatitude) ** 2;
  const t1 = Math.tan(footprintLatitude) ** 2;
  const r1 = (a * (1 - eSquared)) / Math.pow(1 - eSquared * Math.sin(footprintLatitude) ** 2, 1.5);
  const n1 = a / Math.sqrt(1 - eSquared * Math.sin(footprintLatitude) ** 2);
  const d = x / (n1 * k0);

  const latitudeRad =
    footprintLatitude -
    ((n1 * Math.tan(footprintLatitude)) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * e1Squared) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * e1Squared - 3 * c1 * c1) * d ** 6) / 720);

  const centralMeridianRad = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
  const longitudeRad =
    centralMeridianRad +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * e1Squared + 24 * t1 * t1) * d ** 5) / 120) /
      Math.cos(footprintLatitude);

  return {lat: (latitudeRad * 180) / Math.PI, lon: (longitudeRad * 180) / Math.PI};
}
