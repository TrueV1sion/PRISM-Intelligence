/**
 * PRISM Pipeline — Phase 3: SYNTHESIZE
 * 
 * Emergence Detection & Synthesis Engine.
 * 
 * This is the product differentiator. If PRISM can't find insights that
 * a single analyst would miss, it has no reason to exist.
 * 
 * Implements all 4 emergence detection algorithms:
 * 1. Cross-Agent Theme Mining — convergent patterns across agents
 * 2. Tension Point Mapping — productive disagreements
 * 3. Gap Triangulation — shared absences
 * 4. Structural Pattern Recognition — deep principles
 * 
 * Plus conflict resolution with classification and escalation ladder.
 * Plus emergence quality scoring (must score 4+ on ≥3 of 5 metrics).
 * 
 * Quality controls:
 * - Critic agent review for STANDARD+ tiers
 * - Emergence quality gate (4+ on 3/5 metrics)
 * - Confidence distribution check
 * - Source coverage enforcement
 * - Provenance completeness tracking
 */

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import {
    SynthesisResultSchema,
    type SynthesisResult,
    type Blueprint,
    type PipelineEvent,
} from "./types";
import type { AgentDeployResult } from "./deploy";

// ─── Types ──────────────────────────────────────────────────

export interface SynthesizeInput {
    blueprint: Blueprint;
    agentResults: AgentDeployResult[];
    onEvent?: (event: PipelineEvent) => void;
}

export interface SynthesizeOutput {
    synthesis: SynthesisResult;
    qualityPassed: boolean;
    qualityIssues: string[];
    warnings: string[];
    synthesisStrategy: "direct" | "validated" | "grouped" | "hierarchical" | "campaign";
}


// ─── System Prompt ──────────────────────────────────────────

