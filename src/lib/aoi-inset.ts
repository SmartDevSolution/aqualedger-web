// Pure projection of the committed AOI and zone geometries into a small SVG inset (DR-M3-01 §8:
// "AOI hash with a small map inset of the AOI and zones"), for the decision card and its print
// export.
//
// Why an inline SVG rather than the workspace map: DR-M3-01 §8 forbids a new route/service and
// requires the exported card to stay real text/SVG ("charts are inline SVG with text labels"), and
// the print stylesheet hides the interactive workspace map. The inset is therefore drawn from the
// committed geometry the result already carries — no tiles, no provider, no network — so the same
// committed values produce the same inset in either language, at print time and in the PDF.
//
// Nothing here invents a coordinate: an unknown or non-polygonal geometry is reported as missing
// rather than approximated, and the projection only scales/translates the committed lon/lat pairs
// (north up: SVG y = −latitude).

import {isPolygonal, zoneBounds} from './zone-model';

export type InsetZoneInput = {zoneId: string; ranked: boolean; fill: string; geometry: unknown};

export type InsetZonePath = {zoneId: string; ranked: boolean; fill: string; path: string};

export type AoiInset = {
  /** SVG `viewBox` in the projected (y-flipped) space. */
  viewBox: string;
  /** Outer-ring path of the requested area, or null when the AOI is not a committed polygon. */
  aoiPath: string | null;
  zones: InsetZonePath[];
  /** Zone ids whose geometry is absent or not polygonal — disclosed, never approximated. */
  missingZoneIds: string[];
};

export function buildAoiInset(aoi: unknown, zones: InsetZoneInput[]): AoiInset | null {
  let bounds: [number, number, number, number] | null = null;
  let aoiPath: string | null = null;
  if (isPolygonal(aoi)) {
    aoiPath = geometryPath(aoi);
    bounds = zoneBounds(aoi);
  }

  const zonePaths: InsetZonePath[] = [];
  const missingZoneIds: string[] = [];
  for (const zone of zones) {
    if (!isPolygonal(zone.geometry)) {
      missingZoneIds.push(zone.zoneId);
      continue;
    }
    const path = geometryPath(zone.geometry);
    const zoneBox = zoneBounds(zone.geometry);
    if (path === '' || zoneBox === null) {
      missingZoneIds.push(zone.zoneId);
      continue;
    }
    bounds = bounds === null ? zoneBox : union(bounds, zoneBox);
    zonePaths.push({zoneId: zone.zoneId, ranked: zone.ranked, fill: zone.fill, path});
  }

  if (bounds === null) return null;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const pad = Math.max(maxLon - minLon, maxLat - minLat, 0.0001) * 0.08;
  const viewBox = [
    number(minLon - pad),
    number(-(maxLat + pad)),
    number(maxLon - minLon + 2 * pad),
    number(maxLat - minLat + 2 * pad)
  ].join(' ');
  return {viewBox, aoiPath, zones: zonePaths, missingZoneIds};
}

/** One path per ring: outer ring and any holes, closed. Coordinates are projected with y = −lat. */
function geometryPath(geometry: {type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[]}): string {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const paths: string[] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) continue;
    for (const ring of polygon) {
      const path = ringPath(ring);
      if (path !== '') paths.push(path);
    }
  }
  return paths.join(' ');
}

function ringPath(ring: unknown): string {
  if (!Array.isArray(ring)) return '';
  const commands: string[] = [];
  let first = true;
  for (const position of ring) {
    if (!Array.isArray(position)) continue;
    const lon = position[0];
    const lat = position[1];
    if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    commands.push(`${first ? 'M' : 'L'}${number(lon)},${number(-lat)}`);
    first = false;
  }
  return commands.length < 3 ? '' : `${commands.join(' ')} Z`;
}

function union(left: [number, number, number, number], right: [number, number, number, number]): [number, number, number, number] {
  return [
    Math.min(left[0], right[0]),
    Math.min(left[1], right[1]),
    Math.max(left[2], right[2]),
    Math.max(left[3], right[3])
  ];
}

function number(value: number): string {
  return Number(value.toFixed(6)).toString();
}
