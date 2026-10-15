'use client';

import {useLocale, useTranslations} from 'next-intl';
import {Link, usePathname} from '@/i18n/navigation';
import {carriedQuery, useUrlSearch} from '@/lib/url-state';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('navigation');
  const search = useUrlSearch();
  const nextLocale = locale === 'en' ? 'ar' : 'en';
  // A37: switching language is a navigation to the same route in the other locale. The analysis id
  // is in the pathname; the selected zone, open panel and drawer state travel in the query string.
  // Nothing is posted and the result is re-read by id, so result_sha256 is unchanged.
  const query = carriedQuery(search);

  return (
    <Link
      href={{pathname, query}}
      locale={nextLocale}
      className="language-switcher"
      aria-label={t('switchLanguage')}
      hrefLang={nextLocale}
    >
      <span className={locale === 'en' ? 'is-active' : ''}>EN</span><span className={locale === 'ar' ? 'is-active' : ''}>AR</span>
    </Link>
  );
}
