'use client';

import dynamic from 'next/dynamic';
import {useLocale, useTranslations} from 'next-intl';
import {useEffect, useRef, useState} from 'react';
import {useRouter} from '@/i18n/navigation';
import {createAnalysis, type ApiFailure} from '@/lib/api/client';
import {clearIdempotencyKey, getIdempotencyKey} from '@/lib/api/idempotency';
import {useAnalysisRun} from '@/lib/api/use-analysis-run';
import {formatNumber} from '@/lib/format';
import {parseAoiGeoJson, validateAnalysisInput, type AoiPolygon, type InputProblem} from '@/lib/analysis-input';
import {emptyWorkspaceDraft, readWorkspaceDraft, writeWorkspaceDraft, type WorkspaceDraft} from '@/lib/workspace-draft';
import {AnalysisResultPanel} from './analysis-result-panel';
import {AnalysisStagePanel} from './analysis-stage-panel';
import {BackendErrorNotice} from './backend-error-notice';

type WorkspaceProps = {
  analysisId?: string;
};

function MapLoadingState() {
  const t = useTranslations('workspace');
  return <div className="map-state map-state-loading" role="status">{t('mapLoading')}</div>;
}

const WorkspaceMap = dynamic(() => import('./workspace-map'), {ssr: false, loading: MapLoadingState});

