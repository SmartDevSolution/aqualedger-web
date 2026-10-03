'use client';

import {useEffect, useState} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {validatePolygon, type AoiPolygon} from '@/lib/analysis-input';
import {formatGregorianDate, formatNumber, formatUtcTimestamp, formatValue} from '@/lib/format';
import {isolate, useReasonText} from '@/lib/reason-text';
import {canonicalJson, sha256Hex, shortHash} from '@/lib/api/result-hash';
import type {ResultIdentityState} from '@/lib/api/use-result-identity';
import {isPolygonal, rankGroupStep, zoneBounds, type ScoredResultView, type ZoneView} from '@/lib/zone-model';
import {buildAoiInset} from '@/lib/aoi-inset';
import {ConfounderChip, EvidenceClassBadge, familyLabel} from './zone-priority-panel';

// In-place decision card + print-ready localized view (plan §8, DR-M3-01 §8). Real text throughout
// — no canvas, no image of text — so Arabic shaping and bidi survive printing. The print header and
// footer repeat the analysis id, short result hash, method version and the committed scoring time on
// every page (`position: fixed` in @media print). Values come from the one committed result only;
// the scoring time is the backend's `computed_at`, so the same card prints the same stamp in either
// language and no clock reading is involved.
//
// DR-M3-01 §8 content projection: the identity/content fields above, the committed pipeline and
// config versions, the AOI identity with a small inset drawn from the committed geometry, sources
// with product/version/revision and represented/acquisition dates, observation counts and gaps,
// ranked zones with rank / rank_group / rank-key components / independent families, the
// evidence-quality class with C and the recovered uncalibrated label, UNRANKED zones counted and
// listed, the priority-class statement bound to the body's own status, confounder disclosures, and
// the applicable limitations. A field the committed result does not carry is stated as not
// returned; nothing is silently dropped and no source fact is invented.

type DecisionCardProps = {
  view: ScoredResultView;
  identity: ResultIdentityState;
};

