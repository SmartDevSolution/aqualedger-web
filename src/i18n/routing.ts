import {defineRouting} from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'en',
  localeCookie: {name: 'aqualedger.locale', maxAge: 60 * 60 * 24 * 365}
});
