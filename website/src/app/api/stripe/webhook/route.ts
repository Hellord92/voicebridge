import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const email   = session.customer_details?.email ?? '';
    const tier    = session.metadata?.tier ?? 'monthly';

    /* Forward to backend license server */
    const adminKey = process.env.LICENSE_ADMIN_KEY!;
    await fetch(`${process.env.API_URL}/api/license/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, tier, stripeId: session.id, adminKey }),
    });
  }

  return NextResponse.json({ received: true });
}
