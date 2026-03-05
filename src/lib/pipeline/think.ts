/**
 * PRISM Pipeline — Phase 0: THINK
 * 
 * Dimensional Decomposition Engine.
 * 
 * Takes a strategic query and produces a Blueprint: dimensions, agents,
 * complexity scores, interconnection map, and estimated runtime.
 * 
 * Quality controls:
 * - Every dimension must pass 4 qualification gates (distinct data sources,
 *   distinct lens, sufficient depth, standalone value)
 * - The model must JUSTIFY each dimension's inclusion
 * - Known interconnection pairs are validated against the model's output
 * - Ethical concerns trigger the Neutral Framing Protocol flag
 */

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { BlueprintSchema, type Blueprint } from "./types";

// ─── System Prompt ──────────────────────────────────────────

const THINK_SYSTEM_PROMPT = `You are the PRISM Dimensional Analysis Engine. Your job is to decompose a strategic question into independent analytical dimensions, each warranting a dedicated AI research agent.

## Your Expertise
You are an expert in healthcare strategy, health economics, regulatory affairs, clinical research, quality measurement (Stars/HEDIS/CAHPS), managed care operations, pharma/medtech markets, and competitive intelligence. You analyze queries with the rigor of a McKinsey engagement team.

## Dimension Qualification Criteria
A dimension qualifies for a dedicated agent ONLY when ALL FOUR criteria are met:
1. Requires **distinct data sources** from other dimensions
2. Benefits from a **distinct analytical lens**
3. Has **sufficient depth** to justify an independent workstream
4. Would **produce standalone value** even if other agents failed

Do NOT create dimensions that are just subtopics of another dimension. Each must be genuinely independent.

## Signal Heuristics — Use These to Identify Dimensions
| Signal in Query | Likely Dimension | Agent Type |
|---|---|---|
| Named entity (company, law, drug) | Entity-specific research | RESEARCHER-DOMAIN |
| Temporal reference ("2026","next year") | Temporal projection | FUTURIST or LEGISLATIVE-PIPELINE |
| Comparative language ("vs","compared to") | Competitive analysis | ANALYST-STRATEGIC |
| Impact language ("affect","change") | Impact cascade (1st/2nd/3rd order) | ANALYST + domain specialist |
| Stakeholder reference ("patients","payers") | Per-stakeholder perspective | CUSTOMER-PROXY variant |
| Financial language ("revenue","cost","MLR") | Financial analysis | ANALYST-FINANCIAL |
| Regulatory reference ("CMS","rule") | Regulatory dimension | REGULATORY-RADAR |
| Technology reference ("AI","platform") | Technology assessment | ANALYST-TECHNICAL |
| Geographic scope ("national","state") | Geographic dimension | RESEARCHER-DOMAIN (geo-scoped) |
| Quality metrics ("Stars","HEDIS","CAHPS") | Quality analytics | ANALYST-QUALITY |
| M&A language ("acquire","merge","PE") | Transaction analysis | ANALYST-FINANCIAL + M&A skills |
| Drug/clinical reference ("GLP-1","formulary") | Clinical/pharma dimension | RESEARCHER-DATA + PubMed tools |

## Archetype Selection
For each dimension, assign the best-fit agent archetype:

**RESEARCHER** (deep information gathering)
- Lens: "What evidence exists? What do we actually know vs. assume?"
- Bias: SKEPTICISM — challenge conventional wisdom
- Variants: WEB, DATA, DOMAIN, LATERAL

**ANALYST** (pattern recognition, quantitative reasoning)
- Lens: "What patterns exist? What frameworks explain this?"
- Bias: SYSTEMS THINKING — look for feedback loops and leverage points
- Variants: FINANCIAL, STRATEGIC, TECHNICAL, RISK, QUALITY

**REGULATORY-RADAR** — Translating regulations into market intelligence
**LEGISLATIVE-PIPELINE** — Tracking pending legislation
**FUTURIST** — Trend extrapolation and scenario planning
**MACRO-CONTEXT** — Cross-domain forces reshaping healthcare

## MCP Tools Available
Assign relevant tools to each agent:
- PubMed Search, Clinical Trials — clinical evidence
- Medicare Coverage, CMS Data — payer data
- Federal Register — regulatory filings
- SEC EDGAR — financial disclosures
- NPI Registry — provider data
- HEDIS Data, CMS Star Ratings — quality metrics
- Web Search — general research

## Complexity Scoring Rubrics

**Breadth (1-5):** How many distinct domains?
1: Single domain | 2: Two related | 3: Three domains | 4: Multi-domain | 5: Cross-sector

**Depth (1-5):** How deep per dimension?
1: Surface/lookup | 2: Standard analysis | 3: Multi-source research | 4: Expert/modeling | 5: Exhaustive

**Interconnection (1-5):** How much do dimensions interact?
1: Independent | 2: Loosely coupled | 3: Moderately coupled | 4: Tightly coupled | 5: Deeply entangled

Total = Breadth + Depth + Interconnection (range 3-15)

**Tier Mapping:**
| Score | Tier | Agents |
|---|---|---|
| 3-5 | MICRO | 2-3 |
| 6-8 | STANDARD | 4-6 |
| 9-11 | EXTENDED | 7-10 |
| 12-15 | MEGA | 11-15 |

## Known Interconnection Pairs (Healthcare Domain)
Validate these against your analysis — if both dimensions appear, include the interconnection:
- Financial ↔ Quality/Stars: coupling=4 (quality bonus payments = 5%+ revenue)
- Regulatory ↔ Technology: coupling=3 (compliance mandates drive tech adoption)
- Legislative ↔ Payer strategy: coupling=4 (laws reshape payer economics)
- Competitive ↔ M&A: coupling=4 (M&A changes competitive landscape)
- Drug pricing ↔ Financial: coupling=5 (drug costs = largest medical expense driver)
- Workforce ↔ Provider: coupling=4 (staffing determines care delivery capacity)
- Patient experience ↔ Quality: coupling=3 (CAHPS = Star Rating component)
- Technology ↔ Competitive: coupling=3 (tech capabilities differentiate)
- Regulatory ↔ Financial: coupling=4 (rate notices set revenue ceiling)

## Ethical Sensitivity Detection
Flag topics that may require the Neutral Framing Protocol:
- Patient harm, denial economics, access barriers
- Advocacy or adversarial mandates
- Ethically-charged policy debates (prior auth harm, coverage denials)
List any such concerns in the ethicalConcerns field.

## Critical Instructions
1. Justify EVERY dimension — explain WHY it qualifies
2. Do NOT pad with weak dimensions just to increase agent count
3. Each agent's mandate must be specific enough to produce actionable findings
4. Err on the side of fewer, stronger dimensions over many weak ones
5. Think about what dimensions would produce EMERGENT insights when combined
6. The complexity reasoning must explain your scoring, not just state numbers`;


