import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateWishlistItems } from "@/lib/utils";
import { getSession } from "@/lib/session";

// POST/PUT update wishlist items for a person
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session.isLoggedIn || !session.personId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { personId, items } = await request.json();

    // Verify the session user matches the personId being modified
    if (personId !== session.personId) {
      return NextResponse.json({ error: "Forbidden: you can only modify your own wishlist" }, { status: 403 });
    }

    if (!personId) {
      return NextResponse.json({ error: "Person ID is required" }, { status: 400 });
    }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: "Items must be an array" }, { status: 400 });
    }

    // Validate wishlist items
    const validation = validateWishlistItems(items);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Verify person exists and belongs to the session's group
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    if (person.groupId !== session.groupId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete existing wishlist items
    await prisma.wishlistItem.deleteMany({
      where: { personId },
    });

    // Create new wishlist items
    const wishlistItems = await Promise.all(
      items.map((item: { title: string; note?: string }, index: number) =>
        prisma.wishlistItem.create({
          data: {
            personId,
            title: item.title.trim(),
            note: item.note?.trim() || null,
            order: index,
          },
        })
      )
    );

    return NextResponse.json({ wishlistItems });
  } catch (error) {
    console.error("Error updating wishlist:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
