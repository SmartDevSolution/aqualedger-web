'use client';

import {useTranslations} from 'next-intl';
import {isM3Envelope} from '@/lib/api/m3';
import {m3ReasonMessageKey} from '@/lib/api/error-messages';
import type {M3ZoneAssessment} from '@/lib/api/m3';

// M3 scoring-envelope presentation, additive to the M1/M2 result panel (contract 0.2.0).
//
// Rendering rules come from DR-M3-01: a result without the envelope is "not scored under this
// method" — never UNRANKED, never a zero, never a substituted class. A zone whose priority
// status is UNRANKED is shown in the neutral vocabulary the contract already carries (status +
// reason codes); RANKED shows the rank/rank_group the backend computed. The evidence-quality
// class is the recovered, explicitly uncalibrated axis and is always shown with its uncalibrated
// label — it is never presented as a priority class, and priority_class_status is always
// "not established" under v1.

type ScoringSectionProps = {
  result: import('@/lib/api/client').AnalysisResult;
};

export function ResultScoringSection({result}: ScoringSectionProps) {
  const t = useTranslations('workspace');

  if (!isM3Envelope(result)) {
    return (
      <section className="result-detail-section" aria-labelledby="result-scoring-heading">
        <h3 id="result-scoring-heading">{t('scoringHeading')}</h3>
        <p className="subtle-copy">{t('scoringNotScored')}</p>
      </section>
    );
  }

  const ranked = result.assessment.filter((zone) => zone.priority.status === 'RANKED');
  const unranked = result.assessment.filter((zone) => zone.priority.status === 'UNRANKED');

  return (
    <section className="result-detail-section" aria-labelledby="result-scoring-heading">
      <h3 id="result-scoring-heading">{t('scoringHeading')}</h3>
      <p className="subtle-copy">{t('scoringUncalibratedDisclosure')}</p>
      <dl className="result-facts">
        <div className="result-fact">
          <dt>{t('scoringMethod')}</dt>
          <dd><bdi dir="ltr">{result.scoring.method_version}</bdi></dd>
        </div>
        <div className="result-fact">
          <dt>{t('scoringPriorityClassStatus')}</dt>
          <dd>{t('scoringPriorityClassNotEstablished')}</dd>
        </div>
      </dl>
      {ranked.length > 0 ? (
        <div className="scoring-zones">
          <h4>{t('scoringRankedHeading')}</h4>
          <ul className="scene-list">
            {ranked.map((zone) => <ZoneRow key={zone.zone_id} zone={zone} ranked />)}
          </ul>
        </div>
      ) : null}
      {unranked.length > 0 ? (
        <div className="scoring-zones">
          <h4>{t('scoringUnrankedHeading')}</h4>
          <ul className="scene-list">
            {unranked.map((zone) => <ZoneRow key={zone.zone_id} zone={zone} ranked={false} />)}
          </ul>
        </div>
      ) : null}
      {result.assessment.length === 0 ? <p className="subtle-copy">{t('scoringNoZones')}</p> : null}
    </section>
  );
}

function ZoneRow({zone, ranked}: {
  zone: M3ZoneAssessment;
  ranked: boolean;
}) {
  const t = useTranslations('workspace');
  const errors = useTranslations('errors');
  const zoneClass = zone.evidence_quality.class;
  const classValue = zone.evidence_quality.c;
  // The backend pins the display string for boundary cases (DR-M3-01 §5/A1.1); the web never
  // re-formats the quantized decimal itself.
  const classDisplay = zone.evidence_quality.display ?? classValue ?? null;
  // Ranks travel into the message as literal strings so the digit policy is fixed once (A38):
  // ICU would otherwise re-format the number per locale (Eastern Arabic numerals under ar).
  const rank = zone.priority.rank === null || zone.priority.rank === undefined ? '—' : String(zone.priority.rank);
  const rankGroup = zone.priority.rank_group === null || zone.priority.rank_group === undefined ? '—' : String(zone.priority.rank_group);

  return (
    <li className="scoring-zone-row">
      <bdi dir="ltr" className="scoring-zone-id">{zone.zone_id}</bdi>
      {ranked ? (
        <span>
          {t('scoringZoneRankedWithClass', {
            rank,
            rankGroup,
            zoneClass: zoneClass ?? t('scoringClassAbsent')
          })}
        </span>
      ) : (
        <span>{t('scoringZoneUnranked')}</span>
      )}
      {classDisplay ? <bdi dir="ltr">{classDisplay}</bdi> : null}
      <span className="bidi-list">
        {(zone.priority.reasons ?? []).map((reason, index) => (
          <bdi key={`${reason.code}-${index}`} dir="auto">{errors(m3ReasonMessageKey(reason.code))}</bdi>
        ))}
      </span>
    </li>
  );
}
