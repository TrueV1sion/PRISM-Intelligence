import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HistoryQuerySchema, validateParams } from "@/lib/api-validation";

// GET /api/history — List all runs with their agent counts and status
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const validation = validateParams(HistoryQuerySchema, {
        tier: searchParams.get("tier") || "ALL",
        status: searchParams.get("status") || "ALL",
        limit: searchParams.get("limit") || "50",
    });
    if (!validation.success) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { tier: tierFilter, status: statusFilter, limit } = validation.data;
    const tier = tierFilter === "ALL" ? null : tierFilter;
    const status = statusFilter === "ALL" ? null : statusFilter;

    try {
        const runs = await prisma.run.findMany({
            where: {
                ...(tier ? { tier } : {}),
                ...(status ? { status } : {}),
            },
            include: {
                agents: {
                    select: { id: true, name: true, archetype: true, status: true, color: true },
                },
                dimensions: {
                    select: { id: true, name: true },
                },
                presentation: {
                    select: { id: true, title: true, htmlPath: true, slideCount: true },
                },
                _count: {
                    select: { findings: true, synthesis: true },
                },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return NextResponse.json({ runs });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch run history";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
