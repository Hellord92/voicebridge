import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localeDetection: false, // Always default to English; user can switch manually
});

export function middleware(req: NextRequest) {
  return intlMiddleware(req);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
