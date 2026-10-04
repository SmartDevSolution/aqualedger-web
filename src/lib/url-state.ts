'use client';

import {useMemo, useSyncExternalStore} from 'react';

// Same-route workspace state carried in the query string (plan §7 permits query state on the
// same route; there is no new route or page): `zone`, `panel` (card), `history` (drawer).
// Keeping it in the URL is what lets a language switch (a navigation to the same pathname in the
// other locale) preserve the selected zone, open panel and drawer state with no POST (A37), and
// makes a saved link reopen the same view. It is read through an external store rather than
// `useSearchParams` so the statically generated analysis routes need no Suspense bailout.

const URL_STATE_EVENT = 'aqualedger:url-state';

export type WorkspaceUrlState = {
  zone: string | null;
  card: boolean;
  scenario: boolean;
  history: boolean;
};

function subscribe(callback: () => void): () => void {
  window.addEventListener('popstate', callback);
  window.addEventListener(URL_STATE_EVENT, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(URL_STATE_EVENT, callback);
  };
}

function getSnapshot(): string {
  return window.location.search;
}

function getServerSnapshot(): string {
  return '';
}

export function useUrlSearch(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function parseWorkspaceUrlState(search: string): WorkspaceUrlState {
  const params = new URLSearchParams(search);
  const zone = params.get('zone');
  return {
    zone: zone && zone.length <= 200 ? zone : null,
    card: params.get('panel') === 'card',
    scenario: params.get('scenario') === '1',
    history: params.get('history') === '1'
  };
}

export function useWorkspaceUrlState(): WorkspaceUrlState {
  const search = useUrlSearch();
  return useMemo(() => parseWorkspaceUrlState(search), [search]);
}

/** Replace (never push) the query string; `null` removes a key. Hash and pathname are untouched. */
export function patchUrlState(patch: Partial<{zone: string | null; panel: 'card' | null; scenario: '1' | null; history: '1' | null}>): void {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', next);
  window.dispatchEvent(new Event(URL_STATE_EVENT));
}

/** The query parameters a locale switch must carry across; everything else is dropped. */
export function carriedQuery(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const carried: Record<string, string> = {};
  for (const key of ['zone', 'panel', 'scenario', 'history']) {
    const value = params.get(key);
    if (value) carried[key] = value;
  }
  return carried;
}
