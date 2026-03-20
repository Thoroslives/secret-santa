import { prisma } from '@/lib/db';
import { PLANS, PlanType } from '@/lib/stripe';

export async function checkGroupLimits(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      _count: { select: { people: true } },
      subscription: true,
    },
  });

  if (!group) return null;

  const plan = (group.plan || 'free') as PlanType;
  const limits = PLANS[plan];

  return {
    plan,
    limits,
    currentParticipants: group._count.people,
    canAddParticipant: group._count.people < limits.maxParticipants,
    maxWishlistItems: limits.maxWishlistItems,
    subscription: group.subscription,
  };
}

export async function enforceParticipantLimit(groupId: string): Promise<{ allowed: boolean; message?: string }> {
  const info = await checkGroupLimits(groupId);
  if (!info) return { allowed: false, message: 'Group not found' };

  if (!info.canAddParticipant) {
    return {
      allowed: false,
      message: `Your ${info.limits.name} plan allows up to ${info.limits.maxParticipants} participants. Upgrade to add more.`,
    };
  }

  return { allowed: true };
}

export async function enforceWishlistLimit(groupId: string, itemCount: number): Promise<{ allowed: boolean; message?: string }> {
  const info = await checkGroupLimits(groupId);
  if (!info) return { allowed: false, message: 'Group not found' };

  if (itemCount > info.maxWishlistItems) {
    return {
      allowed: false,
      message: `Your ${info.limits.name} plan allows up to ${info.maxWishlistItems} wishlist items. Upgrade for more.`,
    };
  }

  return { allowed: true };
}
