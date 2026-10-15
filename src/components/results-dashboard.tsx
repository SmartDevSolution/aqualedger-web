'use client';

import {useLocale, useTranslations} from 'next-intl';
import type {AnalysisResult} from '@/lib/api/client';
import {formatValue} from '@/lib/format';
import {WorkspaceIcon} from './workspace-icon';

/** Presentation only: no aggregation, inferred AOI area or scientific thresholds. */
export function ResultsDashboard({result, selectedZoneId}: {result: AnalysisResult | null; selectedZoneId: string | null}) {
  const d = useTranslations('dashboard');
  const locale = useLocale();
  const missing = d('unavailable');
  const mean = result?.statistics?.ndvi_mean;
  const scenes = result?.scenes_evaluated;
  const sources = result?.m2?.source_manifest;
  const observations = result?.m2?.observations ?? [];
  const zoneId = selectedZoneId ?? observations.find((observation) => observation.indicator === 'NDVI' && observation.observation_class === 'OBSERVED')?.zone_id;
  const series = observations.filter((observation) => observation.zone_id === zoneId && observation.indicator === 'NDVI' && observation.observation_class === 'OBSERVED' && observation.value != null).sort((a, b) => a.window_start.localeCompare(b.window_start));
  // Dates remain discrete observations of ONE zone. Never connect different zones,
  // interpolate monthly points or silently turn missing evidence into zero.
  const dated = series.filter((observation, index) => index === 0 || series[index - 1]?.window_start !== observation.window_start);
  const points = dated.map((observation, index) => `${24 + index / Math.max(1, dated.length - 1) * 272},${110 - ((observation.value! + 1) / 2) * 94}`).join(' ');
  return <div className="dashboard-summary" data-testid="dashboard-summary">
    <div className="metric-grid">
      <section className="metric-card"><h3><WorkspaceIcon name="leaf" />{d('ndvi')}</h3><div className={mean == null ? 'metric-unavailable' : 'metric-number'}><bdi dir="ltr">{mean == null ? missing : formatValue(mean, locale)}</bdi></div><div className="ndvi-segments" aria-hidden="true"><i /><i /><i /><i /><i /></div><p>{d('observationOnly')}</p></section>
      <section className="metric-card"><h3><WorkspaceIcon name="area" />{d('area')}</h3><div className="metric-unavailable">{missing}</div><p>{d('noArea')}</p><p>{d('noLandCover')}</p></section>
      <section className="metric-card"><h3><WorkspaceIcon name="chart" />{d('observations')}</h3><div className={scenes ? 'metric-number' : 'metric-unavailable'}><bdi>{scenes ? formatValue(scenes.length, locale, 0) : missing}</bdi></div><p>{d('dates')}</p>{scenes?.length ? <div className="date-observations">{scenes.map((scene, index) => <span key={`${scene.acquisition_date}-${index}`}>{scene.valid_coverage_fraction == null ? <span>—</span> : <i title={`${scene.valid_coverage_fraction}`} style={{height: `${scene.valid_coverage_fraction * 30}px`}} />}<bdi dir="ltr">{scene.acquisition_date}</bdi></span>)}</div> : null}</section>
      <section className="metric-card"><h3><WorkspaceIcon name="image" />{d('evidence')}</h3><div className={sources ? 'metric-number' : 'metric-unavailable'}><bdi>{sources ? formatValue(sources.length, locale, 0) : missing}</bdi></div><p>{d('sources')}</p><p>{d('noThumbnails')}</p></section>
    </div>
    <section className="trend-card"><h3><WorkspaceIcon name="chart" />{d('trend')}<span className="chart-tag">NDVI</span></h3>
      {dated.length < 2 ? <div className="trend-unavailable"><WorkspaceIcon name="chart" /><p>{d('noTrend')}</p></div> : <>
        <p>{d('series')} · <bdi>{zoneId}</bdi></p><svg className="ndvi-series" viewBox="0 0 320 140" role="img" aria-label={d('series')}>
          {[0, 1, 2].map((tick) => <g key={tick}><line x1="24" y1={16 + tick * 47} x2="296" y2={16 + tick * 47} stroke="currentColor" opacity=".16" /><text x="0" y={20 + tick * 47}>{1 - tick}</text></g>)}
          <polyline points={points} fill="none" stroke="var(--brand)" strokeWidth="2" />
          {dated.map((observation, index) => <circle key={`${observation.window_start}-${index}`} cx={24 + index / Math.max(1, dated.length - 1) * 272} cy={110 - ((observation.value! + 1) / 2) * 94} r="3" fill="var(--brand)"><title>{observation.window_start}: {observation.value}</title></circle>)}
          <text x="24" y="134">{dated[0]!.window_start}</text><text x="296" y="134" textAnchor="end">{dated[dated.length - 1]!.window_start}</text>
        </svg>
      </>}
    </section>
  </div>;
}
