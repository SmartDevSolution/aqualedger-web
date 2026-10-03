'use client';

import {useLocale, useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {formatGregorianDate} from '@/lib/format';
import {isKnownConfounderCode, isolate, useReasonText} from '@/lib/reason-text';
import {
  FACTOR_IDS,
  RANK_GROUP_STEPS,
  factorRow,
  rankGroupStep,
  type ScoredResultView,
  type ZoneView
} from '@/lib/zone-model';
import type {ResultIdentityState} from '@/lib/api/use-result-identity';
import {shortHash} from '@/lib/api/result-hash';
import {ZoneEvidenceView} from './zone-evidence-view';

// M3 zone priority / evidence panel (plan §7). Reads ONE `ScoredResultView`, built once per
// (analysis_id, result_sha256); nothing here reads form state, locale-dependent data or the clock.
//
// Two axes, never one colour ramp:
//   - order: RANKED zones in rank order, encoded by `rank_group` on a single-hue blue ramp; UNRANKED
//     zones get the neutral hatch and are grouped by their first reason;
//   - evidence quality: a separate outlined badge with its own label, always marked uncalibrated.
// The panel never shows an H/M/L priority: "priority class not established" is stated, and the
// evidence-quality class is never substituted for it.

type PanelProps = {
  view: ScoredResultView;
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  identity: ResultIdentityState;
  cardOpen: boolean;
  onToggleCard: () => void;
  hasProvenance: boolean;
};

export function ZonePriorityPanel({view, selectedZoneId, onSelectZone, identity, cardOpen, onToggleCard, hasProvenance}: PanelProps) {
  const t = useTranslations('zones');
  const card = useTranslations('decisionCard');
  const m3 = useTranslations('m3Disclosure');
  const selected = view.zones.find((zone) => zone.zoneId === selectedZoneId) ?? null;

  return (
    <section className="result-detail-section zone-panel" aria-labelledby="result-scoring-heading">
      <div className="section-heading-with-note">
        <h3 id="result-scoring-heading">{t('panelTitle')}</h3>
        <button
          type="button"
          className="button button-secondary"
          aria-expanded={cardOpen}
          aria-controls="decision-card"
          onClick={onToggleCard}
        >
          {cardOpen ? card('close') : card('open')}
        </button>
      </div>
      {view.result.scoring.priority_class_status === 'NOT_ESTABLISHED' ? (
        <p className="notice notice-neutral zone-class-banner" data-testid="priority-class-banner">
          {t('priorityClassBanner', {methodVersion: isolate(view.result.scoring.method_version)})}
        </p>
      ) : (
        // Bound to the body's own value (Council condition 3): any other or absent status is never
        // restated as "not established" and never turned into a class; only the order is shown.
        <p className="notice notice-neutral zone-class-banner" data-testid="priority-class-banner" data-status="unrecognised">
          {t('priorityClassUnrecognised', {
            methodVersion: isolate(view.result.scoring.method_version),
            status: isolate(view.result.scoring.priority_class_status ?? '—')
          })}
        </p>
      )}
      <p className="subtle-copy" data-testid="zone-guardrail">{m3('panelFooter')}</p>
      <p className="subtle-copy">{m3('ordering')}</p>
      <p className="subtle-copy">{m3('noPriorityScore')}</p>

      <dl className="result-facts">
        <div className="result-fact">
          <dt>{t('methodLabel')}</dt>
          <dd><bdi dir="ltr">{view.result.scoring.method_version}</bdi></dd>
        </div>
        <div className="result-fact" data-testid="result-identity">
          <dt>{t('resultHash')}</dt>
          <dd>
            <bdi dir="ltr" title={view.resultSha256} data-testid="result-sha256">{shortHash(view.resultSha256)}</bdi>
            {' '}
            <span className="subtle-copy">{t('identityHashCheck', {state: identityStateLabel(identity.hashCheck, t)})}</span>
          </dd>
        </div>
      </dl>

      <Legend />

      {view.zones.length === 0 ? <p className="subtle-copy">{t('noZones')}</p> : null}

      {view.zones.length > 0 ? (
        <div className="scoring-zones">
          <h4>{t('rankedHeading')}</h4>
          {view.ranked.length === 0 ? <p className="subtle-copy">{t('noRanked')}</p> : (
            <ul className="zone-list">
              {view.ranked.map((zone) => (
                <ZoneRow key={zone.zoneId} view={view} zone={zone} selected={zone.zoneId === selectedZoneId} onSelect={onSelectZone} />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {view.unrankedGroups.length > 0 ? (
        <div className="scoring-zones">
          <h4>{t('unrankedHeading')} ({view.unrankedCount})</h4>
          {view.unrankedGroups.map((group) => (
            <UnrankedGroupBlock key={group.reason ?? '_none'} view={view} reason={group.reason} zones={group.zones}
              selectedZoneId={selectedZoneId} onSelect={onSelectZone} />
          ))}
        </div>
      ) : null}

      {selected ? (
        <ZoneEvidenceView result={view.result} zone={selected} analysisId={view.analysisId} />
      ) : view.zones.length > 0 ? (
        <p className="subtle-copy" data-testid="no-zone-selected">{t('noneSelected')}</p>
      ) : null}
      {hasProvenance ? (
        <p className="subtle-copy"><a href="#result-provenance-heading">{t('provenanceLink')}</a></p>
      ) : null}
    </section>
  );
}

function identityStateLabel(state: ResultIdentityState['hashCheck'], t: ReturnType<typeof useTranslations<'zones'>>): string {
  if (state === 'match') return t('identityMatch');
  if (state === 'mismatch') return t('identityMismatch');
  if (state === 'pending') return t('identityPending');
  return t('identityUnavailable');
}

function Legend() {
  const t = useTranslations('zones');
  return (
    <div className="zone-legend" role="group" aria-label={t('legendHeading')}>
      <p className="subtle-copy">{t('legendRankGroup')}</p>
      <ul className="legend-ramp">
        {RANK_GROUP_STEPS.map((step, index) => (
          <li key={step.fill}>
            <span className="legend-swatch-box" style={{background: step.fill}} aria-hidden="true" />
            {t('legendRankGroupStep', {group: String(index + 1)})}
          </li>
        ))}
      </ul>
      <p className="subtle-copy"><span className="legend-swatch-box unranked-hatch" aria-hidden="true" /> {t('legendUnranked')}</p>
      <p className="subtle-copy">{t('legendClass')}</p>
    </div>
  );
}

function UnrankedGroupBlock({view, reason, zones, selectedZoneId, onSelect}: {
  view: ScoredResultView;
  reason: string | null;
  zones: ZoneView[];
  selectedZoneId: string | null;
  onSelect: (zoneId: string) => void;
}) {
  const t = useTranslations('zones');
  const label = unrankedGroupLabel(reason, t);
  return (
    <div className="unranked-group" data-testid="unranked-group" data-reason={reason ?? 'none'}>
      <h5>{t('unrankedGroupHeading', {reason: label, count: String(zones.length)})}</h5>
      <ul className="zone-list">
        {zones.map((zone) => (
          <ZoneRow key={zone.zoneId} view={view} zone={zone} selected={zone.zoneId === selectedZoneId} onSelect={onSelect} />
        ))}
      </ul>
    </div>
  );
}

const GROUP_KEYS = [
  'MANDATORY_INPUT_MISSING', 'ZONE_FULLY_MASKED', 'NO_OBSERVATION_IN_WINDOW', 'RESOLUTION_INADEQUATE',
  'AGRI_MASK_BLOCKED', 'NOT_AGRICULTURAL', 'PERSISTENCE_INELIGIBLE', 'PERSISTENCE_UNKNOWN',
  'PERSISTENCE_NOT_ASSESSED', 'EVIDENCE_LIMITED', 'EVIDENCE_NOT_ASSESSED'
] as const;

function unrankedGroupLabel(reason: string | null, t: ReturnType<typeof useTranslations<'zones'>>): string {
  const key = (GROUP_KEYS as readonly string[]).includes(reason ?? '') ? reason as (typeof GROUP_KEYS)[number] : '_other';
  return t(`unrankedGroup.${key}`);
}

function ZoneRow({view, zone, selected, onSelect}: {
  view: ScoredResultView;
  zone: ZoneView;
  selected: boolean;
  onSelect: (zoneId: string) => void;
}) {
  const t = useTranslations('zones');
  const locale = useLocale();
  const reasonText = useReasonText(view.analysisId);
  const assessment = zone.assessment;
  const priorityReasons = (assessment.priority.reasons ?? []).slice(0, 3);
  const families = assessment.independent_families ?? [];
  const confounders = assessment.confounders ?? [];
  const failed = assessment.sufficiency.failed_factors ?? [];
  const step = rankGroupStep(zone.rankGroup);
  void locale;

  return (
    <li className={`scoring-zone-row zone-row${selected ? ' is-selected' : ''}`} data-zone-id={zone.zoneId} data-ranked={zone.ranked}>
      <div className="zone-row-head">
        <button
          type="button"
          className="zone-select"
          aria-pressed={selected}
          aria-label={t('selectZone', {zoneId: isolate(zone.zoneId)})}
          onClick={() => onSelect(zone.zoneId)}
        >
          <bdi dir="ltr" className="scoring-zone-id">{zone.zoneId}</bdi>
        </button>
        {zone.ranked ? (
          <span className="rank-chip" style={{background: step.fill, color: step.ink}} data-rank-group={zone.rankGroup ?? ''}>
            {t('rankLabel', {rank: zone.rank === null ? '—' : String(zone.rank)})}
            {' · '}
            {t('rankGroupLabel', {rankGroup: zone.rankGroup === null ? '—' : String(zone.rankGroup)})}
          </span>
        ) : (
          <span className="rank-chip rank-chip-unranked" data-testid="unranked-chip">{t('unrankedLabel')}</span>
        )}
        <EvidenceClassBadge zone={zone} />
        {selected ? <span className="selected-tag">{t('selectedZone')}</span> : null}
      </div>

      <p className="zone-status-line">
        <span>{t('evidenceStatusLabel')}: {t(`evidenceStatus.${assessment.evidence_status}`)}</span>
        {' · '}
        <span>
          {t('sufficiencyLabel')}: {assessment.sufficiency.status === 'PASS' ? t('sufficiency.PASS') : t('sufficiency.INSUFFICIENT_DATA')}
        </span>
        {failed.length > 0 ? <>{' · '}<span>{t('failedFactors', {factors: isolate(failed.join(', '))})}</span></> : null}
      </p>

      {priorityReasons.length > 0 ? (
        <ul className="reason-list" aria-label={t('reasonsHeading')}>
          {priorityReasons.map((reason, index) => (
            <li key={`${reason.code}-${index}`} data-reason-code={reason.code}>{reasonText(reason)}</li>
          ))}
        </ul>
      ) : null}

      {zone.ranked ? (
        <div className="family-chips" aria-label={t('independentFamilies')}>
          {families.length === 0 ? <span className="subtle-copy">{t('noFamilies')}</span> : families.map((family) => (
            <span key={family.family} className={`chip${family.counted ? ' chip-counted' : ' chip-uncounted'}`} data-family={family.family} data-counted={family.counted}>
              {t(family.counted ? 'familyCounted' : 'familyNotCounted', {family: familyLabel(family.family, t)})}
              {family.source_ids.length > 1 ? <> · {t('familyCollapsed', {count: String(family.source_ids.length)})}</> : null}
              {' · '}
              {family.adverse_signal ? t('familyAdverse') : t('familyNoSignal')}
              {family.reason ? <> · {reasonText(family.reason)}</> : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="confounder-chips" aria-label={t('confoundersHeading')}>
        {confounders.length === 0 ? <span className="subtle-copy">{t('confoundersNone')}</span> : confounders.map((confounder, index) => (
          <span key={`${confounder.code}-${index}`} className="chip chip-confounder" data-confounder={confounder.code}>
            <ConfounderText code={confounder.code} assessed={confounder.assessed} />
          </span>
        ))}
      </div>
      <p className="subtle-copy">{t('confoundersHeading')}</p>

      <TechnicalView view={view} zone={zone} locale={locale} onSelect={onSelect} />
    </li>
  );
}

function familyLabel(family: string, t: ReturnType<typeof useTranslations<'zones'>>): string {
  if (family === 'OPTICAL' || family === 'SAR' || family === 'RAINFALL') return t(`family.${family}`);
  return family;
}

function ConfounderText({code, assessed}: {code: string; assessed: boolean}) {
  const t = useTranslations('zones');
  const c = useTranslations('confounders');
  const label = isKnownConfounderCode(code) ? c(code) : c('unknown', {code: isolate(code)});
  return <>{assessed ? t('confounderAssessed', {label}) : t('confounderNotMeasured', {label})}</>;
}

export function EvidenceClassBadge({zone}: {zone: ZoneView}) {
  const e = useTranslations('evidenceQuality');
  const quality = zone.assessment.evidence_quality;
  // An UNRANKED zone never shows a class or composite, whatever the payload carries (Council
  // condition 1): the suppression is explicit, not a by-product of the generic row layout.
  const shown = zone.ranked ? quality : null;
  const display = shown ? (shown.display ?? shown.c ?? null) : null;
  return (
    <span className="quality-badge" data-testid="evidence-quality-badge" data-class={shown?.class ?? 'none'}>
      <span className="quality-badge-axis">{e('axisLabel')}:</span>{' '}
      {shown?.class ? e('badge', {class: e(`class.${shown.class}`)}) : e('noClass')}
      {display ? <> · <bdi dir="ltr">{e('compositeC', {value: display})}</bdi></> : null}
    </span>
  );
}

function TechnicalView({view, zone, locale, onSelect}: {view: ScoredResultView; zone: ZoneView; locale: string; onSelect: (zoneId: string) => void}) {
  const t = useTranslations('zones');
  const e = useTranslations('evidenceQuality');
  const reasonText = useReasonText(view.analysisId);
  const quality = zone.assessment.evidence_quality;
  const topReasons = (quality.top_reasons ?? []).slice(0, 3);
  const rankKey = zone.assessment.priority.rank_key ?? null;
  const refs = zone.assessment.evidence_refs ?? [];

  return (
    <details className="technical-view">
      <summary>{t('technicalHeading', {zoneId: isolate(zone.zoneId)})}</summary>

      <p className="subtle-copy">{e('uncalibratedLabel')}</p>
      <p className="subtle-copy">{e('notPriority')}</p>
      <dl className="result-facts compact-facts">
        <div className="result-fact"><dt>{e('mandatoryLabel')}</dt><dd><bdi dir="ltr">{quality.m ?? e('absentNotZero')}</bdi></dd></div>
        <div className="result-fact"><dt>{e('optionalLabel')}</dt><dd><bdi dir="ltr">{quality.o ?? e('absentNotZero')}</bdi></dd></div>
        <div className="result-fact"><dt>{e('compositeLabel')}</dt><dd><bdi dir="ltr">{zone.ranked ? (quality.c ?? e('absentNotZero')) : e('absentNotZero')}</bdi></dd></div>
      </dl>
      {topReasons.length > 0 ? (
        <>
          <h5>{e('topReasons')}</h5>
          <ul className="reason-list">
            {topReasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reasonText(reason)}</li>)}
          </ul>
        </>
      ) : null}

      <table className="factor-table" data-testid="factor-table">
        <caption>{e('factorTableCaption', {zoneId: isolate(zone.zoneId)})}</caption>
        <thead>
          <tr>
            <th scope="col">{e('colFactor')}</th>
            <th scope="col">{e('colScore')}</th>
            <th scope="col">{e('colState')}</th>
            <th scope="col">{e('colReason')}</th>
            <th scope="col">{e('colEvidence')}</th>
          </tr>
        </thead>
        <tbody>
          {FACTOR_IDS.map((factorId) => {
            const row = factorRow(zone.assessment, factorId);
            return (
              <tr key={factorId} data-factor-id={factorId}>
                <th scope="row"><bdi dir="ltr">{factorId}</bdi></th>
                <td><bdi dir="ltr">{row ? row.score : '—'}</bdi></td>
                <td>{!row ? e('factorAbsent') : !row.applicable ? e('factorNotApplicable') : !row.assessed ? e('factorNotAssessed') : e('factorScored')}</td>
                <td>{row?.reason ? reasonText(row.reason) : '—'}</td>
                <td>
                  <FactorEvidenceLink factorId={factorId} zoneId={zone.zoneId} onSelect={onSelect} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rankKey ? (
        <>
          <h5>{t('rankKeyHeading')}</h5>
          <ul className="reason-list">
            <li>{t('rankKeyFamilies', {count: String(rankKey.independent_family_count)})}</li>
            <li>{t('rankKeyPersistence', {count: String(rankKey.persistence_windows)})}</li>
            <li>{t('rankKeyRecurrence', {count: String(rankKey.recurrence_windows)})}</li>
            <li>{t('rankKeyStrength', {value: isolate(rankKey.anomaly_strength)})}</li>
            <li>{t('rankKeyTieBreak', {zoneId: isolate(rankKey.zone_id)})}</li>
          </ul>
        </>
      ) : null}

      <h5>{t('evidenceRefsHeading')}</h5>
      {refs.length === 0 ? <p className="subtle-copy">{t('noEvidenceRefs')}</p> : (
        <ul className="reason-list">
          {refs.map((ref, index) => (
            <li key={`${ref.source_id}-${index}`}>
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
      <p className="subtle-copy"><Link href="/settings">{t('sourcesLink')}</Link></p>
    </details>
  );
}

function FactorEvidenceLink({factorId, zoneId, onSelect}: {factorId: string; zoneId: string; onSelect: (zoneId: string) => void}) {
  const e = useTranslations('evidenceQuality');
  // Selects the row's zone and moves to the zone-scoped time-series/evidence view. It is a button
  // acting on in-memory state: it never navigates, fetches or posts.
  return (
    <button
      type="button"
      className="link-button"
      aria-label={e('factorLinkLabel', {factorId: isolate(factorId), zoneId: isolate(zoneId)})}
      data-zone-link={zoneId}
      onClick={() => {
        onSelect(zoneId);
        requestAnimationFrame(() => {
          const heading = document.getElementById('zone-evidence-heading');
          heading?.scrollIntoView({block: 'start'});
          heading?.focus();
        });
      }}
    >
      {e('factorLink')}
    </button>
  );
}
