/**
 * PRISM Pipeline — Executor
 * 
 * Orchestrates the complete intelligence pipeline:
 * THINK → CONSTRUCT → DEPLOY → SYNTHESIZE → (CRITIC) → COMPLETE
 * 
 * Manages the full lifecycle, updating database state between phases,
 * emitting events for real-time streaming, and enforcing quality gates.
 */

import { prisma } from "@/lib/prisma";
import { think, type ThinkInput } from "./think";
import { construct } from "./construct";
import { deploy } from "./deploy";
import { synthesize, criticReview } from "./synthesize";
import { MemoryBus } from "./memory-bus";
import { AnalysisStore, type ExecutionState, type DecompositionPattern } from "./analysis-store";
import { runQualityAssurance, getQualityGateSystem, type QualityAssuranceReport } from "./quality-assurance";
import { generatePresentation } from "@/lib/presentation";
import type { Blueprint, PipelineEvent, IntelligenceManifest } from "./types";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────

export interface PipelineInput {
    query: string;
    runId: string;
    urgency?: "speed" | "balanced" | "thorough";
    decompositionPattern?: DecompositionPattern;
    onEvent?: (event: PipelineEvent) => void;
}

export interface PipelineOutput {
    runId: string;
    manifest: IntelligenceManifest;
    qualityPassed: boolean;
    qualityIssues: string[];
    warnings: string[];
    qualityAssurance: QualityAssuranceReport;
    executionState: ExecutionState;
}


// ─── Main Orchestrator ──────────────────────────────────────

/**
 * Execute the full PRISM intelligence pipeline.
 * 
 * Flow: THINK → CONSTRUCT → DEPLOY → SYNTHESIZE → CRITIC → COMPLETE
 * 
 * Each phase updates the database Run status.
 * Quality gate is enforced after synthesis — issues are flagged but don't block delivery.
 */
