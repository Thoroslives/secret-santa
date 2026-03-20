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
    maxGroups: 1,
    maxParticipants: 10,
    maxWishlistItems: 3,
    features: ['1 group', 'Up to 10 participants', 'Basic wishlist (3 items)', 'Manual assignments'],
  },
  plus: {
    name: 'Santa Plus',
    priceId: process.env.STRIPE_PRICE_PLUS || '',
    price: 'R29/season',
    priceUsd: '≈$1.50 USD',
    maxGroups: Infinity,
    maxParticipants: 50,
    maxWishlistItems: 10,
    features: [
      'Unlimited groups',
      'Up to 50 participants per group',
      'Extended wishlist (10 items with images)',
      'Email notifications when assigned',
      'Budget tracking per group',
      'Priority support',
    ],
  },
  pro: {
    name: 'Santa Pro',
    priceId: process.env.STRIPE_PRICE_PRO || '',
    price: 'R79/season',
    priceUsd: '≈$4 USD',
    maxGroups: Infinity,
    maxParticipants: Infinity,
    maxWishlistItems: Infinity,
    features: [
      'Everything in Plus',
      'Unlimited participants',
      'Custom group branding',
      'Exclusion rules (who can\'t get who)',
      'Gift budget limits',
      'CSV export',
      'API access',
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
