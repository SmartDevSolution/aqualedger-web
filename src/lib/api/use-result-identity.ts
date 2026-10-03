'use client';

import {useEffect, useState} from 'react';
import type {ScoredResultView} from '@/lib/zone-model';
import {computeCardId, computeResultSha256} from './result-hash';

export type ResultIdentityState = {
  /** `match` / `mismatch` once re-derived; `unavailable` when WebCrypto is missing; `pending` until then. */
  hashCheck: 'pending' | 'match' | 'mismatch' | 'unavailable';
  /** sha256("aq-card-1|" + analysis_id + "|" + result_sha256) of the EMITTED hash; null until computed. */
  cardId: string | null;
};

/**
 * Verifies the emitted `result_sha256` against the body this browser holds and derives the card id.
 * The displayed hash is always the emitted one; a mismatch is reported, never silently corrected.
 * State is keyed by (analysis_id, result_sha256) so a different result never shows a stale verdict.
 */
export function useResultIdentity(view: ScoredResultView | null): ResultIdentityState {
  const key = view ? `${view.analysisId}|${view.resultSha256}` : null;
  const [held, setHeld] = useState<{key: string | null; value: ResultIdentityState}>({
    key: null,
    value: {hashCheck: 'pending', cardId: null}
  });

  useEffect(() => {
    if (!view) return;
    let active = true;
    const run = async () => {
      const [recomputed, cardId] = await Promise.all([
        computeResultSha256(view.result as unknown as Record<string, unknown>),
        computeCardId(view.analysisId, view.resultSha256)
      ]);
      if (!active) return;
      setHeld({
        key: `${view.analysisId}|${view.resultSha256}`,
        value: {
          hashCheck: recomputed === null ? 'unavailable' : recomputed === view.resultSha256 ? 'match' : 'mismatch',
          cardId
        }
      });
    };
    void run();
    return () => {
      active = false;
    };
  }, [view]);

  return held.key === key && key !== null ? held.value : {hashCheck: 'pending', cardId: null};
}
