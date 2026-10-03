'use client';

import {useLocale, useTranslations} from 'next-intl';
import {formatGregorianDate, formatPercent, formatValue} from '@/lib/format';
import {isolate, useMissingReasonText} from '@/lib/reason-text';
import {zoneObservations, type ZoneView, type M2Observation} from '@/lib/zone-model';
import type {M3ScoredResult} from '@/lib/api/m3';

// Zone-scoped time-series / evidence view (plan §7). It reuses the M2 evidence-chart vocabulary
// already shipped in `quality-evidence-panel.tsx` (the `.evidence-chart*` rows) — no new chart
// dependency — and reads only the selected zone's observations from the committed result. Observed,
// derived and missing values are labelled separately; a missing value is "not returned", never zero.

const INDICATORS = ['NDVI', 'NDMI', 'RAINFALL', 'RADAR_CONTEXT'] as const;

export function ZoneEvidenceView({result, zone, analysisId}: {result: M3ScoredResult; zone: ZoneView; analysisId: string}) {
  const t = useTranslations('zoneEvidence');
  void analysisId;
  const observations = zoneObservations(result, zone.zoneId);

  return (
    <section className="zone-evidence" aria-labelledby="zone-evidence-heading" data-testid="zone-evidence" data-zone-id={zone.zoneId}>
      <h4 id="zone-evidence-heading" tabIndex={-1}>{t('heading', {zoneId: isolate(zone.zoneId)})}</h4>
      <p className="subtle-copy">{t('description')}</p>
      {observations.length === 0 ? <p className="subtle-copy">{t('noObservations')}</p> : INDICATORS.map((indicator) => {
        const rows = observations.filter((observation) => observation.indicator === indicator);
        return rows.length === 0 ? null : <IndicatorSeries key={indicator} indicator={indicator} rows={rows} zoneId={zone.zoneId} />;
      })}
    </section>
  );
}

function IndicatorSeries({indicator, rows, zoneId}: {indicator: (typeof INDICATORS)[number]; rows: M2Observation[]; zoneId: string}) {
  const t = useTranslations('zoneEvidence');
  const locale = useLocale();
  const missingReason = useMissingReasonText();
  const label = t(`indicator.${indicator}`);
  const numeric = rows.filter((row) => typeof row.value === 'number') as (M2Observation & {value: number})[];
  const max = numeric.reduce((largest, row) => Math.max(largest, Math.abs(row.value)), 0);

  return (
    <div className="indicator-series" data-indicator={indicator}>
      <h5>{label}</h5>
      {numeric.length > 0 ? (
        <div className="evidence-chart" role="img" aria-label={t('chartLabel', {indicator: label, zoneId: isolate(zoneId)})}>
          {rows.map((row) => {
            const hasValue = typeof row.value === 'number';
            const width = hasValue && max > 0 ? Math.max(0, Math.min(100, (Math.abs(row.value as number) / max) * 100)) : 0;
            return (
              <div className="evidence-chart-row" key={`${row.window_start}-${row.window_end}`}>
                <bdi dir="ltr" className="evidence-chart-label">{row.window_start}</bdi>
                <div className="evidence-chart-track" aria-hidden="true">
                  <span className={`evidence-chart-bar obs-${row.observation_class.toLowerCase()}`} style={{width: `${width}%`}} />
                </div>
                <span className="evidence-chart-value">
                  {hasValue ? formatValue(row.value as number, locale) : t('class.MISSING')}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      <p className="subtle-copy">{t('chartNote')}</p>
      <table className="factor-table">
        <caption>{t('tableCaption', {indicator: label, zoneId: isolate(zoneId)})}</caption>
        <thead>
          <tr>
            <th scope="col">{t('colWindow')}</th>
            <th scope="col">{t('colClass')}</th>
            <th scope="col">{t('colValue')}</th>
            <th scope="col">{t('colValid')}</th>
            <th scope="col">{t('colCount')}</th>
            <th scope="col">{t('colMissing')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.window_start}-${row.window_end}`} data-observation-class={row.observation_class}>
              <td>{t('window', {start: formatGregorianDate(row.window_start, locale), end: formatGregorianDate(row.window_end, locale)})}</td>
              <td>{t(`class.${row.observation_class}`)}</td>
              <td>
                {typeof row.value === 'number'
                  ? <bdi dir="ltr">{t('valueWithUnit', {value: formatValue(row.value, locale), unit: row.unit ?? ''}).trim()}</bdi>
                  : '—'}
              </td>
              <td>{typeof row.valid_area_fraction === 'number' ? formatPercent(row.valid_area_fraction, locale) : '—'}</td>
              <td>{formatValue(row.valid_count, locale, 0)}</td>
              <td>{row.missing_reason ? <span data-missing-reason={row.missing_reason}>{missingReason(row.missing_reason)}</span> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
