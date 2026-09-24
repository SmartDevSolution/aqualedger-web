import {validatePolygon, type AoiPolygon} from './analysis-input';

export type WorkspaceDraft = {
  aoi: AoiPolygon | null;
  aoiText: string;
  startDate: string;
  endDate: string;
};

const STORAGE_KEY = 'aqualedger.workspace-draft.v1';

export const emptyWorkspaceDraft: WorkspaceDraft = {
  aoi: null,
  aoiText: '',
  startDate: '',
  endDate: ''
};

export function readWorkspaceDraft(): WorkspaceDraft {
  if (typeof window === 'undefined') {
    return emptyWorkspaceDraft;
  }

  try {
    const serialized = window.sessionStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      return emptyWorkspaceDraft;
    }
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value)) {
      return emptyWorkspaceDraft;
    }

    let aoi: AoiPolygon | null = null;
    if (isPolygon(value.aoi)) {
      aoi = validatePolygon(value.aoi).valid ? value.aoi : null;
    }
    return {
      aoi,
      aoiText: typeof value.aoiText === 'string' ? value.aoiText : '',
      startDate: typeof value.startDate === 'string' ? value.startDate : '',
      endDate: typeof value.endDate === 'string' ? value.endDate : ''
    };
  } catch {
    return emptyWorkspaceDraft;
  }
}

export function writeWorkspaceDraft(draft: WorkspaceDraft): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPolygon(value: unknown): value is AoiPolygon {
  if (!isRecord(value) || value.type !== 'Polygon' || !Array.isArray(value.coordinates)) {
    return false;
  }
  return value.coordinates.every((ring) => Array.isArray(ring) && ring.every((position) =>
    Array.isArray(position) && position.length === 2 && position.every((coordinate) =>
      typeof coordinate === 'number' && Number.isFinite(coordinate)
    )
  ));
}