const SYNTHESIS_SYSTEM_PROMPT = `You are the PRISM Emergence Detection & Synthesis Engine. You have received the structured output from multiple independent AI research agents, each analyzing a different dimension of a strategic question.

Your job is THE most important part of the entire PRISM pipeline: finding insights that NO single agent would have discovered alone. This is emergence — the whole revealing what the parts cannot.

## The 4 Emergence Detection Algorithms

### Algorithm 1: Cross-Agent Theme Mining
Scan ALL agent outputs for concepts appearing in 2+ agents.
- Same concept + same evidence = **CORROBORATION** (not emergence — just agreement)
- Same concept + different evidence = **CONVERGENT EMERGENCE** (strong signal — different paths leading to same truth)
- Related concepts forming a pattern = **PATTERN EMERGENCE** (deepest insight — structural truth)

### Algorithm 2: Tension Point Mapping
Find where agent perspectives create productive tension.
- List ALL findings where agents explicitly or implicitly disagree
- Classify the conflict:
  - **Factual**: Disagreement on verifiable facts → resolve by Evidence Weighting (primary=3, secondary=2, tertiary=1, +1 recency, +1 corroboration)
  - **Interpretive**: Same facts, different meaning → Perspective Synthesis (find higher-order frame)
  - **Methodological**: Different approaches, different results → Framework Arbitration
  - **Predictive**: Disagreement about future → Scenario Branching (strategies that work across scenarios)
  - **Values-Based**: Different priorities → Stakeholder Mapping (surface for human decision)
  - **Scope**: Different problem definitions → Scope Alignment
- For each tension, ask: "What if BOTH are true?" — this question often reveals deeper structure
- Productive tensions that cannot be resolved → preserve as genuine complexity (do NOT flatten them)

### Algorithm 3: Gap Triangulation
Multiple agents independently noting the absence of the same thing.
- Collect each agent's "what I couldn't find" (gaps section)
- Shared gaps are often **more important than shared findings**
- For each shared gap: "WHY is this missing?" (data doesn't exist? proprietary? not studied? hidden?)

### Algorithm 4: Structural Pattern Recognition
Agents solving different sub-problems arrive at structurally similar solutions.
- Compare the STRUCTURE (not content) of agent outputs
- Example: Agent A finds "drug pricing uses tiered access" and Agent B finds "quality programs use tiered incentives" → structural similarity = "tiering as a control mechanism"
- Structural similarity across domains suggests deep underlying principle

## Emergence Quality Scoring
Every emergent insight MUST be scored on 5 dimensions (each 1-5):
| Metric | Question |
|---|---|
| **Novelty** | Would any single agent have stated this? (1=yes obviously, 5=impossible from one agent) |
| **Grounding** | Supported by evidence from 2+ agents? (1=no evidence, 5=strong multi-agent evidence) |
| **Actionability** | Suggests a specific decision or action? (1=purely academic, 5=clear "do this") |
| **Depth** | Explains WHY, not just WHAT? (1=surface observation, 5=deep causal mechanism) |
| **Surprise** | Contradicts initial assumptions? (1=obvious, 5=genuinely unexpected) |

**QUALITY GATE: An insight qualifies as "emergent" ONLY if it scores 4+ on at least 3 of these 5 dimensions.** Below that threshold, it's a finding, not an emergence. Be honest about this — false emergence is worse than no emergence.

## Synthesis Layers — All 5 Required
1. **Foundation Layer**: Uncontested ground — what ALL agents agree on
2. **Convergence Layer**: Where agents independently arrived at the same truth via different evidence paths
3. **Tension Layer**: Productive tensions preserved as genuine complexity (NOT artificially resolved)
4. **Emergence Layer**: Insights visible ONLY from seeing all perspectives at once
5. **Gap Layer**: What the swarm collectively could NOT determine (be honest about this)

## Conflict Resolution Strategy
When agents disagree:
1. **Auto-Resolve**: Evidence gap >3 → higher score wins
2. **Synthesis Attempt**: Find integrative resolution
3. **Preserve as Complexity**: Both views presented, human decides
4. **Flag for Human**: Surface with recommendation

Do NOT artificially resolve genuine complexity. A brief that preserves productive tension is more valuable than one that forces false consensus.

## Quality Report
Track and report:
- Total findings across all agents
- % of findings with verifiable sources (target: ≥80%)
- Confidence distribution (flag if >60% are HIGH — likely poor calibration)
- Emergence yield (qualified emergent insights per 3 agents)
- Gap count (≥1 required for transparency)
- Whether full provenance chain is intact

## Critical Rules
1. **Emergence must be REAL.** Don't manufacture fake emergent insights. If 5 agents produce only 1 genuine emergence, report 1 — not 5 forced ones.
2. **Preserve complexity.** Productive tensions are features, not bugs.
3. **Be transparent about gaps.** What the swarm couldn't find is as important as what it found.
4. **Source everything.** Every insight traces back to specific agent findings with evidence.
5. **Calibrate honestly.** The quality report must reflect reality, not aspirations.`;


// ─── Main Function ──────────────────────────────────────────

/**
 * Phase 3: SYNTHESIZE — Tiered Emergence Detection & Synthesis.
 * 
 * Routes to tier-appropriate synthesis strategy:
 * - MICRO (2-4 agents): Direct — single synthesizer, no critic
 * - STANDARD (5-8): Validated — synthesizer → critic → refine
 * - EXTENDED (9-12): Grouped — cluster → sub-synths → meta-synth
 * - MEGA (13-15): Hierarchical — sub-swarms → meta-orchestrator
 * - CAMPAIGN (15+): Multi-phase sequential (reserved)
 */
