'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRef, useEffect, useState } from 'react';
import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../lib/auth';

const FiberScene = dynamic(() => import('../../components/FiberScene'), { ssr: false });

/* ─── Animation helpers ─────────────────────────────────────────────────── */
function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.8, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Language data ─────────────────────────────────────────────────────── */
const LANGS = [
  '🇬🇧 English','🇹🇷 Turkish','🇪🇸 Spanish','🇫🇷 French','🇩🇪 German',
  '🇵🇹 Portuguese','🇮🇳 Hindi','🇨🇳 Chinese','🇯🇵 Japanese','🇸🇦 Arabic',
  '🇰🇷 Korean','🇮🇹 Italian','🇷🇺 Russian','🇳🇱 Dutch','🇵🇱 Polish',
  '🇸🇪 Swedish','🇳🇴 Norwegian','🇩🇰 Danish','🇫🇮 Finnish','🇺🇦 Ukrainian',
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
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y       = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const opacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#04080f]">

      {/* ── Full-screen fiber canvas (absolute behind everything) ── */}
      <div className="absolute inset-0 z-0">
        <FiberScene />
      </div>

      {/* ── Dark gradient vignette so text stays readable ── */}
      <div className="absolute inset-0 z-10 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,transparent_30%,#04080f_100%)]" />
      {/* bottom fade into next section */}
      <div className="absolute bottom-0 left-0 right-0 h-48 z-10 pointer-events-none bg-gradient-to-t from-[#04080f] to-transparent" />

      {/* ── Floating copy (centred, above canvas) ── */}
      <motion.div
        style={{ y, opacity }}
        className="relative z-20 flex flex-col items-center text-center px-6 pt-20 pb-8 max-w-4xl mx-auto"
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: 'backOut' }}
          className="inline-flex items-center gap-2 text-xs font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20 px-4 py-1.5 rounded-full mb-8 backdrop-blur-sm"
        >
          <motion.span
            animate={{ scale: [1, 1.5, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-sky-400"
          />
          {t('hero_badge')}
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[1.02] mb-6 whitespace-pre-line"
        >
          <span className="bg-gradient-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-transparent drop-shadow-2xl">
            {t('hero_headline')}
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="text-lg md:text-xl text-slate-300/80 max-w-2xl mb-10 leading-relaxed"
        >
          {t('hero_sub')}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mb-16"
        >
          <Link
            href="/dashboard"
            className="group relative overflow-hidden px-9 py-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-base transition-all shadow-xl shadow-sky-500/40 hover:shadow-sky-500/60 hover:-translate-y-1"
          >
            <span className="relative z-10">{t('hero_cta_primary')}</span>
            <motion.div className="absolute inset-0 bg-gradient-to-r from-sky-400 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Link>
          <Link
            href="#how"
            className="px-9 py-4 rounded-xl border border-white/10 hover:border-sky-500/40 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm text-slate-300 hover:text-white font-medium text-base transition-all hover:-translate-y-1"
          >
            {t('hero_cta_secondary')} →
          </Link>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="flex gap-10 sm:gap-16"
        >
          {[['50+', 'Languages'], ['<1.2s', 'Latency'], ['99.9%', 'Uptime']].map(([val, label]) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold text-white">{val}</div>
              <div className="text-xs text-slate-500 mt-0.5 uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* ── Mic translation card — floats at bottom of hero ── */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.1 }}
        className="relative z-20 w-full flex justify-center px-4 pb-12"
      >
        <MicHero />
      </motion.div>
    </section>
  );
}

/* ─── Mic animation hero ─────────────────────────────────────────────────── */
const TRANSLATION_PAIRS = [
  { from: '🇹🇷 Türkçe konuşuyorum...', to: '🇬🇧 I am speaking Turkish...' },
  { from: '🇩🇪 Ich spreche Deutsch...', to: '🇯🇵 ドイツ語を話しています...' },
  { from: '🇫🇷 Je parle français...', to: '🇸🇦 أنا أتحدث الفرنسية...' },
  { from: '🇪🇸 Estoy hablando español...', to: '🇨🇳 我在说西班牙语...' },
];

const EQ_BARS = [3, 7, 5, 9, 4, 8, 6, 10, 5, 7, 3, 8, 6, 4, 9];

function MicHero() {
  const [pairIdx, setPairIdx] = useState(0);
  const [speaking, setSpeaking] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setSpeaking(false);
      setTimeout(() => {
        setPairIdx(i => (i + 1) % TRANSLATION_PAIRS.length);
        setSpeaking(true);
      }, 600);
    }, 3200);
    return () => clearInterval(iv);
  }, []);

  const pair = TRANSLATION_PAIRS[pairIdx];

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col items-center gap-8 mt-4"
    >
      {/* Microphone orb */}
      <div className="relative flex items-center justify-center">
        {/* Expanding sound rings */}
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-sky-400/30"
            animate={{ scale: [1, 2.4 + i * 0.4], opacity: [0.5, 0] }}
            transition={{ duration: 2.2, delay: i * 0.5, repeat: Infinity, ease: 'easeOut' }}
            style={{ width: 90, height: 90 }}
          />
        ))}

        {/* Inner glow */}
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-28 h-28 rounded-full bg-sky-500/20 blur-xl"
        />

        {/* Mic button */}
        <motion.div
          animate={{ scale: speaking ? [1, 1.06, 1] : 1 }}
          transition={{ duration: 0.4, repeat: speaking ? Infinity : 0 }}
          className="relative z-10 w-20 h-20 rounded-full bg-gradient-to-br from-sky-500 to-violet-600 shadow-2xl shadow-sky-500/50 flex items-center justify-center"
        >
          <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 17.93A8.001 8.001 0 0 1 4.07 12H2a10 10 0 0 0 9 9.93V24h2v-2.07A10 10 0 0 0 22 12h-2.07a8.001 8.001 0 0 1-6.93 6.93V19h-2v-.07z"/>
          </svg>
        </motion.div>
      </div>

      {/* Equalizer bars */}
      <div className="flex items-end gap-[3px] h-10">
        {EQ_BARS.map((h, i) => (
          <motion.div
            key={i}
            className="w-1.5 rounded-full bg-gradient-to-t from-sky-600 to-sky-400"
            animate={speaking
              ? { height: [`${h * 3}px`, `${(h * 1.8 + Math.random() * 8) | 0}px`, `${h * 3}px`] }
              : { height: '4px' }
            }
            transition={{ duration: 0.35 + i * 0.02, repeat: Infinity, ease: 'easeInOut', delay: i * 0.04 }}
          />
        ))}
      </div>

      {/* Live translation card */}
      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-5 shadow-2xl">
        {/* From */}
        <div className="mb-3">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Speaking</span>
          <AnimatePresence mode="wait">
            <motion.p
              key={pair.from}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="text-slate-200 font-medium mt-0.5"
            >
              {pair.from}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Divider with arrow */}
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-slate-800" />
          <motion.div
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="w-7 h-7 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </motion.div>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* To */}
        <div className="mb-4">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">They hear</span>
          <AnimatePresence mode="wait">
            <motion.p
              key={pair.to}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, delay: 0.15 }}
              className="text-white font-semibold mt-0.5"
            >
              {pair.to}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2.5 bg-sky-500/8 border border-sky-500/20 rounded-xl px-3 py-2">
          <motion.div
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0"
          />
          <span className="text-xs text-sky-300 font-semibold">Translating live</span>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-xs text-emerald-400 font-mono font-bold">0.9s</span>
            <span className="text-xs text-slate-600">latency</span>
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <motion.div
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -right-4 top-8 bg-emerald-500/10 border border-emerald-500/25 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-semibold text-emerald-300 hidden lg:block"
      >
        ✓ 50 languages
      </motion.div>
      <motion.div
        animate={{ y: [0, 7, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute -left-4 top-16 bg-violet-500/10 border border-violet-500/25 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-semibold text-violet-300 hidden lg:block"
      >
        ⚡ &lt;1.2s latency
      </motion.div>
    </motion.div>
  );
}

/* ─── Stats ─────────────────────────────────────────────────────────────── */
function Stats({ t }: { t: ReturnType<typeof useTranslations> }) {
  const items = [
    { value: '50',    label: t('stats_langs') },
    { value: '<1.2s', label: t('stats_latency') },
    { value: '2',     label: t('stats_platforms') },
    { value: '5 min', label: t('stats_trial') },
    { value: '100%',  label: t('stats_secure') },
  ];
  return (
    <FadeIn>
      <section className="py-14 border-y border-slate-800/60 bg-slate-900/40 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-6">
          {items.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className="text-center"
            >
              <div className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">
                {item.value}
              </div>
              <div className="text-xs text-slate-500 mt-1">{item.label}</div>
            </motion.div>
          ))}
        </div>
      </section>
    </FadeIn>
  );
}

