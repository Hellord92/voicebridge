import { NextRequest, NextResponse } from 'next/server';

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text.slice(0, 200) || 'Invalid upstream response' };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { plan_id, email, payment_method, crypto_currency = 'USDT', firebase_uid = '', id_token = '' } = body;

    if (!plan_id || !email || !payment_method) {
      return NextResponse.json({ detail: 'Missing fields' }, { status: 400 });
    }

    const apiUrl = (process.env.API_URL || 'https://api.voicebridgeapps.com').replace(/\/$/, '');

    let resolvedUid = firebase_uid;
    if (id_token && !resolvedUid) {
      try {
        const meRes = await fetch(`${apiUrl}/api/auth/me`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${id_token}` },
        });
        if (meRes.ok) {
          const me = await readJsonSafe(meRes);
          resolvedUid = me.uid;
        }
      } catch {
        /* non-fatal */
      }
    }

    const res = await fetch(`${apiUrl}/api/orders/create`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ plan_id, email, payment_method, crypto_currency, firebase_uid: resolvedUid }),
    });

    const data = await readJsonSafe(res);
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ detail: e?.message || 'Checkout proxy error' }, { status: 500 });
  }
}
