import en from '../../messages/en.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'ar' | 'en';
    Messages: typeof en;
  }
}
