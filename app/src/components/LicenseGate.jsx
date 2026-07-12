import React, { useState } from 'react';

const PRICING_URL = 'https://voicebridgeapps.com/pricing';

export default function LicenseGate({ settings, licensed, licenseInfo, onActivate, onClose, onSignOut, serverUrl }) {
  const [key, setKey]             = useState(settings?.licenseKey || '');
  const [showKey, setShowKey]     = useState(false);
  const [msg, setMsg]             = useState('');
  const [loading, setLoading]     = useState(false);
  const [refCode, setRefCode]     = useState('');
  const [refMsg, setRefMsg]       = useState('');
  const [refLoading, setRefLoading] = useState(false);

  const handleClaimReferral = async () => {
    const code = refCode.trim().toUpperCase();
    if (!code) { setRefMsg('Enter a referral code.'); return; }
    if (!settings?.licenseKey) { setRefMsg('Activate a license key first.'); return; }
    setRefLoading(true);
    setRefMsg('Claiming…');
    try {
      const base = serverUrl || 'https://api.voicebridgeapps.com';
      const resp = await fetch(`${base}/api/referral/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.licenseKey}`,
        },
        body: JSON.stringify({ referral_code: code }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setRefMsg(`✓ ${data.message || 'Referral applied! Bonus minutes added.'}`);
        setRefCode('');
      } else {
        setRefMsg(`✗ ${data.detail || 'Invalid or already used code'}`);
      }
    } catch (e) {
      setRefMsg('✗ Network error — check server connection');
    } finally {
      setRefLoading(false);
    }
  };

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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f0f18] rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-white/10">
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
                { name: 'Free',       min: '5 min trial',   price: '$0'   },
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
              <p className="text-xs text-slate-500 pt-1">Minutes never expire · All 50 languages · Crypto</p>
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
              {settings?.licenseKey ? (
                /* User already has a key — don't show input, just allow re-activation */
                <p className="text-xs text-slate-500 text-center">Already have a key? <button
                  onClick={() => setShowKey(v => !v)}
                  className="text-sky-400 hover:underline"
                >Enter a different one</button></p>
              ) : null}
              {(!settings?.licenseKey || showKey) && (
                <>
                  <label className="text-xs text-slate-400 block mb-1">Have a license key?</label>
                  <div className="relative mb-2">
                    <input
                      type="text"
                      value={key}
                      onChange={e => setKey(e.target.value)}
                      placeholder="VB-T-A1B2C3-D4E5F6-ABCD"
                      autoComplete="off"
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-sky-400 font-mono"
                    />
                  </div>
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
                </>
              )}
            </div>
          </>
        )}
        {onSignOut && (
          <button type="button" onClick={onSignOut}
            className="w-full mt-4 py-2 text-xs text-slate-500 hover:text-rose-400 border-t border-white/10 pt-4">
            Sign out
          </button>
        )}
        {settings?.referralCode && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-slate-400 mb-1">Refer a friend — they get 15 free minutes</p>
            <p className="font-mono text-xs text-cyan-400 break-all select-all">{settings.referralCode}</p>
            <a
              href={`https://voicebridgeapps.com/pricing?ref=${encodeURIComponent(settings.referralCode)}`}
              target="_blank"
              rel="noreferrer"
              className="block mt-2 text-xs text-slate-500 hover:text-cyan-400 underline"
            >
              Share referral link
            </a>
          </div>
        )}

        {/* Referral code claim */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs font-semibold text-slate-400 mb-2">Have a referral code?</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={refCode}
              onChange={e => setRefCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleClaimReferral()}
              placeholder="VBREF-XXXXXXXX"
              maxLength={20}
              className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-cyan-400/50 placeholder:text-slate-600"
            />
            <button
              onClick={handleClaimReferral}
              disabled={refLoading}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/30 border border-cyan-400/20 disabled:opacity-50 transition whitespace-nowrap"
            >
              {refLoading ? '…' : 'Claim'}
            </button>
          </div>
          {refMsg && (
            <p className={`text-xs mt-1.5 ${refMsg.startsWith('✓') ? 'text-emerald-400' : 'text-rose-400'}`}>
              {refMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
