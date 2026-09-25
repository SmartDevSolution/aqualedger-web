'use client';

import {useLocale, useTranslations} from 'next-intl';
import {formatGregorianDate, formatPercent, formatTimestamp, formatValue} from '@/lib/format';
import {limitationMessageKey, reasonMessageKey} from '@/lib/api/error-messages';
import type {AnalysisRunState} from '@/lib/api/use-analysis-run';
import type {PreviewOverlayStatus} from '@/lib/preview/geotiff-overlay';

export function AnalysisResultPanel({
  analysisId,
  state,
  previewStatus
}: {
  analysisId?: string | undefined;
  state: AnalysisRunState;
  previewStatus: PreviewOverlayStatus;
}) {
  const locale = useLocale();
  const t = useTranslations('workspace');

  return (
    <section className="panel result-panel" aria-labelledby="result-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">04</p>
          <h2 id="result-heading">{t('resultHeading')}</h2>
        </div>
        {analysisId ? <bdi className="result-id" dir="ltr">{analysisId}</bdi> : null}
      </div>
      {!analysisId ? (
        <div className="result-empty-state">
          <div className="result-icon" aria-hidden="true">NDVI</div>
          <div>
            <h3>{t('previewUnavailable')}</h3>
            <p>{t('noResult')}</p>
          </div>
        </div>
      ) : null}
      {analysisId && (state.kind === 'loading' || state.kind === 'pending') ? (
        <p className="notice notice-neutral" role="status">{t(state.kind === 'loading' && state.stage === 'result' ? 'loadingResult' : 'checkingSavedAnalysis')}</p>
      ) : null}
      {analysisId && state.kind === 'failed' ? (
        <div className="notice notice-warning" role="status">
          <strong>{t('failedRunHasNoEvidenceStatus')}</strong>
          <p>{t('failedRunNoResult')}</p>
        </div>
      ) : null}
      {analysisId && state.kind === 'blocked' ? <p className="notice notice-neutral">{t('resultBlocked')}</p> : null}
      {analysisId && state.kind === 'timedOut' ? <p className="notice notice-neutral">{t('resultTimedOut')}</p> : null}
      {analysisId && state.kind === 'complete' ? (
        <LoadedAnalysisResult result={state.result} locale={locale} previewStatus={previewStatus} />
      ) : null}
    </section>
  );
}