export async function executePipeline(input: PipelineInput): Promise<PipelineOutput> {
    const { query, runId, urgency = "balanced", decompositionPattern = "dimensional_split", onEvent } = input;
    const allWarnings: string[] = [];

    // Create shared memory bus for cross-agent communication
    const memoryBus = new MemoryBus(query);

    // Create analysis store for execution tracking
    const store = new AnalysisStore();
    const execution = store.createExecution(runId, decompositionPattern);

    try {
        // ─── Phase 0: THINK ───────────────────────────────────

        await updateRunStatus(runId, "THINK");
        store.updateExecution(runId, { phase: "THINK", status: "running" });

        const thinkResult = await think({ query, urgency });
        const { blueprint } = thinkResult;
        allWarnings.push(...thinkResult.warnings);

        // Persist blueprint to database
        await persistBlueprint(runId, blueprint);

        onEvent?.({ type: "blueprint", data: blueprint });


        // ─── Phase 1: CONSTRUCT ───────────────────────────────

        await updateRunStatus(runId, "CONSTRUCT");
        store.updateExecution(runId, { phase: "CONSTRUCT", status: "spawning" });
        store.saveBlueprint(runId, blueprint);

        const constructResult = construct(blueprint);
        const { agents } = constructResult;
        allWarnings.push(...constructResult.warnings);

        // Update agents in database with system prompts
        for (const agent of agents) {
            await prisma.agent.updateMany({
                where: { runId, name: agent.name },
                data: {
                    status: "active",
                    archetype: agent.archetype,
                    mandate: agent.mandate,
                    tools: JSON.stringify(agent.tools),
                    color: agent.color,
                },
            });
        }


        // ─── Phase 2: DEPLOY ──────────────────────────────────

        await updateRunStatus(runId, "DEPLOY");
        store.updateExecution(runId, { phase: "DEPLOY", status: "running" });

        const deployResult = await deploy({
            agents,
            query,
            tier: blueprint.tier,
            memoryBus,
            onEvent,
        });
        allWarnings.push(...deployResult.warnings);

        // Persist agent results and findings to database
        for (const agentResult of deployResult.results) {
            if (agentResult.result) {
                // Update agent status
                await prisma.agent.updateMany({
                    where: { runId, name: agentResult.agentName },
                    data: {
                        status: "complete",
                        progress: 100,
                    },
                });

                // Persist findings
                for (const finding of agentResult.result.findings) {
                    const dbAgent = await prisma.agent.findFirst({
                        where: { runId, name: agentResult.agentName },
                    });

                    if (dbAgent) {
                        await prisma.finding.create({
                            data: {
                                statement: finding.statement,
                                evidence: finding.evidence,
                                confidence: finding.confidence,
                                evidenceType: finding.evidenceType,
                                source: finding.source,
                                implication: finding.implication,
                                action: "keep",
                                agentId: dbAgent.id,
                                runId,
                            },
                        });
                    }
                }
            } else {
                // Mark failed agents
                await prisma.agent.updateMany({
                    where: { runId, name: agentResult.agentName },
                    data: { status: "failed", progress: 0 },
                });
            }
        }

        // Check: enough agents succeeded?
        const successCount = deployResult.results.filter(r => r.result !== null).length;
        if (successCount < 2) {
            throw new Error(
                `Only ${successCount} agents succeeded — minimum 2 required for synthesis. ` +
                `Failed: ${deployResult.failedAgents.join(", ")}`
            );
        }


        // ─── Phase 3: SYNTHESIZE ──────────────────────────────

        await updateRunStatus(runId, "SYNTHESIZE");
        onEvent?.({
            type: "synthesis:layer",
            data: { name: "foundation", description: "Starting synthesis — analyzing cross-agent patterns...", insights: [] },
        });
        store.updateExecution(runId, {
            phase: "SYNTHESIZE",
            status: "synthesizing",
            agentsCompleted: successCount,
            agentsFailed: deployResult.failedAgents.length,
            findingsCount: deployResult.totalFindings,
        });

        const synthResult = await synthesize({
            blueprint,
            agentResults: deployResult.results,
            onEvent,
        });
        allWarnings.push(...synthResult.warnings);

        // Persist synthesis layers
        for (let i = 0; i < synthResult.synthesis.layers.length; i++) {
            const layer = synthResult.synthesis.layers[i];
            await prisma.synthesis.create({
                data: {
                    layerName: layer.name,
                    description: layer.description,
                    insights: JSON.stringify(layer.insights),
                    order: i,
                    runId,
                },
            });
        }


        // ─── Critic Review (EXTENDED+ tiers only) ──────────────
        // Note: STANDARD tier already runs critic inside synthesize() via the validated strategy.
        // Only EXTENDED/MEGA/CAMPAIGN need an outer critic pass (they use grouped/hierarchical).

        const tier = blueprint.tier;
        let criticResult = null;

        if (tier !== "MICRO" && tier !== "STANDARD") {
            onEvent?.({
                type: "agent:progress",
                data: { agentId: "critic", progress: -1, message: "Running adversarial quality review..." },
            });
            criticResult = await criticReview(
                synthResult.synthesis,
                blueprint,
                deployResult.results,
                onEvent,
            );

            const criticalIssues = criticResult.issues.filter(i => i.severity === "critical");
            if (criticalIssues.length > 0) {
                allWarnings.push(
                    `CRITIC found ${criticalIssues.length} critical issue(s): ` +
                    criticalIssues.map(i => i.description).join("; ")
                );
            }
        }


        // ─── Build Intelligence Manifest ──────────────────────
        console.log("[PRISM] Building manifest...");

        const totalCost = deployResult.results.reduce((sum, r) => sum + r.meta.cost, 0);

        const manifest: IntelligenceManifest = {
            meta: {
                query,
                tier: blueprint.tier,
                agentCount: agents.length,
                totalFindings: deployResult.totalFindings,
                emergentInsights: synthResult.synthesis.emergentInsights.length,
                runId,
                generatedAt: new Date().toISOString(),
                totalCost,
            },
            blueprint,
            agentResults: deployResult.results
                .filter(r => r.result !== null)
                .map(r => ({
                    agent: blueprint.agents.find(a => a.name === r.agentName)!,
                    result: r.result!,
                    meta: r.meta,
                })),
            synthesis: synthResult.synthesis,
            provenance: deployResult.results
                .filter(r => r.result !== null)
                .flatMap(r =>
                    r.result!.findings.map(f => ({
                        finding: f.statement,
                        agent: r.agentName,
                        evidence: f.evidence,
                        source: f.source,
                        confidence: f.confidence as "HIGH" | "MEDIUM" | "LOW",
                        confidenceReasoning: f.confidenceReasoning,
                    }))
                ),
        };


        // ─── Quality Assurance Pipeline ────────────────────────
        console.log("[PRISM] Running QA pipeline...");

        const qaReport = await runQualityAssurance(
            manifest,
            deployResult.results,
            blueprint,
            getQualityGateSystem(),
            criticResult?.issues,
            onEvent,
        );

        // Merge QA warnings into allWarnings
        for (const w of qaReport.warnings) {
            allWarnings.push(`[${w.severity.toUpperCase()}] ${w.message}`);
        }


        // ─── Generate Presentation ────────────────────────────
        console.log("[PRISM] Generating presentation...");

        let presentationPath = "";
        try {
            const html = generatePresentation(manifest, qaReport);
            const decksDir = join(process.cwd(), "public", "decks");
            mkdirSync(decksDir, { recursive: true });

            const filename = `${runId}.html`;
            writeFileSync(join(decksDir, filename), html, "utf-8");
            presentationPath = `/decks/${filename}`;

            // Count slides
            const slideCount = (html.match(/class="slide[\s"]/g) || []).length;

            // Persist to database
            await prisma.presentation.create({
                data: {
                    title: manifest.meta.query,
                    subtitle: `${manifest.meta.tier} · ${manifest.meta.agentCount} agents · ${manifest.meta.totalFindings} findings`,
                    htmlPath: presentationPath,
                    slideCount,
                    runId,
                },
            });
        } catch (presError) {
            console.error("[PRISM] Presentation generation error:", presError);
            const msg = presError instanceof Error ? presError.message : String(presError);
            allWarnings.push(`Presentation generation failed: ${msg}`);
        }


        // ─── Complete ─────────────────────────────────────────
        console.log("[PRISM] Completing run...");

        await prisma.run.update({
            where: { id: runId },
            data: {
                status: "COMPLETE",
                completedAt: new Date(),
            },
        });

        onEvent?.({ type: "run:complete", data: { runId, manifest, presentationPath } });

        // Complete execution tracking
        store.completeExecution(runId, manifest);
        const executionState = store.getExecution(runId)!;

        return {
            runId,
            manifest,
            qualityPassed: synthResult.qualityPassed && qaReport.passesAllGates,
            qualityIssues: synthResult.qualityIssues,
            warnings: allWarnings,
            qualityAssurance: qaReport,
            executionState,
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Update run status to failed
        await prisma.run.update({
            where: { id: runId },
            data: { status: "FAILED" },
        });

        store.failExecution(runId, errorMessage);

        onEvent?.({ type: "run:error", data: { error: errorMessage, phase: "pipeline" } });

        throw error;
    }
}


// ─── Helpers ────────────────────────────────────────────────

async function updateRunStatus(runId: string, status: string) {
    await prisma.run.update({
        where: { id: runId },
        data: { status },
    });
}

async function persistBlueprint(runId: string, blueprint: Blueprint) {
    // Update run with complexity data
    await prisma.run.update({
        where: { id: runId },
        data: {
            tier: blueprint.tier,
            complexityScore: Math.round(blueprint.complexity.total),
            breadth: blueprint.complexity.breadth,
            depth: blueprint.complexity.depth,
            interconnection: blueprint.complexity.interconnection,
            estimatedTime: blueprint.estimatedTime,
        },
    });

    // Create dimensions
    for (const dim of blueprint.dimensions) {
        await prisma.dimension.create({
            data: {
                name: dim.name,
                description: dim.description,
                runId,
            },
        });
    }

    // Create agents
    for (const agent of blueprint.agents) {
        await prisma.agent.create({
            data: {
                name: agent.name,
                archetype: agent.archetype,
                mandate: agent.mandate,
                tools: JSON.stringify(agent.tools),
                dimension: agent.dimension,
                runId,
            },
        });
    }
}
