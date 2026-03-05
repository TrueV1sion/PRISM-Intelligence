/**
 * POST /api/pipeline/execute — Execute the full PRISM intelligence pipeline.
 * 
 * Accepts a query + runId, runs THINK → CONSTRUCT → DEPLOY → SYNTHESIZE → CRITIC,
 * and returns the complete IntelligenceManifest.
 * 
 * In the future this will be an SSE endpoint for real-time streaming.
 * For now, it returns the complete result synchronously.
 */

import { NextResponse } from "next/server";
import { executePipeline } from "@/lib/pipeline/executor";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { query, runId, urgency = "balanced" } = body;

        if (!query || !runId) {
            return NextResponse.json(
                { error: "query and runId are required" },
                { status: 400 }
            );
        }

        const result = await executePipeline({
            query,
            runId,
            urgency,
        });

        return NextResponse.json({
            success: true,
            runId: result.runId,
            manifest: result.manifest,
            qualityPassed: result.qualityPassed,
            qualityIssues: result.qualityIssues,
            warnings: result.warnings,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[Pipeline Error]", message);

        return NextResponse.json(
            { error: message, success: false },
            { status: 500 }
        );
    }
}