export function Workspace({analysisId}: WorkspaceProps) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('workspace');
  const errorText = useTranslations('errors');
  const [draft, setDraft] = useState<WorkspaceDraft>(emptyWorkspaceDraft);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [coordinateText, setCoordinateText] = useState('');
  const [inputProblem, setInputProblem] = useState<InputProblem | null>(null);
  const [submitFailure, setSubmitFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const submitController = useRef<AbortController | null>(null);
  const {state: runState, retry: retryStatus} = useAnalysisRun(analysisId);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) {
        return;
      }
      const restored = readWorkspaceDraft();
      setDraft(restored);
      setCoordinateText(restored.aoiText);
      setDraftLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => submitController.current?.abort(), []);

  const validation = validateAnalysisInput(draft.aoi, draft.startDate, draft.endDate);
  const areaText = validation.areaKm2 === null ? null : formatNumber(validation.areaKm2, locale);

  function updateDraft(nextDraft: WorkspaceDraft) {
    setDraft(nextDraft);
    if (draftLoaded) {
      setDraftStorageFailed(!writeWorkspaceDraft(nextDraft));
    }
    setSubmitFailure(null);
  }

  function setAoi(aoi: AoiPolygon | null) {
    const aoiText = aoi ? JSON.stringify({type: 'Polygon', coordinates: aoi.coordinates}, null, 2) : '';
    setCoordinateText(aoiText);
    updateDraft({...draft, aoi, aoiText});
    setInputProblem(null);
    setDrawingEnabled(false);
  }

  function useCoordinateText() {
    try {
      const aoi = parseAoiGeoJson(coordinateText);
      const aoiText = JSON.stringify({type: 'Polygon', coordinates: aoi.coordinates}, null, 2);
      setCoordinateText(aoiText);
      updateDraft({...draft, aoi, aoiText});
      setInputProblem(null);
    } catch (error) {
      setInputProblem(problemFromError(error));
    }
  }

  async function runAnalysis() {
    if (!draft.aoi || !validation.valid) return;
    setSubmitFailure(null);

    const request = {
      aoi_geojson: draft.aoi,
      start_date: draft.startDate,
      end_date: draft.endDate,
      locale
    };
    const idempotencyKey = getIdempotencyKey(request);
    if (!idempotencyKey) {
      setSubmitFailure({code: 'IDEMPOTENCY_KEY_UNAVAILABLE', requestId: null, httpStatus: null, retryable: false});
      return;
    }

    const controller = new AbortController();
    submitController.current = controller;
    setSubmitting(true);
    const response = await createAnalysis(request, idempotencyKey, controller.signal);
    if (controller.signal.aborted) return;
    setSubmitting(false);
    submitController.current = null;
    if (response.error) {
      setSubmitFailure(response.error);
      if (!response.error.retryable) clearIdempotencyKey();
      return;
    }

    clearIdempotencyKey();
    router.push(`/analysis/${response.data.analysis_id}`);
  }

  const problem = inputProblem ?? validation.problem;

  return (
    <main className="page-content workspace-page">
      <header className="page-heading">
        <p className="eyebrow"><bdi dir="ltr">AquaLedger</bdi> · {t('title')}</p>
        <h1>{t('title')}</h1>
        <p className="page-intro">{t('intro')}</p>
      </header>

      {draftLoaded && draftStorageFailed ? <p className="notice notice-warning" role="alert">{errorText('draftStorageUnavailable')}</p> : null}

      <div className="workspace-grid">
        <section className="panel map-panel" aria-labelledby="map-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">01</p>
              <h2 id="map-heading">{t('mapHeading')}</h2>
            </div>
            <span className="panel-step">{draft.aoi ? t('areaDrawn') : t('noArea')}</span>
          </div>
          <p className="section-copy">{t('mapDescription')}</p>

          <div className="map-tools">
            {!draft.aoi ? (
              <button type="button" className="button button-secondary" onClick={() => setDrawingEnabled(true)} disabled={mapStatus !== 'ready' || submitting}>
                {t('drawArea')}
              </button>
            ) : (
              <button type="button" className="button button-secondary" onClick={() => setAoi(null)} disabled={submitting}>
                {t('clearArea')}
              </button>
            )}
            {drawingEnabled ? <span className="map-tool-help">{t('drawingHelp')}</span> : null}
          </div>

          <div className="map-frame" aria-label={t('mapHeading')}>
            <WorkspaceMap
              geometry={draft.aoi}
              drawingEnabled={drawingEnabled}
              onGeometryChange={setAoi}
              onDrawingFinished={() => setDrawingEnabled(false)}
              onStatusChange={setMapStatus}
            />
          </div>
          <p className="map-attribution">{t('mapAttribution')}</p>

          <details className="coordinate-entry">
            <summary>{t('coordinateEntry')}</summary>
            <p>{t('coordinateInstructions')}</p>
            <label htmlFor="aoi-geojson">{t('coordinateText')}</label>
            <textarea
              id="aoi-geojson"
              dir="ltr"
              spellCheck={false}
              disabled={submitting}
              value={coordinateText}
              onChange={(event) => {
                setCoordinateText(event.target.value);
                updateDraft({...draft, aoiText: event.target.value});
                setInputProblem(null);
              }}
              rows={5}
            />
            <button type="button" className="button button-tertiary" onClick={useCoordinateText}>
              {t('loadPolygon')}
            </button>
          </details>
          {draft.aoi && areaText ? <p className="area-summary">{t('areaSummary')}: <bdi dir="ltr">{areaText} {t('areaUnit')}</bdi></p> : null}
        </section>

        <section className="panel input-panel" aria-labelledby="dates-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">02</p>
              <h2 id="dates-heading">{t('datesHeading')}</h2>
            </div>
          </div>

          <div className="field-stack">
            <div className="field-group">
              <label htmlFor="start-date">{t('startDate')}</label>
              <input
                id="start-date"
                type="date"
                lang="en"
                value={draft.startDate}
                disabled={submitting}
                onChange={(event) => updateDraft({...draft, startDate: event.target.value})}
                aria-describedby="date-help"
              />
            </div>
            <div className="field-group">
              <label htmlFor="end-date">{t('endDate')}</label>
              <input
                id="end-date"
                type="date"
                lang="en"
                value={draft.endDate}
                disabled={submitting}
                onChange={(event) => updateDraft({...draft, endDate: event.target.value})}
                aria-describedby="date-help"
              />
            </div>
          </div>
          <p id="date-help" className="field-help">{t('dateHelp')}</p>

          {problem ? <p className="notice notice-warning validation-message" role="status">{errorText(problem)}</p> : null}
          <button type="button" className="button button-primary run-button" disabled={!validation.valid || submitting} onClick={runAnalysis}>
            {submitting ? t('submittingAnalysis') : t('runAnalysis')}
          </button>
          {submitFailure ? <BackendErrorNotice failure={submitFailure} /> : null}

          <AnalysisStagePanel analysisId={analysisId} state={runState} submitFailure={null} onRetry={retryStatus} />

          <p className="science-disclosure">{t('workspaceDisclosure')}</p>
        </section>
      </div>

      <AnalysisResultPanel analysisId={analysisId} state={runState} />
    </main>
  );
}

function problemFromError(error: unknown): InputProblem {
  const message = error instanceof Error ? error.message : '';
  const problems: InputProblem[] = [
    'invalidGeoJson', 'unsupportedGeometry', 'invalidCoordinates', 'invalidPolygon',
    'antimeridianUnsupported', 'tooManyVertices', 'areaTooLarge', 'dateMissing',
    'dateInvalid', 'dateOrder', 'dateFuture', 'dateSpanTooLong'
  ];
  return problems.find((problem) => problem === message) ?? 'invalidGeoJson';
}
