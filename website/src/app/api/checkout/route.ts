import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { plan_id, email, payment_method, crypto_currency = 'USDT', firebase_uid = '', id_token = '' } = body;

  if (!plan_id || !email || !payment_method) {
    return NextResponse.json({ detail: 'Missing fields' }, { status: 400 });
  }

  const apiUrl = process.env.API_URL || 'https://api.voicebridgeapps.com';

  // If user is signed in and provided their Firebase token, verify and get uid
  let resolvedUid = firebase_uid;
  if (id_token && !resolvedUid) {
    try {
      const meRes = await fetch(`${apiUrl}/api/auth/me`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${id_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        resolvedUid = me.uid;
      }
    } catch {}
  }

  const res = await fetch(`${apiUrl}/api/orders/create`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ plan_id, email, payment_method, crypto_currency, firebase_uid: resolvedUid }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
