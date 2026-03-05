/**
 * PRISM Pipeline — Phase 2: DEPLOY
 * 
 * Two-Phase Parallel Agent Executor.
 * 
 * Each agent executes in two phases:
 * 1. RESEARCH: generateText() with MCP tools → real data from PubMed, CMS, EDGAR, etc.
 * 2. STRUCTURE: generateObject() with research context → validated structured findings
 * 
 * Quality controls:
 * - Real data gathering via 19+ external API tools
 * - Agent outputs validated against Zod schema
 * - Source verification: findings must reference real tool data
 * - Unsourced findings flagged and confidence downgraded
 * - Per-agent failure handling: failed agents don't block the pipeline
 * - Model metadata tracked for provenance
 * - Tool call stats tracked per-agent and per-tool
 */

import { generateObject, generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { AgentResultSchema, type AgentResult, type AgentExecutionMeta, type PipelineEvent } from "./types";
import type { ConstructedAgent } from "./construct";
import type { MemoryBus } from "./memory-bus";
import { buildToolsForAgent, getToolStats } from "./tool-bridge";

// ─── Types ──────────────────────────────────────────────────

export interface AgentDeployResult {
    agentId: string;
    agentName: string;
    dimension: string;
    result: AgentResult | null;
    meta: AgentExecutionMeta;
    error?: string;
    warnings: string[];
}

export interface DeployInput {
    agents: ConstructedAgent[];
    query: string;
    tier?: "MICRO" | "STANDARD" | "EXTENDED" | "MEGA" | "CAMPAIGN";
    memoryBus?: MemoryBus;
    onEvent?: (event: PipelineEvent) => void;
}

export interface DeployOutput {
    results: AgentDeployResult[];
    failedAgents: string[];
    totalFindings: number;
    sourcedFindings: number;
    unsourcedFindings: number;
    warnings: string[];
    toolStats?: {
        totalCalls: number;
        cachedCalls: number;
        cacheHitRate: number;
        byTool: Record<string, number>;
        byAgent: Record<string, number>;
    };
}


// ─── Main Function ──────────────────────────────────────────

/**
 * Phase 2: DEPLOY — Execute all agents in parallel with real tool access.
 * 
 * Each agent:
 * 1. Phase 1 (RESEARCH): Uses generateText() with MCP tools to gather real data
 *    from PubMed, CMS, SEC EDGAR, GDELT, and 15+ other sources
 * 2. Phase 2 (STRUCTURE): Uses generateObject() with research context to produce
 *    validated structured findings grounded in real evidence
 * 3. Gets validated against the AgentResult Zod schema
 * 4. Has findings checked for source quality
 * 
 * Agents run independently via Promise.allSettled — a failed agent
 * doesn't block the others. Tool results are cached across agents.
 */
export async function deploy(input: DeployInput): Promise<DeployOutput> {
    const { agents, query, tier, memoryBus, onEvent } = input;
    const warnings: string[] = [];

    // Emit spawn events
    for (const agent of agents) {
        onEvent?.({ type: "agent:spawned", data: { agentId: agent.id, name: agent.name } });
    }

    // ─── Wave Execution Strategy ─────────────────────────────
    // EXTENDED+ tiers (7+ agents): two-wave execution for cross-agent awareness
    // Wave 1: Foundation agents (first half) — run in parallel
    // Wave 2: Specialist agents (second half) — run with Wave 1's blackboard context
    // MICRO/STANDARD: all agents run in parallel (faster, simpler)
    const useWaves = (tier === "EXTENDED" || tier === "MEGA" || tier === "CAMPAIGN") && agents.length >= 7;

    let settledResults: PromiseSettledResult<AgentDeployResult>[];

    if (useWaves && memoryBus) {
        const midpoint = Math.ceil(agents.length / 2);
        const wave1Agents = agents.slice(0, midpoint);
        const wave2Agents = agents.slice(midpoint);

        onEvent?.({
            type: "agent:progress",
            data: { agentId: "orchestrator", progress: 10, message: `Wave 1: Deploying ${wave1Agents.length} foundation agents...` },
        });

        // Wave 1: Foundation agents
        const wave1Results = await Promise.allSettled(
            wave1Agents.map(agent => executeAgent(agent, query, memoryBus, onEvent))
        );

        // Write Wave 1 results to memory bus for Wave 2 agents to read
        for (const settled of wave1Results) {
            if (settled.status === "fulfilled" && settled.value.result) {
                const r = settled.value;
                for (const finding of r.result!.findings) {
                    memoryBus.writeToBlackboard({
                        agent: r.agentName,
                        key: `${r.dimension.toLowerCase().replace(/\s+/g, "-")}/${finding.evidenceType}`,
                        value: finding.statement,
                        confidence: finding.confidence === "HIGH" ? 0.9 : finding.confidence === "MEDIUM" ? 0.6 : 0.3,
                        evidenceType: finding.evidenceType === "primary" ? "direct" : finding.evidenceType === "secondary" ? "inferred" : "analogical",
                        tags: [r.dimension.toLowerCase(), finding.confidence.toLowerCase()],
                        references: [finding.source],
                    });
                }
                for (const signal of r.result!.signals) {
                    memoryBus.sendSignal({
                        from: r.agentName,
                        to: "all",
                        type: "discovery",
                        priority: "medium",
                        message: signal,
                    });
                }
            }
        }

        onEvent?.({
            type: "agent:progress",
            data: { agentId: "orchestrator", progress: 55, message: `Wave 2: Deploying ${wave2Agents.length} specialist agents with cross-agent context...` },
        });

        // Wave 2: Specialist agents — they'll receive Wave 1's blackboard via memoryContext
        const wave2Results = await Promise.allSettled(
            wave2Agents.map(agent => executeAgent(agent, query, memoryBus, onEvent))
        );

        settledResults = [...wave1Results, ...wave2Results];
        warnings.push(`Two-wave execution: ${wave1Agents.length} foundation + ${wave2Agents.length} specialist agents (${tier} tier)`);
    } else {
        // Standard parallel execution for MICRO/STANDARD
        settledResults = await Promise.allSettled(
            agents.map(agent => executeAgent(agent, query, memoryBus, onEvent))
        );
    }

    // Process results
    const results: AgentDeployResult[] = [];
    const failedAgents: string[] = [];
    let totalFindings = 0;
    let sourcedFindings = 0;
    let unsourcedFindings = 0;

    for (let i = 0; i < settledResults.length; i++) {
        const settled = settledResults[i];
        const agent = agents[i];

        if (settled.status === "fulfilled") {
            const deployResult = settled.value;
            results.push(deployResult);

            if (deployResult.result) {
                // Count finding quality metrics
                for (const finding of deployResult.result.findings) {
                    totalFindings++;
                    if (finding.source && finding.source.trim() !== "" && !finding.source.toLowerCase().includes("not available")) {
                        sourcedFindings++;
                    } else {
                        unsourcedFindings++;
                        deployResult.warnings.push(`Finding "${finding.statement.substring(0, 60)}..." has no verifiable source`);
                    }
                }

                // Write findings to shared blackboard for cross-agent awareness
                if (memoryBus) {
                    for (const finding of deployResult.result.findings) {
                        memoryBus.writeToBlackboard({
                            agent: deployResult.agentName,
                            key: `${deployResult.dimension.toLowerCase().replace(/\s+/g, "-")}/${finding.evidenceType}`,
                            value: finding.statement,
                            confidence: finding.confidence === "HIGH" ? 0.9 : finding.confidence === "MEDIUM" ? 0.6 : 0.3,
                            evidenceType: finding.evidenceType === "primary" ? "direct" : finding.evidenceType === "secondary" ? "inferred" : "analogical",
                            tags: [deployResult.dimension.toLowerCase(), finding.confidence.toLowerCase()],
                            references: [finding.source],
                        });
                    }

                    // Write cross-dimensional signals
                    for (const signal of deployResult.result.signals) {
                        memoryBus.sendSignal({
                            from: deployResult.agentName,
                            to: "all",
                            type: "discovery",
                            priority: "medium",
                            message: signal,
                        });
                    }
                }

                onEvent?.({ type: "agent:complete", data: { agentId: agent.id, result: deployResult.result } });
            } else {
                failedAgents.push(agent.name);
                onEvent?.({ type: "agent:failed", data: { agentId: agent.id, error: deployResult.error ?? "Unknown error" } });
            }

            warnings.push(...deployResult.warnings);
        } else {
            // Promise rejected — agent completely failed
            failedAgents.push(agent.name);
            const error = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);

            results.push({
                agentId: agent.id,
                agentName: agent.name,
                dimension: agent.dimension,
                result: null,
                meta: {
                    agentId: agent.id,
                    modelProvider: "anthropic",
                    modelName: "claude-sonnet-4-20250514",
                    inputTokens: 0,
                    outputTokens: 0,
                    startedAt: new Date(),
                    completedAt: new Date(),
                    durationMs: 0,
                    cost: 0,
                },
                error,
                warnings: [`Agent "${agent.name}" failed completely: ${error}`],
            });

            onEvent?.({ type: "agent:failed", data: { agentId: agent.id, error } });
            warnings.push(`Agent "${agent.name}" failed: ${error}. Dimension "${agent.dimension}" may have reduced coverage.`);
        }
    }

    // Cross-check: look for signals from successful agents that reference failed dimensions
    if (failedAgents.length > 0) {
        const successfulAgents = results.filter(r => r.result !== null);
        for (const successful of successfulAgents) {
            if (successful.result?.signals && successful.result.signals.length > 0) {
                warnings.push(
                    `Agent "${successful.agentName}" has cross-dimensional signals that may partially cover failed dimensions.`
                );
            }
        }
    }

    // Source coverage warning
    const sourceCoverage = totalFindings > 0 ? (sourcedFindings / totalFindings) * 100 : 0;
    if (sourceCoverage < 80) {
        warnings.push(
            `Source coverage is ${Math.round(sourceCoverage)}% (${sourcedFindings}/${totalFindings}). ` +
            `Target is ≥80%. ${unsourcedFindings} findings lack verifiable sources.`
        );
    }

    return {
        results,
        failedAgents,
        totalFindings,
        sourcedFindings,
        unsourcedFindings,
        warnings,
        toolStats: getToolStats(),
    };
}


