'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';

/* ─── Language grid data ────────────────────────────────────────────────── */
const LANGS = [
  '🇬🇧 English','🇹🇷 Turkish','🇪🇸 Spanish','🇫🇷 French','🇩🇪 German',
  '🇵🇹 Portuguese','🇮🇳 Hindi','🇨🇳 Chinese','🇯🇵 Japanese','🇸🇦 Arabic',
  '🇰🇷 Korean','🇮🇹 Italian','🇷🇺 Russian','🇳🇱 Dutch','🇵🇱 Polish',
  '🇸🇪 Swedish','🇳🇴 Norwegian','🇩🇰 Danish','🇫🇮 Finnish','🇺🇦 Ukrainian',
];

const PAIRS = [
  { from: '🇹🇷 Turkish', to: '🇬🇧 English' },
  { from: '🇩🇪 German',  to: '🇯🇵 Japanese' },
  { from: '🇫🇷 French',  to: '🇸🇦 Arabic' },
  { from: '🇪🇸 Spanish', to: '🇨🇳 Chinese' },
];

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function HomePage() {
  const t = useTranslations();

  return (
    <main className="min-h-screen overflow-x-hidden">
      <Hero t={t} />
      <Stats t={t} />
      <HowItWorks t={t} />
      <Features t={t} />
      <Languages t={t} />
      <PricingTeaser t={t} />
      <CtaBanner t={t} />
      <Footer t={t} />
    </main>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */
function Hero({ t }: { t: ReturnType<typeof useTranslations> }) {
  const { user } = useAuth();

  return (
    <section className="relative pt-36 pb-28 px-6 text-center overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-violet-600/10 blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 text-xs font-medium bg-sky-500/10 text-sky-300 border border-sky-500/20 px-4 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          {t('hero_badge')}
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6 whitespace-pre-line">
          <span className="bg-gradient-to-br from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            {t('hero_headline')}
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          {t('hero_sub')}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20">
          <Link
            href="/download"
            className="group relative px-8 py-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-base transition-all shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 hover:-translate-y-0.5"
          >
            {t('hero_cta_primary')}
          </Link>
          <Link
            href="#how"
            className="px-8 py-4 rounded-xl border border-slate-700 hover:border-slate-500 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium text-base transition-all hover:-translate-y-0.5"
          >
            {t('hero_cta_secondary')} →
          </Link>
        </div>

        {/* App mockup */}
        <div className="relative inline-block">
          {/* Glow behind card */}
          <div className="absolute -inset-4 bg-sky-500/10 blur-2xl rounded-3xl" />
          <div className="relative bg-slate-900/80 backdrop-blur border border-slate-700/80 rounded-2xl p-5 shadow-2xl w-72 text-left">
            {/* Window chrome */}
            <div className="flex items-center gap-1.5 mb-4">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-400/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="ml-3 text-sm font-semibold text-sky-400">VoiceBridge</span>
            </div>

            {/* Translation pairs */}
            <div className="space-y-3">
              {PAIRS.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400 w-28 truncate">{p.from}</span>
                  <span className="flex-1 text-center">
                    <svg className="w-4 h-4 text-sky-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                  <span className="text-slate-300 w-28 text-right truncate">{p.to}</span>
                </div>
              ))}
            </div>

            {/* Status */}
            <div className="mt-4 flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-xs text-sky-300 font-medium">Translating live…</span>
              <span className="ml-auto text-xs text-slate-500">0.9s</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Stats ─────────────────────────────────────────────────────────────── */
function Stats({ t }: { t: ReturnType<typeof useTranslations> }) {
  const items = [
    { value: '50',     label: t('stats_langs') },
    { value: '< 1.2s', label: t('stats_latency') },
    { value: '2',      label: t('stats_platforms') },
    { value: '5 min',  label: t('stats_trial') },
    { value: '100%',   label: t('stats_secure') },
  ];
  return (
    <section className="py-12 border-y border-slate-800/60 bg-slate-900/30">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {items.map((item) => (
            <div key={item.label} className="text-center">
              <div className="text-2xl font-extrabold bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">
                {item.value}
              </div>
              <div className="text-xs text-slate-400 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How it works ──────────────────────────────────────────────────────── */
function HowItWorks({ t }: { t: ReturnType<typeof useTranslations> }) {
  const steps = [
    { step: t('how_1_step'), title: t('how_1_title'), desc: t('how_1_desc'), icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    )},
    { step: t('how_2_step'), title: t('how_2_title'), desc: t('how_2_desc'), icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    )},
    { step: t('how_3_step'), title: t('how_3_title'), desc: t('how_3_desc'), icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
      </svg>
    )},
  ];

  return (
    <section id="how" className="py-28 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
            {t('how_title')}
          </h2>
          <p className="text-slate-400 text-lg">{t('how_sub')}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <div key={i} className="relative group">
              {/* Connector line */}
              {i < 2 && (
                <div className="hidden md:block absolute top-8 left-[calc(100%-1rem)] w-8 h-px bg-gradient-to-r from-slate-700 to-transparent z-10" />
              )}
              <div className="h-full bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-slate-700/60 hover:border-sky-500/30 rounded-2xl p-6 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-sky-500/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                    {s.icon}
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                    {s.step}
                  </span>
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features ──────────────────────────────────────────────────────────── */
function Features({ t }: { t: ReturnType<typeof useTranslations> }) {
  const feats = [
    { title: t('feat_1_title'), desc: t('feat_1_desc'), gradient: 'from-sky-500 to-blue-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064" />
      </svg>
    )},
    { title: t('feat_2_title'), desc: t('feat_2_desc'), gradient: 'from-violet-500 to-purple-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )},
    { title: t('feat_3_title'), desc: t('feat_3_desc'), gradient: 'from-emerald-500 to-teal-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
      </svg>
    )},
    { title: t('feat_4_title'), desc: t('feat_4_desc'), gradient: 'from-amber-500 to-orange-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    )},
    { title: t('feat_5_title'), desc: t('feat_5_desc'), gradient: 'from-rose-500 to-pink-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )},
    { title: t('feat_6_title'), desc: t('feat_6_desc'), gradient: 'from-cyan-500 to-sky-600', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
  ];

  return (
    <section className="py-28 px-6 bg-slate-900/40">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-5xl font-extrabold text-center mb-4">
          {t('features_title')}
        </h2>
        <p className="text-center text-slate-400 mb-16 text-lg">
          {t('hero_sub').split('—')[0].trim()}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {feats.map((f) => (
            <div
              key={f.title}
              className="group relative bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 transition-all hover:-translate-y-1 overflow-hidden"
            >
              {/* Subtle gradient corner */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-br ${f.gradient}`} />
              <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center text-white bg-gradient-to-br ${f.gradient}`}>
                {f.icon}
              </div>
              <h3 className="font-bold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Language grid ─────────────────────────────────────────────────────── */
function Languages({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <section className="py-28 px-6">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="text-3xl md:text-5xl font-extrabold mb-4">{t('langs_title')}</h2>
        <p className="text-slate-400 mb-12 text-lg">{t('langs_sub')}</p>
        <div className="flex flex-wrap gap-2.5 justify-center">
          {LANGS.map((lang) => (
            <span
              key={lang}
              className="px-3 py-1.5 rounded-full text-sm font-medium bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:border-sky-500/40 hover:text-white transition-colors cursor-default"
            >
              {lang}
            </span>
          ))}
          <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-sky-500/10 border border-sky-500/30 text-sky-400">
            +30 more
          </span>
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing teaser ────────────────────────────────────────────────────── */
function PricingTeaser({ t }: { t: ReturnType<typeof useTranslations> }) {
  const plans = [
    { name: 'Free',         price: '$0',   minutes: 5,   desc: 'Try all 50 languages',  highlight: false },
    { name: 'Starter',      price: '$99',  minutes: 60,  desc: 'Perfect for occasional meetings', highlight: false },
    { name: 'Standard',     price: '$329', minutes: 240, desc: 'Most popular — daily meetings',   highlight: true  },
    { name: 'Professional', price: '$459', minutes: 360, desc: 'Power users and daily calls',     highlight: false },
  ];

  return (
    <section className="py-28 px-6 bg-slate-900/40">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4">{t('pricing_teaser_title')}</h2>
          <p className="text-slate-400 text-lg">{t('pricing_teaser_sub')}</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl p-5 border flex flex-col transition ${
                p.highlight
                  ? 'bg-sky-500/5 border-sky-500/40 shadow-xl shadow-sky-500/10'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold bg-sky-500 text-white px-3 py-0.5 rounded-full whitespace-nowrap">
                  Most popular
                </span>
              )}
              <div className="font-bold mb-1">{p.name}</div>
              <div className="text-xs text-slate-400 mb-4">{p.desc}</div>
              <div className="text-3xl font-extrabold mb-1">{p.price}</div>
              <div className="text-xs text-slate-500 mb-5">{p.minutes} min · ${(parseInt(p.price.replace('$','')) / p.minutes || 0).toFixed(2)}/min</div>
              <Link
                href="/pricing"
                className={`mt-auto block w-full py-2.5 rounded-xl text-center text-sm font-semibold transition ${
                  p.highlight
                    ? 'bg-sky-500 hover:bg-sky-400 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                }`}
              >
                {p.name === 'Free' ? 'Download Free' : 'Buy Now'}
              </Link>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link href="/pricing" className="text-sky-400 hover:text-sky-300 font-medium transition">
            {t('pricing_teaser_cta')}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ───────────────────────────────────────────────────────────────── */
function CtaBanner({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <section className="py-28 px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-sky-500/8 blur-[100px]" />
      </div>
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
          {t('cta_title')}
        </h2>
        <p className="text-slate-400 text-lg mb-10">{t('cta_sub')}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/download"
            className="px-8 py-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-base transition-all shadow-lg shadow-sky-500/30 hover:-translate-y-0.5"
          >
            {t('cta_primary')}
          </Link>
          <Link
            href="/pricing"
            className="px-8 py-4 rounded-xl border border-slate-700 hover:border-slate-500 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium text-base transition-all hover:-translate-y-0.5"
          >
            {t('cta_secondary')}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────────────── */
function Footer({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <footer className="border-t border-slate-800 py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <span className="font-extrabold text-sky-400 text-lg">VoiceBridge</span>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-[180px]">
              {t('footer_tagline')}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('footer_product')}</p>
            <div className="space-y-2">
              <Link href="/download" className="block text-sm text-slate-500 hover:text-slate-300 transition">{t('footer_download')}</Link>
              <Link href="/pricing"  className="block text-sm text-slate-500 hover:text-slate-300 transition">{t('footer_pricing')}</Link>
              <Link href="#how"      className="block text-sm text-slate-500 hover:text-slate-300 transition">{t('nav_how')}</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('footer_company')}</p>
            <div className="space-y-2">
              <Link href="/dashboard" className="block text-sm text-slate-500 hover:text-slate-300 transition">{t('footer_dashboard')}</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('footer_legal_title')}</p>
            <div className="space-y-2">
              <span className="block text-sm text-slate-500">{t('footer_privacy')}</span>
              <span className="block text-sm text-slate-500">{t('footer_terms')}</span>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800 pt-6 text-xs text-slate-600">
          {t('footer_legal')}
        </div>
      </div>
    </footer>
  );
}
