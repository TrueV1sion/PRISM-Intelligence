import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/run/[id] — Get full run details with all relations
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const run = await db.run.findUniqueWithRelations(id);

    if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({ run });
}

// PATCH /api/run/[id] — Update run status
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();

    const run = await db.run.update(id, {
        status: body.status,
        ...(body.status === "DELIVER" ? { completedAt: new Date() } : {}),
    });

    return NextResponse.json({ run });
}
