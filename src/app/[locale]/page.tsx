import {redirect} from 'next/navigation';
import {hasLocale} from 'next-intl';
import {routing} from '@/i18n/routing';

type LocalePageProps = {
  params: Promise<{locale: string}>;
};

export default async function LocalePage({params}: LocalePageProps) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) {
    redirect('/en/analysis');
  }
  redirect(`/${locale}/analysis`);
}
