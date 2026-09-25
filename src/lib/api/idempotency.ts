import type {AnalysisCreateRequest} from './client';

const STORAGE_KEY = 'aqualedger.analysis-attempt.v1';

type AttemptRecord = {
  key: string;
  identity: string;
};

let inMemoryAttempt: AttemptRecord | null = null;

export function getIdempotencyKey(request: AnalysisCreateRequest): string | null {
  const identity = canonicalIdentity(request);
  const stored = readAttempt();
  if (stored?.identity === identity) {
    inMemoryAttempt = stored;
    return stored.key;
  }
  if (inMemoryAttempt?.identity === identity) {
    return inMemoryAttempt.key;
  }

  const key = window.crypto.randomUUID?.();
  if (!key) {
    return null;
  }
  const attempt = {key, identity};
  inMemoryAttempt = attempt;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // Keep the key for retries in this page lifetime if session storage is unavailable.
  }
  return key;
}

export function clearIdempotencyKey(): void {
  inMemoryAttempt = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // A stale record is ignored when the next request has different analytical input.
  }
}

function canonicalIdentity(request: AnalysisCreateRequest): string {
  return JSON.stringify({
    aoi_geojson: request.aoi_geojson,
    start_date: request.start_date,
    end_date: request.end_date
  });
}

function readAttempt(): AttemptRecord | null {
  try {
    const serialized = window.sessionStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      return null;
    }
    const value: unknown = JSON.parse(serialized);
    if (isRecord(value) && typeof value.key === 'string' && typeof value.identity === 'string') {
      return {key: value.key, identity: value.identity};
    }
  } catch {
    return null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
