'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../lib/auth';

const GlobeHero = dynamic(() => import('../../components/GlobeHero'), { ssr: false });
const MicScene  = dynamic(() => import('../../components/MicScene'),  { ssr: false });

/* ── Scroll-triggered reveal helpers ─────────────────────────────────────── */
function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}
function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  return (
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.9, delay }} className={className}>
      {children}
    </motion.div>
  );
}

/* ── 3D tilt hook ─────────────────────────────────────────────────────────── */
function useTilt(max = 14) {
  const ref = useRef<HTMLDivElement>(null);
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - 0.5;
    const y = (e.clientY - r.top)  / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(12px)`;
  }, [max]);
  const onMouseLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
  }, []);
  return { ref, onMouseMove, onMouseLeave };
}

/* ── Language data ────────────────────────────────────────────────────────── */
const LANGS_ROW1 = [
  '🇬🇧 English','🇹🇷 Turkish','🇪🇸 Spanish','🇫🇷 French','🇩🇪 German',
  '🇵🇹 Portuguese','🇮🇳 Hindi','🇨🇳 Chinese','🇯🇵 Japanese','🇸🇦 Arabic',
  '🇰🇷 Korean','🇮🇹 Italian','🇺🇦 Ukrainian','🇧🇩 Bengali','🇵🇰 Urdu',
  '🇻🇳 Vietnamese','🇹🇭 Thai','🇮🇩 Indonesian',
];
const LANGS_ROW2 = [
  '🇷🇺 Russian','🇳🇱 Dutch','🇵🇱 Polish','🇸🇪 Swedish','🇳🇴 Norwegian',
  '🇩🇰 Danish','🇫🇮 Finnish','🇲🇾 Malay','🇵🇭 Filipino','🇰🇪 Swahili',
  '🇬🇪 Georgian','🇦🇲 Armenian','🇦🇿 Azerbaijani','🇳🇬 Hausa','🇪🇹 Amharic',
  '🇲🇲 Burmese','🇰🇭 Khmer','🇱🇰 Sinhala',
];

/* ── Animated stat counter ───────────────────────────────────────────────── */
function StatCounter({ value, suffix = '', prefix = '', label }: { value: number; suffix?: string; prefix?: string; label: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = Date.now();
    const duration = 1200;
    const raf = requestAnimationFrame(function tick() {
      const progress = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(parseFloat((value * ease).toFixed(value % 1 !== 0 ? 1 : 0)));
      if (progress < 1) requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  return (
    <div ref={ref} className="text-left">
      <div className="text-2xl font-extrabold text-white tabular-nums">
        {prefix}{display}{suffix}
      </div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

/* ── Live translation demo pairs ─────────────────────────────────────────── */
const PAIRS = [
  { from: '🇹🇷 Türkçe konuşuyorum...', to: '🇬🇧 I am speaking Turkish...' },
  { from: '🇩🇪 Ich spreche Deutsch...', to: '🇯🇵 ドイツ語を話しています...' },
  { from: '🇫🇷 Je parle français...',  to: '🇸🇦 أنا أتحدث الفرنسية...' },
  { from: '🇪🇸 Estoy hablando...',     to: '🇨🇳 我在说西班牙语...' },
];
const EQ = [3,7,5,9,4,8,6,10,5,7,3,8,6,4,9];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PAGE                                                                       */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  const t = useTranslations();
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0a0a0f] text-white">
      <Hero t={t} />
      <Stats t={t} />
      <BusinessStats />
      <HowItWorks t={t} />
      <PlatformCompatibility t={t} />
      <UseCases />
      <NoInterpreterNeeded />
      <Features t={t} />
      <Languages t={t} />
      <PricingTeaser t={t} />
      <CtaBanner t={t} />
    </main>
  );
}

/* ── Business Stats (KUDO-style) ──────────────────────────────────────────── */
const BIZ_STATS = [
  {
    value: '59%',
    label: 'of employees working in another language worry about missing information',
    source: 'Foreign Language Anxiety Study, 2022',
    icon: '😟',
    color: 'from-rose-500 to-pink-600',
    glow: 'rgba(244,63,94,0.15)',
  },
  {
    value: '80%',
    label: 'of workers are more productive when spoken to in their native language',
    source: 'Forbes Insights / Rosetta Stone Survey',
    icon: '⚡',
    color: 'from-amber-500 to-orange-500',
    glow: 'rgba(245,158,11,0.15)',
  },
  {
    value: '25%',
    label: 'of companies lose business opportunities due to language barriers',
    source: 'American Council on the Teaching of Foreign Languages',
    icon: '📉',
    color: 'from-cyan-500 to-blue-600',
    glow: 'rgba(0,200,255,0.15)',
  },
];

function BusinessStats() {
  return (
    <section className="py-24 px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0,200,255,0.04) 0%, transparent 70%)' }} />
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-14">
          <span className="inline-block text-xs font-bold tracking-widest uppercase mb-4 px-3 py-1 rounded-full"
            style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', color: '#67e8f9' }}>
            Why it matters
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 text-white">
            Language barriers cost businesses{' '}
            <span style={{ background: 'linear-gradient(90deg,#f43f5e,#f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              every day
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            VoiceBridge eliminates the barrier — no interpreter fees, no scheduling, no delays.
          </p>
        </FadeUp>
        <div className="grid md:grid-cols-3 gap-6">
          {BIZ_STATS.map((s, i) => (
            <FadeUp key={i} delay={i * 0.12}>
              <TiltCard glowColor={s.glow} lift
                className="group relative rounded-2xl p-8 h-full flex flex-col"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)' }}>
                <div className={`absolute inset-0 bg-gradient-to-br ${s.color} opacity-0 group-hover:opacity-[0.05] transition-opacity duration-500 rounded-2xl`} />
                <div className="text-4xl mb-4">{s.icon}</div>
                <div className={`text-5xl font-black mb-3 bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>
                  {s.value}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed flex-1">{s.label}</p>
                <p className="text-slate-600 text-[10px] mt-4 italic">*{s.source}</p>
              </TiltCard>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── No Interpreter Needed ────────────────────────────────────────────────── */
const COMPARISON = [
  { label: 'Cost',          human: '$150–$500/hour',  ai: 'From $0.99',        winner: 'ai' },
  { label: 'Availability',  human: 'Schedule in advance', ai: '24/7 instant',  winner: 'ai' },
  { label: 'Languages',     human: '1–3 specialties', ai: '100+ languages',    winner: 'ai' },
  { label: 'Latency',       human: '2–5s relay',      ai: '< 1 second',        winner: 'ai' },
  { label: 'Setup',         human: 'Days of planning', ai: 'Download & go',    winner: 'ai' },
  { label: 'Privacy',       human: 'Third party present', ai: 'On-device audio', winner: 'ai' },
];

function NoInterpreterNeeded() {
  return (
    <section className="py-32 px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full blur-[140px]"
          style={{ background: 'radial-gradient(ellipse, rgba(124,58,237,0.07) 0%, transparent 70%)' }} />
      </div>
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-16">
          <span className="inline-block text-xs font-bold tracking-widest uppercase mb-4 px-3 py-1 rounded-full"
            style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa' }}>
            AI vs Human Interpreter
          </span>
          <h2 className="text-4xl md:text-6xl font-extrabold mb-4">
            No interpreter{' '}
            <span style={{ background: 'linear-gradient(90deg,#00c8ff,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              needed.
            </span>
          </h2>
          <p className="text-slate-400 text-xl max-w-2xl mx-auto">
            VoiceBridge replaces expensive human interpreters with real-time AI — available instantly, in 100+ languages, at a fraction of the cost.
          </p>
        </FadeUp>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {/* Human interpreter card */}
          <FadeUp delay={0}>
            <div className="rounded-2xl p-8 h-full"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">👤</div>
                <div>
                  <h3 className="font-bold text-white text-lg">Human Interpreter</h3>
                  <p className="text-slate-500 text-sm">Traditional approach</p>
                </div>
              </div>
              <div className="space-y-3">
                {COMPARISON.map(c => (
                  <div key={c.label} className="flex items-center justify-between py-2 border-b border-white/[0.05]">
                    <span className="text-slate-500 text-sm">{c.label}</span>
                    <span className="text-slate-400 text-sm">{c.human}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>

          {/* VoiceBridge card */}
          <FadeUp delay={0.1}>
            <TiltCard glowColor="rgba(0,200,255,0.15)" lift
              className="rounded-2xl p-8 h-full relative overflow-hidden"
              style={{ background: 'rgba(0,200,255,0.04)', border: '1px solid rgba(0,200,255,0.2)' }}>
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.5), transparent)' }} />
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{ background: 'linear-gradient(135deg,#00c8ff,#7c3aed)' }}>⚡</div>
                <div>
                  <h3 className="font-bold text-white text-lg">VoiceBridge AI</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(0,200,255,0.15)', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.3)' }}>
                    RECOMMENDED
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                {COMPARISON.map(c => (
                  <div key={c.label} className="flex items-center justify-between py-2 border-b border-cyan-500/10">
                    <span className="text-slate-400 text-sm">{c.label}</span>
                    <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#00c8ff' }}>
                      <span className="text-emerald-400 text-xs">✓</span>{c.ai}
                    </span>
                  </div>
                ))}
              </div>
            </TiltCard>
          </FadeUp>
        </div>

        {/* Trust banner */}
        <FadeUp delay={0.2}>
          <div className="rounded-2xl p-8 text-center relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(0,200,255,0.06), rgba(124,58,237,0.06))', border: '1px solid rgba(0,200,255,0.15)' }}>
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.4), rgba(124,58,237,0.4), transparent)' }} />
            <p className="text-2xl font-extrabold text-white mb-2">
              Professional-grade AI interpretation — available 24/7
            </p>
            <p className="text-slate-400 mb-6 max-w-xl mx-auto">
              Trusted for business meetings, corporate training, customer support, and global events. Works with Zoom, Teams, Google Meet, and any audio platform.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-400">
              {['Zoom', 'Google Meet', 'Microsoft Teams', 'Webex', 'Any Platform'].map(p => (
                <span key={p} className="px-3 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
function Hero({ t }: { t: ReturnType<typeof useTranslations> }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const textY    = useTransform(scrollYProgress, [0, 1],    [0, 110]);
  const textOp   = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const micY     = useTransform(scrollYProgress, [0, 0.5],  [0, -80]);
  const micOp    = useTransform(scrollYProgress, [0, 0.45], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-screen flex flex-col overflow-hidden bg-[#0a0a12]">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse 55% 55% at 68% 45%, rgba(0,200,255,0.07) 0%, transparent 70%)' }} />
      <div className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse 35% 35% at 68% 45%, rgba(124,58,237,0.05) 0%, transparent 70%)' }} />

      {/* 40/60 split — text left, mic right */}
      <div className="relative z-10 flex-1 max-w-[1400px] mx-auto w-full grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-0 items-center px-6 pt-24 pb-0 min-h-screen">

        {/* Left: copy (40%) */}
        <motion.div style={{ y: textY, opacity: textOp }}
          className="text-center lg:text-left order-1 lg:order-1 flex flex-col justify-center py-16 lg:py-0 lg:pr-8">

          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'backOut' }}
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 backdrop-blur-sm self-center lg:self-start"
            style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', color: '#67e8f9' }}>
            <motion.span animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            {t('hero_badge')}
          </motion.div>

          {/* Split headline — Apple style */}
          <div className="mb-6">
            <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="text-5xl sm:text-6xl lg:text-[68px] xl:text-[76px] font-extrabold tracking-tight leading-[1.04]">
              <span className="text-white block">Speak any</span>
              <span className="text-white block">language.</span>
              <span className="block mt-1" style={{ color: 'rgba(255,255,255,0.28)' }}>Your audience</span>
              <span className="block" style={{ color: 'rgba(255,255,255,0.28)' }}>hears theirs.</span>
            </motion.h1>
          </div>

          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="text-base text-slate-400 max-w-sm mb-8 leading-relaxed mx-auto lg:mx-0">
            {t('hero_sub')}
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-10">
            <Link href="/dashboard"
              className="px-8 py-3.5 rounded-full font-bold text-sm text-black transition-all active:scale-95"
              style={{ background: '#00c8ff', boxShadow: '0 0 28px rgba(0,200,255,0.35)' }}
              onMouseEnter={e => ((e.target as HTMLElement).style.background = '#22d3ee')}
              onMouseLeave={e => ((e.target as HTMLElement).style.background = '#00c8ff')}>
              {t('hero_cta_primary')}
            </Link>
            <Link href="#how"
              className="px-8 py-3.5 rounded-full font-medium text-sm text-slate-300 hover:text-white transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
              {t('hero_cta_secondary')} →
            </Link>
          </motion.div>

          {/* Stats row — animated counters */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.6 }}
            className="flex flex-wrap gap-6 justify-center lg:justify-start">
            {[
              { value: 100,  suffix: '+', label: 'Languages' },
              { value: 1,    prefix: '<', suffix: 's', label: 'Latency' },
              { value: 99.9, suffix: '%', label: 'Uptime' },
            ].map((s) => (
              <StatCounter key={s.label} {...s} />
            ))}
          </motion.div>
        </motion.div>

        {/* Right: 3D Mic (60%) — rises + fades on scroll */}
        <motion.div
          style={{ y: micY, opacity: micOp }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 1.4, delay: 0.2 }}
          className="order-2 lg:order-2 h-[260px] sm:h-[340px] lg:h-screen w-full relative">
          {/* On mobile: hide 3D, show gradient instead */}
          <div className="absolute inset-0 md:hidden rounded-3xl"
            style={{ background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0,200,255,0.12) 0%, rgba(124,58,237,0.08) 50%, transparent 100%)' }} />
          <div className="hidden md:block absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 55%, rgba(0,200,255,0.06) 0%, transparent 70%)' }} />
          <div className="hidden md:block w-full h-full">
            <MicScene />
          </div>

          {/* Live translation glass card — bottom left */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.3, duration: 0.6 }}
            className="absolute bottom-20 left-4 w-64 pointer-events-none"
            style={{ background: 'rgba(10,10,20,0.72)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '14px 16px' }}>
            <LiveDemo compact />
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none z-10 bg-gradient-to-t from-[#0a0a12] to-transparent" />
    </section>
  );
}

/* ── Live translation demo card ───────────────────────────────────────────── */
function LiveDemo({ compact = false }: { compact?: boolean }) {
  const [idx, setIdx] = useState(0);
  const [speaking, setSpeaking] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => {
      setSpeaking(false);
      setTimeout(() => { setIdx(i => (i+1) % PAIRS.length); setSpeaking(true); }, 600);
    }, 3400);
    return () => clearInterval(iv);
  }, []);
  const p = PAIRS[idx];

  return (
    <div className={`w-full ${compact ? '' : 'max-w-sm bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl'}`}>
      {/* Mic + EQ row */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative">
          {[0,1,2].map(i => (
            <motion.div key={i} className="absolute inset-0 rounded-full border border-cyan-400/30"
              animate={{ scale: [1, 2.2 + i*0.4], opacity: [0.5, 0] }}
              transition={{ duration: 2, delay: i*0.55, repeat: Infinity, ease: 'easeOut' }} />
          ))}
          <motion.div animate={{ scale: speaking ? [1,1.07,1] : 1 }}
            transition={{ duration: 0.4, repeat: speaking ? Infinity : 0 }}
            className="relative z-10 w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-violet-600 shadow-lg shadow-cyan-500/40 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 17.93A8.001 8.001 0 0 1 4.07 12H2a10 10 0 0 0 9 9.93V24h2v-2.07A10 10 0 0 0 22 12h-2.07a8.001 8.001 0 0 1-6.93 6.93V19h-2v-.07z"/>
            </svg>
          </motion.div>
        </div>
        <div className="flex items-end gap-[2px] h-8">
          {EQ.map((h,i) => (
            <motion.div key={i} className="w-1 rounded-full bg-gradient-to-t from-cyan-600 to-cyan-400"
              animate={speaking ? { height: [`${h*2.2}px`,`${(h*1.6+3)|0}px`,`${h*2.2}px`] } : { height: '3px' }}
              transition={{ duration: 0.3+i*0.02, repeat: Infinity, ease: 'easeInOut', delay: i*0.03 }} />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-cyan-300 font-semibold">
          <motion.div animate={{ opacity: [1,0.3,1] }} transition={{ duration: 1, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          Live
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest">Speaking</span>
          <AnimatePresence mode="wait">
            <motion.p key={p.from} initial={{ opacity:0,y:6 }} animate={{ opacity:1,y:0 }}
              exit={{ opacity:0,y:-6 }} transition={{ duration:0.3 }} className="text-sm text-slate-200 font-medium mt-0.5">{p.from}</motion.p>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2 py-1">
          <div className="flex-1 h-px bg-white/8" />
          <motion.div animate={{ x:[0,3,0] }} transition={{ duration:1.1, repeat:Infinity }}
            className="text-cyan-400 text-xs">→</motion.div>
          <div className="flex-1 h-px bg-white/8" />
        </div>
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest">They hear</span>
          <AnimatePresence mode="wait">
            <motion.p key={p.to} initial={{ opacity:0,y:6 }} animate={{ opacity:1,y:0 }}
              exit={{ opacity:0,y:-6 }} transition={{ duration:0.3, delay:0.12 }} className="text-sm text-white font-semibold mt-0.5">{p.to}</motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ── Stats bar ────────────────────────────────────────────────────────────── */
function Stats({ t }: { t: ReturnType<typeof useTranslations> }) {
  const items = [
    { value: '100',   label: t('stats_langs') },
    { value: '<1s', label: t('stats_latency') },
    { value: '2',     label: t('stats_platforms') },
    { value: '5 min', label: t('stats_trial') },
    { value: '100%',  label: t('stats_secure') },
  ];
  return (
    <FadeIn>
      <section className="py-12 border-y border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-6">
          {items.map((item, i) => (
            <motion.div key={item.label} initial={{ opacity:0, y:16 }}
              whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
              transition={{ duration:0.5, delay: i * 0.08 }} className="text-center">
              <div className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
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

/* ── How it works — 3D tilt cards ─────────────────────────────────────────── */
function HowItWorks({ t }: { t: ReturnType<typeof useTranslations> }) {
  const steps = [
    { step: '01', title: t('how_1_title'), desc: t('how_1_desc'), color: 'from-cyan-500 to-blue-600', glow: 'rgba(0,200,255,0.15)' },
    { step: '02', title: t('how_2_title'), desc: t('how_2_desc'), color: 'from-violet-500 to-purple-600', glow: 'rgba(124,58,237,0.15)' },
    { step: '03', title: t('how_3_title'), desc: t('how_3_desc'), color: 'from-emerald-500 to-teal-600', glow: 'rgba(16,185,129,0.15)' },
  ];
  return (
    <section id="how" className="py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-20">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-4">{t('how_title')}</h2>
          <p className="text-slate-400 text-xl">{t('how_sub')}</p>
        </FadeUp>
        <div className="grid md:grid-cols-3 gap-6 relative">
          {/* Dotted connecting line — vertically centered on the step icon badges (28px padding + 28px half-icon = 56px) */}
          <div className="hidden md:block absolute top-[3.5rem] left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)]"
            style={{ height: '2px', backgroundImage: 'linear-gradient(90deg, rgba(0,200,255,0.4) 0%, rgba(124,58,237,0.4) 50%, rgba(16,185,129,0.4) 100%)',
              maskImage: 'repeating-linear-gradient(90deg, black 0px, black 6px, transparent 6px, transparent 14px)' }} />
          {steps.map((s, i) => (
            <FadeUp key={i} delay={i * 0.15}>
              <TiltCard glowColor={s.glow} className="group relative rounded-2xl p-7 h-full"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${s.color} opacity-0 group-hover:opacity-[0.05] transition-opacity duration-500`} />
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-5 shadow-lg`}>
                  <span className="text-white font-bold text-lg">{s.step}</span>
                </div>
                <h3 className="font-bold text-white text-xl mb-3">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </TiltCard>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Platform compatibility ───────────────────────────────────────────────── */
function PlatformCompatibility({ t }: { t: ReturnType<typeof useTranslations> }) {
  const works = [t('compat_works_1'), t('compat_works_2'), t('compat_works_3')];
  const notSupported = [t('compat_not_1'), t('compat_not_2'), t('compat_not_3')];
  return (
    <section id="compatibility" className="py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4">{t('compat_title')}</h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">{t('compat_sub')}</p>
        </FadeUp>
        <div className="grid md:grid-cols-2 gap-5">
          <FadeUp delay={0.05}>
            <div className="rounded-2xl p-6 h-full border border-emerald-500/20 bg-emerald-500/5">
              <h3 className="font-bold text-emerald-300 mb-4 flex items-center gap-2">
                <span className="text-lg">✓</span> {t('compat_works_title')}
              </h3>
              <ul className="space-y-3">
                {works.map(item => (
                  <li key={item} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-emerald-400 flex-shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="rounded-2xl p-6 h-full border border-amber-500/20 bg-amber-500/5">
              <h3 className="font-bold text-amber-300 mb-4 flex items-center gap-2">
                <span className="text-lg">✕</span> {t('compat_not_title')}
              </h3>
              <ul className="space-y-3">
                {notSupported.map(item => (
                  <li key={item} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-amber-400 flex-shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeUp>
        </div>
        <FadeUp delay={0.15} className="mt-5">
          <p className="text-center text-sm text-cyan-300/80 bg-cyan-500/8 border border-cyan-400/20 rounded-xl px-4 py-3">
            {t('compat_note')}
          </p>
        </FadeUp>
      </div>
    </section>
  );
}

/* ── TiltCard ─────────────────────────────────────────────────────────────── */
function TiltCard({ children, className = '', style = {}, glowColor = 'rgba(0,200,255,0.15)', lift = false }:
  { children: React.ReactNode; className?: string; style?: React.CSSProperties; glowColor?: string; lift?: boolean }) {
  const { ref, onMouseMove, onMouseLeave: tiltLeave } = useTilt(12);

  const handleEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = `0 20px 60px ${glowColor}, 0 0 0 1px rgba(0,200,255,0.20)`;
    if (lift) e.currentTarget.style.borderColor = 'rgba(0,200,255,0.35)';
  };
  const handleLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = 'none';
    if (lift) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
    tiltLeave();
  };

  return (
    <div ref={ref} onMouseMove={onMouseMove} onMouseEnter={handleEnter} onMouseLeave={handleLeave}
      className={className}
      style={{ ...style, transition: 'transform 0.18s ease, box-shadow 0.3s ease, border-color 0.3s ease', willChange: 'transform' }}>
      {children}
    </div>
  );
}

/* ── Features — 3D tilt + stagger ────────────────────────────────────────── */
function Features({ t }: { t: ReturnType<typeof useTranslations> }) {
  const feats = [
    { title: t('feat_1_title'), desc: t('feat_1_desc'), gradient: 'from-cyan-500 to-blue-600',    emoji: '🌐', glow: 'rgba(0,200,255,0.15)' },
    { title: t('feat_2_title'), desc: t('feat_2_desc'), gradient: 'from-violet-500 to-purple-600', emoji: '⚡', glow: 'rgba(124,58,237,0.15)' },
    { title: t('feat_3_title'), desc: t('feat_3_desc'), gradient: 'from-emerald-500 to-teal-600',  emoji: '✓', glow: 'rgba(16,185,129,0.15)' },
    { title: t('feat_4_title'), desc: t('feat_4_desc'), gradient: 'from-amber-500 to-orange-600',  emoji: '🔒', glow: 'rgba(245,158,11,0.15)' },
    { title: t('feat_5_title'), desc: t('feat_5_desc'), gradient: 'from-rose-500 to-pink-600',     emoji: '💻', glow: 'rgba(244,63,94,0.15)' },
    { title: t('feat_6_title'), desc: t('feat_6_desc'), gradient: 'from-cyan-500 to-sky-600',      emoji: '♾️', glow: 'rgba(0,200,255,0.15)' },
  ];
  return (
    <section className="py-32 px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(ellipse, rgba(124,58,237,0.06) 0%, transparent 70%)' }} />
      </div>
      <div className="max-w-6xl mx-auto">
        <FadeUp className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-4">{t('features_title')}</h2>
        </FadeUp>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {feats.map((f, i) => (
            <FadeUp key={f.title} delay={i * 0.08}>
              <TiltCard glowColor={f.glow} lift
                className="group relative rounded-2xl p-7 h-full overflow-hidden cursor-default"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)' }}>
                <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-500`} />
                <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r ${f.gradient} opacity-0 group-hover:opacity-70 transition-opacity duration-500`} />
                <div className={`w-11 h-11 rounded-xl mb-5 flex items-center justify-center bg-gradient-to-br ${f.gradient} shadow-lg text-lg`}>
                  {f.emoji}
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </TiltCard>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Languages — infinite marquee ────────────────────────────────────────── */
function LangPill({ label }: { label: string }) {
  return (
    <span className="flex-shrink-0 px-4 py-2 mx-2 rounded-full text-sm font-medium select-none"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}
function MarqueeRow({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%)' }}>
      <div className={`flex ${reverse ? 'marquee-right' : 'marquee-left'}`} style={{ width: 'max-content' }}>
        {doubled.map((lang, i) => <LangPill key={`${lang}-${i}`} label={lang} />)}
      </div>
    </div>
  );
}
function Languages({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <section className="py-32 overflow-hidden" style={{ background: 'rgba(255,255,255,0.01)' }}>
      <div className="max-w-5xl mx-auto text-center px-6 mb-14">
        <FadeUp>
          <h2 className="text-4xl md:text-6xl font-extrabold mb-4">{t('langs_title')}</h2>
          <p className="text-slate-400 text-xl">{t('langs_sub')}</p>
        </FadeUp>
      </div>
      <div className="space-y-4">
        <MarqueeRow items={LANGS_ROW1} />
        <MarqueeRow items={LANGS_ROW2} reverse />
      </div>
      <FadeIn className="text-center mt-10">
        <span className="px-4 py-2 rounded-full text-sm font-semibold"
          style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: '#67e8f9' }}>
          +76 more languages
        </span>
      </FadeIn>
    </section>
  );
}

/* ── Use Cases ────────────────────────────────────────────────────────────── */
const USE_CASES = [
  {
    emoji: '💼',
    title: 'Business Meetings',
    subtitle: 'Close deals across languages',
    desc: 'Join Zoom, Teams, or Google Meet with foreign clients. You speak your language — they hear a fluent translation in theirs, instantly.',
    tags: ['Zoom', 'Teams', 'Google Meet'],
    stat: { value: '80%', label: 'of workers are more productive in their native language' },
    color: 'from-cyan-500 to-blue-600',
    glow: 'rgba(0,200,255,0.12)',
  },
  {
    emoji: '🎓',
    title: 'Online Classes',
    subtitle: 'Teach without language barriers',
    desc: 'Deliver lectures or tutoring sessions to international students. Real-time translation keeps every student engaged in their own language.',
    tags: ['Udemy', 'Teachable', 'Zoom'],
    stat: { value: '3×', label: 'more student retention when taught in native language' },
    color: 'from-violet-500 to-purple-600',
    glow: 'rgba(124,58,237,0.12)',
  },
  {
    emoji: '🌍',
    title: 'Customer Support',
    subtitle: 'Support customers worldwide',
    desc: 'Handle international support calls fluently. No interpreter needed — VoiceBridge translates in real-time so you stay focused on helping.',
    tags: ['WhatsApp', 'Intercom', 'Phone'],
    stat: { value: '25%', label: 'of businesses lose customers to language barriers' },
    color: 'from-emerald-500 to-teal-600',
    glow: 'rgba(16,185,129,0.12)',
  },
  {
    emoji: '🏢',
    title: 'Corporate Training',
    subtitle: 'Train global teams instantly',
    desc: 'Deliver corporate training, onboarding sessions, and company-wide announcements to international teams — no scheduling interpreters, no delays.',
    tags: ['Zoom', 'Teams', 'Live Events'],
    stat: { value: '3×', label: 'faster global rollout when training is delivered in native language' },
    color: 'from-amber-500 to-orange-600',
    glow: 'rgba(245,158,11,0.12)',
  },
];

function UseCases() {
  const [active, setActive] = useState(0);
  const uc = USE_CASES[active];

  return (
    <section className="py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-16">
          <span className="inline-block text-xs font-bold tracking-widest uppercase mb-4 px-3 py-1 rounded-full"
            style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', color: '#67e8f9' }}>
            Who uses VoiceBridge
          </span>
          <h2 className="text-4xl md:text-6xl font-extrabold mb-4">
            Built for <span style={{ background: 'linear-gradient(90deg,#00c8ff,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>real conversations</span>
          </h2>
          <p className="text-slate-400 text-xl">One tool, every scenario where language gets in the way.</p>
        </FadeUp>

        {/* Tab buttons */}
        <div className="flex gap-2 justify-center mb-12 flex-wrap">
          {USE_CASES.map((u, i) => (
            <button key={i} onClick={() => setActive(i)}
              className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all"
              style={active === i
                ? { background: 'linear-gradient(90deg,#00c8ff,#7c3aed)', color: '#000' }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
              {u.emoji} {u.title}
            </button>
          ))}
        </div>

        {/* Active card */}
        <AnimatePresence mode="wait">
          <motion.div key={active}
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="grid md:grid-cols-2 gap-6">

            {/* Left — description */}
            <TiltCard glowColor={uc.glow} className="rounded-2xl p-8 flex flex-col justify-between"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${uc.color} flex items-center justify-center text-3xl mb-6 shadow-lg`}>
                  {uc.emoji}
                </div>
                <h3 className="text-2xl font-extrabold text-white mb-1">{uc.title}</h3>
                <p className="text-sm text-slate-400 mb-5">{uc.subtitle}</p>
                <p className="text-slate-300 leading-relaxed">{uc.desc}</p>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {uc.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                    {tag}
                  </span>
                ))}
              </div>
            </TiltCard>

            {/* Right — stat + CTA */}
            <div className="flex flex-col gap-4">
              <TiltCard glowColor={uc.glow} className="rounded-2xl p-8 flex-1 flex flex-col justify-center"
                style={{ background: `linear-gradient(135deg, rgba(0,200,255,0.05), rgba(124,58,237,0.05))`, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-6xl font-black mb-3"
                  style={{ background: `linear-gradient(90deg,#00c8ff,#7c3aed)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {uc.stat.value}
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">{uc.stat.label}</p>
              </TiltCard>

              <TiltCard glowColor="rgba(0,200,255,0.1)" className="rounded-2xl p-6 flex items-center justify-between gap-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,200,255,0.15)' }}>
                <div>
                  <p className="font-bold text-white mb-1">Start free — no subscription</p>
                  <p className="text-xs text-slate-400">5 free minutes, then pay only for what you use.</p>
                </div>
                <Link href="/download"
                  className="flex-shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
                  style={{ background: 'linear-gradient(90deg,#00c8ff,#7c3aed)', color: '#000' }}>
                  Download
                </Link>
              </TiltCard>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ── Pricing teaser cards ─────────────────────────────────────────────────── */
const PLAN_FEATURES: Record<string, string[]> = {
  Free:         ['5 minutes trial', '100 languages', 'macOS + Windows', 'Basic support'],
  Starter:      ['60 minutes', '100 languages', 'macOS + Windows', 'Email support', 'HD voice'],
  Standard:     ['240 minutes', '100 languages', 'macOS + Windows', 'Priority support', 'HD voice', 'API access'],
  Professional: ['360 minutes', '100 languages', 'macOS + Windows', '24/7 support', 'HD voice', 'API access', 'Custom voice'],
};

function PricingTeaserCard({ name, price, minutes, highlight, badge }:
  { name: string; price: string; minutes: number; highlight: boolean; badge: string | null }) {
  const feats = PLAN_FEATURES[name] ?? [];
  const perMin = name === 'Free' ? '0' : (parseInt(price.replace('$', '')) / minutes).toFixed(2);

  const card = (
    <TiltCard glowColor="rgba(0,200,255,0.12)" lift={!highlight}
      className="group relative rounded-2xl p-6 flex flex-col h-full min-h-[260px]"
      style={{
        background: highlight ? 'rgba(0,200,255,0.06)' : 'rgba(255,255,255,0.03)',
        border: highlight ? '1px solid rgba(0,200,255,0.3)' : '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(8px)',
      }}>
      {badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 text-xs font-bold px-3 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: 'linear-gradient(90deg,#00c8ff,#7c3aed)', color: '#fff' }}>
          {badge}
        </span>
      )}
      <div className="font-bold text-lg mb-1 text-white">{name}</div>
      <div className="text-4xl font-extrabold text-white my-3">{price}</div>
      <div className="text-xs text-slate-500 mb-4">{minutes} min · ${perMin}/min</div>
      <ul className="space-y-1.5 mb-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {feats.slice(0, 3).map(f => (
          <li key={f} className="flex items-center gap-2 text-xs text-slate-400">
            <span style={{ color: '#00c8ff' }}>✓</span> {f}
          </li>
        ))}
      </ul>
      <Link href={name === 'Free' ? '/dashboard' : '/pricing'}
        className="mt-auto block w-full py-3 rounded-xl text-center text-sm font-bold transition-all active:scale-95"
        style={highlight
          ? { background: 'linear-gradient(90deg,#00c8ff,#7c3aed)', color: '#000' }
          : { background: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }}>
        {name === 'Free' ? 'Start Free' : 'Buy Now'}
      </Link>
    </TiltCard>
  );

  if (!highlight) return card;

  return (
    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      className="popular-glow rounded-2xl h-full flex flex-col">
      {card}
    </motion.div>
  );
}

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
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10 items-stretch">
          {plans.map((p, i) => (
            <FadeUp key={p.name} delay={i * 0.1} className="h-full">
              <PricingTeaserCard {...p} />
            </FadeUp>
          ))}
        </div>
        <FadeIn className="text-center">
          <Link href="/pricing" className="font-semibold transition text-lg"
            style={{ color: '#00c8ff' }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = '#67e8f9')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = '#00c8ff')}>
            {t('pricing_teaser_cta')}
          </Link>
        </FadeIn>
      </div>
    </section>
  );
}

/* ── CTA Banner ───────────────────────────────────────────────────────────── */
function CtaBanner({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <section className="py-32 px-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <motion.div animate={{ scale:[1,1.2,1], opacity:[0.07,0.14,0.07] }}
          transition={{ duration:8, repeat:Infinity, ease:'easeInOut' }}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full blur-[130px]"
          style={{ background: 'linear-gradient(to top, rgba(0,200,255,0.6), rgba(124,58,237,0.6))' }} />
      </div>
      <div className="max-w-3xl mx-auto text-center">
        <FadeUp>
          <h2 className="text-4xl md:text-6xl font-extrabold mb-5">{t('cta_title')}</h2>
          <p className="text-slate-400 text-xl mb-12">{t('cta_sub')}</p>
        </FadeUp>
        <FadeUp delay={0.15}>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.div whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}>
              <Link href="/dashboard"
                className="block px-10 py-4 rounded-full font-bold text-lg transition-all shadow-2xl"
                style={{ background: 'linear-gradient(90deg,#00c8ff,#7c3aed)', color: '#000', boxShadow: '0 0 40px rgba(0,200,255,0.25)' }}>
                {t('cta_primary')}
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}>
              <Link href="/pricing"
                className="block px-10 py-4 rounded-full font-semibold text-lg transition-all text-slate-200 hover:text-white"
                style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}>
                {t('cta_secondary')}
              </Link>
            </motion.div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
