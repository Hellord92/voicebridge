import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { locales } from '../../i18n';
import { AuthProvider } from '../../lib/auth';
import Navbar from '../../components/Navbar';
import '../globals.css';

export function generateStaticParams() {
  return locales.map(locale => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  if (!locales.includes(params.locale)) notFound();
  const messages = await getMessages({ locale: params.locale });
  return {
    title:       (messages as Record<string, string>).meta_title       ?? 'VoiceBridge',
    description: (messages as Record<string, string>).meta_description ?? 'Real-time voice translation',
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!locales.includes(params.locale)) notFound();

  // Required by next-intl 3.22+ for static rendering support
  setRequestLocale(params.locale);

  const messages = await getMessages({ locale: params.locale });

  return (
    <html lang={params.locale} className="scroll-smooth">
      <body className="bg-slate-950 text-slate-100 antialiased">
        <NextIntlClientProvider locale={params.locale} messages={messages}>
          <AuthProvider>
            <Navbar />
            {children}
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
