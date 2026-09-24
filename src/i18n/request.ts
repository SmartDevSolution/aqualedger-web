import * as rootParams from 'next/root-params';
import {hasLocale} from 'next-intl';
import {getRequestConfig} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {routing} from './routing';

export default getRequestConfig(async ({locale}) => {
  const routeLocale = locale ?? (await rootParams.locale());
  if (!hasLocale(routing.locales, routeLocale)) {
    notFound();
  }

  return {
    locale: routeLocale,
    messages: (await import(`../../messages/${routeLocale}.json`)).default
  };
});
