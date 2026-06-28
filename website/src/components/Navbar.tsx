'use client';
import { useAuth } from '../lib/auth';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function Navbar() {
  const { user, account, signInGoogle, signOut, loading } = useAuth();
  const t = useTranslations();

  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-slate-800/50 bg-slate-950/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="font-extrabold text-sky-400 text-lg tracking-tight hover:text-sky-300 transition">
          VoiceBridge
        </Link>

        {/* Center links */}
        <div className="hidden md:flex items-center gap-1">
          <Link href="/#how"     className="text-sm text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition">
            {t('nav_how')}
          </Link>
          <Link href="/pricing"  className="text-sm text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition">
            {t('nav_pricing')}
          </Link>
          <Link href="/download" className="text-sm text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition">
            {t('nav_download')}
          </Link>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {!loading && (
            user ? (
              <>
                <Link
                  href="/dashboard"
                  className="text-sm font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-lg transition"
                >
                  {t('nav_dashboard')}
                </Link>
                <button
                  onClick={signOut}
                  className="text-xs text-slate-500 hover:text-slate-300 transition px-2"
                >
                  {t('nav_signout')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={signInGoogle}
                  className="text-sm text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition"
                >
                  {t('nav_signin')}
                </button>
                <Link
                  href="/dashboard"
                  className="text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-white px-4 py-1.5 rounded-lg transition shadow-lg shadow-sky-500/20"
                >
                  {t('nav_cta')}
                </Link>
              </>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