export async function synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const { blueprint, agentResults, onEvent } = input;
    const warnings: string[] = [];

    // Filter to successful agents only
    const successfulResults = agentResults.filter(r => r.result !== null);

    if (successfulResults.length < 2) {
        throw new Error(
            `Cannot synthesize with fewer than 2 successful agents. Only ${successfulResults.length} succeeded. ` +
            `Failed agents: ${agentResults.filter(r => r.result === null).map(r => r.agentName).join(", ")}`
        );
    }

    // Route to tier-appropriate synthesis strategy
    const tier = blueprint.tier;
    let synthesisStrategy: SynthesizeOutput["synthesisStrategy"];

    switch (tier) {
        case "MICRO":
            synthesisStrategy = "direct";
            break;
        case "STANDARD":
            synthesisStrategy = "validated";
            break;
        case "EXTENDED":
            synthesisStrategy = "grouped";
            break;
        case "MEGA":
        case "CAMPAIGN":
            synthesisStrategy = "hierarchical";
            break;
        default:
            synthesisStrategy = "validated";
    }

    // Execute the appropriate strategy
    let synthesis: SynthesisResult;

    switch (synthesisStrategy) {
        case "direct":
            synthesis = await directSynthesis(blueprint, successfulResults, onEvent);
            break;
        case "grouped":
            synthesis = await groupedSynthesis(blueprint, successfulResults, onEvent);
            warnings.push(`Using GROUPED synthesis for ${successfulResults.length} agents (${tier} tier)`);
            break;
        case "hierarchical": {
            // True hierarchical: grouped synthesis → second meta-pass focused on cross-cluster emergence
            const baseSynthesis = await groupedSynthesis(blueprint, successfulResults, onEvent);
            onEvent?.({
                type: "synthesis:layer",
                data: { name: "emergence", description: "Running hierarchical meta-orchestrator pass...", insights: [] },
            });
            // Re-synthesize with the grouped synthesis as additional context
            const hierarchicalContext = `PREVIOUS GROUPED SYNTHESIS RESULTS:\n${baseSynthesis.layers.map(l => `[${l.name}] ${l.insights.join("; ")}`).join("\n")}\n\nEMERGENT INSIGHTS FOUND: ${baseSynthesis.emergentInsights.map(e => e.insight).join("; ")}\n\nFocus this pass on CROSS-CLUSTER patterns that the grouped synthesis may have missed.`;
            synthesis = await directSynthesis(
                { ...blueprint, query: blueprint.query + "\n\n" + hierarchicalContext },
                successfulResults,
                onEvent
            );
            // Merge qualified emergent insights from both passes (deduplicated)
            const existingInsights = new Set(synthesis.emergentInsights.map(e => e.insight.toLowerCase().substring(0, 50)));
            for (const e of baseSynthesis.emergentInsights) {
                if (!existingInsights.has(e.insight.toLowerCase().substring(0, 50))) {
                    synthesis.emergentInsights.push(e);
                }
            }
            warnings.push(`HIERARCHICAL synthesis: grouped + meta-orchestrator pass (${tier} tier)`);
            break;
        }
        case "validated":
        default: {
            // Validated: directSynthesis → criticReview → refine if critical issues found
            synthesis = await directSynthesis(blueprint, successfulResults, onEvent);

            onEvent?.({
                type: "synthesis:layer",
                data: { name: "convergence", description: "Running critic validation...", insights: [] },
            });

            const critic = await criticReview(synthesis, blueprint, agentResults, onEvent);
            const criticalIssues = critic.issues.filter(i => i.severity === "critical");

            if (criticalIssues.length > 0) {
                onEvent?.({
                    type: "synthesis:layer",
                    data: { name: "emergence", description: `Refining synthesis — ${criticalIssues.length} critical issues identified...`, insights: [] },
                });

                // Refine synthesis with critic feedback
                const refinedSynthesis = await directSynthesis(
                    {
                        ...blueprint,
                        query: blueprint.query + `\n\nCRITIC FEEDBACK (address these issues in your synthesis):\n${criticalIssues.map(i => `- [${i.category}] ${i.description}: ${i.recommendation}`).join("\n")}`,
                    },
                    successfulResults,
                    onEvent
                );
                synthesis = refinedSynthesis;
                warnings.push(`Synthesis refined after critic found ${criticalIssues.length} critical issue(s)`);
            } else {
                warnings.push(`Critic validated synthesis — confidence: ${critic.confidence}`);
            }
            break;
        }
    }

    // ─── Post-synthesis quality checks ────────────────────────
    const qualityIssues = runQualityChecks(synthesis, successfulResults);

    // Emit synthesis events
    for (const layer of synthesis.layers) {
        onEvent?.({ type: "synthesis:layer", data: layer });
    }

    const qualifiedEmergences = synthesis.emergentInsights.filter(e => {
        const scores = [e.quality.novelty, e.quality.grounding, e.quality.actionability, e.quality.depth, e.quality.surprise];
        return scores.filter(s => s >= 4).length >= 3;
    });

    for (const emergence of qualifiedEmergences) {
        onEvent?.({ type: "synthesis:emergence", data: emergence });
    }

    const qualityPassed = qualityIssues.length === 0;
    if (!qualityPassed) {
        warnings.push(`⚠️ QUALITY GATE: ${qualityIssues.length} issue(s) detected. Review before distributing this brief.`);
    }

    return {
        synthesis,
        qualityPassed,
        qualityIssues,
        warnings,
        synthesisStrategy,
    };
}


