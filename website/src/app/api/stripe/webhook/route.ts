import { NextRequest, NextResponse } from 'next/server';

// Stripe webhook removed — payments are handled via NOWPayments (crypto) and IBAN.
// This file is kept as a placeholder to avoid 404s on old webhook URLs.

export async function POST(req: NextRequest) {
  return NextResponse.json({ received: true });
}
