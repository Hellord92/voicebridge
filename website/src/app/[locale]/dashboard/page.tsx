'use client';
import { useAuth } from '../../../lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

const PRICING_URL = '/pricing';

export default function DashboardPage() {
  const { user, account, loading, signInGoogle, signOut, refreshAccount } = useAuth();
  const router = useRouter();
  const [polling, setPolling] = useState(false);

  // Refresh account every 30s while on this page
  useEffect(() => {
    if (!user) return;
    const id = setInterval(refreshAccount, 30_000);
    return () => clearInterval(id);
  }, [user, refreshAccount]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Loading…</div>
      </main>
    );
  }

  if (!user || !account) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-700 rounded-2xl p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Sign in to VoiceBridge</h1>
          <p className="text-slate-400 text-sm mb-8">
            Manage your account, view minutes, and download the app.
          </p>
          <button
            onClick={signInGoogle}
            className="w-full py-3 rounded-xl bg-white text-slate-900 font-semibold hover:bg-slate-100 transition flex items-center justify-center gap-3"
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </div>
      </main>
    );
  }

  const lic = account.license;
  const pct = lic.minutes_total
    ? Math.round(((lic.minutes_total - lic.minutes_used) / lic.minutes_total) * 100)
    : 100;

  const GITHUB_REPO = 'Hellord92/voicebridge';

  return (
    <main className="min-h-screen pt-24 pb-20 px-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{account.name ?? account.email}</h1>
            <p className="text-slate-400 text-sm">{account.email}</p>
          </div>
          <button
            onClick={signOut}
            className="text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5 transition"
          >
            Sign out
          </button>
        </div>

        {/* License card */}
        <div className={clsx(
          'rounded-2xl p-6 border',
          lic.free_trial
            ? 'bg-slate-900 border-slate-700'
            : 'bg-sky-500/5 border-sky-500/30',
        )}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wide">Current Plan</span>
              <h2 className="text-xl font-bold mt-0.5">{lic.plan_name}</h2>
            </div>
            {lic.free_trial && (
              <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full">
                Free Trial — 5 min/session
              </span>
            )}
          </div>

          {!lic.free_trial && lic.minutes_left !== null && (
            <>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Minutes remaining</span>
                <span className="font-semibold text-white">
                  {lic.minutes_left} / {lic.minutes_total} min
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
                <div
                  className={clsx(
                    'h-2 rounded-full transition-all',
                    pct > 25 ? 'bg-sky-500' : 'bg-amber-500',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {lic.minutes_left < 30 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-300 mb-3">
                  Low on minutes — top up to keep translating.
                </div>
              )}
            </>
          )}

          <a
            href={PRICING_URL}
            className="inline-block text-sm bg-sky-500 hover:bg-sky-400 text-white font-semibold px-4 py-2 rounded-lg transition"
          >
            {lic.free_trial ? 'Upgrade — Buy Minutes' : 'Add More Minutes'}
          </a>
        </div>

        {/* License key */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">License Key</p>
          <p className="font-mono text-sm text-slate-200 break-all select-all">{lic.key}</p>
          <p className="text-xs text-slate-500 mt-1">
            You can also enter this key manually in the desktop app.
          </p>
        </div>

        {/* Download */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Download VoiceBridge</h3>
          <div className="grid grid-cols-2 gap-3">
            <a
              href={`https://github.com/${GITHUB_REPO}/releases/latest/download/VoiceBridge.dmg`}
              className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 transition"
            >
              <span className="text-2xl"></span>
              <div>
                <p className="font-semibold text-sm">macOS</p>
                <p className="text-xs text-slate-400">.dmg · Apple Silicon + Intel</p>
              </div>
            </a>
            <div className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3 opacity-50 cursor-not-allowed select-none">
              <span className="text-2xl">🪟</span>
              <div>
                <p className="font-semibold text-sm text-slate-300">Windows</p>
                <p className="text-xs text-slate-500">.exe · Windows 10/11</p>
                <span className="text-xs text-amber-400/70">Coming next month</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Sign in with the same Google account inside the app — your minutes will sync automatically.
          </p>
        </div>

        {/* How to use */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
          <h3 className="font-semibold mb-3">Quick Start</h3>
          <ol className="space-y-2 text-sm text-slate-400">
            {[
              'Download and install the app',
              'Sign in with Google (same account as here)',
              'Put on headphones — required to prevent echo',
              'Select your headphone microphone as Input',
              'Select VoiceBridge Microphone as Output in Zoom/Meet/Teams',
              'Press Start — speak in any language, your audience hears the translation',
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sky-500/10 text-sky-400 text-xs flex items-center justify-center font-semibold">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}
