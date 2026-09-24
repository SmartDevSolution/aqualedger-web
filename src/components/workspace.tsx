'use client';

import dynamic from 'next/dynamic';
import {useLocale, useTranslations} from 'next-intl';
import {useEffect, useState} from 'react';
import {formatNumber} from '@/lib/format';
import {parseAoiGeoJson, validateAnalysisInput, type AoiPolygon, type InputProblem} from '@/lib/analysis-input';
import {emptyWorkspaceDraft, readWorkspaceDraft, writeWorkspaceDraft, type WorkspaceDraft} from '@/lib/workspace-draft';

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
  const t = useTranslations('workspace');
  const errorText = useTranslations('errors');
  const [draft, setDraft] = useState<WorkspaceDraft>(emptyWorkspaceDraft);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [coordinateText, setCoordinateText] = useState('');
  const [inputProblem, setInputProblem] = useState<InputProblem | null>(null);
  const [actionNotice, setActionNotice] = useState(false);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

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

  const validation = validateAnalysisInput(draft.aoi, draft.startDate, draft.endDate);
  const areaText = validation.areaKm2 === null ? null : formatNumber(validation.areaKm2, locale);

  function updateDraft(nextDraft: WorkspaceDraft) {
    setDraft(nextDraft);
    if (draftLoaded) {
      setDraftStorageFailed(!writeWorkspaceDraft(nextDraft));
    }
    setActionNotice(false);
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

  function runAnalysis() {
    setActionNotice(true);
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
              <button type="button" className="button button-secondary" onClick={() => setDrawingEnabled(true)} disabled={mapStatus !== 'ready'}>
                {t('drawArea')}
              </button>
            ) : (
              <button type="button" className="button button-secondary" onClick={() => setAoi(null)}>
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
                onChange={(event) => updateDraft({...draft, endDate: event.target.value})}
                aria-describedby="date-help"
              />
            </div>
          </div>
          <p id="date-help" className="field-help">{t('dateHelp')}</p>

          {problem ? <p className="notice notice-warning validation-message" role="status">{errorText(problem)}</p> : null}
          {actionNotice ? <p className="notice notice-neutral" role="status">{t('runUnavailable')}</p> : null}

          <button type="button" className="button button-primary run-button" disabled={!validation.valid} onClick={runAnalysis}>
            {t('runAnalysis')}
          </button>

          <section className="stage-card" aria-labelledby="stage-heading">
            <p className="eyebrow">03</p>
            <h3 id="stage-heading">{t('analysisStageHeading')}</h3>
            <p className="stage-state"><span className="status-dot" aria-hidden="true" />{analysisId ? t('savedStatusPending') : t('notSubmitted')}</p>
            <p className="subtle-copy">{analysisId ? t('savedStatusPending') : t('notSubmittedDetail')}</p>
            {analysisId ? <p className="id-line">{t('routeAnalysisId')}: <bdi dir="ltr">{analysisId}</bdi></p> : null}
          </section>

          <p className="science-disclosure">{t('workspaceDisclosure')}</p>
        </section>
      </div>

      <section className="panel result-panel" aria-labelledby="result-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">04</p>
            <h2 id="result-heading">{t('resultHeading')}</h2>
          </div>
          {analysisId ? <bdi className="result-id" dir="ltr">{analysisId}</bdi> : null}
        </div>
        <div className="result-empty-state">
          <div className="result-icon" aria-hidden="true">NDVI</div>
          <div>
            <h3>{t('previewUnavailable')}</h3>
            <p>{analysisId ? t('savedResultPending') : t('noResult')}</p>
          </div>
        </div>
        <div className="result-facts">
          <p>{t('ndviLegendUnavailable')}</p>
          <p>{t('provenanceUnavailable')}</p>
        </div>
      </section>
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
