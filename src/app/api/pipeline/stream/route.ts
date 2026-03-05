/**
 * GET /api/pipeline/stream?runId=...&query=...
 * 
 * SSE (Server-Sent Events) endpoint for real-time pipeline streaming.
 * 
 * Executes the full PRISM pipeline (THINK → CONSTRUCT → DEPLOY → SYNTHESIZE → QA)
 * and streams events as they occur.
 * 
 * Event Types:
 * - phase_change: Pipeline phase transition
 * - blueprint: Strategic decomposition complete
 * - agent_spawned: Agent initialized
 * - agent_progress: Agent execution progress update
 * - finding_added: New finding from an agent
 * - agent_complete: Agent finished execution
 * - agent_failed: Agent execution failed
 * - emergence_detected: Emergent insight found
 * - synthesis_layer: Synthesis layer completed
 * - conflict_found: Tension between agents detected
 * - critic_review: Critic issue flagged
 * - quality_report: Quality assessment results
 * - complete: Pipeline finished
 * - error: Pipeline error
 */

import { executePipeline } from "@/lib/pipeline/executor";
import { prisma } from "@/lib/prisma";
import type { PipelineEvent } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const runId = searchParams.get("runId");
    const urgency = (searchParams.get("urgency") ?? "balanced") as "speed" | "balanced" | "thorough";

    if (!query || !runId) {
        return new Response(
            JSON.stringify({ error: "query and runId are required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    // Validate API key is set
    if (!process.env.ANTHROPIC_API_KEY) {
        return new Response(
            JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured. Set it in .env to enable live mode." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            // Helper to send SSE events
            function send(event: string, data: unknown) {
                try {
                    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                    controller.enqueue(encoder.encode(payload));
                } catch {
                    // Stream may have been closed by client
                }
            }

            // Heartbeat to keep SSE connection alive during long synthesis phases
            const heartbeat = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(": heartbeat\n\n"));
                } catch {
                    clearInterval(heartbeat);
                }
            }, 15_000);

            // Map PipelineEvents to SSE events
            function handleEvent(event: PipelineEvent) {
                switch (event.type) {
                    case "blueprint":
                        send("phase_change", { phase: "blueprint", message: "Blueprint ready — review and approve..." });
                        send("blueprint", {
                            query: event.data.query,
                            tier: event.data.tier,
                            estimatedTime: event.data.estimatedTime,
                            agentCount: event.data.agents.length,
                            complexity: event.data.complexity,
                            dimensions: event.data.dimensions.map(d => ({
                                name: d.name,
                                description: d.description,
                            })),
                            agents: event.data.agents.map(a => ({
                                name: a.name,
                                archetype: a.archetype,
                                dimension: a.dimension,
                                mandate: a.mandate,
                                tools: a.tools,
                            })),
                        });
                        break;

                    case "agent:spawned":
                        send("agent_spawned", event.data);
                        break;

                    case "agent:progress":
                        send("agent_progress", event.data);
                        break;

                    case "agent:finding":
                        send("finding_added", {
                            agentId: event.data.agentId,
                            finding: {
                                statement: event.data.finding.statement,
                                confidence: event.data.finding.confidence,
                                evidence: event.data.finding.evidence,
                                source: event.data.finding.source,
                                implication: event.data.finding.implication,
                            },
                        });
                        break;

                    case "agent:complete":
                        send("agent_complete", {
                            agentId: event.data.agentId,
                            findingCount: event.data.result.findings.length,
                            gapCount: event.data.result.gaps.length,
                        });
                        break;

                    case "agent:failed":
                        send("agent_failed", event.data);
                        break;

                    case "synthesis:layer":
                        send("synthesis_layer", event.data);
                        break;

                    case "synthesis:emergence":
                        send("emergence_detected", {
                            insight: event.data.insight,
                            type: event.data.type,
                            contributingAgents: event.data.contributingAgents,
                            quality: event.data.quality,
                        });
                        break;

                    case "critic:review":
                        send("critic_review", event.data);
                        break;

                    case "run:complete":
                        send("quality_report", {
                            qualityReport: event.data.manifest.synthesis.qualityReport,
                            emergentInsights: event.data.manifest.synthesis.emergentInsights.length,
                            totalFindings: event.data.manifest.meta.totalFindings,
                            totalCost: event.data.manifest.meta.totalCost,
                        });
                        send("complete", {
                            runId: event.data.runId,
                            agentCount: event.data.manifest.meta.agentCount,
                            totalFindings: event.data.manifest.meta.totalFindings,
                            emergentInsights: event.data.manifest.meta.emergentInsights,
                            totalCost: event.data.manifest.meta.totalCost,
                            presentationPath: event.data.presentationPath ?? "",
                        });
                        break;

                    case "run:error":
                        send("error", event.data);
                        break;
                }
            }

            try {
                // Create the Run record in the database — the executor calls .update() throughout
                await prisma.run.create({
                    data: {
                        id: runId,
                        query,
                        status: "INITIALIZE",
                    },
                });

                // Send initial event
                send("phase_change", { phase: "think", message: "Decomposing strategic question..." });

                const result = await executePipeline({
                    query,
                    runId,
                    urgency,
                    onEvent: handleEvent,
                });

                // Send QA report if available
                if (result.qualityAssurance) {
                    send("quality_report", {
                        overallScore: result.qualityAssurance.score.overallScore,
                        grade: result.qualityAssurance.score.grade,
                        provenanceCompleteness: result.qualityAssurance.provenance.chainCompleteness,
                        warningCount: result.qualityAssurance.warnings.length,
                        criticalWarnings: result.qualityAssurance.warnings
                            .filter(w => w.severity === "critical")
                            .map(w => w.message),
                    });
                }

            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                send("error", { error: message, phase: "pipeline" });
            } finally {
                clearInterval(heartbeat);
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