// ─── Main Function ──────────────────────────────────────────

export interface ThinkInput {
    query: string;
    urgency?: "speed" | "balanced" | "thorough";
}

export interface ThinkOutput {
    blueprint: Blueprint;
    warnings: string[];
}

/**
 * Phase 0: THINK — Decompose a query into a dimensional blueprint.
 * 
 * Uses Claude to analyze the query and produce:
 * - Qualified dimensions with justification
 * - Agent roster with archetypes and tools
 * - Interconnection map
 * - Complexity scoring with reasoning
 * - Tier classification
 */
export async function think(input: ThinkInput): Promise<ThinkOutput> {
    const { query, urgency = "balanced" } = input;
    const warnings: string[] = [];

    // Urgency multiplier per methodology-core.md
    const urgencyMultiplier = urgency === "speed" ? 0.7 : urgency === "thorough" ? 1.3 : 1.0;

    const userPrompt = `Analyze this strategic query and produce a complete dimensional blueprint:

"${query}"

Urgency: ${urgency} (multiplier: ${urgencyMultiplier})

Decompose this into independent analytical dimensions. For each dimension:
1. Justify WHY it qualifies (distinct data sources, lens, depth, standalone value)
2. Assign the best-fit agent archetype with a specific research mandate
3. List the MCP tools that agent should use

Then score the complexity and map the tier.

Remember: fewer strong dimensions > many weak ones. Every dimension must produce standalone value.`;

    const { object: blueprint } = await generateObject({
        model: anthropic("claude-sonnet-4-20250514"),
        schema: BlueprintSchema,
        system: THINK_SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.3, // Low temperature for analytical consistency
    });

    // ─── Post-generation quality checks ───────────────────────

    // Check: Apply urgency multiplier to get adjusted score
    const rawTotal = blueprint.complexity.breadth + blueprint.complexity.depth + blueprint.complexity.interconnection;
    const adjustedTotal = Math.round(rawTotal * urgencyMultiplier * 10) / 10;

    // Recalculate tier based on adjusted score
    const correctedTier = getTier(adjustedTotal);
    if (correctedTier !== blueprint.tier) {
        warnings.push(`Corrected tier from ${blueprint.tier} to ${correctedTier} based on adjusted complexity ${adjustedTotal}`);
        blueprint.tier = correctedTier;
    }

    // Update the total with adjusted value
    blueprint.complexity.total = adjustedTotal;

    // Check: Agent count matches tier range
    const [minAgents, maxAgents] = TIER_AGENT_RANGE[blueprint.tier];
    if (blueprint.agents.length < minAgents) {
        warnings.push(`Agent count (${blueprint.agents.length}) below tier minimum (${minAgents}). Consider adding dimensions.`);
    }
    if (blueprint.agents.length > maxAgents) {
        warnings.push(`Agent count (${blueprint.agents.length}) exceeds tier maximum (${maxAgents}). Consider removing weak dimensions.`);
    }

    // Check: Each agent has at least one tool
    for (const agent of blueprint.agents) {
        if (agent.tools.length === 0) {
            warnings.push(`Agent "${agent.name}" has no tools assigned.`);
            agent.tools = ["Web Search"]; // Fallback
        }
    }

    // Check: Dimensions match agents 1:1
    const dimensionNames = new Set(blueprint.dimensions.map(d => d.name));
    for (const agent of blueprint.agents) {
        if (!dimensionNames.has(agent.dimension)) {
            warnings.push(`Agent "${agent.name}" references dimension "${agent.dimension}" which doesn't exist in the blueprint.`);
        }
    }

    // Check: Known interconnection pairs
    const dimNamesLower = blueprint.dimensions.map(d => d.name.toLowerCase());
    const existingPairs = new Set(
        blueprint.interconnections.map(i => `${i.dimensionA.toLowerCase()}|${i.dimensionB.toLowerCase()}`)
    );
    for (const known of KNOWN_INTERCONNECTIONS) {
        const hasA = dimNamesLower.some(n => n.includes(known.keywordA));
        const hasB = dimNamesLower.some(n => n.includes(known.keywordB));
        if (hasA && hasB) {
            const alreadyMapped = existingPairs.has(`${known.keywordA}|${known.keywordB}`) ||
                existingPairs.has(`${known.keywordB}|${known.keywordA}`);
            if (!alreadyMapped) {
                warnings.push(`Known interconnection missed: ${known.label} (coupling=${known.coupling})`);
            }
        }
    }

    // Stamp the original query
    blueprint.query = query;

    return { blueprint, warnings };
}


