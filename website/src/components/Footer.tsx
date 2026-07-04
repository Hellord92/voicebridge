'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const CONTACT_EMAIL = 'info@voicebridgeapps.com';

export default function Footer() {
  const t = useTranslations();

  return (
    <footer
      className="relative py-14 px-6 footer-grid overflow-hidden"
      style={{ background: 'rgba(5,5,14,0.95)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(0,200,255,0.6) 30%, rgba(124,58,237,0.6) 70%, transparent)',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] blur-[80px]"
        style={{ background: 'radial-gradient(ellipse, rgba(0,200,255,0.04) 0%, transparent 70%)' }}
      />
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-10">
          <div className="col-span-2 md:col-span-1">
            <span className="font-extrabold text-xl" style={{ color: '#00c8ff' }}>
              VoiceBridge
            </span>
            <p className="text-xs text-slate-500 mt-3 leading-relaxed max-w-[200px]">{t('footer_tagline')}</p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-1.5 mt-4 text-sm text-cyan-400/90 hover:text-cyan-300 transition"
            >
              <span aria-hidden>✉</span>
              {CONTACT_EMAIL}
            </a>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('footer_product')}</p>
            <div className="space-y-2.5">
              <Link href="/download" className="block text-sm text-slate-500 hover:text-slate-200 transition">
                {t('footer_download')}
              </Link>
              <Link href="/pricing" className="block text-sm text-slate-500 hover:text-slate-200 transition">
                {t('footer_pricing')}
              </Link>
              <Link href="/#how" className="block text-sm text-slate-500 hover:text-slate-200 transition">
                {t('nav_how')}
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('footer_company')}</p>
            <div className="space-y-2.5">
              <Link href="/dashboard" className="block text-sm text-slate-500 hover:text-slate-200 transition">
                {t('footer_dashboard')}
              </Link>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="block text-sm text-slate-500 hover:text-cyan-300 transition"
              >
                {t('footer_contact')}
              </a>
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
        <div
          className="pt-6 flex flex-col md:flex-row justify-between items-center gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs text-slate-600">{t('footer_legal')}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs text-slate-600">
            <span>voicebridgeapps.com</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-cyan-400 transition">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
