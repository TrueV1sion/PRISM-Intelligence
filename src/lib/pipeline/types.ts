/**
 * PRISM Pipeline Types
 * 
 * Shared type definitions for the entire intelligence pipeline.
 * These types encode the quality requirements from methodology-core.md —
 * every finding has evidence, every confidence has reasoning, every source is traceable.
 */

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────

export type SwarmTier = "MICRO" | "STANDARD" | "EXTENDED" | "MEGA" | "CAMPAIGN";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type EvidenceType = "primary" | "secondary" | "tertiary";
export type FindingAction = "keep" | "dismiss" | "boost" | "flag";
export type AgentStatus = "idle" | "active" | "complete" | "failed";
export type ConflictType = "factual" | "interpretive" | "methodological" | "predictive" | "values-based" | "scope";

export type ArchetypeFamily =
    | "RESEARCHER-WEB" | "RESEARCHER-DATA" | "RESEARCHER-DOMAIN" | "RESEARCHER-LATERAL"
    | "ANALYST-FINANCIAL" | "ANALYST-STRATEGIC" | "ANALYST-TECHNICAL" | "ANALYST-RISK" | "ANALYST-QUALITY"
    | "CREATOR-WRITER" | "CREATOR-PRESENTER" | "CREATOR-TECHNICAL" | "CREATOR-PERSUADER"
    | "CRITIC-FACTUAL" | "CRITIC-LOGICAL" | "CRITIC-STRATEGIC" | "CRITIC-EDITORIAL"
    | "SYNTHESIZER" | "ARBITER"
    | "DEVILS-ADVOCATE" | "FUTURIST" | "HISTORIAN" | "RED-TEAM" | "CUSTOMER-PROXY"
    | "LEGISLATIVE-PIPELINE" | "REGULATORY-RADAR" | "MACRO-CONTEXT";


// ─── Dimensional Decomposition (THINK) ──────────────────────

/** A qualified dimension with explicit justification for WHY it was selected */
export const DimensionAnalysisSchema = z.object({
    name: z.string().describe("Dimension name, e.g. 'Clinical Landscape'"),
    description: z.string().describe("What this dimension covers"),
    justification: z.string().describe("WHY this dimension qualifies: what distinct data sources and analytical lens it requires"),
    dataSources: z.array(z.string()).describe("Distinct data sources this dimension requires"),
    lens: z.string().describe("The distinct analytical lens for this dimension"),
    signalMatch: z.string().describe("What signal in the query triggered this dimension"),
});
export type DimensionAnalysis = z.infer<typeof DimensionAnalysisSchema>;

/** Interconnection between two dimensions */
export const InterconnectionSchema = z.object({
    dimensionA: z.string(),
    dimensionB: z.string(),
    coupling: z.number().min(1).max(5).describe("1=independent, 5=deeply entangled"),
    mechanism: z.string().describe("How these dimensions interact"),
});
export type Interconnection = z.infer<typeof InterconnectionSchema>;

/** Recommended agent for a dimension */
export const AgentRecommendationSchema = z.object({
    name: z.string().describe("Agent name, e.g. 'Clinical Researcher'"),
    archetype: z.string().describe("Archetype code, e.g. 'RESEARCHER-DATA'"),
    dimension: z.string().describe("Which dimension this agent covers"),
    mandate: z.string().describe("Specific research mandate — what this agent must investigate"),
    tools: z.array(z.string()).describe("MCP tools this agent should use"),
    lens: z.string().describe("Analytical lens: what perspective does this agent bring"),
    bias: z.string().describe("Intentional bias: e.g., SKEPTICISM, SYSTEMS THINKING"),
});
export type AgentRecommendation = z.infer<typeof AgentRecommendationSchema>;