// ─── Direct Synthesis (MICRO + STANDARD) ────────────────────

/**
 * Direct, single-pass synthesis — used for MICRO (2-4 agents) and
 * as the base strategy for STANDARD before critic validation.
 */
async function directSynthesis(
    blueprint: Blueprint,
    successfulResults: AgentDeployResult[],
    onEvent?: (event: PipelineEvent) => void,
): Promise<SynthesisResult> {
    const agentSummaries = formatAgentSummaries(successfulResults);
    const metrics = calculatePreSynthesisMetrics(successfulResults);

    const userPrompt = `Here are the structured outputs from ${successfulResults.length} independent PRISM agents analyzing this strategic question:

"${blueprint.query}"

${agentSummaries}

---

Pre-synthesis quality metrics:
- Total findings: ${metrics.totalFindings}
- Sourced findings: ${metrics.sourcedFindings} (${metrics.sourceCoveragePercent}%)
- Confidence distribution: HIGH=${metrics.confidenceDist.high}, MEDIUM=${metrics.confidenceDist.medium}, LOW=${metrics.confidenceDist.low}
- Agents: ${successfulResults.length} successful

Now run ALL FOUR emergence detection algorithms. Produce the complete synthesis with all 5 layers, qualified emergent insights with quality scores, tension points with conflict classification, and the quality report.

Remember: emergence must be REAL. Score honestly. Preserve productive tensions. Be transparent about gaps.`;

    onEvent?.({ type: "synthesis:layer", data: { name: "foundation", description: "Analyzing uncontested ground...", insights: [] } });

    const { object: synthesis } = await generateObject({
        model: anthropic("claude-sonnet-4-20250514"),
        schema: SynthesisResultSchema,
        system: SYNTHESIS_SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.3,
    });

    return synthesis;
}


// ─── Grouped Synthesis (EXTENDED + MEGA) ────────────────────

/**
 * Grouped synthesis — used for EXTENDED (9-12) and MEGA (13+) tiers.
 * 
 * Process:
 * 1. Cluster agents by dimension proximity (using interconnection data)
 * 2. Run a sub-synthesizer for each cluster
 * 3. Run a meta-synthesizer that integrates sub-syntheses
 * 
 * This keeps connections sparse — each sub-synthesizer only sees its
 * cluster's agents, reducing coordination overhead.
 */
