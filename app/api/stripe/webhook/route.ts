import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const { groupId, plan } = session.metadata || {};

      if (groupId && plan) {
        // Update group plan
        await prisma.group.update({
          where: { id: groupId },
          data: { plan },
        });

        // Create or update subscription record
        await prisma.subscription.upsert({
          where: { groupId },
          update: {
            stripeCustomerId: session.customer as string,
            plan,
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for seasonal
          },
          create: {
            groupId,
            stripeCustomerId: session.customer as string,
            plan,
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        });
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const subRecord = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscription.id },
      });

      if (subRecord) {
        const status = subscription.status === 'active' ? 'active' : 'canceled';
        await prisma.subscription.update({
          where: { id: subRecord.id },
          data: { status },
        });

        if (status === 'canceled') {
          await prisma.group.update({
            where: { id: subRecord.groupId },
            data: { plan: 'free' },
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
