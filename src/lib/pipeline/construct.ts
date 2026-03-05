/**
 * PRISM Pipeline — Phase 1: CONSTRUCT
 * 
 * Agent Prompt Builder.
 * 
 * Takes a Blueprint and produces fully-formed agent system prompts,
 * each tailored to the agent's archetype, dimension, and mandate.
 * 
 * Quality controls:
 * - Neutral Framing Protocol applied to ethically-charged mandates
 * - Every prompt requires structured output: Finding, Evidence, Confidence (with reasoning),
 *   Source, Implication, Gaps, Signals for Other Agents, Minority Views
 * - Anti-hallucination directive in every prompt
 * - Agent color assignment for UI consistency
 * - Auto-forge protocol for novel dimensions with no matching archetype
 */

import type { Blueprint, AgentRecommendation } from "./types";
import {
    ARCHETYPE_REGISTRY,
    getArchetype,
    forgeArchetype,
    type ArchetypeProfile,
} from "./archetypes";
import { getSkillRouter } from "./skill-router";
import { AGENT_COLORS } from "../constants";

// Re-export archetype registry for external access
export { ARCHETYPE_REGISTRY } from "./archetypes";


// ─── Neutral Framing Protocol ───────────────────────────────

const ETHICALLY_CHARGED_PATTERNS = [
    /advocate|advocacy/i,
    /adversarial|devil's advocate/i,
    /patient harm|harm to patients/i,
    /denial|deny.*claim/i,
    /argue.*case.*for/i,
    /defend.*position/i,
    /economics of.*harm/i,
    /prior auth.*harm/i,
    /coverage denial/i,
];

/**
 * Apply the Neutral Framing Protocol to an agent mandate.
 * Reframes ethically-charged mandates as neutral research tasks
 * to prevent the documented 60% agent failure rate on sensitive topics.
 */
