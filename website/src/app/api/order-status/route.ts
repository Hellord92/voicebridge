import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('id');
  if (!orderId) return NextResponse.json({ detail: 'Missing id' }, { status: 400 });

  const apiUrl = (process.env.API_URL || 'https://api.voicebridgeapps.com').replace(/\/$/, '');

  try {
    const res = await fetch(`${apiUrl}/api/orders/${orderId}`, { cache: 'no-store' });
    const text = await res.text();
    let data: any = {};
    if (text) { try { data = JSON.parse(text); } catch { data = { detail: text.slice(0, 200) }; } }
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ detail: e?.message || 'Proxy error' }, { status: 500 });
  }
}
