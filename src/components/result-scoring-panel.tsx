'use client';

import {useTranslations} from 'next-intl';
import {DecisionCard} from './decision-card';
import {ZonePriorityPanel} from './zone-priority-panel';
import type {ScoredResultView} from '@/lib/zone-model';
import type {ResultIdentityState} from '@/lib/api/use-result-identity';

// M3 scoring presentation, additive to the M1/M2 result panel (contract 0.2.0).
//
// Rendering rules come from DR-M3-01: a result without the envelope is "not scored under this
// method" — never UNRANKED, never a zero, never a substituted class. A scored result is rendered
// from the single `ScoredResultView` the workspace built once per (analysis_id, result_sha256).
// A zone whose priority status is UNRANKED is shown in the neutral vocabulary the contract
// already carries (status + reason codes); RANKED shows the rank/rank_group the backend computed.
// The evidence-quality class is the recovered, explicitly uncalibrated axis and is shown on
// RANKED rows with its uncalibrated label — it is never presented as a priority class, and an
// UNRANKED row carries no class at all (gated structurally in `zone-priority-panel.tsx`, not
// merely because the backend emits none for it); priority_class_status is always "not
// established" under v1.

export type ScoringSectionProps = {
  /** null = the committed result carries no scoring envelope. */
  view: ScoredResultView | null;
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  identity: ResultIdentityState;
  cardOpen: boolean;
  onToggleCard: () => void;
  hasProvenance: boolean;
};

export function ResultScoringSection({view, selectedZoneId, onSelectZone, identity, cardOpen, onToggleCard, hasProvenance}: ScoringSectionProps) {
  const t = useTranslations('workspace');

  if (!view) {
    return (
      <section className="result-detail-section" aria-labelledby="result-scoring-heading">
        <h3 id="result-scoring-heading">{t('scoringHeading')}</h3>
        <p className="subtle-copy">{t('scoringNotScored')}</p>
      </section>
    );
  }

  return (
    <>
      <ZonePriorityPanel
        view={view}
        selectedZoneId={selectedZoneId}
        onSelectZone={onSelectZone}
        identity={identity}
        cardOpen={cardOpen}
        onToggleCard={onToggleCard}
        hasProvenance={hasProvenance}
      />
      {cardOpen ? <DecisionCard view={view} identity={identity} /> : null}
    </>
  );
}