export function DecisionCard({view, identity}: DecisionCardProps) {
  const t = useTranslations('decisionCard');
  const m3 = useTranslations('m3Disclosure');
  const e = useTranslations('evidenceQuality');
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
  const aoiHash = useAoiHash(aoi);
  const inset = buildAoiInset(aoi, view.zones.map((zone) => ({
    zoneId: zone.zoneId,
    ranked: zone.ranked,
    fill: rankGroupStep(zone.rankGroup).fill,
    geometry: zone.geometry
  })));
  const bounds = isPolygonal(aoi) ? zoneBounds(aoi) : null;
  const vertexCount = aoiVertexCount(aoi);

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
        <Fact label={t('pipelineVersion')} value={<bdi dir="ltr" data-testid="card-pipeline-version">{result.pipeline_version}</bdi>} />
        <Fact label={t('m2PipelineVersion')} value={<bdi dir="ltr" data-testid="card-m2-pipeline-version">{m2?.pipeline_version ?? t('notReturned')}</bdi>} />
        <Fact label={t('m2ConfigVersion')} value={<bdi dir="ltr" data-testid="card-m2-config-version">{m2?.config_version ?? t('notReturned')}</bdi>} />
        <Fact label={t('scoredAt')} value={<bdi dir="ltr">{scoredAt}</bdi>} />
      </dl>

      <section className="card-section" aria-labelledby="card-aoi">
        <h4 id="card-aoi">{t('sectionAoi')}</h4>
        <p>{t('aoiSummary', {area: areaKm2 === null ? t('notReturned') : isolate(formatNumber(areaKm2, locale)), count: String(view.zones.length)})}</p>
        <dl className="result-facts">
          <Fact label={t('aoiVertices')} value={<bdi dir="ltr" data-testid="card-aoi-vertices">{vertexCount === null ? t('notReturned') : String(vertexCount)}</bdi>} />
          <Fact label={t('aoiBounds')} value={<bdi dir="ltr" data-testid="card-aoi-bounds">{bounds === null ? t('notReturned') : bounds.map((value) => formatValue(value, 'en', 6)).join(', ')}</bdi>} />
          <Fact label={t('aoiHash')} value={<bdi dir="ltr" data-testid="card-aoi-hash">{aoiHash ?? t('notReturned')}</bdi>} />
        </dl>
        <p className="subtle-copy">{t('aoiHashNote')}</p>
        {inset ? (
          <figure className="card-inset" data-testid="card-inset">
            <svg viewBox={inset.viewBox} role="img" aria-label={t('insetLabel')} preserveAspectRatio="xMidYMid meet">
              <defs>
                <pattern id="card-inset-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="4" height="4" fill="#e9ecee" />
                  <line x1="0" y1="0" x2="0" y2="4" stroke="#8a9096" strokeWidth="1" />
                </pattern>
              </defs>
              {inset.zones.map((zone) => (
                <path
                  key={zone.zoneId}
                  className={`card-inset-zone${zone.ranked ? ' is-ranked' : ' is-unranked'}`}
                  data-zone-id={zone.zoneId}
                  d={zone.path}
                  fill={zone.ranked ? zone.fill : 'url(#card-inset-hatch)'}
                >
                  <title>{t(zone.ranked ? 'insetZoneRanked' : 'insetZoneUnranked', {zoneId: zone.zoneId})}</title>
                </path>
              ))}
              {inset.aoiPath ? <path className="card-inset-aoi" d={inset.aoiPath} data-testid="card-inset-aoi" /> : null}
            </svg>
            <figcaption className="subtle-copy">{t('insetCaption')}</figcaption>
            {inset.missingZoneIds.length > 0 ? (
              <p className="subtle-copy" data-testid="card-inset-missing">{t('insetNoGeometry', {zones: isolate(inset.missingZoneIds.join(', '))})}</p>
            ) : null}
          </figure>
        ) : <p className="subtle-copy" data-testid="card-inset-unavailable">{t('notReturned')}</p>}
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
          <ul className="reason-list card-source-list">
            {(m2?.source_manifest ?? []).map((source, index) => {
              const dates = sourceDateText(source, locale);
              const hasDetails = Boolean(source.version || source.revision || dates);
              return (
                <li key={`${source.source_id}-${index}`} data-source-id={source.source_id}>
                  {t('sourceLine', {
                    sourceId: isolate(source.source_id),
                    role: sourceRoleText(source.role, t),
                    status: sourceStatusText(source.status, t),
                    product: isolate(source.product)
                  })}
                  {hasDetails ? (
                    <>
                      {source.version ? <span className="card-source-detail">{t('sourceVersion', {version: isolate(source.version)})}</span> : null}
                      {source.revision ? <span className="card-source-detail">{t('sourceRevision', {revision: isolate(source.revision)})}</span> : null}
                      {dates ? <span className="card-source-detail">{t('sourceDates', {dates})}</span> : null}
                    </>
                  ) : <span className="card-source-detail subtle-copy">{t('sourceDetailsUnavailable')}</span>}
                </li>
              );
            })}
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
        <p className="subtle-copy" data-testid="card-evidence-quality-label">{e('uncalibratedLabel')}</p>
        {view.ranked.length === 0 ? <p className="subtle-copy">{m3('ordering')}</p> : (
          <ol className="card-zone-list">
            {view.ranked.map((zone) => <CardZone key={zone.zoneId} zone={zone} reasonText={reasonText} />)}
          </ol>
        )}
      </section>

      <section className="card-section" aria-labelledby="card-unranked">
        <h4 id="card-unranked">{t('sectionUnranked', {count: String(view.unrankedCount)})}</h4>
        {view.unrankedGroups.map((group) => (
          <ul key={group.reason ?? '_none'} className="card-zone-list" data-unranked-reason={group.reason ?? 'none'}>
            {group.zones.map((zone) => <CardZone key={zone.zoneId} zone={zone} reasonText={reasonText} />)}
          </ul>
        ))}
      </section>

      <section className="card-section" aria-labelledby="card-limitations">
        <h4 id="card-limitations">{t('sectionLimitations')}</h4>
        <ul className="reason-list">
          <PriorityClassLimitation scoring={scoring} />
          <li>{t('limitationUncalibrated')}</li>
          <li>{t('limitationEstimate')}</li>
          <li>{m3('noPriorityScore')}</li>
          <li>{t('limitationProvisionalAoi')}</li>
          <li>{t('limitationNoInBasinValidation')}</li>
          <li>{t('limitationContextOnlySources')}</li>
          <li>{t('limitationMask')}</li>
        </ul>
      </section>

      <p className="science-disclosure">{m3('cardFooter')}</p>
    </article>
  );
}

