import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const { priceId, groupId, plan } = await request.json();

    if (!priceId || !groupId || !plan) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL}/admin/dashboard?payment=success&plan=${plan}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/?payment=cancelled`,
      metadata: { groupId, plan },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
