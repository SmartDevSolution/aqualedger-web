'use client';

import {useLocale, useTranslations} from 'next-intl';
import {Link, usePathname} from '@/i18n/navigation';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('navigation');
  const nextLocale = locale === 'en' ? 'ar' : 'en';

  return (
    <Link
      href={pathname}
      locale={nextLocale}
      className="language-switcher"
      aria-label={t('switchLanguage')}
      hrefLang={nextLocale}
    >
      {t('switchLanguage')}
    </Link>
  );
}
