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
        {t('analysis')}
      </Link>
      <Link href="/settings" aria-current={onSettings ? 'page' : undefined}>
        {t('settings')}
      </Link>
    </nav>
  );
}
