'use client';

import {useTranslations} from 'next-intl';
import {Link, usePathname} from '@/i18n/navigation';

export function MainNavigation() {
  const t = useTranslations('navigation');
  const pathname = usePathname();
  const onAnalysis = pathname.startsWith('/analysis');
  const onSettings = pathname === '/settings';

  return (
    <nav className="primary-nav" aria-label={t('mainNavigation')}>
      <Link href="/analysis" aria-current={onAnalysis ? 'page' : undefined}>
        <span className="sr-only">{t('analysis')}</span><span aria-hidden="true">{t('map')}</span>
      </Link>
      {(['analytics', 'reports', 'areas', 'data'] as const).map((item) => <span key={item} className="nav-unavailable" aria-disabled="true">{t(item)}</span>)}
      <Link href="/settings" aria-current={onSettings ? 'page' : undefined}>
        <span className="sr-only">{t('settings')}</span><span aria-hidden="true">{t('settings').split(' / ')[0]}</span>
      </Link>
    </nav>
  );
}
