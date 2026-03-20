import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

export const PLANS = {
  free: {
    name: 'Free',
    maxGroups: Infinity,
    maxParticipants: 10,
    maxWishlistItems: 5,
    features: [
      'Unlimited groups',
      'Up to 10 participants per group',
      'Wishlist management (5 items)',
      'Random assignment algorithm',
      'Email magic link login',
      'Multi-currency budget support',
      'Mobile-friendly design',
    ],
  },
  unlimited: {
    name: 'Unlimited',
    priceId: 'price_1TDAokBiNvYQF2cP1HlmIisk',
    price: '$10',
    priceUsd: '$10 USD',
    maxGroups: Infinity,
    maxParticipants: Infinity,
    maxWishlistItems: 5,
    features: [
      'Everything in Free',
      'Unlimited participants per group',
      'One-time payment',
    ],
  },
} as const;

export type PlanType = keyof typeof PLANS;

export function getPlanLimits(plan: PlanType) {
  return PLANS[plan];
}

export function canAddParticipant(plan: PlanType, currentCount: number): boolean {
  return currentCount < PLANS[plan].maxParticipants;
}

export function getMaxWishlistItems(plan: PlanType): number {
  return PLANS[plan].maxWishlistItems;
}
