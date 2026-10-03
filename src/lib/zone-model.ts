import type {AnalysisResult} from './api/client';
import type {M2ResultAdditions} from './api/m2';
import type {M3ScoredResult, M3ZoneAssessment} from './api/m3';

// Pure projection of one committed M3 result into what the panel, map, chart and card display.
// Every consumer reads from the same `ScoredResultView`, built once per (analysis_id,
// result_sha256); nothing here reads form state, locale or the clock.

export type Reason = {code: string; params?: Record<string, unknown> | undefined};
export type ZoneAssessment = M3ZoneAssessment;
export type M2Zone = NonNullable<M2ResultAdditions['zones']>[number];
export type M2Observation = NonNullable<M2ResultAdditions['observations']>[number];

/** The twelve scorecard rows in their fixed order (DR-M3-01 §5): mandatory M1–M4 then optional O1–O8. */
export const FACTOR_IDS = ['M1', 'M2', 'M3', 'M4', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8'] as const;
export type FactorId = (typeof FACTOR_IDS)[number];

/**
 * RANKED zones are encoded by `rank_group` on a single-hue sequential ramp (darkest = group 1).
 * The evidence-quality class never uses this ramp (it is a separate badge, see globals.css) and
 * UNRANKED zones never use any ramp colour: they get the neutral hatch. Shared by the panel
 * chips and the map layer so both axes read identically on every surface.
 */
export const RANK_GROUP_STEPS = [
  {fill: '#08306b', ink: '#ffffff'},
  {fill: '#17508a', ink: '#ffffff'},
  {fill: '#2f6fa8', ink: '#ffffff'},
  {fill: '#8fbad8', ink: '#172d36'},
  {fill: '#c6dcec', ink: '#172d36'}
] as const;

export function rankGroupStep(rankGroup: number | null | undefined): (typeof RANK_GROUP_STEPS)[number] {
  const index = rankGroup === null || rankGroup === undefined || rankGroup < 1
    ? RANK_GROUP_STEPS.length - 1
    : Math.min(rankGroup, RANK_GROUP_STEPS.length) - 1;
  return RANK_GROUP_STEPS[index] as (typeof RANK_GROUP_STEPS)[number];
}

export type ZoneView = {
  zoneId: string;
  assessment: ZoneAssessment;
  ranked: boolean;
  rank: number | null;
  rankGroup: number | null;
  /** The first priority reason code of an UNRANKED zone; the grouping key. */
  unrankedReason: string | null;
  /** Geometry joined from `m2.zones` on the identity triple (zone_id, geometry_version, geometry_hash). */
  geometry: M2Zone['geometry'] | null;
};

export type UnrankedGroup = {reason: string | null; zones: ZoneView[]};

export type ScoredResultView = {
  analysisId: string;
  resultSha256: string;
  result: M3ScoredResult;
  zones: ZoneView[];
  ranked: ZoneView[];
  unrankedGroups: UnrankedGroup[];
  unrankedCount: number;
};

export type ScoredResultKey = `${string}|${string}`;

export function resultKey(analysisId: string, resultSha256: string): ScoredResultKey {
  return `${analysisId}|${resultSha256}`;
}

export function isScoredResult(result: AnalysisResult): result is M3ScoredResult {
  return result.scoring !== undefined && result.scoring !== null
    && result.assessment !== undefined && result.assessment !== null
    && result.result_identity !== undefined && result.result_identity !== null;
}

/**
 * Builds the one view of a committed scored result. Returns null when the result is not scored
 * (absent envelope = "not scored under this method", never UNRANKED) or when its identity does
 * not belong to `expectedAnalysisId` — a late or foreign result is discarded, never displayed.
 */
export function buildScoredResultView(result: AnalysisResult, expectedAnalysisId: string): ScoredResultView | null {
  if (!isScoredResult(result)) return null;
  if (result.analysis_id !== expectedAnalysisId) return null;
  if (result.result_identity.analysis_id !== expectedAnalysisId) return null;

  const m2Zones = result.m2?.zones ?? [];
  const zones: ZoneView[] = result.assessment.map((assessment) => {
    const ranked = assessment.priority.status === 'RANKED';
    const match = m2Zones.find((zone) => zone.zone_id === assessment.zone_id
      && sameVersion(zone.geometry_version, assessment.geometry_version)
      && sameHash(zone.geometry_hash, assessment.geometry_hash));
    return {
      zoneId: assessment.zone_id,
      assessment,
      ranked,
      rank: ranked ? assessment.priority.rank ?? null : null,
      rankGroup: ranked ? assessment.priority.rank_group ?? null : null,
      unrankedReason: ranked ? null : assessment.priority.reasons?.[0]?.code ?? null,
      geometry: match?.geometry ?? null
    };
  });

  const ranked = zones.filter((zone) => zone.ranked).sort(compareRanked);
  const unranked = zones.filter((zone) => !zone.ranked);
  return {
    analysisId: expectedAnalysisId,
    resultSha256: result.result_identity.result_sha256,
    result,
    zones,
    ranked,
    unrankedGroups: groupUnranked(unranked),
    unrankedCount: unranked.length
  };
}

function sameVersion(left: unknown, right: unknown): boolean {
  return right === undefined || right === null || String(left) === String(right);
}

function sameHash(left: unknown, right: unknown): boolean {
  return right === undefined || right === null || left === right;
}

function compareRanked(left: ZoneView, right: ZoneView): number {
  const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
  const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return compareText(left.zoneId, right.zoneId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** UNRANKED zones grouped by their first reason code; groups ordered by code, zones by id. */
function groupUnranked(zones: ZoneView[]): UnrankedGroup[] {
  const groups = new Map<string | null, ZoneView[]>();
  for (const zone of zones) {
    const members = groups.get(zone.unrankedReason) ?? [];
    members.push(zone);
    groups.set(zone.unrankedReason, members);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => compareText(left ?? '\uffff', right ?? '\uffff'))
    .map(([reason, members]) => ({reason, zones: members.sort((a, b) => compareText(a.zoneId, b.zoneId))}));
}

export function factorRow(zone: ZoneAssessment, factorId: string) {
  return zone.evidence_quality.factors.find((row) => row.factor_id === factorId) ?? null;
}

/** Observations scoped to one zone, chronological. */
export function zoneObservations(result: AnalysisResult, zoneId: string): M2Observation[] {
  return (result.m2?.observations ?? [])
    .filter((observation) => observation.zone_id === zoneId)
    .sort((left, right) => compareText(left.window_start, right.window_start));
}

export function zoneBounds(geometry: unknown): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      minX = Math.min(minX, value[0]);
      maxX = Math.max(maxX, value[0]);
      minY = Math.min(minY, value[1]);
      maxY = Math.max(maxY, value[1]);
      return;
    }
    value.forEach(visit);
  };
  if (typeof geometry === 'object' && geometry !== null) {
    visit((geometry as {coordinates?: unknown}).coordinates);
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

export function isPolygonal(geometry: unknown): geometry is {type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[]} {
  if (typeof geometry !== 'object' || geometry === null) return false;
  const candidate = geometry as {type?: unknown; coordinates?: unknown};
  return (candidate.type === 'Polygon' || candidate.type === 'MultiPolygon') && Array.isArray(candidate.coordinates);
}