async function groupedSynthesis(
    blueprint: Blueprint,
    successfulResults: AgentDeployResult[],
    onEvent?: (event: PipelineEvent) => void,
): Promise<SynthesisResult> {
    // Step 1: Cluster agents by interconnection proximity
    const clusters = clusterAgents(blueprint, successfulResults);

    onEvent?.({
        type: "synthesis:layer", data: {
            name: "foundation",
            description: `Grouped synthesis: ${clusters.length} clusters detected. Running sub-synthesizers...`,
            insights: [],
        }
    });

    // Step 2: Run sub-synthesizer for each cluster
    const subSyntheses: Array<{ clusterName: string; synthesis: SynthesisResult }> = [];

    for (const cluster of clusters) {
        const subBlueprint = {
            ...blueprint,
            dimensions: blueprint.dimensions.filter(d =>
                cluster.agents.some(a => a.dimension === d.name)
            ),
        };

        const subSynthesis = await directSynthesis(subBlueprint, cluster.agents, onEvent);
        subSyntheses.push({ clusterName: cluster.name, synthesis: subSynthesis });
    }

    // Step 3: Meta-synthesis — integrate sub-syntheses
    const metaPrompt = `You are performing META-SYNTHESIS for a grouped PRISM analysis.

${subSyntheses.length} sub-synthesis groups have independently analyzed aspects of this question:
"${blueprint.query}"

${subSyntheses.map(ss => `## Cluster: ${ss.clusterName}

### Foundation:
${ss.synthesis.layers.find(l => l.name === "foundation")?.insights.join("\n") ?? "None"}

### Convergence:
${ss.synthesis.layers.find(l => l.name === "convergence")?.insights.join("\n") ?? "None"}

### Tensions:
${ss.synthesis.tensions.map(t => `- ${t.description} [${t.conflictType}]`).join("\n") || "None"}

### Emergent Insights:
${ss.synthesis.emergentInsights.map(e => `- ${e.insight} (type: ${e.type})`).join("\n") || "None"}

### Gaps:
${ss.synthesis.layers.find(l => l.name === "gaps")?.insights.join("\n") ?? "None"}`
    ).join("\n\n---\n\n")}

Now perform CROSS-CLUSTER emergence detection:
1. What themes emerge across clusters that no single cluster identified?
2. What tensions exist BETWEEN clusters (not just within)?
3. What gaps appear across all clusters?
4. What structural patterns repeat across clusters?

Produce the final integrated synthesis with all 5 layers, combining insights from all clusters. The emergence layer should focus on CROSS-CLUSTER emergence — insights that only become visible when viewing all clusters together.`;

    const { object: metaSynthesis } = await generateObject({
        model: anthropic("claude-sonnet-4-20250514"),
        schema: SynthesisResultSchema,
        system: SYNTHESIS_SYSTEM_PROMPT,
        prompt: metaPrompt,
        temperature: 0.3,
    });

    return metaSynthesis;
}


// ─── Agent Clustering ───────────────────────────────────────

interface AgentCluster {
    name: string;
    agents: AgentDeployResult[];
    dimensions: string[];
}

/**
 * Cluster agents by dimension interconnection proximity.
 * Uses the blueprint's interconnection map to group tightly-coupled dimensions together.
 */
function clusterAgents(blueprint: Blueprint, agents: AgentDeployResult[]): AgentCluster[] {
    const dimensions = agents.map(a => a.dimension);
    const uniqueDimensions = [...new Set(dimensions)];

    // If 4 or fewer unique dimensions, no need to cluster
    if (uniqueDimensions.length <= 4) {
        return [{ name: "All Agents", agents, dimensions: uniqueDimensions }];
    }

    // Build adjacency map from interconnections
    const adjacency: Record<string, Set<string>> = {};
    for (const dim of uniqueDimensions) {
        adjacency[dim] = new Set();
    }

    for (const ic of blueprint.interconnections) {
        if (adjacency[ic.dimensionA] && adjacency[ic.dimensionB] && ic.coupling >= 3) {
            adjacency[ic.dimensionA].add(ic.dimensionB);
            adjacency[ic.dimensionB].add(ic.dimensionA);
        }
    }

    // Greedy clustering: group strongly-connected dimensions
    const assigned = new Set<string>();
    const clusters: AgentCluster[] = [];

    for (const dim of uniqueDimensions) {
        if (assigned.has(dim)) continue;

        const cluster: string[] = [dim];
        assigned.add(dim);

        // Add connected dimensions not yet assigned
        for (const connected of adjacency[dim]) {
            if (!assigned.has(connected) && cluster.length < 5) {
                cluster.push(connected);
                assigned.add(connected);
            }
        }

        clusters.push({
            name: cluster.join(" + "),
            agents: agents.filter(a => cluster.includes(a.dimension)),
            dimensions: cluster,
        });
    }

    return clusters;
}


