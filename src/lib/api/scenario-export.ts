import {canonicalJson} from './result-hash';
import type {ScenarioResponse} from './scenario';

/** Language-neutral deterministic JSON export of the committed scenario response (A39). */
export function scenarioExportBytes(scenario: ScenarioResponse): string {
  return `${canonicalJson(scenario)}\n`;
}

export function scenarioExportFileName(analysisId: string): string {
  return `aqualedger-scenario-${analysisId}.json`;
}
