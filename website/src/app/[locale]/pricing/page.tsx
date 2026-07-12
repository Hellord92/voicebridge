'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '../../../lib/auth';

const PLANS = [
  { id: 'free',    minutes: 5,   price: '$0',    name: 'Free',         desc: 'Try all 100 languages.',                highlight: false, savings: null },
  { id: 'min_60',  minutes: 60,  price: '$99',   name: 'Starter',      desc: 'Perfect for occasional meetings.',      highlight: false, savings: null },
  { id: 'min_120', minutes: 120, price: '$179',  name: 'Basic',        desc: 'Save $19 vs two Starter packs.',        highlight: false, savings: 9   },
  { id: 'min_240', minutes: 240, price: '$329',  name: 'Standard',     desc: 'Most popular — daily meetings.',        highlight: true,  savings: 17  },
  { id: 'min_360', minutes: 360, price: '$459',  name: 'Professional', desc: 'Power users and daily calls.',          highlight: false, savings: 23  },
  { id: 'min_480', minutes: 480, price: '$579',  name: 'Business',     desc: 'Large teams, multiple time zones.',     highlight: false, savings: 27  },
  { id: 'min_600', minutes: 600, price: '$679',  name: 'Enterprise',   desc: '10 hours — maximum value.',            highlight: false, savings: 31  },
];

const CRYPTO = ['USDT', 'BTC', 'ETH', 'USDC', 'SOL', 'LTC'];

