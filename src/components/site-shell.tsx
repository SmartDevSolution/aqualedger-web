import type {ReactNode} from 'react';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {LanguageSwitcher} from './language-switcher';
import {MainNavigation} from './main-navigation';

type SiteShellProps = {
  children: ReactNode;
  locale: 'ar' | 'en';
};

export async function SiteShell({children, locale}: SiteShellProps) {
  const t = await getTranslations('shell');

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href="/analysis" locale={locale} className="brand-link" aria-label={t('productName')}>
          <span className="brand-mark" aria-hidden="true">A</span>
          <span className="brand-copy">
            <span className="brand-name">{t('productName')}</span>
            <span className="brand-description">{t('productDescription')}</span>
          </span>
        </Link>
        <div className="header-controls">
          <MainNavigation />
          <LanguageSwitcher />
        </div>
      </header>
      {children}
      <footer className="site-footer">{t('footerNote')}</footer>
    </div>
  );
}
