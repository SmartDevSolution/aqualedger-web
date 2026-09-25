import area from '@turf/area';
import booleanValid from '@turf/boolean-valid';
import type {Feature, Polygon, Position} from 'geojson';

type AoiCoordinate = [longitude: number, latitude: number];
export type AoiPolygon = Polygon;

export type InputProblem =
  | 'invalidGeoJson'
  | 'unsupportedGeometry'
  | 'invalidCoordinates'
  | 'invalidPolygon'
  | 'antimeridianUnsupported'
  | 'tooManyVertices'
  | 'areaTooLarge'
  | 'dateMissing'
  | 'dateInvalid'
  | 'dateOrder'
  | 'dateFuture'
  | 'dateSpanTooLong';

export type InputValidation = {
  valid: boolean;
  problem: InputProblem | null;
  areaKm2: number | null;
};

const MAX_AOI_AREA_KM2 = 5_000;
const MAX_DATE_SPAN_DAYS = 120;
const MAX_VERTICES = 500;

export function parseAoiGeoJson(text: string): AoiPolygon {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error('invalidGeoJson');
  }

  const geometry = isRecord(value) && value.type === 'Feature' ? value.geometry : value;
  if (!isRecord(geometry) || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) {
    throw new Error('unsupportedGeometry');
  }
  if (geometry.coordinates.length === 0) {
    throw new Error('unsupportedGeometry');
  }

  const coordinates = geometry.coordinates as unknown[];
  const rings: Position[][] = coordinates.map((ring) => {
    if (!Array.isArray(ring)) {
      throw new Error('invalidCoordinates');
    }
    return ring.map((position) => {
      if (!isPosition(position)) {
        throw new Error('invalidCoordinates');
      }
      return position;
    });
  });

  const polygon = {type: 'Polygon', coordinates: rings} satisfies AoiPolygon;
  const validation = validatePolygon(polygon);
  if (validation.problem) {
    throw new Error(validation.problem);
  }
  return polygon;
}

export function validateAnalysisInput(
  polygon: AoiPolygon | null,
  startDate: string,
  endDate: string,
  today = new Date().toISOString().slice(0, 10)
): InputValidation {
  if (!polygon) {
    return {valid: false, problem: 'invalidPolygon', areaKm2: null};
  }

  const polygonValidation = validatePolygon(polygon);
  if (polygonValidation.problem) {
    return polygonValidation;
  }
  if (!startDate || !endDate) {
    return {valid: false, problem: 'dateMissing', areaKm2: polygonValidation.areaKm2};
  }
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) {
    return {valid: false, problem: 'dateInvalid', areaKm2: polygonValidation.areaKm2};
  }
  if (startDate > endDate) {
    return {valid: false, problem: 'dateOrder', areaKm2: polygonValidation.areaKm2};
  }
  if (startDate > today || endDate > today) {
    return {valid: false, problem: 'dateFuture', areaKm2: polygonValidation.areaKm2};
  }

  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const spanDays = (end - start) / 86_400_000;
  if (spanDays > MAX_DATE_SPAN_DAYS) {
    return {valid: false, problem: 'dateSpanTooLong', areaKm2: polygonValidation.areaKm2};
  }

  return {valid: true, problem: null, areaKm2: polygonValidation.areaKm2};
}

export function validatePolygon(polygon: AoiPolygon): InputValidation {
  if (polygon.coordinates.length === 0 || polygon.coordinates.some((ring) => ring.length < 4 || !ring.every(isPosition))) {
    return {valid: false, problem: 'invalidCoordinates', areaKm2: null};
  }
  if (polygon.coordinates.reduce((total, ring) => total + ring.length, 0) > MAX_VERTICES) {
    return {valid: false, problem: 'tooManyVertices', areaKm2: null};
  }
  for (const ring of polygon.coordinates) {
    if (!samePosition(ring[0], ring[ring.length - 1])) {
      return {valid: false, problem: 'invalidPolygon', areaKm2: null};
    }
    for (let index = 0; index < ring.length - 1; index += 1) {
      const position = ring[index];
      const next = ring[index + 1];
      if (!isPosition(position) || !isPosition(next)) {
        return {valid: false, problem: 'invalidCoordinates', areaKm2: null};
      }
      if (Math.abs(position[0] - next[0]) > 180) {
        return {valid: false, problem: 'antimeridianUnsupported', areaKm2: null};
      }
    }
  }

  const feature: Feature<Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: polygon
  };
  if (!booleanValid(feature)) {
    return {valid: false, problem: 'invalidPolygon', areaKm2: null};
  }

  const areaKm2 = area(feature) / 1_000_000;
  if (!Number.isFinite(areaKm2) || areaKm2 <= 0) {
    return {valid: false, problem: 'invalidPolygon', areaKm2: null};
  }
  if (areaKm2 > MAX_AOI_AREA_KM2) {
    return {valid: false, problem: 'areaTooLarge', areaKm2};
  }
  return {valid: true, problem: null, areaKm2};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPosition(value: unknown): value is Position & AoiCoordinate {
  if (!Array.isArray(value) || value.length < 2 || !value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) {
    return false;
  }
  const coordinates = value as unknown[];
  const longitude = coordinates[0];
  const latitude = coordinates[1];
  return typeof longitude === 'number' && longitude >= -180 && longitude <= 180
    && typeof latitude === 'number' && latitude >= -90 && latitude <= 90;
}

function samePosition(left: Position | undefined, right: Position | undefined): boolean {
  return left !== undefined && right !== undefined && left[0] === right[0] && left[1] === right[1];
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
