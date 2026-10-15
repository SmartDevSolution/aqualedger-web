import type {ReactNode} from 'react';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {LanguageSwitcher} from './language-switcher';
import {MainNavigation} from './main-navigation';
import {WorkspaceIcon} from './workspace-icon';

type SiteShellProps = {
  children: ReactNode;
  locale: 'ar' | 'en';
};

export async function SiteShell({children, locale}: SiteShellProps) {
  const t = await getTranslations('shell');
  const d = await getTranslations('dashboard');

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href="/analysis" locale={locale} className="brand-link" aria-label={t('productName')}>
          <span className="brand-mark" aria-hidden="true"><WorkspaceIcon name="leaf" /></span>
          <span className="brand-copy">
            <span className="brand-name">{t('productName')}</span>
            <span className="brand-description">{locale === 'ar' ? 'اليمن' : 'YEMEN'}</span>
          </span>
        </Link>
        <div className="header-controls">
          <MainNavigation />
          <label className="header-search" title={d('searchUnavailable')}><WorkspaceIcon name="search" /><input disabled placeholder={d('search')} aria-label={d('searchUnavailable')} /></label>
          <LanguageSwitcher />
          <button className="avatar-button" disabled aria-label={d('accountUnavailable')}><WorkspaceIcon name="user" /></button>
        </div>
      </header>
      {children}
      <footer className="site-footer">{t('footerNote')}</footer>
    </div>
  );
}
