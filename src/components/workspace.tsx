'use client';

import dynamic from 'next/dynamic';
import {useLocale, useTranslations} from 'next-intl';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useRouter} from '@/i18n/navigation';
import {createAnalysis, type ApiFailure} from '@/lib/api/client';
import {clearIdempotencyKey, getIdempotencyKey} from '@/lib/api/idempotency';
import {useAnalysisRun} from '@/lib/api/use-analysis-run';
import {formatNumber} from '@/lib/format';
import {parseAoiGeoJson, validateAnalysisInput, type AoiPolygon, type InputProblem} from '@/lib/analysis-input';
import {emptyWorkspaceDraft, readWorkspaceDraft, writeWorkspaceDraft, type WorkspaceDraft} from '@/lib/workspace-draft';
import type {PreviewOverlayRequest, PreviewOverlayStatus} from '@/lib/preview/geotiff-overlay';
import {AnalysisResultPanel} from './analysis-result-panel';
import {useResultIdentity} from '@/lib/api/use-result-identity';
import {useScenario} from '@/lib/api/use-scenario';
import {patchUrlState, useWorkspaceUrlState} from '@/lib/url-state';
import {buildScoredResultView, isPolygonal, rankGroupStep, type ScoredResultView} from '@/lib/zone-model';
import type {ZoneLayerRequest} from './workspace-map';
import {AnalysisStagePanel} from './analysis-stage-panel';
import {HistoryDrawer} from './history-drawer';
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
  const historyText = useTranslations('history');
  const [draft, setDraft] = useState<WorkspaceDraft>(emptyWorkspaceDraft);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [coordinateText, setCoordinateText] = useState('');
  const [inputProblem, setInputProblem] = useState<InputProblem | null>(null);
  const [submitFailure, setSubmitFailure] = useState<ApiFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [previewStatus, setPreviewStatus] = useState<PreviewOverlayStatus>('idle');
  const submitController = useRef<AbortController | null>(null);
  const {state: runState, retry: retryStatus} = useAnalysisRun(analysisId);
  const urlState = useWorkspaceUrlState();

  // ONE in-memory scored result per route id (A25/A39): the map, panel, chart and card all read
  // this view. It is built from the committed result of THIS id only and is keyed by
  // (analysis_id, result_sha256); form state (`draft`) is never an input to it.
  const scoredView = useMemo<ScoredResultView | null>(() => {
    if (!analysisId || runState.kind !== 'complete') return null;
    return buildScoredResultView(runState.result, analysisId);
  }, [analysisId, runState]);
  const identity = useResultIdentity(scoredView);
  const selectedZoneId = scoredView && urlState.zone && scoredView.zones.some((zone) => zone.zoneId === urlState.zone)
    ? urlState.zone
    : null;
  const cardOpen = scoredView !== null && urlState.card;
  const scenarioOpen = urlState.scenario;
  const committedResultSha256 = runState.kind === 'complete'
    ? runState.result.result_identity?.result_sha256 ?? null
    : null;
  const scenarioState = useScenario(analysisId, committedResultSha256);
  const selectZone = useCallback((zoneId: string) => patchUrlState({zone: zoneId}), []);
  const toggleCard = useCallback(() => patchUrlState({panel: urlState.card ? null : 'card'}), [urlState.card]);
  const toggleScenario = useCallback(() => patchUrlState({scenario: urlState.scenario ? null : '1'}), [urlState.scenario]);
  const closeHistory = useCallback(() => patchUrlState({history: null}), []);

  const zoneLayer = useMemo<ZoneLayerRequest | null>(() => {
    if (!scoredView) return null;
    const zones = scoredView.zones.flatMap((zone) => zone.geometry && isPolygonal(zone.geometry)
      ? [{zoneId: zone.zoneId, geometry: zone.geometry, ranked: zone.ranked, fill: rankGroupStep(zone.rankGroup).fill}]
      : []);
    return {key: `${scoredView.analysisId}|${scoredView.resultSha256}`, zones};
  }, [scoredView]);

  // DP-4 P1: the map renders the NDVI preview only for a committed result, and only when the
  // result actually carries a ready, georeferenced ndvi_preview artifact — never on a partial or
  // in-flight run, and never a fabricated layer when the artifact is absent. Memoized on
  // `runState` (stable across unrelated Workspace re-renders, e.g. `previewStatus` updates) rather
  // than rebuilt as a fresh object every render: a fresh identity on each render would retrigger
  // WorkspaceMap's `[previewOverlay, status]` effect on every one of its own status callbacks,
  // tearing down and refetching the overlay in an unbounded loop instead of settling once ready.
  const previewOverlay = useMemo<PreviewOverlayRequest | null>(() => {
    if (runState.kind !== 'complete') {
      return null;
    }
    const artifact = runState.result.artifacts?.find((candidate) => candidate.kind === 'ndvi_preview');
    if (!artifact?.ready || !artifact.bounds) {
      return null;
    }
    return {analysisId: runState.result.analysis_id, bounds: artifact.bounds, crs: artifact.crs};
  }, [runState]);
  // A committed result's own artifact record is enough to tell "no ndvi_preview artifact at all"
  // apart from "the artifact exists but isn't ready yet" without calling the preview route (which
  // would otherwise be the only place that distinction is made) or fetching/rendering unready
  // bytes. `artifact.ready === false` is the only case the not-ready presentation covers; a ready
  // artifact missing `bounds` (not a real backend shape) falls back to the prior "absent" reading.
  const committedPreviewArtifact = runState.kind === 'complete'
    ? runState.result.artifacts?.find((candidate) => candidate.kind === 'ndvi_preview') ?? null
    : null;
  const previewArtifactUnready = runState.kind === 'complete' && previewOverlay === null && committedPreviewArtifact?.ready === false;
  const previewArtifactAbsent = runState.kind === 'complete' && previewOverlay === null && !previewArtifactUnready;
  const effectivePreviewStatus: PreviewOverlayStatus = previewArtifactUnready
    ? 'artifactNotReady'
    : previewArtifactAbsent
      ? 'noArtifact'
      : previewStatus;

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
        <button
          type="button"
          className="button button-secondary history-toggle"
          aria-expanded={urlState.history}
          aria-controls="history-drawer"
          onClick={() => patchUrlState({history: urlState.history ? null : '1'})}
        >
          {historyText('toggleOpen')}
        </button>
      </header>

      {draftLoaded && draftStorageFailed ? <p className="notice notice-warning" role="alert">{errorText('draftStorageUnavailable')}</p> : null}

      <div className="workspace-grid">
        <section className="panel input-panel" aria-labelledby="aoi-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">01</p>
              <h2 id="aoi-heading">{t('mapHeading')}</h2>
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
          <div className="panel-heading input-dates-heading">
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
                dir="ltr"
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
                dir="ltr"
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

        <section className="panel map-panel" aria-labelledby="map-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">03</p>
              <h2 id="map-heading">{t('mapHeading')}</h2>
            </div>
          </div>
          <div className="map-frame" aria-label={t('mapHeading')}>
            <WorkspaceMap
              geometry={draft.aoi}
              drawingEnabled={drawingEnabled}
              onGeometryChange={setAoi}
              onDrawingFinished={() => setDrawingEnabled(false)}
              onStatusChange={setMapStatus}
              previewOverlay={previewOverlay}
              onPreviewOverlayStatusChange={setPreviewStatus}
              zoneLayer={zoneLayer}
              selectedZoneId={selectedZoneId}
              onZoneSelect={selectZone}
            />
          </div>
          <p className="map-attribution">{t('mapAttribution')}</p>
        </section>

      <AnalysisResultPanel
        analysisId={analysisId}
        state={runState}
        previewStatus={effectivePreviewStatus}
        scoring={{
          view: scoredView,
          selectedZoneId,
          onSelectZone: selectZone,
          identity,
          cardOpen,
          onToggleCard: toggleCard
        }}
        scenario={{
          state: scenarioState,
          resultSha256: committedResultSha256,
          open: scenarioOpen,
          onToggle: toggleScenario
        }}
      />
      </div>

      <HistoryDrawer
        open={urlState.history}
        onClose={closeHistory}
        currentAnalysisId={analysisId}
        hasDraftArea={draft.aoi !== null}
      />
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