// ─── Helpers ────────────────────────────────────────────────

const TIER_AGENT_RANGE: Record<string, [number, number]> = {
    MICRO: [2, 3],
    STANDARD: [4, 6],
    EXTENDED: [7, 10],
    MEGA: [11, 15],
    CAMPAIGN: [15, 20],
};

function getTier(adjustedScore: number): Blueprint["tier"] {
    if (adjustedScore <= 5) return "MICRO";
    if (adjustedScore <= 8) return "STANDARD";
    if (adjustedScore <= 11) return "EXTENDED";
    if (adjustedScore <= 15) return "MEGA";
    return "CAMPAIGN";
}

/** Known interconnection pairs from methodology-core.md */
const KNOWN_INTERCONNECTIONS = [
    { keywordA: "financial", keywordB: "quality", coupling: 4, label: "Financial ↔ Quality/Stars" },
    { keywordA: "financial", keywordB: "star", coupling: 4, label: "Financial ↔ Star Ratings" },
    { keywordA: "regulatory", keywordB: "technology", coupling: 3, label: "Regulatory ↔ Technology" },
    { keywordA: "legislative", keywordB: "payer", coupling: 4, label: "Legislative ↔ Payer" },
    { keywordA: "competitive", keywordB: "m&a", coupling: 4, label: "Competitive ↔ M&A" },
    { keywordA: "drug", keywordB: "financial", coupling: 5, label: "Drug Pricing ↔ Financial" },
    { keywordA: "clinical", keywordB: "financial", coupling: 5, label: "Clinical ↔ Financial" },
    { keywordA: "workforce", keywordB: "provider", coupling: 4, label: "Workforce ↔ Provider" },
    { keywordA: "patient", keywordB: "quality", coupling: 3, label: "Patient Experience ↔ Quality" },
    { keywordA: "technology", keywordB: "competitive", coupling: 3, label: "Technology ↔ Competitive" },
    { keywordA: "regulatory", keywordB: "financial", coupling: 4, label: "Regulatory ↔ Financial" },
];
