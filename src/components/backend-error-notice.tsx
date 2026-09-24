'use client';

import {useTranslations} from 'next-intl';
import {backendErrorMessageKey} from '@/lib/api/error-messages';
import type {ApiFailure} from '@/lib/api/client';

export function BackendErrorNotice({failure}: {failure: ApiFailure}) {
  const t = useTranslations('errors');
  const key = backendErrorMessageKey(failure.code);

  return (
    <div className="notice notice-warning" role="alert">
      <p>{key === 'unknownBackendError'
        ? t(key, {requestId: failure.requestId ?? t('supportReferenceUnavailable')})
        : t(key)}</p>
      {failure.requestId ? <p className="request-reference">{t('requestReference')}: <bdi dir="ltr">{failure.requestId}</bdi></p> : null}
    </div>
  );
}
