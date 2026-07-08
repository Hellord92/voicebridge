import React, { useState } from 'react';
import { signInWithGoogle, firebaseConfigured } from '../lib/firebase.js';

export default function SignIn({ onSignIn }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleGoogle = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithGoogle();
      if (result.ok) {
        onSignIn(result.user, result.account);
      } else {
        setError(result.error || 'Sign-in failed');
      }
    } catch (e) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,200,255,0.12) 0%, transparent 70%)' }} />

      <div className="titlebar-drag h-8" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <img src="./assets/logo.svg" alt="VoiceBridge" className="h-14 w-14 mb-3" onError={e => { e.target.style.display = 'none'; }} />
        <div className="text-2xl font-extrabold tracking-tight mb-1">
          <span className="text-white">Voice</span><span className="text-cyan-400">Bridge</span>
        </div>
        <p className="text-slate-500 text-xs mb-8">Real-time voice translation</p>

        <div className="w-full glass-card p-6 space-y-4">
          <h2 className="font-semibold text-center text-white">Sign in to continue</h2>
          <p className="text-xs text-slate-400 text-center">
            Sync your license and free trial across devices.
          </p>

          {!firebaseConfigured() && (
            <p className="text-xs text-amber-400/90 text-center bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Firebase keys missing — copy <code className="text-amber-200">app/.env.example</code> to <code className="text-amber-200">app/.env.local</code> or use a license key below.
            </p>
          )}

          <button
            onClick={handleGoogle}
            disabled={loading || !firebaseConfigured()}
            className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 rounded-xl hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50"
          >
            <GoogleIcon />
            {loading ? 'Opening browser…' : 'Continue with Google'}
          </button>

          {error && <p className="text-xs text-rose-400 text-center">{error}</p>}

          <div className="border-t border-white/10 pt-3">
            <button
              onClick={() => onSignIn({ uid: '__manual__' }, null)}
              className="w-full text-xs text-slate-500 hover:text-cyan-400 py-1.5 transition"
            >
              Enter license key manually →
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 mt-6 text-center">
          <a href="https://voicebridgeapps.com" target="_blank" rel="noreferrer" className="text-cyan-500/80 hover:text-cyan-400">
            voicebridgeapps.com
          </a>
        </p>
      </div>
    </div>
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