function LoadedAnalysisResult({
  result,
  locale,
  previewStatus
}: {
  result: import('@/lib/api/client').AnalysisResult;
  locale: string;
  previewStatus: PreviewOverlayStatus;
}) {
  const t = useTranslations('workspace');
  const errors = useTranslations('errors');
  const coverage = result.effective_coverage;
  const statistics = result.statistics;
  const provenance = result.provenance;

  return (
    <>
      <div className={`result-preview-state notice ${previewStatus === 'ready' ? 'notice-positive' : 'notice-warning'}`} role="status">
        <div className="result-icon" aria-hidden="true">NDVI</div>
        <div>
          <h3>{t('previewHeading')}</h3>
          <p>{t(previewMessageKey(previewStatus))}</p>
        </div>
      </div>

      <section className="result-detail-section" aria-labelledby="result-coverage-heading">
        <h3 id="result-coverage-heading">{t('coverageHeading')}</h3>
        <dl className="result-facts">
          <Fact label={t('executionLabel')} value={t('executionSucceeded')} />
          <Fact label={t('evidenceLabel')} value={evidenceLabel(result.evidence_status, t)} />
          <Fact
            label={t('selectedAcquisition')}
            value={coverage.acquisition_date ? formatGregorianDate(coverage.acquisition_date, locale) : t('noSelectedAcquisition')}
          />
          <Fact
            label={t('validCoverage')}
            value={coverage.valid_coverage_fraction === null ? t('coverageUnavailable') : formatPercent(coverage.valid_coverage_fraction, locale)}
          />
          <Fact
            label={t('coverageGuard')}
            value={`${formatPercent(coverage.min_valid_coverage_fraction_guard, locale)} · ${t('notScientificThreshold')}`}
          />
        </dl>
      </section>

      {statistics ? (
        <section className="result-detail-section" aria-labelledby="result-statistics-heading">
          <h3 id="result-statistics-heading">{t('statisticsHeading')}</h3>
          <dl className="result-facts result-statistics">
            <Fact label={t('validObservationCount')} value={formatValue(statistics.valid_observation_count, locale, 0)} />
            <Fact label={t('validArea')} value={`${formatValue(statistics.valid_area_m2 / 1_000_000, locale)} ${t('areaUnit')}`} />
            <Fact label={t('ndviMean')} value={formatNullableValue(statistics.ndvi_mean, locale, t)} />
            <Fact label={t('ndviMedian')} value={formatNullableValue(statistics.ndvi_median, locale, t)} />
            <Fact label={t('ndviRange')} value={`${formatNullableValue(statistics.ndvi_min, locale, t)} – ${formatNullableValue(statistics.ndvi_max, locale, t)}`} />
            <Fact label={t('ndviPercentiles')} value={`${formatNullableValue(statistics.ndvi_p05, locale, t)} – ${formatNullableValue(statistics.ndvi_p95, locale, t)}`} />
            <Fact label={t('maskedFraction')} value={formatPercent(statistics.masked_fraction, locale)} />
          </dl>
        </section>
      ) : (
        <p className="subtle-copy">{t('statisticsUnavailable')}</p>
      )}

      {(result.scenes_evaluated?.length ?? 0) > 0 ? (
        <section className="result-detail-section" aria-labelledby="result-scenes-heading">
          <h3 id="result-scenes-heading">{t('evaluatedDates')}</h3>
          <ul className="scene-list">
            {result.scenes_evaluated?.map((scene) => (
              <li key={`${scene.acquisition_date}:${scene.item_ids?.join('|') ?? ''}`}>
                <bdi dir="ltr">{scene.acquisition_date}</bdi>
                <span>{scene.valid_coverage_fraction === null ? t('notReturned') : formatPercent(scene.valid_coverage_fraction, locale)}</span>
                <span>
                  {scene.selected
                    ? t('selectedDate')
                    : scene.rejection_reason === null || scene.rejection_reason === undefined
                      ? t('notSelectedDate')
                      : errors(reasonMessageKey(scene.rejection_reason))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(result.limitations?.length ?? 0) > 0 ? (
        <section className="result-detail-section" aria-labelledby="result-limitations-heading">
          <h3 id="result-limitations-heading">{t('limitationsHeading')}</h3>
          <ul className="scene-list">
            {result.limitations?.map((limitation, index) => (
              <li key={`${limitationCode(limitation) ?? 'unknown'}-${index}`}>
                <span>{errors(limitationMessageKey(limitationCode(limitation)))}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {provenance ? (
        <section className="result-detail-section" aria-labelledby="result-provenance-heading">
          <h3 id="result-provenance-heading">{t('provenanceHeading')}</h3>
          <dl className="result-facts">
            <Fact label={t('schemaVersion')} value={<bdi dir="ltr">{result.schema_version}</bdi>} />
            <Fact label={t('pipelineVersion')} value={<bdi dir="ltr">{result.pipeline_version}</bdi>} />
            <Fact label={t('methodVersion')} value={<bdi dir="ltr">{result.method_version}</bdi>} />
            <Fact label={t('sourceIdentifier')} value={<bdi dir="ltr">{provenance.source_id}</bdi>} />
            <Fact label={t('sourceLabel')} value={<bdi dir="auto">{provenance.provider}</bdi>} />
            <Fact label={t('collectionLabel')} value={<bdi dir="auto">{provenance.collection}</bdi>} />
            <Fact label={t('itemIds')} value={<span className="bidi-list">{provenance.item_ids.map((item) => <bdi key={item} dir="ltr">{item}</bdi>)}</span>} />
            <Fact label={t('acquisitionTime')} value={formatTimestamp(provenance.acquisition_datetime, locale)} />
            <Fact label={t('processingBaseline')} value={provenance.processing_baseline ?? t('notReturned')} />
            <Fact label={t('gridCrs')} value={<bdi dir="ltr">{provenance.grid_crs}</bdi>} />
            <Fact label={t('gridResolution')} value={`${formatValue(provenance.grid_resolution_m, locale)} m`} />
            <Fact label={t('gridOrigin')} value={<bdi dir="ltr">{provenance.grid_origin.map((value) => formatValue(value, 'en')).join(', ')}</bdi>} />
            <Fact label={t('scaleOffset')} value={<bdi dir="ltr">{formatValue(provenance.scale, 'en', 8)} / {formatValue(provenance.offset, 'en', 8)}</bdi>} />
            <Fact label={t('maskPolicy')} value={provenance.mask_policy} />
            <Fact label={t('maskedClasses')} value={<bdi dir="ltr">{provenance.mask_masked_classes.join(', ')}</bdi>} />
            <Fact label={t('retainedClasses')} value={<bdi dir="ltr">{provenance.mask_retained_classes.join(', ')}</bdi>} />
          </dl>
        </section>
      ) : (
        <p className="subtle-copy">{t('provenanceUnavailable')}</p>
      )}
    </>
  );
}

function Fact({label, value}: {label: string; value: React.ReactNode}) {
  return <div className="result-fact"><dt>{label}</dt><dd>{value}</dd></div>;
}

type PreviewMessageKey =
  | 'previewReady'
  | 'previewLoading'
  | 'previewNotReady'
  | 'previewNotReadyFailed'
  | 'previewFetchFailed'
  | 'previewDecodeFailed'
  | 'previewCrsUnsupported'
  | 'previewNoArtifact'
  | 'previewArtifactNotReady'
  | 'previewUrlUnavailable'
  | 'previewResultUnavailable'
  | 'previewNotConfigured';

function previewMessageKey(status: PreviewOverlayStatus): PreviewMessageKey {
  switch (status) {
    case 'ready':
      return 'previewReady';
    case 'loading':
      return 'previewLoading';
    case 'notReady':
      return 'previewNotReady';
    case 'notReadyFailed':
      return 'previewNotReadyFailed';
    case 'fetchFailed':
      return 'previewFetchFailed';
    case 'decodeFailed':
      return 'previewDecodeFailed';
    case 'crsUnsupported':
      return 'previewCrsUnsupported';
    case 'artifactNotReady':
      return 'previewArtifactNotReady';
    case 'urlUnavailable':
      return 'previewUrlUnavailable';
    case 'resultUnavailable':
      return 'previewResultUnavailable';
    case 'notConfigured':
      return 'previewNotConfigured';
    case 'noArtifact':
    case 'idle':
    default:
      return 'previewNoArtifact';
  }
}

function evidenceLabel(status: string, t: ReturnType<typeof useTranslations<'workspace'>>): string {
  if (status === 'NOT_ASSESSED') return t('evidenceNotAssessed');
  if (status === 'INSUFFICIENT') return t('evidenceInsufficient');
  if (status === 'SUFFICIENT' || status === 'LIMITED') return t('unsupportedEvidenceStatus', {status});
  return t('unknownEvidenceStatus');
}

function formatNullableValue(value: number | null, locale: string, t: ReturnType<typeof useTranslations<'workspace'>>): string {
  return value === null ? t('notReturned') : formatValue(value, locale);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function limitationCode(value: unknown): string | null {
  if (!isRecord(value) || typeof value.code !== 'string') return null;
  return value.code;
}
