'use client';

import {useLocale, useTranslations} from 'next-intl';
import {validatePolygon, type AoiPolygon} from '@/lib/analysis-input';
import {formatGregorianDate, formatNumber, formatUtcTimestamp} from '@/lib/format';
import {isolate, useReasonText} from '@/lib/reason-text';
import {shortHash} from '@/lib/api/result-hash';
import type {ResultIdentityState} from '@/lib/api/use-result-identity';
import {rankGroupStep, type ScoredResultView, type ZoneView} from '@/lib/zone-model';
import {EvidenceClassBadge} from './zone-priority-panel';

// In-place decision card + print-ready localized view (plan §8). Real text throughout — no canvas,
// no image of text — so Arabic shaping and bidi survive printing. The print header and footer
// repeat the analysis id, short result hash, method version and the committed scoring time on every
// page (`position: fixed` in @media print). Values come from the one committed result only; the
// scoring time is the backend's `computed_at`, so the same card prints the same stamp in either
// language and no clock reading is involved.

type DecisionCardProps = {
  view: ScoredResultView;
  identity: ResultIdentityState;
};

export function DecisionCard({view, identity}: DecisionCardProps) {
  const t = useTranslations('decisionCard');
  const m3 = useTranslations('m3Disclosure');
  const printT = useTranslations('print');
  const locale = useLocale();
  const reasonText = useReasonText(view.analysisId);
  const {result} = view;
  const scoring = result.scoring;
  const m2 = result.m2 ?? null;
  const scoredAt = scoring.computed_at ? t('utc', {timestamp: formatUtcTimestamp(scoring.computed_at, locale)}) : t('notReturned');
  const shortSha = shortHash(view.resultSha256);
  const aoi = result.request.aoi_geojson as unknown as AoiPolygon;
  const areaKm2 = validatePolygon(aoi).areaKm2;
  const counts = {observed: 0, derived: 0, missing: 0};
  for (const observation of m2?.observations ?? []) {
    if (observation.observation_class === 'OBSERVED') counts.observed += 1;
    else if (observation.observation_class === 'DERIVED') counts.derived += 1;
    else counts.missing += 1;
  }
  const baseline = m2?.baseline ?? null;
  const rankedHeading = t('sectionRanked');

  return (
    <article id="decision-card" className="decision-card" aria-labelledby="decision-card-heading" data-testid="decision-card"
      data-card-id={identity.cardId ?? ''} data-result-sha256={view.resultSha256}>
      <header className="print-header" aria-hidden="true">
        <span>{printT('header', {analysisId: isolate(view.analysisId)})}</span>
      </header>
      <footer className="print-footer" aria-hidden="true">
        <span>{printT('footer', {resultSha256: isolate(shortSha), methodVersion: isolate(scoring.method_version), timestamp: scoredAt})}</span>
      </footer>

      <div className="section-heading-with-note card-heading">
        <h3 id="decision-card-heading">{t('title')}</h3>
        <button type="button" className="button button-primary no-print" onClick={() => window.print()}>{t('print')}</button>
      </div>
      <p className="subtle-copy no-print">{t('printNote')}</p>
      <p className="notice notice-neutral" data-testid="card-guardrail">{m3('cardFooter')}</p>

      <dl className="result-facts card-identity">
        <Fact label={t('analysisId')} value={<bdi dir="ltr" data-testid="card-analysis-id">{view.analysisId}</bdi>} />
        <Fact label={t('resultHash')} value={<bdi dir="ltr" title={view.resultSha256} data-testid="card-result-sha256">{shortSha}</bdi>} />
        <Fact label={t('cardId')} value={<bdi dir="ltr" data-testid="card-id">{identity.cardId ?? '—'}</bdi>} />
        <Fact label={t('method')} value={<bdi dir="ltr">{scoring.method_version}</bdi>} />
        <Fact label={t('operationalization')} value={<bdi dir="ltr">{scoring.operationalization_version}</bdi>} />
        <Fact label={t('scorecardSource')} value={<bdi dir="ltr">{shortHash(scoring.scorecard_source_sha256)}</bdi>} />
        <Fact label={t('scoredAt')} value={<bdi dir="ltr">{scoredAt}</bdi>} />
      </dl>

      <section className="card-section" aria-labelledby="card-aoi">
        <h4 id="card-aoi">{t('sectionAoi')}</h4>
        <p>{t('aoiSummary', {area: areaKm2 === null ? t('notReturned') : isolate(formatNumber(areaKm2, locale)), count: String(view.zones.length)})}</p>
      </section>

      <section className="card-section" aria-labelledby="card-periods">
        <h4 id="card-periods">{t('sectionPeriods')}</h4>
        <dl className="result-facts">
          <Fact label={t('requestedPeriod')} value={`${formatGregorianDate(result.request.start_date, locale)} – ${formatGregorianDate(result.request.end_date, locale)}`} />
          <Fact
            label={t('baselinePeriod')}
            value={baseline?.reference_start && baseline.reference_end
              ? `${formatGregorianDate(baseline.reference_start, locale)} – ${formatGregorianDate(baseline.reference_end, locale)}`
              : t('notReturned')}
          />
        </dl>
      </section>

      <section className="card-section" aria-labelledby="card-sources">
        <h4 id="card-sources">{t('sectionSources')}</h4>
        {(m2?.source_manifest ?? []).length === 0 ? <p className="subtle-copy">{t('noSources')}</p> : (
          <ul className="reason-list">
            {(m2?.source_manifest ?? []).map((source, index) => (
              <li key={`${source.source_id}-${index}`}>
                {t('sourceLine', {sourceId: isolate(source.source_id), role: isolate(source.role), status: isolate(source.status), product: isolate(source.product)})}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-section" aria-labelledby="card-observations">
        <h4 id="card-observations">{t('sectionObservations')}</h4>
        <p>{t('observationCounts', {observed: String(counts.observed), derived: String(counts.derived), missing: String(counts.missing)})}</p>
        <p>{t('coverageGaps', {count: String(m2?.coverage?.length ?? 0)})}</p>
      </section>

      <section className="card-section" aria-labelledby="card-ranked">
        <h4 id="card-ranked">{rankedHeading}</h4>
        {view.ranked.length === 0 ? <p className="subtle-copy">{m3('ordering')}</p> : (
          <ol className="card-zone-list">
            {view.ranked.map((zone) => <CardZone key={zone.zoneId} zone={zone} reasonText={reasonText} />)}
          </ol>
        )}
      </section>

      <section className="card-section" aria-labelledby="card-unranked">
        <h4 id="card-unranked">{t('sectionUnranked', {count: String(view.unrankedCount)})}</h4>
        {view.unrankedGroups.map((group) => (
          <ul key={group.reason ?? '_none'} className="card-zone-list">
            {group.zones.map((zone) => <CardZone key={zone.zoneId} zone={zone} reasonText={reasonText} />)}
          </ul>
        ))}
      </section>

      <section className="card-section" aria-labelledby="card-limitations">
        <h4 id="card-limitations">{t('sectionLimitations')}</h4>
        <ul className="reason-list">
          <li>{t('limitationNoClass', {methodVersion: isolate(scoring.method_version)})}</li>
          <li>{t('limitationUncalibrated')}</li>
          <li>{t('limitationEstimate')}</li>
          <li>{m3('noPriorityScore')}</li>
        </ul>
      </section>

      <p className="science-disclosure">{m3('cardFooter')}</p>
    </article>
  );
}

function CardZone({zone, reasonText}: {zone: ZoneView; reasonText: ReturnType<typeof useReasonText>}) {
  const t = useTranslations('zones');
  const step = rankGroupStep(zone.rankGroup);
  const reasons = (zone.assessment.priority.reasons ?? []).slice(0, 3);
  return (
    <li className="card-zone" data-zone-id={zone.zoneId}>
      <strong><bdi dir="ltr">{zone.zoneId}</bdi></strong>{' '}
      {zone.ranked ? (
        <span className="rank-chip" style={{background: step.fill, color: step.ink}}>
          {t('rankLabel', {rank: zone.rank === null ? '—' : String(zone.rank)})} · {t('rankGroupLabel', {rankGroup: zone.rankGroup === null ? '—' : String(zone.rankGroup)})}
        </span>
      ) : <span className="rank-chip rank-chip-unranked">{t('unrankedLabel')}</span>}{' '}
      <EvidenceClassBadge zone={zone} />
      <ul className="reason-list">
        {reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reasonText(reason)}</li>)}
      </ul>
    </li>
  );
}

function Fact({label, value}: {label: string; value: React.ReactNode}) {
  return <div className="result-fact"><dt>{label}</dt><dd>{value}</dd></div>;
}
