'use client';

import {useEffect, useState} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {formatTimestamp} from '@/lib/format';
import {getSources, type ApiFailure, type SourcesResponse} from '@/lib/api/client';
import {sourceReasonMessageKey} from '@/lib/api/error-messages';
import {BackendErrorNotice} from './backend-error-notice';

type LoadState =
  | {kind: 'loading'}
  | {kind: 'loaded'; response: SourcesResponse}
  | {kind: 'failed'; error: ApiFailure};

export function SourceStatusPanel() {
  const locale = useLocale();
  const t = useTranslations('settings');
  const errors = useTranslations('errors');
  const [retryNumber, setRetryNumber] = useState(0);
  const [state, setState] = useState<LoadState>({kind: 'loading'});

  useEffect(() => {
    const controller = new AbortController();
    setState({kind: 'loading'});
    void getSources(controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setState(response.error ? {kind: 'failed', error: response.error} : {kind: 'loaded', response: response.data});
    });
    return () => controller.abort();
  }, [retryNumber]);

  return (
    <section className="panel source-panel" aria-labelledby="source-status-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('statusHeading')}</p>
          <h2 id="source-status-heading">{t('statusHeading')}</h2>
        </div>
        <span className={`status-tag ${state.kind === 'loaded' ? 'status-tag-neutral' : 'status-tag-warning'}`}>
          {state.kind === 'loading' ? t('loading') : state.kind === 'loaded' ? t('statusLoaded') : t('statusUnavailable')}
        </span>
      </div>

      {state.kind === 'loading' ? <p className="notice notice-neutral" role="status">{t('loadingDetail')}</p> : null}
      {state.kind === 'failed' ? (
        <>
          <BackendErrorNotice failure={state.error} />
          <button type="button" className="button button-tertiary" onClick={() => setRetryNumber((value) => value + 1)}>{t('retry')}</button>
        </>
      ) : null}
      {state.kind === 'loaded' && state.response.sources.length === 0 ? (
        <p className="notice notice-neutral" role="status">{t('noSources')}</p>
      ) : null}
      {state.kind === 'loaded' && state.response.sources.length > 0 ? (
        <ul className="source-list">
          {state.response.sources.map((source) => (
            <li className="source-item" key={source.source_id}>
              <div className="source-heading">
                <div>
                  <h3>{source.name}</h3>
                  <p><bdi dir="auto">{source.provider}</bdi> · <bdi dir="auto">{source.collection}</bdi></p>
                </div>
                <span className={`status-tag ${source.check.status === 'reachable' ? 'status-tag-neutral' : 'status-tag-warning'}`}>
                  {checkStatusLabel(source.check.status, t)}
                </span>
              </div>
              <dl className="source-facts">
                <Fact label={t('role')} value={source.mandatory ? t('mandatory') : t('optional')} />
                <Fact label={t('sourceType')} value={source.temporal_or_static === 'TEMPORAL' ? t('temporal') : t('static')} />
                <Fact label={t('configured')} value={source.configured ? t('yes') : t('no')} />
                <Fact label={t('enabled')} value={source.enabled ? t('yes') : t('no')} />
                <Fact label={t('checkScope')} value={scopeLabel(source.check.check_scope, t)} />
                <Fact label={t('lastChecked')} value={source.check.checked_at ? formatTimestamp(source.check.checked_at, locale) : t('notChecked')} />
                {source.check.reason_code ? <Fact label={t('reason')} value={errors(sourceReasonMessageKey(source.check.reason_code))} /> : null}
              </dl>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="subtle-copy">{t('settingsDisclosure')}</p>
    </section>
  );
}

function checkStatusLabel(status: string, t: ReturnType<typeof useTranslations<'settings'>>): string {
  switch (status) {
    case 'NOT_CHECKED': return t('notChecked');
    case 'reachable': return t('reachable');
    case 'failed': return t('checkFailed');
    case 'deferred': return t('deferred');
    case 'not_configured': return t('notConfigured');
    default: return t('unknownCheckStatus');
  }
}

function scopeLabel(scope: string | null, t: ReturnType<typeof useTranslations<'settings'>>): string {
  if (scope === 'catalogue_root') return t('catalogueCheck');
  if (scope === 'pixel_read') return t('pixelReadCheck');
  return scope ? t('otherCheckScope') : t('noCheckScope');
}

function Fact({label, value}: {label: string; value: string}) {
  return <div className="source-fact"><dt>{label}</dt><dd>{value}</dd></div>;
}