function applyNeutralFraming(mandate: string, dimension: string): string {
    const isEthicallyCharged = ETHICALLY_CHARGED_PATTERNS.some(p => p.test(mandate));

    if (!isEthicallyCharged) return mandate;

    // Reframe: advocacy → research, adversarial → contrarian analysis
    return mandate
        .replace(/advocate for|argue that|defend the position that/gi, "research evidence regarding")
        .replace(/patient harm/gi, "patient outcomes and access metrics")
        .replace(/denial economics|economics of denial/gi, "utilization management financial impact")
        .replace(/devil's advocate/gi, "contrarian analysis")
        .replace(/argue the strongest case for/gi, "research the strongest evidence-based counterarguments regarding")
        + `\n[NOTE: This mandate has been neutrally framed for the "${dimension}" dimension to ensure thorough, objective research.]`;
}


// ─── Output Requirements Template ───────────────────────────

const OUTPUT_REQUIREMENTS = `

## Required Output Structure

You MUST structure your analysis as follows. Every field is required.

### Findings (produce 3-8 findings)
For EACH finding, provide ALL of the following:
1. **Statement**: A clear, specific finding (one sentence)
2. **Evidence**: What supports this — cite specific data, studies, documents, statistics
3. **Confidence**: HIGH, MEDIUM, or LOW
4. **Confidence Reasoning**: WHY this confidence level — explain based on evidence quality, source diversity, and corroboration. Not just the label.
5. **Evidence Type**: "primary" (original data/study), "secondary" (analysis/review), or "tertiary" (opinion/commentary)
6. **Source**: Where this came from — URL, document name, database name. Be specific.
7. **Implication**: So what? Why does this matter for the strategic question?

### Gaps & Uncertainties
- List what you COULD NOT determine
- For each gap: why is this information missing? (data doesn't exist? proprietary? not yet studied?)

### Signals for Other Agents
- Note observations relevant to OTHER dimensions being analyzed
- These cross-dimensional signals are critical for emergence detection

### Minority Views
- Important counter-perspectives or dissenting evidence
- Do NOT suppress views just because they contradict the majority — they may be the most insightful finding

### Executive Summary
- One paragraph summarizing the most important takeaways

## Critical Rules
1. **Do NOT fabricate sources.** If you cannot find evidence for something, say "I could not find evidence for this" rather than inventing a citation. Fabricated sources will be detected during verification and will invalidate your findings.
2. **Calibrate confidence honestly.** If a finding is based on a single commentary article, it's LOW confidence even if the claim sounds definitive. If corroborated by 3 independent primary sources, it's HIGH.
3. **Acknowledge uncertainty.** A brief that honestly states what is NOT known is more trustworthy than one that appears to know everything.
4. **Be specific, not generic.** "Healthcare costs are rising" is not a finding. "Medicare Part D spending on GLP-1 agonists increased 47% YoY in Q3 2025 (CMS PUF data)" is a finding.`;


// ─── Main Function ──────────────────────────────────────────

export interface ConstructedAgent {
    id: string;
    name: string;
    archetype: string;
    dimension: string;
    mandate: string;
    tools: string[];
    color: string;
    systemPrompt: string;
    wasNeutrallyFramed: boolean;
    compatibleSkills: string[];
    synthesisRole: string;
}

export interface ConstructOutput {
    agents: ConstructedAgent[];
    warnings: string[];
    forgedArchetypes: string[];
}

/**
 * Phase 1: CONSTRUCT — Build full agent prompts from a Blueprint.
 * 
 * For each agent in the blueprint:
 * 1. Look up the archetype profile from the full 25+ registry
 * 2. If no match, auto-forge a custom archetype
 * 3. Apply Neutral Framing Protocol if ethically-charged
 * 4. Compose the full system prompt with output requirements
 * 5. Assign a color for UI display
 */
export function construct(blueprint: Blueprint): ConstructOutput {
    const warnings: string[] = [];
    const agents: ConstructedAgent[] = [];
    const forgedArchetypes: string[] = [];

    for (let i = 0; i < blueprint.agents.length; i++) {
        const agentRec = blueprint.agents[i];
        let profile = getArchetype(agentRec.archetype);

        // Auto-Forge Protocol: create archetype on the fly if not in registry
        if (!profile) {
            const forged = forgeArchetype(agentRec.dimension, {
                domain: agentRec.dimension,
                lens: agentRec.lens,
                style: "Structured findings with evidence citations and confidence ratings",
                bias: agentRec.bias,
                successMetric: "At least one non-obvious, evidence-backed insight",
            });
            profile = forged;
            forgedArchetypes.push(forged.id);
            warnings.push(`Auto-forged archetype "${forged.id}" for dimension "${agentRec.dimension}" — no registry match for "${agentRec.archetype}"`);
        }

        // Check for ethical sensitivity and apply Neutral Framing
        const isEthicallyCharged = ETHICALLY_CHARGED_PATTERNS.some(p => p.test(agentRec.mandate));
        const ethicalConcerns = blueprint.ethicalConcerns || [];
        const dimensionIsEthical = ethicalConcerns.some(c =>
            agentRec.dimension.toLowerCase().includes(c.toLowerCase()) ||
            c.toLowerCase().includes(agentRec.dimension.toLowerCase())
        );

        const needsNeutralFraming = isEthicallyCharged || dimensionIsEthical;
        const framedMandate = needsNeutralFraming
            ? applyNeutralFraming(agentRec.mandate, agentRec.dimension)
            : agentRec.mandate;

        if (needsNeutralFraming) {
            warnings.push(`Applied Neutral Framing Protocol to "${agentRec.name}" — original mandate contained ethically-charged language`);
        }

        const systemPrompt = buildAgentPrompt(agentRec, profile, framedMandate, blueprint);

        agents.push({
            id: `agent-${i}`,
            name: agentRec.name,
            archetype: agentRec.archetype,
            dimension: agentRec.dimension,
            mandate: framedMandate,
            tools: agentRec.tools,
            color: AGENT_COLORS[i % AGENT_COLORS.length],
            systemPrompt,
            wasNeutrallyFramed: needsNeutralFraming,
            compatibleSkills: profile.compatibleSkills,
            synthesisRole: profile.synthesisRole,
        });
    }

    return { agents, warnings, forgedArchetypes };
}


// ─── Prompt Builder ─────────────────────────────────────────

function buildAgentPrompt(
    agent: AgentRecommendation,
    profile: ArchetypeProfile,
    mandate: string,
    blueprint: Blueprint,
): string {
    const lens = profile.lens;
    const bias = profile.bias;
    const description = profile.description;

    // Use the archetype's full prompt template if available
    const roleSection = profile.promptTemplate || `You are ${agent.name}, a specialized intelligence agent.

## Your Analytical Lens
${lens}

## Your Intentional Bias
${bias}`;

    // Find this agent's dimension info
    const dimension = blueprint.dimensions.find(d => d.name === agent.dimension);

    // Find interconnected dimensions
    const interconnected = blueprint.interconnections
        .filter(i => i.dimensionA === agent.dimension || i.dimensionB === agent.dimension)
        .map(i => {
            const otherDim = i.dimensionA === agent.dimension ? i.dimensionB : i.dimensionA;
            return `${otherDim} (coupling=${i.coupling}: ${i.mechanism})`;
        });

    // Inject domain intelligence from platform skills
    const skillRouter = getSkillRouter();
    const skillContext = skillRouter.buildSkillContext(profile.compatibleSkills);

    return `You are ${agent.name}, a specialized intelligence agent in the PRISM multi-agent analysis pipeline.

## Your Role
${description}

${roleSection}

## Your Dimension
**${agent.dimension}**: ${dimension?.description ?? ""}

## Your Mandate
${mandate}

## Context
You are one of ${blueprint.agents.length} agents analyzing this strategic question:
"${blueprint.query}"

You are responsible for the "${agent.dimension}" dimension. Other agents are covering:
${blueprint.agents
            .filter(a => a.name !== agent.name)
            .map(a => `- ${a.name} → ${a.dimension}`)
            .join("\n")}

${interconnected.length > 0 ? `## Interconnected Dimensions
Your dimension has known interconnections with:
${interconnected.map(i => `- ${i}`).join("\n")}

Pay special attention to findings that connect to these dimensions — they are critical for emergence detection.` : ""}
${skillContext}

## Available Tools
${agent.tools.map(t => `- ${t}`).join("\n")}

${OUTPUT_REQUIREMENTS}`;
}
