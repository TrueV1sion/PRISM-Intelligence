/**
 * Collaboration State Flush API
 *
 * POST /api/collaboration/flush — Persist Yjs state to database
 *
 * Called periodically (every 5s) by the CollaborationSession to
 * save slide content changes from the Yjs document to Prisma.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

const FlushSchema = z.object({
  versionId: z.string().min(1),
  slides: z.record(z.string(), z.object({}).passthrough()),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = FlushSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { versionId, slides } = parsed.data;

  // Verify version exists
  const version = await prisma.presentationVersion.findUnique({
    where: { id: versionId },
    select: { id: true },
  });

  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Update each slide's content
  const updates = Object.entries(slides).map(([slideNumberStr, content]) => {
    const slideNumber = parseInt(slideNumberStr, 10);
    if (isNaN(slideNumber)) return null;

    return prisma.slideVersion.updateMany({
      where: { versionId, slideNumber },
      data: {
        content: content as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }).filter(Boolean);

  try {
    await prisma.$transaction(updates as NonNullable<(typeof updates)[number]>[]);
    return NextResponse.json({ flushed: updates.length });
  } catch (err) {
    console.error("[collaboration/flush] Failed:", err);
    return NextResponse.json({ error: "Flush failed" }, { status: 500 });
  }
}