export default function PricingPage() {
  const t = useTranslations();
  const { user, account, signInGoogle } = useAuth();
  const [selectedPlan, setSelectedPlan]   = useState<string | null>(null);
  const [cryptoCoin, setCryptoCoin]       = useState('USDT');
  const [email, setEmail]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState<any>(null);

  const effectiveEmail = email.trim() || account?.email?.trim() || '';

  useEffect(() => {
    if (account?.email && !email) setEmail(account.email);
  }, [account?.email, email]);

  const handleBuy = async (planId: string) => {
    if (planId === 'free') { window.location.href = '/download'; return; }
    setSelectedPlan(planId);
    setResult(null);
  };

  const handleCheckout = async () => {
    if (!effectiveEmail || !selectedPlan) return;
    setLoading(true);
    try {
      const idToken = user ? await user.getIdToken() : undefined;
      const res = await fetch('/api/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          plan_id:         selectedPlan,
          email:           effectiveEmail,
          payment_method:  'crypto',
          crypto_currency: cryptoCoin,
          firebase_uid:    account?.uid ?? '',
          id_token:        idToken ?? '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error');
      setResult(data);
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen pt-28 pb-24 px-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-extrabold text-center mb-3">
          Simple, minute-based pricing
        </h1>
        <p className="text-center text-slate-400 mb-4">
          All packages include all 50 languages · Minutes never expire
        </p>
        <div className="flex items-center justify-center gap-2 mb-12">
          <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full">
            💳 Pay with Crypto
          </span>
        </div>

        {/* Plan grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {/* Free card */}
          <div className="rounded-2xl p-5 border bg-slate-900 border-slate-800 flex flex-col">
            <div className="font-bold text-lg mb-1">Free</div>
            <div className="text-xs text-slate-400 mb-4">Try all 50 languages — 5 min per session</div>
            <div className="text-3xl font-extrabold mb-5">$0</div>
            <Link href="/download" className="mt-auto block w-full py-2.5 rounded-xl border border-slate-700 hover:border-slate-500 text-center text-sm font-semibold transition">
              Download
            </Link>
          </div>

          {PLANS.filter(p => p.id !== 'free').map(plan => (
            <div
              key={plan.id}
              className={clsx(
                'rounded-2xl p-5 border flex flex-col transition',
                plan.highlight
                  ? 'bg-sky-500/10 border-sky-500/40 shadow-xl shadow-sky-500/10'
                  : 'bg-slate-900 border-slate-800',
                selectedPlan === plan.id && 'ring-2 ring-sky-400',
              )}
            >
              {plan.highlight && (
                <span className="text-xs font-semibold bg-sky-500 text-white px-2 py-0.5 rounded-full self-start mb-3">
                  Most popular
                </span>
              )}
              {plan.savings && (
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full self-start mb-3">
                  Save {plan.savings}%
                </span>
              )}
              <div className="font-bold text-lg mb-1">{plan.name}</div>
              <div className="text-xs text-slate-400 mb-4">{plan.desc}</div>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-3xl font-extrabold">{plan.price}</span>
              </div>
              <div className="text-xs text-slate-500 mb-5">
                {plan.minutes} min · ${(parseFloat(plan.price.replace('$','')) / plan.minutes).toFixed(2)}/min
              </div>
              <button
                onClick={() => handleBuy(plan.id)}
                className={clsx(
                  'mt-auto w-full py-2.5 rounded-xl text-sm font-semibold transition',
                  plan.highlight
                    ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100',
                )}
              >
                Get {plan.name}
              </button>
            </div>
          ))}
        </div>

        {/* Checkout panel */}
        {selectedPlan && !result && (
          <div className="max-w-md mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-6">
            <h2 className="font-bold text-lg mb-4">
              Complete your order — {PLANS.find(p => p.id === selectedPlan)?.name}
            </h2>

            {!user && (
              <div className="bg-sky-500/5 border border-sky-500/20 rounded-lg px-3 py-2 mb-4 text-xs text-sky-300">
                <button onClick={signInGoogle} className="font-semibold underline">Sign in with Google</button>
                {' '}to link this purchase to your account (recommended).
              </div>
            )}
            {user && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2 mb-4 text-xs text-emerald-300">
                ✓ Signed in as {account?.email} — license will be linked to your account.
              </div>
            )}

            <label className="text-xs text-slate-400 block mb-1">Email (for license key delivery)</label>
            <input
              type="email"
              value={email || account?.email || ''}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-sky-400 mb-4"
            />

            <label className="text-xs text-slate-400 block mb-1">Select currency</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {CRYPTO.map(c => (
                <button
                  key={c}
                  onClick={() => setCryptoCoin(c)}
                  className={clsx(
                    'px-3 py-1 rounded-lg border text-xs font-mono font-semibold transition',
                    cryptoCoin === c
                      ? 'bg-amber-500/10 border-amber-500 text-amber-300'
                      : 'bg-slate-800 border-slate-600 text-slate-400',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <button
              onClick={handleCheckout}
              disabled={loading || !effectiveEmail}
              className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Processing…' : 'Confirm Order'}
            </button>
            <button onClick={() => setSelectedPlan(null)} className="w-full py-2 mt-2 text-slate-500 text-sm hover:text-slate-300 transition">
              Cancel
            </button>
          </div>
        )}

        {/* Payment result */}
        {result && !result.error && (
          <div className="max-w-md mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-6">
            <PaymentResult result={result} />
          </div>
        )}
        {result?.error && (
          <div className="max-w-md mx-auto bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-rose-300 text-sm">
            ✗ {result.error}
          </div>
        )}

        {/* FAQ */}
        <div className="mt-20 max-w-2xl mx-auto">
          <h3 className="text-xl font-bold mb-6 text-center">Frequently asked questions</h3>
          <Faq />
        </div>
      </div>
    </main>
  );
}

function PaymentResult({ result }: { result: any }) {
  const p = result.payment;
  const [orderStatus, setOrderStatus] = useState<any>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://api.voicebridgeapps.com';

  useEffect(() => {
    if (!result.order_id) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/api/orders/${result.order_id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active) setOrderStatus(data);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { active = false; clearInterval(id); };
  }, [result.order_id, apiBase]);

  if (p.method === 'crypto') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">₿</span>
          <div>
            <p className="font-bold">Send {p.pay_amount} {p.pay_currency}</p>
            <p className="text-xs text-slate-400">to the address below</p>
          </div>
        </div>
        {orderStatus?.status === 'confirmed' && orderStatus.license_key && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm">
            <p className="font-semibold text-emerald-300 mb-1">Payment confirmed!</p>
            <p className="font-mono text-xs break-all select-all">{orderStatus.license_key}</p>
          </div>
        )}
        {orderStatus?.status === 'pending' && (
          <p className="text-xs text-amber-400 animate-pulse">Waiting for on-chain confirmation…</p>
        )}
        <div className="bg-slate-800 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">Payment address</p>
          <p className="font-mono text-xs text-white break-all">{p.pay_address}</p>
        </div>
        {p.invoice_url && (
          <a href={p.invoice_url} target="_blank" rel="noreferrer"
            className="block w-full py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-semibold text-center hover:bg-amber-500/20 transition">
            Open Payment Page →
          </a>
        )}
        <p className="text-xs text-slate-400">Order ID: <span className="font-mono">{result.order_id}</span></p>
        <p className="text-xs text-slate-400">Your license key will be emailed automatically once the payment is detected on-chain.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🏦</span>
        <p className="font-bold">Bank Transfer Instructions</p>
      </div>
      <div className="bg-slate-800 rounded-lg p-3 space-y-2 text-sm">
        <Row label="Account holder" value={p.account_holder} />
        <Row label="IBAN"          value={p.iban} mono />
        <Row label="BIC / SWIFT"   value={p.bic_swift} mono />
        <Row label="Bank"          value={p.bank_name} />
        <Row label="Amount"        value={`${p.amount_usd} USD`} />
        <Row label="Reference"     value={p.reference} mono highlight />
      </div>
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
        ⚠ Include reference <strong>{p.reference}</strong> in the payment description. License key delivered within 24h.
      </div>
    </div>
  );
}

function Row({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400 flex-shrink-0">{label}</span>
      <span className={clsx('text-right', mono && 'font-mono', highlight && 'text-sky-300 font-bold')}>{value}</span>
    </div>
  );
}

function Faq() {
  const items = [
    ['Do minutes expire?',               'No — your minutes never expire. Use them at your own pace.'],
    ['What languages are supported?',    'All 50 languages in every paid plan, including the Free tier.'],
    ['How is the license key delivered?','By email immediately after crypto payment is confirmed, or within 24h for bank transfers.'],
    ['Can I use the app on multiple devices?', 'Yes, one license can be used on one device at a time.'],
    ['What if I run out of minutes?',    'You can purchase additional minutes anytime. Minutes stack — they are added to your balance.'],
  ];
  return (
    <div className="divide-y divide-slate-800">
      {items.map(([q, a], i) => (
        <details key={i} className="py-4 group">
          <summary className="cursor-pointer font-medium text-slate-200 list-none flex justify-between items-center">
            {q}
            <span className="text-slate-500 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">{a}</p>
        </details>
      ))}
    </div>
  );
}
