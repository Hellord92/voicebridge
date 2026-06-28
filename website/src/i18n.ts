import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'tr', 'fr', 'de', 'es', 'pt', 'hi', 'zh', 'ja', 'ar'];
export const defaultLocale = 'en';

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale is a Promise in next-intl 3.22+
  let locale = await requestLocale;

  // Fall back to default if locale is unsupported or undefined
  if (!locale || !locales.includes(locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
