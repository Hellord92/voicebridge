'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function HomePage() {
  const t = useTranslations();

  return (
    <main className="min-h-screen">
      <Nav t={t} />
      <Hero t={t} />
      <HowItWorks t={t} />
      <Features t={t} />
      <CtaBanner t={t} />
      <Footer t={t} />
    </main>
  );
}

function Nav({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-slate-950/80 backdrop-blur border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <span className="font-bold text-sky-400 text-lg tracking-tight">VoiceBridge</span>
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          <Link href="#how" className="hover:text-white transition">{t('nav_pricing')}</Link>
          <Link href="/pricing" className="hover:text-white transition">{t('nav_pricing')}</Link>
          <Link href="/download" className="hover:text-white transition">{t('nav_download')}</Link>
        </div>
        <Link href="/download" className="text-sm bg-sky-500 hover:bg-sky-400 text-white px-4 py-2 rounded-lg transition font-medium">
          {t('hero_cta_primary')}
        </Link>
      </div>
    </nav>
  );
}

function Hero({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <section className="pt-32 pb-24 px-6 text-center">
      <div className="max-w-3xl mx-auto">
        <span className="inline-block text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 px-3 py-1 rounded-full mb-6">
          {t('hero_badge')}
        </span>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none mb-6 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent whitespace-pre-line">
          {t('hero_headline')}
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          {t('hero_sub')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/download"
            className="px-8 py-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-lg transition shadow-lg shadow-sky-500/25"
          >
            {t('hero_cta_primary')}
          </Link>
          <Link
            href="#how"
            className="px-8 py-4 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-medium text-lg transition"
          >
            {t('hero_cta_secondary')} →
          </Link>
        </div>
      </div>

      {/* Fake product screenshot */}
      <div className="mt-20 max-w-xs mx-auto">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl shadow-sky-500/10">
          <div className="h-6 flex items-center gap-1.5 mb-3">
            <span className="w-3 h-3 rounded-full bg-rose-500/70" />
            <span className="w-3 h-3 rounded-full bg-amber-500/70" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
            <span className="ml-2 text-xs text-sky-400 font-bold">VoiceBridge</span>
          </div>
          <div className="space-y-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">🎤 I speak</span>
              <span className="ml-auto bg-slate-800 px-2 py-0.5 rounded text-slate-200">🇹🇷 Turkish</span>
            </div>
            <div className="text-center text-slate-600">→</div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">🔊 They hear</span>
              <span className="ml-auto bg-slate-800 px-2 py-0.5 rounded text-slate-200">🇬🇧 English</span>
            </div>
            <div className="mt-3 w-full py-2 rounded-lg bg-sky-500 text-center text-white font-medium">
              ● Translating…
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ t }: { t: ReturnType<typeof useTranslations> }) {
  const steps = [
    { icon: '⬇', title: t('how_1_title'), desc: t('how_1_desc') },
    { icon: '🎙', title: t('how_2_title'), desc: t('how_2_desc') },
    { icon: '🌍', title: t('how_3_title'), desc: t('how_3_desc') },
  ];
  return (
    <section id="how" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">{t('how_title')}</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <div key={i} className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-2xl flex items-center justify-center mx-auto mb-4">{s.icon}</div>
              <h3 className="font-semibold text-white mb-2">{s.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features({ t }: { t: ReturnType<typeof useTranslations> }) {
  const feats = [
    { icon: '🌐', label: t('feature_langs') },
    { icon: '⚡', label: t('feature_latency') },
    { icon: '🔒', label: t('feature_secure') },
    { icon: '🆓', label: t('feature_trial') },
  ];
  return (
    <section className="py-16 px-6 bg-slate-900/50">
      <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
        {feats.map((f, i) => (
          <div key={i} className="text-center p-4 rounded-2xl bg-slate-800/50 border border-slate-700">
            <div className="text-3xl mb-2">{f.icon}</div>
            <p className="text-sm font-medium text-slate-200">{f.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CtaBanner({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <section className="py-24 px-6 text-center">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-6">{t('hero_headline')}</h2>
        <Link
          href="/download"
          className="inline-block px-10 py-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-lg transition shadow-lg shadow-sky-500/25"
        >
          {t('hero_cta_primary')}
        </Link>
      </div>
    </section>
  );
}

function Footer({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <footer className="border-t border-slate-800 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
        <div>
          <span className="font-bold text-sky-400">VoiceBridge</span>
          <span className="ml-3">{t('footer_tagline')}</span>
        </div>
        <span>{t('footer_legal')}</span>
      </div>
    </footer>
  );
}
