'use client';

import {useTranslations} from 'next-intl';
import type {AnalysisRunState} from '@/lib/api/use-analysis-run';
import {runFailureMessageKey} from '@/lib/api/error-messages';
import {BackendErrorNotice} from './backend-error-notice';

type AnalysisStagePanelProps = {
  analysisId?: string | undefined;
  state: AnalysisRunState;
  submitFailure?: {code: string; requestId: string | null; httpStatus: number | null; retryable: boolean} | null;
  onRetry: () => void;
};

export function AnalysisStagePanel({analysisId, state, submitFailure, onRetry}: AnalysisStagePanelProps) {
  const t = useTranslations('workspace');
  const errors = useTranslations('errors');

  return (
    <section className="stage-card" aria-labelledby="stage-heading">
      <p className="eyebrow">03</p>
      <h3 id="stage-heading">{t('analysisStageHeading')}</h3>
      {!analysisId ? (
        <>
          <p className="stage-state">{t('notSubmitted')}</p>
          <p className="subtle-copy">{t('notSubmittedDetail')}</p>
        </>
      ) : (
        <>
          <p className="stage-state">{stageTitle(state.kind, t)}</p>
          {state.kind === 'loading' ? <p className="subtle-copy" role="status">{state.stage === 'result' ? t('loadingResult') : t('checkingSavedAnalysis')}</p> : null}
          {state.kind === 'pending' ? (
            <p className="subtle-copy" role="status">{t('executionStatus', {status: executionLabel(state.status.execution_status, t)})}</p>
          ) : null}
          {state.kind === 'complete' ? (
            <>
              <p className="subtle-copy" role="status">{t('executionStatus', {status: executionLabel(state.status.execution_status, t)})}</p>
              {state.status.execution_status !== 'FAILED' ? renderEvidenceStatus(state.status, t) : null}
            </>
          ) : null}
          {state.kind === 'failed' ? (
            <>
              <p className="subtle-copy" role="status">{t('analysisFailed')}</p>
              <p className="subtle-copy">{errors(runFailureMessageKey(state.errorCode))}</p>
            </>
          ) : null}
          {state.kind === 'blocked' ? <BackendErrorNotice failure={state.error} /> : null}
          {state.kind === 'timedOut' ? (
            <>
              <p className="subtle-copy" role="status">{t('pollingTimedOut')}</p>
              <button type="button" className="button button-tertiary" onClick={onRetry}>{t('retryStatus')}</button>
            </>
          ) : null}
          {(state.kind === 'blocked' && state.error.retryable) ? (
            <button type="button" className="button button-tertiary" onClick={onRetry}>{t('retryStatus')}</button>
          ) : null}
          <p className="id-line">{t('routeAnalysisId')}: <bdi dir="ltr">{analysisId}</bdi></p>
        </>
      )}
      {submitFailure ? <BackendErrorNotice failure={submitFailure} /> : null}
    </section>
  );
}

function stageTitle(kind: AnalysisRunState['kind'], t: ReturnType<typeof useTranslations<'workspace'>>): string {
  switch (kind) {
    case 'loading': return t('stageChecking');
    case 'pending': return t('stageInProgress');
    case 'complete': return t('stageComplete');
    case 'failed': return t('stageFailed');
    case 'blocked': return t('stageBlocked');
    case 'timedOut': return t('stageTimedOut');
    case 'idle': return t('notSubmitted');
  }
}

function executionLabel(status: string, t: ReturnType<typeof useTranslations<'workspace'>>): string {
  switch (status) {
    case 'QUEUED': return t('executionQueued');
    case 'RUNNING': return t('executionRunning');
    case 'RETRY_WAIT': return t('executionRetryWait');
    case 'SUCCEEDED': return t('executionSucceeded');
    case 'FAILED': return t('executionFailed');
    default: return t('executionUnknown');
  }
}

function renderEvidenceStatus(
  status: {execution_status: string; evidence_status: string},
  t: ReturnType<typeof useTranslations<'workspace'>>
) {
  const value = status.execution_status === 'FAILED' ? null : status.evidence_status;
  if (value === 'NOT_ASSESSED') {
    return <p className="subtle-copy">{t('evidenceNotAssessed')}</p>;
  }
  if (value === 'INSUFFICIENT') {
    return <p className="subtle-copy">{t('evidenceInsufficient')}</p>;
  }
  if (value === 'SUFFICIENT' || value === 'LIMITED') {
    return <p className="subtle-copy">{t('unsupportedEvidenceStatus', {status: value})}</p>;
  }
  return null;
}