/* ─── How it works ──────────────────────────────────────────────────────── */
function HowItWorks({ t }: { t: ReturnType<typeof useTranslations> }) {
  const steps = [
    { step: '01', title: t('how_1_title'), desc: t('how_1_desc'), color: 'from-sky-500 to-blue-600' },
    { step: '02', title: t('how_2_title'), desc: t('how_2_desc'), color: 'from-violet-500 to-purple-600' },
    { step: '03', title: t('how_3_title'), desc: t('how_3_desc'), color: 'from-emerald-500 to-teal-600' },
  ];
  return (
    <section id="how" className="py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-20">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-4">{t('how_title')}</h2>
          <p className="text-slate-400 text-xl">{t('how_sub')}</p>
        </FadeUp>

        <div className="grid md:grid-cols-3 gap-6 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-sky-500/30 via-violet-500/30 to-emerald-500/30" />

          {steps.map((s, i) => (
            <FadeUp key={i} delay={i * 0.15}>
              <motion.div
                whileHover={{ y: -8, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="group relative bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-7 h-full"
              >
                {/* Gradient corner on hover */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${s.color} opacity-0 group-hover:opacity-[0.04] transition-opacity duration-500`} />

                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-5 shadow-lg`}>
                  <span className="text-white font-bold text-lg">{s.step}</span>
                </div>
                <h3 className="font-bold text-white text-xl mb-3">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features ──────────────────────────────────────────────────────────── */
function Features({ t }: { t: ReturnType<typeof useTranslations> }) {
  const feats = [
    { title: t('feat_1_title'), desc: t('feat_1_desc'), gradient: 'from-sky-500 to-blue-600', emoji: '🌐' },
    { title: t('feat_2_title'), desc: t('feat_2_desc'), gradient: 'from-violet-500 to-purple-600', emoji: '⚡' },
    { title: t('feat_3_title'), desc: t('feat_3_desc'), gradient: 'from-emerald-500 to-teal-600', emoji: '✓' },
    { title: t('feat_4_title'), desc: t('feat_4_desc'), gradient: 'from-amber-500 to-orange-600', emoji: '🔒' },
    { title: t('feat_5_title'), desc: t('feat_5_desc'), gradient: 'from-rose-500 to-pink-600', emoji: '💻' },
    { title: t('feat_6_title'), desc: t('feat_6_desc'), gradient: 'from-cyan-500 to-sky-600', emoji: '♾️' },
  ];

  return (
    <section className="py-32 px-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-violet-600/5 blur-[120px]" />
      </div>
      <div className="max-w-6xl mx-auto">
        <FadeUp className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-4">{t('features_title')}</h2>
        </FadeUp>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {feats.map((f, i) => (
            <FadeUp key={f.title} delay={i * 0.08}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="group relative bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-7 overflow-hidden h-full backdrop-blur-sm"
              >
                {/* Hover gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-500`} />
                {/* Top accent line */}
                <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r ${f.gradient} opacity-0 group-hover:opacity-60 transition-opacity duration-500`} />

                <div className={`w-11 h-11 rounded-xl mb-5 flex items-center justify-center bg-gradient-to-br ${f.gradient} shadow-lg text-lg`}>
                  {f.emoji}
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Language grid ─────────────────────────────────────────────────────── */
function Languages({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <section className="py-32 px-6 bg-slate-900/40">
      <div className="max-w-5xl mx-auto text-center">
        <FadeUp>
          <h2 className="text-4xl md:text-6xl font-extrabold mb-4">{t('langs_title')}</h2>
          <p className="text-slate-400 mb-14 text-xl">{t('langs_sub')}</p>
        </FadeUp>
        <div className="flex flex-wrap gap-3 justify-center">
          {LANGS.map((lang, i) => (
            <motion.span
              key={lang}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              whileHover={{ scale: 1.1, y: -2 }}
              className="px-4 py-2 rounded-full text-sm font-medium bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:border-sky-500/40 hover:text-white hover:bg-slate-700/80 transition-colors cursor-default"
            >
              {lang}
            </motion.span>
          ))}
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: LANGS.length * 0.04 }}
            className="px-4 py-2 rounded-full text-sm font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-400"
          >
            +30 more
          </motion.span>
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing teaser ────────────────────────────────────────────────────── */
function PricingTeaser({ t }: { t: ReturnType<typeof useTranslations> }) {
  const plans = [
    { name: 'Free',         price: '$0',   minutes: 5,   highlight: false, badge: null },
    { name: 'Starter',      price: '$99',  minutes: 60,  highlight: false, badge: null },
    { name: 'Standard',     price: '$329', minutes: 240, highlight: true,  badge: 'Most popular' },
    { name: 'Professional', price: '$459', minutes: 360, highlight: false, badge: null },
  ];

  return (
    <section className="py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-14">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-4">{t('pricing_teaser_title')}</h2>
          <p className="text-slate-400 text-xl">{t('pricing_teaser_sub')}</p>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {plans.map((p, i) => (
            <FadeUp key={p.name} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -8, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 260 }}
                className={`relative rounded-2xl p-5 border flex flex-col h-full ${
                  p.highlight
                    ? 'bg-sky-500/5 border-sky-500/40 shadow-2xl shadow-sky-500/10'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                {p.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold bg-gradient-to-r from-sky-500 to-violet-500 text-white px-3 py-0.5 rounded-full whitespace-nowrap">
                    {p.badge}
                  </span>
                )}
                <div className="font-bold text-lg mb-1">{p.name}</div>
                <div className="text-3xl font-extrabold my-3">{p.price}</div>
                <div className="text-xs text-slate-500 mb-5">{p.minutes} min · ${(parseInt(p.price.replace('$','') || '0') / (p.minutes || 1)).toFixed(2)}/min</div>
                <Link
                  href={p.name === 'Free' ? '/dashboard' : '/pricing'}
                  className={`mt-auto block w-full py-2.5 rounded-xl text-center text-sm font-semibold transition ${
                    p.highlight
                      ? 'bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-lg'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                  }`}
                >
                  {p.name === 'Free' ? 'Start Free' : 'Buy Now'}
                </Link>
              </motion.div>
            </FadeUp>
          ))}
        </div>

        <FadeIn className="text-center">
          <Link href="/pricing" className="text-sky-400 hover:text-sky-300 font-semibold transition text-lg">
            {t('pricing_teaser_cta')}
          </Link>
        </FadeIn>
      </div>
    </section>
  );
}

/* ─── CTA ───────────────────────────────────────────────────────────────── */
function CtaBanner({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <section className="py-32 px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.08, 0.16, 0.08] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-gradient-to-t from-sky-600 to-violet-600 blur-[130px]"
        />
      </div>
      <div className="max-w-3xl mx-auto text-center">
        <FadeUp>
          <h2 className="text-4xl md:text-6xl font-extrabold mb-5">{t('cta_title')}</h2>
          <p className="text-slate-400 text-xl mb-12">{t('cta_sub')}</p>
        </FadeUp>
        <FadeUp delay={0.15}>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/dashboard"
                className="block px-10 py-4 rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 hover:from-sky-400 hover:to-violet-400 text-white font-bold text-lg transition-all shadow-2xl shadow-sky-500/30"
              >
                {t('cta_primary')}
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/pricing"
                className="block px-10 py-4 rounded-xl border border-slate-700 hover:border-slate-500 bg-white/5 hover:bg-white/10 text-slate-200 font-semibold text-lg transition-all"
              >
                {t('cta_secondary')}
              </Link>
            </motion.div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────────────── */
function Footer({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <footer className="border-t border-slate-800/60 py-14 px-6 bg-slate-950/60 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-10">
          <div className="col-span-2 md:col-span-1">
            <span className="font-extrabold text-sky-400 text-xl">VoiceBridge</span>
            <p className="text-xs text-slate-500 mt-3 leading-relaxed max-w-[180px]">{t('footer_tagline')}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('footer_product')}</p>
            <div className="space-y-2.5">
              <Link href="/download"  className="block text-sm text-slate-500 hover:text-slate-200 transition">{t('footer_download')}</Link>
              <Link href="/pricing"   className="block text-sm text-slate-500 hover:text-slate-200 transition">{t('footer_pricing')}</Link>
              <Link href="/#how"      className="block text-sm text-slate-500 hover:text-slate-200 transition">{t('nav_how')}</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('footer_company')}</p>
            <div className="space-y-2.5">
              <Link href="/dashboard" className="block text-sm text-slate-500 hover:text-slate-200 transition">{t('footer_dashboard')}</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('footer_legal_title')}</p>
            <div className="space-y-2.5">
              <span className="block text-sm text-slate-600">{t('footer_privacy')}</span>
              <span className="block text-sm text-slate-600">{t('footer_terms')}</span>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800/60 pt-6 flex flex-col md:flex-row justify-between items-center gap-3">
          <p className="text-xs text-slate-600">{t('footer_legal')}</p>
          <div className="flex gap-4 text-xs text-slate-600">
            <span>voicebridgeapps.com</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