/** Complete blueprint from THINK phase */
export const BlueprintSchema = z.object({
    query: z.string(),
    dimensions: z.array(DimensionAnalysisSchema).min(2).max(15),
    agents: z.array(AgentRecommendationSchema).min(2).max(15),
    interconnections: z.array(InterconnectionSchema),
    complexity: z.object({
        breadth: z.number().min(1).max(5),
        depth: z.number().min(1).max(5),
        interconnection: z.number().min(1).max(5),
        total: z.number(),
        reasoning: z.string().describe("Why these scores — justify based on query content"),
    }),
    tier: z.enum(["MICRO", "STANDARD", "EXTENDED", "MEGA", "CAMPAIGN"]),
    estimatedTime: z.string(),
    ethicalConcerns: z.array(z.string()).describe("Topics that may require Neutral Framing Protocol"),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;


// ─── Agent Execution (DEPLOY) ───────────────────────────────

/** Structured data point extracted from a finding for presentation rendering */
export const StructuredDataPointSchema = z.object({
    type: z.enum(["metric", "comparison", "ranking", "timeline_event", "entity", "geographic"]).describe(
        "Data type: metric=numeric KPI, comparison=two values, ranking=ordered list, timeline_event=dated milestone, entity=named company/drug/regulation, geographic=state/region data"
    ),
    label: z.string().describe("Short label for the data point, e.g. 'Medicare Spending' or 'Projected Revenue'"),
    value: z.union([z.string(), z.number()]).describe("The data value — can be a number or formatted string like '$1.02T'"),
    unit: z.string().optional().describe("Unit of measurement: '$', '%', 'patients', 'basis points', etc."),
    context: z.string().optional().describe("Contextual qualifier: 'YoY change', 'vs. industry avg', 'Q3 2026 projection'"),
    colorHint: z.enum(["positive", "negative", "neutral", "warning"]).optional().describe("Suggested visual treatment"),
    metadata: z.record(z.string(), z.string()).optional().describe("Additional metadata: severity, threat_level, comparison_base, etc."),
});
export type StructuredDataPoint = z.infer<typeof StructuredDataPointSchema>;

/** A single finding from an agent — the atomic unit of intelligence */
export const AgentFindingSchema = z.object({
    statement: z.string().describe("Clear, specific finding statement"),
    evidence: z.string().describe("What supports this finding — cite specific data, studies, documents"),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    confidenceReasoning: z.string().describe("WHY this confidence level — not just the label but the justification"),
    evidenceType: z.enum(["primary", "secondary", "tertiary"]).describe("primary=original data/study, secondary=analysis/review, tertiary=opinion/commentary"),
    source: z.string().describe("Where this came from — URL, document name, database. Do NOT fabricate sources."),
    sourceVerified: z.boolean().default(false).describe("Whether the source URL/reference was verified to exist"),
    implication: z.string().describe("So what? Why does this matter for the strategic question?"),
    gaps: z.string().optional().describe("What couldn't be determined about this topic"),
    structuredData: z.array(StructuredDataPointSchema).optional().describe(
        "Extracted structured data points for presentation rendering. Extract dollar amounts, percentages, entity names, " +
        "rankings, and timeline events from the evidence. Each finding should have 1-5 structured data points when quantitative data is available."
    ),
});
export type AgentFinding = z.infer<typeof AgentFindingSchema>;

/** Complete output from a single agent */
export const AgentResultSchema = z.object({
    findings: z.array(AgentFindingSchema),
    gaps: z.array(z.string()).describe("What this agent couldn't find — important for Gap Triangulation"),
    signals: z.array(z.string()).describe("Observations relevant to OTHER agents' dimensions"),
    minorityViews: z.array(z.string()).describe("Important counter-perspectives or dissenting evidence"),
    summary: z.string().describe("One-paragraph executive summary of this agent's analysis"),
    contentType: z.enum([
        "financial", "regulatory", "competitive", "clinical",
        "quality", "technology", "strategic", "general",
    ]).describe(
        "Primary content category for presentation slide routing. " +
        "financial=revenue/cost/market data, regulatory=policy/compliance/CMS, competitive=market landscape/M&A, " +
        "clinical=health outcomes/trials/drugs, quality=HEDIS/Stars/CAHPS, technology=platforms/AI/infrastructure, " +
        "strategic=cross-cutting/Inovalon impact, general=other"
    ),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

/** Agent execution metadata */
export interface AgentExecutionMeta {
    agentId: string;
    modelProvider: string;
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
    cost: number;
}


// ─── Synthesis (SYNTHESIZE) ─────────────────────────────────

/** Emergence quality scoring — an insight must score 4+ on ≥3 dimensions to qualify */
export const EmergenceQualitySchema = z.object({
    novelty: z.number().min(1).max(5).describe("Would any single agent have stated this?"),
    grounding: z.number().min(1).max(5).describe("Supported by evidence from 2+ agents?"),
    actionability: z.number().min(1).max(5).describe("Suggests a specific decision or action?"),
    depth: z.number().min(1).max(5).describe("Explains WHY, not just WHAT?"),
    surprise: z.number().min(1).max(5).describe("Contradicts initial assumptions?"),
});
export type EmergenceQuality = z.infer<typeof EmergenceQualitySchema>;

/** An emergent insight that only multi-agent analysis could reveal */
export const EmergentInsightSchema = z.object({
    insight: z.string().describe("The emergent insight statement"),
    type: z.enum(["convergent", "pattern", "tension", "gap"]).describe("What type of emergence"),
    contributingAgents: z.array(z.string()).describe("Which agents' findings contributed to this insight"),
    evidence: z.array(z.string()).describe("Specific evidence from each contributing agent"),
    quality: EmergenceQualitySchema,
    actionableRecommendation: z.string().optional().describe("What should the reader DO with this insight"),
});
export type EmergentInsight = z.infer<typeof EmergentInsightSchema>;

/** A tension point between agents */
export const TensionPointSchema = z.object({
    description: z.string().describe("What the tension is"),
    agentA: z.string(),
    agentB: z.string(),
    positionA: z.string(),
    positionB: z.string(),
    conflictType: z.enum(["factual", "interpretive", "methodological", "predictive", "values-based", "scope"]),
    resolution: z.string().optional().describe("How this was resolved, if it was"),
    resolutionStrategy: z.string().optional().describe("Which strategy was used"),
    preservedAsComplexity: z.boolean().default(false).describe("True if this tension was kept rather than resolved"),
});
export type TensionPoint = z.infer<typeof TensionPointSchema>;

/** A synthesis layer */
export const SynthesisLayerSchema = z.object({
    name: z.enum(["foundation", "convergence", "tension", "emergence", "gaps"]),
    description: z.string(),
    insights: z.array(z.string()),
});
export type SynthesisLayer = z.infer<typeof SynthesisLayerSchema>;

/** Complete synthesis output */
export const SynthesisResultSchema = z.object({
    layers: z.array(SynthesisLayerSchema).length(5),
    emergentInsights: z.array(EmergentInsightSchema),
    tensions: z.array(TensionPointSchema),
    qualityReport: z.object({
        totalFindings: z.number(),
        sourcedFindings: z.number(),
        sourceCoveragePercent: z.number(),
        confidenceDistribution: z.object({
            high: z.number(),
            medium: z.number(),
            low: z.number(),
        }),
        emergenceYield: z.number().describe("Qualified emergent insights per 3 agents"),
        gapCount: z.number(),
        provenanceComplete: z.boolean(),
    }),
});
export type SynthesisResult = z.infer<typeof SynthesisResultSchema>;


// ─── Intelligence Manifest ──────────────────────────────────

/** The complete intelligence manifest — everything needed to generate a presentation */
export interface IntelligenceManifest {
    meta: {
        query: string;
        tier: SwarmTier;
        agentCount: number;
        totalFindings: number;
        emergentInsights: number;
        runId: string;
        generatedAt: string;
        totalCost: number;
    };
    blueprint: Blueprint;
    agentResults: Array<{
        agent: AgentRecommendation;
        result: AgentResult;
        meta: AgentExecutionMeta;
    }>;
    synthesis: SynthesisResult;
    provenance: Array<{
        finding: string;
        agent: string;
        evidence: string;
        source: string;
        confidence: ConfidenceLevel;
        confidenceReasoning: string;
    }>;
}


// ─── Pipeline Events (for streaming) ────────────────────────

export type PipelineEvent =
    | { type: "blueprint"; data: Blueprint }
    | { type: "agent:spawned"; data: { agentId: string; name: string } }
    | { type: "agent:progress"; data: { agentId: string; progress: number; message: string } }
    | { type: "agent:finding"; data: { agentId: string; finding: AgentFinding } }
    | { type: "agent:complete"; data: { agentId: string; result: AgentResult } }
    | { type: "agent:failed"; data: { agentId: string; error: string } }
    | { type: "synthesis:layer"; data: SynthesisLayer }
    | { type: "synthesis:emergence"; data: EmergentInsight }
    | { type: "critic:review"; data: { issue: string; severity: string } }
    | { type: "presentation:ready"; data: { htmlPath: string; slideCount: number } }
    | { type: "run:complete"; data: { runId: string; manifest: IntelligenceManifest; presentationPath?: string } }
    | { type: "run:error"; data: { error: string; phase: string } };
