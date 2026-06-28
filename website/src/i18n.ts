import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'tr', 'fr', 'de', 'es', 'pt', 'hi', 'zh', 'ja', 'ar'];
export const defaultLocale = 'en';

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`../messages/${locale}.json`)).default,
}));
