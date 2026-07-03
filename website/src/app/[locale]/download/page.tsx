'use client';
import { useAuth } from '../../../lib/auth';
import clsx from 'clsx';

const GITHUB_REPO = 'Hellord92/voicebridge';

export default function DownloadPage() {
  const { user, account, signInGoogle } = useAuth();

  return (
    <main className="min-h-screen pt-28 pb-24 px-6">
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Download VoiceBridge</h1>
        <p className="text-slate-400 mb-12">
          Real-time voice translation for macOS and Windows.
        </p>

        {/* Download buttons */}
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          <a
            href={`https://github.com/${GITHUB_REPO}/releases/latest/download/VoiceBridge.dmg`}
            className="group flex flex-col items-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-sky-500/40 rounded-2xl p-6 transition"
          >
            <span className="text-5xl group-hover:scale-110 transition-transform"></span>
            <div>
              <p className="text-lg font-bold">macOS</p>
              <p className="text-sm text-slate-400">Apple Silicon + Intel · macOS 12+</p>
              <p className="text-xs text-slate-500 mt-1">.dmg installer</p>
            </div>
            <span className="mt-2 text-sm font-semibold text-sky-400">Download →</span>
          </a>

          <a
            href={`https://github.com/${GITHUB_REPO}/releases/latest/download/VoiceBridge-Setup.exe`}
            className="group flex flex-col items-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-sky-500/40 rounded-2xl p-6 transition"
          >
            <span className="text-5xl group-hover:scale-110 transition-transform">🪟</span>
            <div>
              <p className="text-lg font-bold">Windows</p>
              <p className="text-sm text-slate-400">Windows 10 / 11 · 64-bit</p>
              <p className="text-xs text-slate-500 mt-1">.exe installer</p>
            </div>
            <span className="mt-2 text-sm font-semibold text-sky-400">Download →</span>
          </a>
        </div>

        {/* Sign-in CTA */}
        {!user ? (
          <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 text-left">
            <h3 className="font-semibold mb-1">Create a free account</h3>
            <p className="text-slate-400 text-sm mb-4">
              Sign in with Google to sync your license across devices. Your minutes follow your account.
            </p>
            <button
              onClick={signInGoogle}
              className="flex items-center gap-3 bg-white text-slate-900 font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-100 transition"
            >
              <GoogleIcon />
              Sign in with Google
            </button>
          </div>
        ) : (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-sm text-emerald-300">
            ✓ Signed in as <strong>{account?.email}</strong> — your license will sync automatically.
          </div>
        )}

        {/* Setup steps */}
        <div className="mt-14 text-left">
          <h2 className="text-xl font-bold mb-5">How to set up</h2>
          <div className="space-y-3">
            {[
              { step: '1', title: 'Install the app', desc: 'Run the installer — the VoiceBridge Microphone virtual driver is installed automatically.' },
              { step: '2', title: 'Put on headphones', desc: 'Headphones are required to prevent audio feedback. Do not use speakers.' },
              { step: '3', title: 'Sign in with Google', desc: 'Same account you used on this website. Your minutes sync instantly.' },
              { step: '4', title: 'Configure your meeting app', desc: 'In Zoom, Google Meet, Teams, or WhatsApp Desktop → select "VoiceBridge Microphone" as your microphone.' },
              { step: '5', title: 'Start translating', desc: 'Press Start in VoiceBridge. Speak in your language — your audience hears the translation in real time.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-500/10 text-sky-400 font-bold flex items-center justify-center text-sm">
                  {step}
                </div>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-slate-400 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System requirements */}
        <div className="mt-10 text-sm text-slate-500">
          <p className="font-medium text-slate-400 mb-2">System Requirements</p>
          <div className="grid sm:grid-cols-2 gap-2 text-left">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <p className="font-medium text-slate-300 mb-1"> macOS</p>
              <p>macOS Monterey 12.0 or later</p>
              <p>Apple Silicon (M1+) or Intel</p>
              <p>2 GB RAM minimum</p>
              <p>Internet connection required</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <p className="font-medium text-slate-300 mb-1">🪟 Windows</p>
              <p>Windows 10 / 11 (64-bit)</p>
              <p>VB-Audio Virtual Cable (auto-installed)</p>
              <p>2 GB RAM minimum</p>
              <p>Internet connection required</p>
            </div>
          </div>
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
