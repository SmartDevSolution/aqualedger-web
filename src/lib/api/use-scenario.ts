'use client';

import {useEffect, useState} from 'react';
import {getAnalysisScenario, type ApiFailure} from './client';
import {isScenarioResponse, scenarioMatchesAssociation, type ScenarioResponse} from './scenario';

export type ScenarioState =
  | {kind: 'idle'}
  | {kind: 'loading'}
  | {kind: 'ready'; scenario: ScenarioResponse; key: string}
  | {kind: 'unavailable'; code: string}
  | {kind: 'blocked'; error: ApiFailure};

/**
 * Fetches the fixed hypothetical scenario for one saved analysis identity (A25/A39).
 * Keyed by `(analysis_id, result_sha256)`; locale changes do not refetch or clear association.
 */
export function useScenario(analysisId: string | undefined, resultSha256: string | null | undefined) {
  const associationKey = analysisId && resultSha256 ? `${analysisId}|${resultSha256}` : null;
  const [held, setHeld] = useState<{key: string | null; value: ScenarioState}>({key: associationKey, value: {kind: 'idle'}});
  const state: ScenarioState = held.key === associationKey ? held.value : associationKey ? {kind: 'loading'} : {kind: 'idle'};

  useEffect(() => {
    if (!analysisId || !resultSha256) {
      setHeld({key: null, value: {kind: 'idle'}});
      return;
    }
    const key = `${analysisId}|${resultSha256}`;
    let active = true;
    const controller = new AbortController();
    setHeld({key, value: {kind: 'loading'}});

    void (async () => {
      const response = await getAnalysisScenario(analysisId, controller.signal);
      if (!active) return;
      if (response.error) {
        if (response.error.code === 'SCENARIO_UNAVAILABLE' || response.error.code === 'NOT_READY') {
          setHeld({key, value: {kind: 'unavailable', code: response.error.code}});
          return;
        }
        if (response.error.code !== 'REQUEST_CANCELLED') {
          setHeld({key, value: {kind: 'blocked', error: response.error}});
        }
        return;
      }
      const scenario = response.data;
      if (!isScenarioResponse(scenario) || !scenarioMatchesAssociation(scenario, analysisId, resultSha256)) {
        setHeld({key, value: {kind: 'blocked', error: {
          code: 'UNKNOWN_RESPONSE',
          httpStatus: null,
          requestId: null,
          retryable: false
        }}});
        return;
      }
      setHeld({key, value: {kind: 'ready', scenario, key}});
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [analysisId, resultSha256]);

  return state;
}