// ─── Quality Checks ─────────────────────────────────────────

function runQualityChecks(synthesis: SynthesisResult, successfulResults: AgentDeployResult[]): string[] {
    const qualityIssues: string[] = [];
    const allFindings = successfulResults.flatMap(r => r.result!.findings);
    const totalFindings = allFindings.length;
    const sourcedFindings = allFindings.filter(f => f.source && f.source.trim() !== "").length;
    const confidenceDist = {
        high: allFindings.filter(f => f.confidence === "HIGH").length,
        medium: allFindings.filter(f => f.confidence === "MEDIUM").length,
        low: allFindings.filter(f => f.confidence === "LOW").length,
    };

    // Check 1: Source coverage ≥80%
    if (synthesis.qualityReport.sourceCoveragePercent < 80) {
        qualityIssues.push(
            `Source coverage is ${synthesis.qualityReport.sourceCoveragePercent}% (target: ≥80%). ` +
            `${totalFindings - sourcedFindings} findings lack verifiable sources.`
        );
    }

    // Check 2: Confidence distribution — no >60% HIGH
    const highPct = totalFindings > 0 ? (confidenceDist.high / totalFindings) * 100 : 0;
    if (highPct > 60) {
        qualityIssues.push(
            `${Math.round(highPct)}% of findings are HIGH confidence (threshold: ≤60%). ` +
            `This may indicate poor calibration — are confidence ratings honest?`
        );
    }

    // Check 3: Emergence yield ≥1 per 3 agents
    const targetEmergence = Math.ceil(successfulResults.length / 3);
    const qualifiedEmergences = synthesis.emergentInsights.filter(e => {
        const scores = [e.quality.novelty, e.quality.grounding, e.quality.actionability, e.quality.depth, e.quality.surprise];
        return scores.filter(s => s >= 4).length >= 3;
    });

    if (qualifiedEmergences.length < targetEmergence) {
        qualityIssues.push(
            `Emergence yield: ${qualifiedEmergences.length} qualified insights (target: ≥${targetEmergence} for ${successfulResults.length} agents). ` +
            `${synthesis.emergentInsights.length - qualifiedEmergences.length} insights scored below the quality gate.`
        );
    }

    // Check 4: Gap transparency
    const gapLayer = synthesis.layers.find(l => l.name === "gaps");
    if (!gapLayer || gapLayer.insights.length === 0) {
        qualityIssues.push(
            `Gap layer is empty — the synthesis claims complete knowledge. ` +
            `This is almost never true and suggests gaps are being suppressed.`
        );
    }

    // Check 5: All 5 layers present
    const requiredLayers = ["foundation", "convergence", "tension", "emergence", "gaps"] as const;
    for (const layerName of requiredLayers) {
        const layer = synthesis.layers.find(l => l.name === layerName);
        if (!layer) {
            qualityIssues.push(`Missing synthesis layer: "${layerName}"`);
        }
    }

    return qualityIssues;
}


// ─── Helper: Format Agent Summaries ─────────────────────────

function formatAgentSummaries(results: AgentDeployResult[]): string {
    return results.map(r => {
        const result = r.result!;
        return `## Agent: ${r.agentName} (${r.dimension})

### Findings (${result.findings.length}):
${result.findings.map((f, i) => `${i + 1}. **${f.statement}**
   - Evidence: ${f.evidence}
   - Confidence: ${f.confidence} — ${f.confidenceReasoning}
   - Source: ${f.source}
   - Implication: ${f.implication}
   - Evidence Type: ${f.evidenceType}`).join("\n\n")}

### Gaps (what this agent couldn't find):
${result.gaps.length > 0 ? result.gaps.map(g => `- ${g}`).join("\n") : "- None reported"}

### Signals for Other Agents:
${result.signals.length > 0 ? result.signals.map(s => `- ${s}`).join("\n") : "- None"}

### Minority Views:
${result.minorityViews.length > 0 ? result.minorityViews.map(m => `- ${m}`).join("\n") : "- None"}

### Executive Summary:
${result.summary}`;
    }).join("\n\n---\n\n");
}


