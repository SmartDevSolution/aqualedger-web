'use client';

import {useLocale, useTranslations} from 'next-intl';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Link} from '@/i18n/navigation';
import {getAnalysisHistory, type AnalysisHistoryItem, type ApiFailure} from '@/lib/api/client';
import {formatGregorianDate, formatTimestamp} from '@/lib/format';
import {isolate} from '@/lib/reason-text';

// Recent-analysis drawer (plan §7), fed by `GET /analyses` through the same-origin relay. It is a
// READ: selecting an item is a plain link to `/analysis/{id}` (the saved analysis is then read by
// GET status/result) and never a POST. The draft AOI/dates live in sessionStorage and are not touched
// by opening a saved analysis; the drawer says so, and says so explicitly when a draft polygon exists.

type DrawerState =
  | {kind: 'loading'}
  | {kind: 'ready'; items: AnalysisHistoryItem[]; nextCursor: string | null; loadingMore: boolean; moreFailed: boolean}
  | {kind: 'error'; unauthorized: boolean};

export function HistoryDrawer({open, onClose, currentAnalysisId, hasDraftArea}: {
  open: boolean;
  onClose: () => void;
  currentAnalysisId?: string | undefined;
  hasDraftArea: boolean;
}) {
  const t = useTranslations('history');
  const locale = useLocale();
  const [state, setState] = useState<DrawerState>({kind: 'loading'});
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const classify = (failure: ApiFailure): DrawerState => ({
    kind: 'error',
    unauthorized: failure.code === 'UNAUTHENTICATED' || failure.code === 'FORBIDDEN' || failure.httpStatus === 401 || failure.httpStatus === 403
  });

  useEffect(() => {
    if (!open) return;
    if (loaded.current && attempt === 0) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    let active = true;
    setState({kind: 'loading'});
    void getAnalysisHistory(null, abort.signal).then((response) => {
      if (!active) return;
      if (response.error) {
        setState(classify(response.error));
        return;
      }
      loaded.current = true;
      setState({kind: 'ready', items: response.data.items, nextCursor: response.data.next_cursor ?? null, loadingMore: false, moreFailed: false});
    });
    return () => {
      active = false;
      abort.abort();
    };
  }, [open, attempt]);

  const loadMore = useCallback(async () => {
    if (state.kind !== 'ready' || !state.nextCursor || state.loadingMore) return;
    const cursor = state.nextCursor;
    setState({...state, loadingMore: true, moreFailed: false});
    const response = await getAnalysisHistory(cursor);
    setState((current) => {
      if (current.kind !== 'ready') return current;
      if (response.error) return {...current, loadingMore: false, moreFailed: true};
      const seen = new Set(current.items.map((item) => item.analysis_id));
      const fresh = response.data.items.filter((item) => !seen.has(item.analysis_id));
      return {kind: 'ready', items: [...current.items, ...fresh], nextCursor: response.data.next_cursor ?? null, loadingMore: false, moreFailed: false};
    });
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside id="history-drawer" className="history-drawer panel" aria-label={t('drawerLabel')} data-testid="history-drawer">
      <div className="section-heading-with-note">
        <h2>{t('heading')}</h2>
        <button type="button" className="button button-tertiary" onClick={onClose}>{t('toggleClose')}</button>
      </div>
      <p className="subtle-copy">{t('description')}</p>
      <p className="subtle-copy" data-testid="history-draft-note">{hasDraftArea ? t('draftKeptWithArea') : t('draftKept')}</p>

      {state.kind === 'loading' ? <p className="notice notice-neutral" role="status">{t('loading')}</p> : null}
      {state.kind === 'error' ? (
        <div className="notice notice-warning" role="alert" data-testid="history-error">
          <p>{state.unauthorized ? t('unauthorized') : t('error')}</p>
          {!state.unauthorized ? <button type="button" className="button button-tertiary" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</button> : null}
        </div>
      ) : null}
      {state.kind === 'ready' && state.items.length === 0 ? <p className="subtle-copy" data-testid="history-empty">{t('empty')}</p> : null}
      {state.kind === 'ready' && state.items.length > 0 ? (
        <ul className="history-list">
          {state.items.map((item) => {
            const range = t('itemDateRange', {startDate: formatGregorianDate(item.start_date, locale), endDate: formatGregorianDate(item.end_date, locale)});
            const scored = item.result_sha256 !== undefined && item.result_sha256 !== null;
            const current = item.analysis_id === currentAnalysisId;
            return (
              <li key={item.analysis_id} className={`history-item${current ? ' is-current' : ''}`} data-analysis-id={item.analysis_id}>
                <Link
                  href={`/analysis/${item.analysis_id}`}
                  aria-current={current ? 'page' : undefined}
                  aria-label={t('itemOpenLabel', {range})}
                >
                  <span className="history-range">{range}</span>
                  <span className="subtle-copy">{t('itemCreated', {createdAt: formatTimestamp(item.created_at, locale)})}</span>
                  <span className="subtle-copy">
                    {scored && item.ranked_count !== undefined && item.ranked_count !== null
                      && item.unranked_count !== undefined && item.unranked_count !== null
                      ? t('itemRanked', {rankedCount: String(item.ranked_count), unrankedCount: String(item.unranked_count)})
                      : scored ? null : t('itemNotScored', {methodVersion: isolate(item.method_version)})}
                  </span>
                  <bdi dir="ltr" className="subtle-copy">{item.analysis_id}</bdi>
                  {current ? <span className="selected-tag">{t('itemCurrent')}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {state.kind === 'ready' && state.nextCursor ? (
        <div>
          <button type="button" className="button button-secondary" disabled={state.loadingMore} onClick={() => void loadMore()}>
            {state.loadingMore ? t('loading') : t('loadMore')}
          </button>
          {state.moreFailed ? <p className="notice notice-warning" role="alert">{t('error')}</p> : null}
        </div>
      ) : null}
    </aside>
  );
}
