import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// GET /api/groups - admin-only list of every group, feeds the admin
// dashboard's group picker (B4). Not for participants - they only ever
// know their own group via /api/groups/[id] or the invite-code verify flow.
export async function GET() {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const groups = await prisma.group.findMany({
      select: { id: true, name: true, year: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(groups);
  } catch (error) {
    console.error("Error listing groups:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