// ─── Helper: Pre-Synthesis Metrics ──────────────────────────

function calculatePreSynthesisMetrics(results: AgentDeployResult[]) {
    const allFindings = results.flatMap(r => r.result!.findings);
    const totalFindings = allFindings.length;
    const sourcedFindings = allFindings.filter(f => f.source && f.source.trim() !== "").length;
    return {
        totalFindings,
        sourcedFindings,
        sourceCoveragePercent: totalFindings > 0 ? Math.round((sourcedFindings / totalFindings) * 100) : 0,
        confidenceDist: {
            high: allFindings.filter(f => f.confidence === "HIGH").length,
            medium: allFindings.filter(f => f.confidence === "MEDIUM").length,
            low: allFindings.filter(f => f.confidence === "LOW").length,
        },
    };
}


// ─── Critic Pass ────────────────────────────────────────────

const CRITIC_SCHEMA = z.object({
    issues: z.array(z.object({
        severity: z.enum(["critical", "warning", "suggestion"]),
        category: z.enum(["evidence", "calibration", "emergence", "gaps", "bias", "logic"]),
        description: z.string(),
        affectedFindings: z.array(z.string()).optional(),
        recommendation: z.string(),
    })),
    overallAssessment: z.string(),
    confidenceInBrief: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

/**
 * Critic Agent Pass — Reviews the synthesis for quality issues.
 * Called for STANDARD+ tiers after the main synthesis.
 */
export async function criticReview(
    synthesis: SynthesisResult,
    blueprint: Blueprint,
    agentResults: AgentDeployResult[],
    onEvent?: (event: PipelineEvent) => void,
): Promise<{ issues: z.infer<typeof CRITIC_SCHEMA>["issues"]; assessment: string; confidence: string }> {

    const { object: review } = await generateObject({
        model: anthropic("claude-sonnet-4-20250514"),
        schema: CRITIC_SCHEMA,
        system: `You are the PRISM Quality Critic. Your job is adversarial review of a completed synthesis.

Check:
1. **Evidence Support**: Are findings backed by cited evidence? Are sources real and specific?
2. **Confidence Calibration**: Are HIGH/MEDIUM/LOW ratings honest? Is there over-confidence?
3. **Emergence Validity**: Do "emergent" insights genuinely require multi-agent perspective? Or are they findings dressed up as emergence?
4. **Gap Transparency**: Are gaps acknowledged honestly? Or is the synthesis hiding uncertainty?
5. **Reasoning Quality**: Are implications logical? Are causal claims supported?
6. **Bias Detection**: Are any agent perspectives systematically over-represented or suppressed?

Be constructively harsh. It's better to catch issues now than to deliver a flawed brief.`,
        prompt: `Review this PRISM synthesis for quality issues.

Query: "${blueprint.query}"
Agent count: ${agentResults.length}
Total findings: ${synthesis.qualityReport.totalFindings}
Source coverage: ${synthesis.qualityReport.sourceCoveragePercent}%
Emergent insights: ${synthesis.emergentInsights.length}

Synthesis layers:
${synthesis.layers.map(l => `**${l.name}**: ${l.insights.join(" | ")}`).join("\n")}

Emergent insights:
${synthesis.emergentInsights.map(e => `- ${e.insight} (novelty=${e.quality.novelty}, grounding=${e.quality.grounding}, actionability=${e.quality.actionability}, depth=${e.quality.depth}, surprise=${e.quality.surprise})`).join("\n")}

Tensions:
${synthesis.tensions.map(t => `- ${t.description} [${t.conflictType}] ${t.preservedAsComplexity ? "(preserved)" : "(resolved)"}`).join("\n")}`,
        temperature: 0.2,
    });

    // Emit critic findings
    for (const issue of review.issues) {
        onEvent?.({
            type: "critic:review",
            data: { issue: issue.description, severity: issue.severity },
        });
    }

    return {
        issues: review.issues,
        assessment: review.overallAssessment,
        confidence: review.confidenceInBrief,
    };
}
