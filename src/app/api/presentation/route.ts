/**
 * POST /api/presentation — Generate an HTML5 presentation from a run
 */

import { NextResponse } from "next/server";
import { generatePresentation } from "@/lib/presentation";
import { AnalysisStore } from "@/lib/pipeline/analysis-store";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { runId, title, showQuality = true, showProvenance = true, maxFindingsPerDimension = 3 } = body;

        if (!runId) {
            return NextResponse.json({ error: "runId is required" }, { status: 400 });
        }

        const store = new AnalysisStore();
        const manifest = store.getResult(runId);

        if (!manifest) {
            return NextResponse.json({ error: "Run not found or not complete" }, { status: 404 });
        }

        // V3: generatePresentation(manifest, qaReport) — no options needed
        const html = generatePresentation(
            manifest,
            (manifest as any).qaReport ?? {
                provenance: { links: [], totalClaims: 0, verifiableSources: 0, unverifiableSources: 0, completeChains: 0, incompleteChains: 0, chainCompleteness: 0, gapSummary: [] },
                score: { overallScore: 0, grade: "C" as const, dimensions: [], passesQualityGate: false, recommendations: [] },
                warnings: [],
                gateDecisions: [],
                passesAllGates: true,
                timestamp: new Date().toISOString(),
            },
        );

        return new Response(html, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Disposition": `inline; filename="prism-brief-${runId}.html"`,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