// ─── Two-Phase Agent Executor ───────────────────────────────

/**
 * Execute a single agent with two-phase approach:
 * 
 * Phase 1 (RESEARCH): generateText() with real MCP tools
 *   → Agent queries PubMed, CMS, EDGAR, etc. in an agentic loop
 *   → Tool results accumulated as research context
 * 
 * Phase 2 (STRUCTURE): generateObject() with research context
 *   → Agent produces structured findings grounded in real tool data
 *   → Zod schema validation ensures output quality
 */
async function executeAgent(
    agent: ConstructedAgent,
    query: string,
    memoryBus?: MemoryBus,
    onEvent?: (event: PipelineEvent) => void,
): Promise<AgentDeployResult> {
    const warnings: string[] = [];
    const startedAt = new Date();

    onEvent?.({
        type: "agent:progress",
        data: { agentId: agent.id, progress: 5, message: `${agent.name} initializing research tools...` },
    });

    try {
        // Inject shared blackboard context if memory bus is available
        const memoryContext = memoryBus ? memoryBus.formatForAgentContext(agent.name) : "";

        // ─── Phase 1: RESEARCH — gather real data via tools ──────

        // Build AI SDK tools from the agent's compatible skills
        const bridgedTools = buildToolsForAgent(
            agent.name,
            agent.compatibleSkills,
            onEvent,
            agent.id,
        );

        const toolCount = Object.keys(bridgedTools).length;

        onEvent?.({
            type: "agent:progress",
            data: { agentId: agent.id, progress: 10, message: `${agent.name} starting research with ${toolCount} tools...` },
        });

        const researchPrompt = `You are ${agent.name}, a research specialist focused on the "${agent.dimension}" dimension.

YOUR MANDATE:
${agent.mandate}

STRATEGIC QUESTION TO RESEARCH:
"${query}"
${memoryContext ? `\n## Intelligence from Other Agents\n${memoryContext}\n` : ""}
INSTRUCTIONS:
Use your available research tools to gather REAL, CURRENT data relevant to this question.
- Make 3-6 tool calls to build a thorough evidence base
- Prioritize primary sources (PubMed, CMS, SEC filings, Federal Register)
- Look for data that supports AND challenges expected conclusions
- Note any gaps where data wasn't available
- When searching, use specific, targeted queries

After gathering data, synthesize your findings into a clear research summary.`;

        const { text: researchText, toolCalls, usage: researchUsage } = await generateText({
            model: anthropic("claude-sonnet-4-20250514"),
            system: agent.systemPrompt,
            prompt: researchPrompt,
            tools: bridgedTools,
            stopWhen: stepCountIs(10),
            temperature: 0.3,
        });

        const researchToolCalls = toolCalls?.length ?? 0;

        onEvent?.({
            type: "agent:progress",
            data: {
                agentId: agent.id,
                progress: 55,
                message: `${agent.name} research complete (${researchToolCalls} tool calls). Structuring findings...`,
            },
        });

        // ─── Phase 2: STRUCTURE — produce validated AgentResult ──

        const structurePrompt = `Based on the research data gathered below, produce your structured analysis.

STRATEGIC QUESTION: "${query}"
YOUR DIMENSION: "${agent.dimension}"
YOUR MANDATE: ${agent.mandate}

## Research Data Gathered
${researchText}

REQUIREMENTS:
- Every finding must cite the REAL source from the research data above
- Do NOT invent data — only report what the research tools actually returned
- Calibrate confidence based on the quality and recency of sources
- Note gaps where tools returned no data or insufficient data
- Flag observations relevant to other agents' dimensions
- Include minority views and counter-perspectives where evidence supports them

STRUCTURED DATA EXTRACTION (MANDATORY — drives presentation charts, stats, and tables):
CRITICAL: Every finding MUST include at least 1 structuredData entry. If a finding contains
no quantitative data, extract qualitative entities (type: "entity") or timeline events.
Findings with empty structuredData arrays produce poor presentations.

Rules for structured data:
- Dollar amounts → type: "metric", unit: "$", value as NUMBER (not string). E.g. { type: "metric", label: "Medicare Spending", value: 1020000000000, unit: "$", context: "FY2026 projection" }
- Percentages → type: "metric", unit: "%", value as NUMBER. E.g. { type: "metric", label: "Premium Increase", value: 8.5, unit: "%", colorHint: "negative" }
- Count/quantity → type: "metric", unit: descriptive (e.g. "filings", "plans", "patients"). E.g. { type: "metric", label: "SEC Filings Analyzed", value: 8, unit: "filings" }
- Entity names (companies, drugs, regulations) → type: "entity". E.g. { type: "entity", label: "ACA Section 1332", value: "State Innovation Waivers" }
- Rankings or head-to-head comparisons → type: "comparison" or "ranking"
- Timeline events with dates → type: "timeline_event". E.g. { type: "timeline_event", label: "CMS Final Rule", value: "January 2027" }
- State/region data → type: "geographic". E.g. { type: "geographic", label: "Texas", value: "High Impact", metadata: { "medicaid_expansion": "no" } }

IMPORTANT: Always use numeric values when possible (value: 8.5 not value: "8.5%"). Always specify the unit field.
Each finding should have 1-5 structured data points. This data drives charts, stat cards, and tables in the final presentation.

CONTENT TYPE CLASSIFICATION:
Set contentType to the dominant category of your analysis:
- "financial" if your findings are primarily about revenue, costs, market size, reimbursement
- "regulatory" if about CMS rules, FDA, compliance, policy changes
- "competitive" if about market landscape, M&A, competitors, startups
- "clinical" if about health outcomes, drug efficacy, clinical trials
- "quality" if about HEDIS, Star Ratings, CAHPS, quality measures
- "technology" if about platforms, AI, digital health infrastructure
- "strategic" if cross-cutting or Inovalon-specific impact
- "general" if none of the above clearly apply`;

        onEvent?.({
            type: "agent:progress",
            data: { agentId: agent.id, progress: 65, message: `${agent.name} structuring evidence-based findings...` },
        });

        const { object: result, usage: structureUsage } = await generateObject({
            model: anthropic("claude-sonnet-4-20250514"),
            schema: AgentResultSchema,
            system: agent.systemPrompt,
            prompt: structurePrompt,
            temperature: 0.2,
        });

        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();

        // Calculate total cost across both phases
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rUsage = researchUsage as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sUsage = structureUsage as any;
        const inputTokens = (rUsage?.promptTokens ?? 0) + (sUsage?.promptTokens ?? 0);
        const outputTokens = (rUsage?.completionTokens ?? 0) + (sUsage?.completionTokens ?? 0);
        const cost = (inputTokens * 3 / 1_000_000) + (outputTokens * 15 / 1_000_000);

        onEvent?.({
            type: "agent:progress",
            data: { agentId: agent.id, progress: 85, message: `${agent.name} validating findings...` },
        });

        // ─── Quality checks on findings ─────────────────────────

        // Check: findings that have no real source
        for (const finding of result.findings) {
            if (!finding.source || finding.source.trim() === "") {
                finding.confidence = "LOW";
                finding.confidenceReasoning = "Downgraded to LOW: no source provided for this finding.";
                warnings.push(`Finding from ${agent.name} has no source — confidence downgraded to LOW`);
            }
        }

        // Check: confidence calibration — if ALL findings are HIGH, that's suspicious
        const highCount = result.findings.filter(f => f.confidence === "HIGH").length;
        if (result.findings.length >= 3 && highCount === result.findings.length) {
            warnings.push(
                `All ${highCount} findings from ${agent.name} are HIGH confidence — ` +
                `this may indicate poor calibration. Consider reviewing.`
            );
        }

        // Check: minimum finding count
        if (result.findings.length < 2) {
            warnings.push(
                `Agent "${agent.name}" produced only ${result.findings.length} finding(s). ` +
                `Expected 3-8 for meaningful coverage.`
            );
        }

        onEvent?.({
            type: "agent:progress",
            data: {
                agentId: agent.id,
                progress: 100,
                message: `${agent.name} complete — ${result.findings.length} findings from ${researchToolCalls} tool calls`,
            },
        });

        return {
            agentId: agent.id,
            agentName: agent.name,
            dimension: agent.dimension,
            result,
            meta: {
                agentId: agent.id,
                modelProvider: "anthropic",
                modelName: "claude-sonnet-4-20250514",
                inputTokens,
                outputTokens,
                startedAt,
                completedAt,
                durationMs,
                cost,
            },
            warnings,
        };
    } catch (error) {
        const completedAt = new Date();
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
            agentId: agent.id,
            agentName: agent.name,
            dimension: agent.dimension,
            result: null,
            meta: {
                agentId: agent.id,
                modelProvider: "anthropic",
                modelName: "claude-sonnet-4-20250514",
                inputTokens: 0,
                outputTokens: 0,
                startedAt,
                completedAt,
                durationMs: completedAt.getTime() - startedAt.getTime(),
                cost: 0,
            },
            error: errorMessage,
            warnings: [`Agent "${agent.name}" failed: ${errorMessage}`],
        };
    }
}
