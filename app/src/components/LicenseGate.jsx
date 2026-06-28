import React, { useState } from 'react';

const PRICING_URL = 'https://voicebridgeapps.com/pricing';

export default function LicenseGate({ settings, licensed, licenseInfo, onActivate, onClose }) {
  const [key, setKey]       = useState(settings?.licenseKey || '');
  const [msg, setMsg]       = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    if (!key.trim()) { setMsg('Enter a license key.'); return; }
    setLoading(true);
    setMsg('Validating…');
    const r = await onActivate(key.trim());
    setLoading(false);
    if (r.ok) {
      setMsg('✓ License activated!');
    } else {
      setMsg(`✗ ${r.data?.reason || 'Invalid or expired key'}`);
    }
  };

  const minutesLeft = licenseInfo?.minutes_left;
  const minutesTotal = licenseInfo?.minutes_total;
  const pct = minutesTotal ? Math.round((minutesLeft / minutesTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">License</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">×</button>
        </div>

        {licensed && licenseInfo ? (
          <div className="space-y-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-sm text-emerald-400">
              ✓ Active — {licenseInfo.plan_name || licenseInfo.plan_id}
            </div>
            {minutesLeft !== null && minutesLeft !== undefined && (
              <>
                <div className="text-sm text-slate-300">
                  <span className="font-bold text-white">{minutesLeft}</span>
                  <span className="text-slate-400"> / {minutesTotal} minutes remaining</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-sky-500 h-2 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {minutesLeft < 30 && (
                  <a
                    href={PRICING_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center hover:bg-amber-500/20 transition"
                  >
                    ⚠ Low on minutes — top up →
                  </a>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {/* Pricing table preview */}
            <div className="mb-4 space-y-1">
              {[
                { name: 'Free',       min: '5 min/session', price: '$0'   },
                { name: 'Starter',    min: '60 min',        price: '$99'  },
                { name: 'Standard ★', min: '240 min',       price: '$329' },
                { name: 'Enterprise', min: '600 min',       price: '$679' },
              ].map(p => (
                <div key={p.name} className="flex justify-between text-xs py-1 border-b border-slate-700">
                  <span className="text-slate-300">{p.name}</span>
                  <span className="text-slate-400">{p.min}</span>
                  <span className="text-sky-300 font-semibold">{p.price}</span>
                </div>
              ))}
              <p className="text-xs text-slate-500 pt-1">Minutes never expire · All 50 languages · Crypto + IBAN</p>
            </div>

            <a
              href={PRICING_URL}
              target="_blank"
              rel="noreferrer"
              className="block w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold text-center transition mb-4"
            >
              Buy Minutes →
            </a>

            <div className="border-t border-slate-700 pt-4">
              <label className="text-xs text-slate-400 block mb-1">Have a license key?</label>
              <input
                type="text"
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="VB-T-A1B2C3-D4E5F6-ABCD"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-sky-400 font-mono mb-2"
              />
              <button
                onClick={handleActivate}
                disabled={loading}
                className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold disabled:opacity-50 transition"
              >
                {loading ? 'Validating…' : 'Activate Key'}
              </button>
              {msg && (
                <p className={`text-xs mt-2 ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-rose-400'}`}>{msg}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
