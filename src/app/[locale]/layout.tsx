import 'maplibre-gl/dist/maplibre-gl.css';
import '@/styles/globals.css';
import type {Metadata} from 'next';
import {hasLocale, NextIntlClientProvider} from 'next-intl';
import {getMessages, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {SiteShell} from '@/components/site-shell';
import {routing} from '@/i18n/routing';

export const metadata: Metadata = {
  title: 'AquaLedger',
  description: 'Water and agricultural decision support'
};

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export default async function LocaleLayout({children, params}: LocaleLayoutProps) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const direction = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={direction}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <SiteShell locale={locale}>{children}</SiteShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
