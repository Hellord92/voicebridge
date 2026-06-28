'use client';
import { useAuth } from '../lib/auth';
import Link from 'next/link';

export default function Navbar() {
  const { user, account, signInGoogle, signOut, loading } = useAuth();

  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-extrabold text-sky-400 text-lg tracking-tight">
          VoiceBridge
        </Link>

        <div className="flex items-center gap-2">
          <Link href="/pricing" className="text-sm text-slate-400 hover:text-white px-3 py-1.5 transition">
            Pricing
          </Link>
          <Link href="/download" className="text-sm text-slate-400 hover:text-white px-3 py-1.5 transition">
            Download
          </Link>

          {!loading && (
            user ? (
              <div className="flex items-center gap-2 ml-2">
                <Link
                  href="/dashboard"
                  className="text-sm font-semibold text-white bg-slate-800 border border-slate-600 hover:border-sky-500/40 px-3 py-1.5 rounded-lg transition"
                >
                  Dashboard
                </Link>
                <button
                  onClick={signOut}
                  className="text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={signInGoogle}
                className="ml-2 flex items-center gap-2 text-sm font-semibold bg-white text-slate-900 hover:bg-slate-100 px-4 py-1.5 rounded-lg transition"
              >
                <GoogleIcon />
                Sign in
              </button>
            )
          )}
        </div>
      </div>
    </nav>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}