// Council condition 3, card surface: the priority-class statement is bound to the body's own
// status. Only `NOT_ESTABLISHED` may state that conclusion; an absent or unrecognized status is
// reported as such and never restated as a concluded priority class.
function PriorityClassLimitation({scoring}: {scoring: ScoredResultView['result']['scoring']}) {
  const t = useTranslations('decisionCard');
  const methodVersion = isolate(scoring.method_version);
  const status = scoring.priority_class_status;
  if (status === 'NOT_ESTABLISHED') return <li data-limitation="priority-class">{t('limitationNoClass', {methodVersion})}</li>;
  if (status === undefined || status === null) return <li data-limitation="priority-class">{t('limitationNoClassAbsent', {methodVersion})}</li>;
  return <li data-limitation="priority-class">{t('limitationNoClassUnrecognised', {methodVersion, status: isolate(status)})}</li>;
}

function CardZone({zone, reasonText}: {zone: ZoneView; reasonText: ReturnType<typeof useReasonText>}) {
  const t = useTranslations('zones');
  const locale = useLocale();
  const step = rankGroupStep(zone.rankGroup);
  const reasons = (zone.assessment.priority.reasons ?? []).slice(0, 3);
  const rankKey = zone.assessment.priority.rank_key ?? null;
  const families = zone.assessment.independent_families ?? [];
  const confounders = zone.assessment.confounders ?? [];
  const refs = zone.assessment.evidence_refs ?? [];
  return (
    <li className="card-zone" data-zone-id={zone.zoneId} data-ranked={zone.ranked}>
      <strong><bdi dir="ltr">{zone.zoneId}</bdi></strong>{' '}
      {zone.ranked ? (
        <span className="rank-chip" style={{background: step.fill, color: step.ink}}>
          {t('rankLabel', {rank: zone.rank === null ? '—' : String(zone.rank)})} · {t('rankGroupLabel', {rankGroup: zone.rankGroup === null ? '—' : String(zone.rankGroup)})}
        </span>
      ) : <span className="rank-chip rank-chip-unranked">{t('unrankedLabel')}</span>}{' '}
      <EvidenceClassBadge zone={zone} />
      <p className="zone-status-line subtle-copy">
        <span>{t('evidenceStatusLabel')}: {t(`evidenceStatus.${zone.assessment.evidence_status}`)}</span>
      </p>
      <ul className="reason-list">
        {reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reasonText(reason)}</li>)}
      </ul>

      {zone.ranked && rankKey ? (
        <div className="card-zone-detail" data-testid="card-zone-rank-key">
          <p className="subtle-copy">{t('rankKeyHeading')}</p>
          <ul className="reason-list">
            <li>{t('rankKeyFamilies', {count: String(rankKey.independent_family_count)})}</li>
            <li>{t('rankKeyPersistence', {count: String(rankKey.persistence_windows)})}</li>
            <li>{t('rankKeyRecurrence', {count: String(rankKey.recurrence_windows)})}</li>
            <li>{t('rankKeyStrength', {value: isolate(rankKey.anomaly_strength)})}</li>
            <li>{t('rankKeyTieBreak', {zoneId: isolate(rankKey.zone_id)})}</li>
          </ul>
        </div>
      ) : null}

      {zone.ranked ? (
        <div className="card-zone-detail" data-testid="card-zone-families">
          <p className="subtle-copy">{t('independentFamilies')}</p>
          {families.length === 0 ? <p className="subtle-copy">{t('noFamilies')}</p> : (
            <ul className="reason-list">
              {families.map((family, index) => (
                <li key={`${family.family}-${index}`} data-family={family.family} data-counted={family.counted}>
                  {t(family.counted ? 'familyCounted' : 'familyNotCounted', {family: familyLabel(family.family, t)})}
                  {family.source_ids.length > 1 ? <> · {t('familyCollapsed', {count: String(family.source_ids.length)})}</> : null}
                  {' · '}
                  {family.adverse_signal ? t('familyAdverse') : t('familyNoSignal')}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="card-zone-detail confounder-chips" data-testid="card-zone-confounders" aria-label={t('confoundersHeading')}>
        {confounders.length === 0 ? <p className="subtle-copy">{t('confoundersNone')}</p> : confounders.map((confounder, index) => (
          <span key={`${confounder.code}-${index}`}><ConfounderChip code={confounder.code} assessed={confounder.assessed} /></span>
        ))}
      </div>
      <p className="subtle-copy">{t('confoundersHeading')}</p>

      <div className="card-zone-detail" data-testid="card-zone-evidence-refs">
        <p className="subtle-copy">{t('evidenceRefsHeading')}</p>
        {refs.length === 0 ? <p className="subtle-copy">{t('noEvidenceRefs')}</p> : (
          <ul className="reason-list">
            {refs.map((ref, index) => (
              <li key={`${ref.source_id}-${index}`} data-source-id={ref.source_id}>
                {t('evidenceRef', {
                  sourceId: isolate(ref.source_id),
                  family: familyLabel(ref.family, t),
                  product: isolate(ref.product ?? '—'),
                  revision: isolate(ref.revision ?? '—')
                })}
                {ref.dates && ref.dates.length > 0
                  ? <> · {t('evidenceRefDates', {dates: ref.dates.map((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatGregorianDate(date, locale) : date).join(', ')})}</>
                  : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function Fact({label, value}: {label: string; value: React.ReactNode}) {
  return <div className="result-fact"><dt>{label}</dt><dd>{value}</dd></div>;
}

type SourceRole = 'TEMPORAL' | 'STATIC' | 'MASK';
type SourceEvidenceStatus = 'NOT_RUN' | 'READ' | 'EMPTY' | 'BLOCKED' | 'FAILED';

// The pinned M2 `SourceEvidence` vocabularies (models/m2.py: SourceEvidence.role Literal,
// SourceEvidenceStatus). Known values render through the catalogs in both locales; an unknown
// value is explained in the reader's language and carries the raw code only as an additional
// isolated diagnostic — never as the sole label.
function sourceRoleText(role: string, t: ReturnType<typeof useTranslations<'decisionCard'>>): string {
  if (role === 'TEMPORAL' || role === 'STATIC' || role === 'MASK') return t(`sourceRole.${role as SourceRole}`);
  return t('sourceRole._unknown', {code: isolate(role)});
}

function sourceStatusText(status: string, t: ReturnType<typeof useTranslations<'decisionCard'>>): string {
  if (status === 'NOT_RUN' || status === 'READ' || status === 'EMPTY' || status === 'BLOCKED' || status === 'FAILED') {
    return t(`sourceStatus.${status as SourceEvidenceStatus}`);
  }
  return t('sourceStatus._unknown', {code: isolate(status)});
}

function sourceDateText(source: {represented_date?: string | null; acquisition_date?: string | null}, locale: string): string | null {
  const dates = [source.represented_date, source.acquisition_date].filter((date): date is string => typeof date === 'string');
  const unique = [...new Set(dates)];
  return unique.length === 0 ? null : unique.map((date) => isolate(formatGregorianDate(date, locale))).join(', ');
}

/** Number of AOI vertices excluding the repeated closing position; null when no polygon is committed. */
function aoiVertexCount(aoi: AoiPolygon): number | null {
  const outerRing = aoi.coordinates[0];
  if (!Array.isArray(outerRing) || outerRing.length < 2) return null;
  return outerRing.length - 1;
}

/**
 * The committed result carries no AOI hash of its own (the contract's `AnalysisResult.request` has
 * the polygon only; `aoi_sha256` exists on the history row), so the card shows a hash re-derived in
 * this browser from the committed polygon — labelled as re-derived, never presented as the
 * backend's value. This follows the same rule as the result-hash verifier: the backend stays the
 * authority for the values it does publish, and a locally derived value is named as such.
 */
function useAoiHash(aoi: AoiPolygon): string | null {
  const [hash, setHash] = useState<string | null>(null);
  const text = canonicalJson(aoi as unknown as Record<string, unknown>);
  useEffect(() => {
    let active = true;
    void sha256Hex(text).then((value) => {
      if (active) setHash(value === null ? null : shortHash(value));
    });
    return () => {
      active = false;
    };
  }, [text]);
  return hash;
}
