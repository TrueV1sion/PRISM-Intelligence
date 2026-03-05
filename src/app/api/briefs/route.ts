/**
 * GET /api/briefs — Search published intelligence briefs
 * POST /api/briefs — Publish a new brief from a completed run
 */

import { NextResponse } from "next/server";
import { getResearchStore } from "@/lib/research-store";
import type { BriefSearchOptions } from "@/lib/research-store";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const store = getResearchStore();

    const options: BriefSearchOptions = {};

    if (searchParams.has("status")) {
        options.status = searchParams.get("status") as BriefSearchOptions["status"];
    }
    if (searchParams.has("q")) {
        options.query = searchParams.get("q")!;
    }
    if (searchParams.has("tags")) {
        options.tags = searchParams.get("tags")!.split(",");
    }
    if (searchParams.has("minScore")) {
        options.minQualityScore = parseInt(searchParams.get("minScore")!, 10);
    }
    if (searchParams.has("sortBy")) {
        options.sortBy = searchParams.get("sortBy") as BriefSearchOptions["sortBy"];
    }
    if (searchParams.has("sortOrder")) {
        options.sortOrder = searchParams.get("sortOrder") as BriefSearchOptions["sortOrder"];
    }
    if (searchParams.has("limit")) {
        options.limit = parseInt(searchParams.get("limit")!, 10);
    }
    if (searchParams.has("offset")) {
        options.offset = parseInt(searchParams.get("offset")!, 10);
    }

    const result = store.search(options);
    const stats = store.getStats();

    return NextResponse.json({
        ...result,
        stats,
    });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { briefId, action, tags, title } = body;
        const store = getResearchStore();

        // Handle status updates
        if (briefId && action) {
            const brief = store.updateStatus(briefId, action);
            if (!brief) {
                return NextResponse.json({ error: "Brief not found" }, { status: 404 });
            }
            return NextResponse.json({ brief });
        }

        // Handle tag additions
        if (briefId && tags) {
            const brief = store.addTags(briefId, tags);
            if (!brief) {
                return NextResponse.json({ error: "Brief not found" }, { status: 404 });
            }
            return NextResponse.json({ brief });
        }

        return NextResponse.json(
            { error: "Invalid request — provide briefId + action/tags" },
            { status: 400 }
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
