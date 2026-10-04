import {createHash} from 'node:crypto';
import {canonicalJson} from '../../src/lib/api/result-hash.ts';

/** Frozen manifest hash (DR-M4-01 §5); mirrors backend `AUTHORITY_DEFINITION_SHA256`. */
export const AUTHORITY_DEFINITION_SHA256 = '99347ab2e9885d5e8b20a5ed110a9052ca2bcbbc8d71d63083cb7835f633cb81';

const SCENARIO_INSTANCE_SCHEME = 'aq-scenario-instance-1';

const DISCLOSURE_ORDER = [
  'HYPOTHETICAL_NOT_OBSERVED',
  'SENSITIVITY_ILLUSTRATION_NOT_BASIN_FORECAST',
  'NOT_OBSERVED_SAVINGS',
  'APPLICATION_REDUCTION_NOT_BASIN_SAVINGS',
  'ILLUSTRATIVE_CONSTANTS_NOT_FROM_THIS_ANALYSIS',
  'NO_IN_BASIN_VALIDATION',
  'CLOSURE_IS_CONSISTENCY_CHECK_NOT_PROOF',
  'BENEFICIAL_ET_REDUCTION_NOT_A_YIELD_ESTIMATE',
  'NO_INDIVIDUAL_WELL_PUMPING_CLAIM'
] as const;

const QUANTITY_ORDER = [
  'W_IN',
  'ET_BEN',
  'E_NONBEN',
  'R',
  'D_NONREC',
  'DELTA_S',
  'BASIN_SAVINGS',
  'YIELD_CHANGE'
] as const;

type ScenarioReason = {code: string; params?: Record<string, unknown>};

function productQuantities(): Array<{quantity: string; status: 'NOT_ESTIMABLE'; reasons: ScenarioReason[]}> {
  return QUANTITY_ORDER.map((quantity) => {
    let reason: ScenarioReason;
    if (quantity === 'BASIN_SAVINGS') {
      reason = {
        code: 'BASIN_SAVINGS_INPUTS_MISSING',
        params: {
          terms: [
            'BOUNDARY_PERIOD',
            'P',
            'W_IN',
            'ET_BEN',
            'E_NONBEN',
            'R',
            'D_NONREC',
            'DELTA_S',
            'Q_OTHER'
          ]
        }
      };
    } else if (quantity === 'YIELD_CHANGE') {
      reason = {code: 'YIELD_RESPONSE_NOT_MODELLED', params: {}};
    } else if (quantity === 'W_IN' || quantity === 'ET_BEN' || quantity === 'E_NONBEN') {
      reason = {code: 'SCENARIO_NOT_EMPIRICALLY_ANCHORED', params: {quantities: [quantity]}};
    } else {
      reason = {code: 'NO_LOCAL_BASIS', params: {quantities: [quantity]}};
    }
    return {quantity, status: 'NOT_ESTIMABLE', reasons: [reason]};
  });
}

function scenarioSha256(content: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalJson(content)).digest('hex');
}

function computeScenarioId(analysisId: string, resultSha256: string, scenarioSha: string): string {
  const material = `${SCENARIO_INSTANCE_SCHEME}|${analysisId.toLowerCase()}|${resultSha256}|${scenarioSha}`;
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/** Mirrors backend `build_scenario_body` for the test double (DR-M4-01 withheld projection). */
export function buildScenarioFixture(analysisId: string, resultSha256: string): Record<string, unknown> {
  const association = {analysis_id: analysisId, result_sha256: resultSha256};
  const quantities = productQuantities();
  const uncertainty = {
    status: 'NOT_ASSESSED',
    reasons: [{code: 'SCENARIO_UNCERTAINTY_NOT_ASSESSED', params: {}}]
  };
  const contentWithoutIdentity: Record<string, unknown> = {
    schema_version: 'aq-scenario-response-1',
    scenario_key: 'tuban-fixed-60',
    scenario_method_version: 'aq-scenario-1',
    scenario_definition_sha256: AUTHORITY_DEFINITION_SHA256,
    association,
    epistemic_class: 'MODELED_SIMULATED',
    basis: 'ILLUSTRATIVE_ONLY',
    boundary_code: 'PROVISIONAL_TUBAN_DELTA_REFERENCE_ONLY',
    period_code: 'HYPOTHETICAL_IRRIGATION_SEASON',
    unit: 'Mm3/season',
    numeric_projection: 'WITHHELD_PENDING_NEW_COUNCIL_METHOD',
    quantities,
    uncertainty,
    disclosures: [...DISCLOSURE_ORDER]
  };
  const scenarioSha = scenarioSha256(contentWithoutIdentity);
  const scenarioId = computeScenarioId(analysisId, resultSha256, scenarioSha);
  return {
    ...contentWithoutIdentity,
    scenario_identity: {scenario_id: scenarioId, scenario_sha256: scenarioSha}
  };
}
