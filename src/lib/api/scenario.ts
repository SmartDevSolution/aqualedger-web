import type {components} from './generated';

export type ScenarioResponse = components['schemas']['ScenarioResponse'];
export type ScenarioQuantityReasonCode = components['schemas']['ScenarioQuantityReasonCode'];

const REASON_CODES: readonly ScenarioQuantityReasonCode[] = [
  'SCENARIO_NOT_EMPIRICALLY_ANCHORED',
  'NO_LOCAL_BASIS',
  'BASIN_SAVINGS_INPUTS_MISSING',
  'YIELD_RESPONSE_NOT_MODELLED',
  'SCENARIO_UNCERTAINTY_NOT_ASSESSED'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function isScenarioReason(value: unknown): boolean {
  if (!isRecord(value) || typeof value.code !== 'string') return false;
  if (!REASON_CODES.includes(value.code as ScenarioQuantityReasonCode)) return false;
  if (value.params !== undefined && !isRecord(value.params)) return false;
  return true;
}

function isScenarioQuantity(value: unknown): boolean {
  if (!isRecord(value) || typeof value.quantity !== 'string' || value.status !== 'NOT_ESTIMABLE') return false;
  if (!Array.isArray(value.reasons) || !value.reasons.every(isScenarioReason)) return false;
  if ('value' in value || 'lower' in value || 'upper' in value) return false;
  return true;
}

export function isScenarioResponse(value: unknown): value is ScenarioResponse {
  if (!isRecord(value)) return false;
  if (value.schema_version !== 'aq-scenario-response-1') return false;
  if (value.scenario_key !== 'tuban-fixed-60' || value.scenario_method_version !== 'aq-scenario-1') return false;
  if (typeof value.scenario_definition_sha256 !== 'string') return false;
  if (!isRecord(value.association) || !isUuid(value.association.analysis_id)
    || typeof value.association.result_sha256 !== 'string') return false;
  if (!isRecord(value.scenario_identity) || typeof value.scenario_identity.scenario_id !== 'string'
    || typeof value.scenario_identity.scenario_sha256 !== 'string') return false;
  if (!Array.isArray(value.quantities) || !value.quantities.every(isScenarioQuantity)) return false;
  if (!isRecord(value.uncertainty) || value.uncertainty.status !== 'NOT_ASSESSED') return false;
  if (!Array.isArray(value.uncertainty.reasons) || !value.uncertainty.reasons.every(isScenarioReason)) return false;
  if (!Array.isArray(value.disclosures) || !value.disclosures.every((entry) => typeof entry === 'string')) return false;
  return true;
}

export function scenarioMatchesAssociation(
  scenario: ScenarioResponse,
  analysisId: string,
  resultSha256: string
): boolean {
  return scenario.association.analysis_id === analysisId && scenario.association.result_sha256 === resultSha256;
}
