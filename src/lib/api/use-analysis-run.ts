'use client';

import {useEffect, useState} from 'react';
import {getAnalysisResult, getAnalysisStatus, type AnalysisResult, type AnalysisStatus, type ApiFailure} from './client';

const POLL_INTERVAL_MS = 2_500;
const MAX_POLL_ATTEMPTS = 40;
const MAX_POLL_DURATION_MS = 2 * 60_000;

export type AnalysisRunState =
  | {kind: 'idle'}
  | {kind: 'loading'; stage: 'status' | 'result'; status?: AnalysisStatus | undefined}
  | {kind: 'pending'; status: AnalysisStatus}
  | {kind: 'complete'; status: AnalysisStatus; result: AnalysisResult}
  | {kind: 'failed'; status: AnalysisStatus; errorCode: string | null}
  | {kind: 'blocked'; status?: AnalysisStatus | undefined; error: ApiFailure}
  | {kind: 'timedOut'; status?: AnalysisStatus | undefined};

export function useAnalysisRun(analysisId: string | undefined) {
  // The state is stored together with the id it was produced for. When the route id changes the
  // previous id's state is never shown for the new id (not even for one render): a result is only
  // ever read through the id it was fetched for (A25/A39 — one in-memory result keyed by id).
  const [held, setHeld] = useState<{id: string | undefined; value: AnalysisRunState}>({
    id: analysisId,
    value: analysisId ? {kind: 'loading', stage: 'status'} : {kind: 'idle'}
  });
  const [retryNumber, setRetryNumber] = useState(0);
  const state: AnalysisRunState = held.id === analysisId
    ? held.value
    : analysisId ? {kind: 'loading', stage: 'status'} : {kind: 'idle'};

  useEffect(() => {
    const setState = (value: AnalysisRunState) => setHeld({id: analysisId, value});
    if (!analysisId) {
      setState({kind: 'idle'});
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const startedAt = Date.now();
    let lastStatus: AnalysisStatus | undefined;
    const controller = new AbortController();

    setState({kind: 'loading', stage: 'status'});

    const schedule = (stage: 'status' | 'result') => {
      if (attempts >= MAX_POLL_ATTEMPTS || Date.now() - startedAt >= MAX_POLL_DURATION_MS) {
        setState({kind: 'timedOut', status: lastStatus});
        return;
      }
      setState(lastStatus ? {kind: 'pending', status: lastStatus} : {kind: 'loading', stage});
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    const poll = async () => {
      if (!active) return;
      attempts += 1;
      const statusResponse = await getAnalysisStatus(analysisId, controller.signal);
      if (!active) return;
      if (statusResponse.error) {
        if (statusResponse.error.retryable && attempts < MAX_POLL_ATTEMPTS && Date.now() - startedAt < MAX_POLL_DURATION_MS) {
          schedule('status');
        } else if (statusResponse.error.code !== 'REQUEST_CANCELLED') {
          setState({kind: 'blocked', status: lastStatus, error: statusResponse.error});
        }
        return;
      }

      const status = statusResponse.data;
      lastStatus = status;
      if (status.execution_status === 'FAILED') {
        setState({kind: 'failed', status, errorCode: firstStatusErrorCode(status)});
        return;
      }
      if (status.execution_status !== 'SUCCEEDED') {
        schedule('status');
        return;
      }

      setState({kind: 'loading', stage: 'result', status});
      const resultResponse = await getAnalysisResult(analysisId, controller.signal);
      if (!active) return;
      if (resultResponse.error) {
        if (resultResponse.error.code === 'NOT_READY' || resultResponse.error.retryable) {
          schedule('result');
        } else if (resultResponse.error.code !== 'REQUEST_CANCELLED') {
          setState({kind: 'blocked', status, error: resultResponse.error});
        }
        return;
      }
      setState({kind: 'complete', status, result: resultResponse.data});
    };

    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [analysisId, retryNumber]);

  return {
    state,
    retry: () => setRetryNumber((value) => value + 1)
  };
}

function firstStatusErrorCode(status: AnalysisStatus): string | null {
  const firstError: unknown = status.errors?.[0];
  if (typeof firstError !== 'object' || firstError === null || Array.isArray(firstError)) {
    return null;
  }
  const code = (firstError as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}
