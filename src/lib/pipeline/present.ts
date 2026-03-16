/**
 * PRISM Pipeline -- Phase 4: PRESENT
 *
 * HTML5 Presentation Generator.
 *
 * Takes synthesis results, agent findings, and a blueprint, then generates
 * a complete self-contained HTML5 presentation via Claude Sonnet. The
 * presentation-system.md spec (~1500 lines) is loaded as the system prompt,
 * giving Claude the full design token vocabulary, component library,
 * animation system, slide framework, editorial judgment rules, and
 * brand standards needed to produce reference-quality HTML.
 *
 * Uses Anthropic SDK directly with:
 * - Sonnet model (MODELS.PRESENT) for fast, high-quality HTML generation
 * - Prompt caching for the presentation system spec (avoids re-parsing
 *   on repeat runs)
 * - max_tokens: 64000 (presentations are 700-1500+ lines of HTML; EXTENDED tier can exceed 24K tokens)
 * - No tools — pure text generation
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import type Anthropic from "@anthropic-ai/sdk";
import {
  getAnthropicClient,
  MODELS,
  cachedSystemPrompt,
} from "@/lib/ai/client";
import type {
  SynthesisResult,
  AgentResult,
  Blueprint,
  PipelineEvent,
  PresentationResult,
} from "./types";
import type { MemoryBus } from "./memory-bus";

// ─── Types ──────────────────────────────────────────────────

export interface PresentInput {
  runId: string;
  synthesis: SynthesisResult;
  agentResults: AgentResult[];
  blueprint: Blueprint;
  emitEvent: (event: PipelineEvent) => void;
  memoryBus?: MemoryBus;
  capturedCalls?: import("./present/data-capture").CapturedToolCall[];
}

// ─── Presentation System Spec Loader ────────────────────────

/**
 * Load the presentation-system.md spec.
 * Searches in order:
 * 1. PRISM_PRESENTATION_SPEC env var (absolute path)
 * 2. <cwd>/references/presentation-system.md
 * 3. Sibling directory: ../prism 2/references/presentation-system.md
 *
 * Cached after first load.
 */
const FALLBACK_PRESENTATION_SPEC = `# PRISM Presentation System (Fallback Spec)

You are a presentation generator for PRISM Intelligence briefs.

## Output Format
Generate a complete, self-contained HTML5 document. Output ONLY raw HTML starting with <!DOCTYPE html>.

## Required External Assets
Include these in <head>:
- <link rel="stylesheet" href="/styles/presentation.css">
- <script src="/js/presentation.js" defer></script>

Do NOT write any inline <style> or <script> tags.

## Slide Structure
Every slide must follow this skeleton:
<section class="slide" id="slide-N">
  <div class="slide-bg-glow"></div>
  <div class="slide-inner"><!-- content --></div>
  <div class="slide-footer">
    <span>PRISM Intelligence</span>
    <span>Source: [tier] - [description]</span>
    <span>Slide N of T</span>
  </div>
</section>

## Slide Sequence
1. Title Slide - hero stats (.stat-block in .grid-3), dramatic title
2. Executive Summary - 3-4 key takeaways as .card elements
3. Methodology - agent roster as .compact-table
4. Dimension Slides (one per agent) - use rich components, no plain bullet lists
5. Emergence Slide (if emergent insights exist) - .emergence-card
6. Tension Slide (if tensions exist) - .grid-2 side-by-side
7. Strategic Implications - timeline or action matrix
8. Source Provenance - .source-list with tier indicators
9. Closing Slide - call to action, PRISM branding

## Component Classes
- .stat-block, .stat-number, .stat-eyebrow, .stat-suffix, .stat-trend
- .card, .card-accent (color variants)
- .tag, .tag-red through .tag-cyan, .tag.quality
- .grid-2, .grid-3, .grid-4
- .compact-table
- .timeline-bar, .tl-segment
- .bar-track, .bar-fill
- .source-list, .source-item
- .anim (fade-in on scroll), .anim-scale, .anim-blur
- Stagger: .d1 through .d7 classes (100ms increments)

## Branding
Use "PRISM | Intelligence" throughout. No other brand references.
`;

let cachedSpec: string | null = null;

function loadPresentationSpec(): string {
  if (cachedSpec) return cachedSpec;

  const candidatePaths = [
    process.env.PRISM_PRESENTATION_SPEC,
    resolve(process.cwd(), "references", "presentation-system.md"),
    resolve(process.cwd(), "..", "prism 2", "references", "presentation-system.md"),
  ].filter(Boolean) as string[];

  for (const specPath of candidatePaths) {
    try {
      cachedSpec = readFileSync(specPath, "utf-8");
      return cachedSpec;
    } catch {
      // try next candidate
    }
  }

  console.warn(
    `[PRESENT] presentation-system.md not found. Searched: ${candidatePaths.join(", ")}. ` +
    `Using embedded fallback spec. Set PRISM_PRESENTATION_SPEC for full design fidelity.`,
  );
  cachedSpec = FALLBACK_PRESENTATION_SPEC;
  return cachedSpec;
}

// ─── Prompt Building ────────────────────────────────────────

/**
 * Determine the recommended slide count based on swarm tier.
 */
function getSlideGuidance(blueprint: Blueprint): string {
  const agentCount = blueprint.agents.length;
  const tier = blueprint.tier;

  const ranges: Record<string, string> = {
    MICRO: "10-12 slides",
    STANDARD: "13-15 slides",
    EXTENDED: "16-18 slides",
    MEGA: "18-22 slides",
    CAMPAIGN: "18-22 slides",
  };

  const slideRange = ranges[tier] ?? "13-15 slides";
  let guidance = `Target ${slideRange} for ${tier} tier with ${agentCount} agents.`;

  if (agentCount >= 6) {
    guidance +=
      " Use Extended Brief format with TOC slide and navigation panel grouping. " +
      "Group dimension slides by analytical theme in the nav panel.";
  }

  return guidance;
}

/**
 * Build a concise agent roster string for the prompt.
 */
function buildAgentRoster(
  agentResults: AgentResult[],
  blueprint: Blueprint,
): string {
  return agentResults
    .map((ar) => {
      // Find the corresponding blueprint agent for color/lens info
      const bpAgent = blueprint.agents.find(
        (a) => a.name === ar.agentName || a.dimension === ar.dimension,
      );
      return (
        `- ${ar.agentName} (${ar.archetype}) — Dimension: ${ar.dimension}` +
        (bpAgent ? ` | Lens: ${bpAgent.lens}` : "") +
        ` | Findings: ${ar.findings.length}`
      );
    })
    .join("\n");
}

/**
 * Summarize top findings per agent (3-5 per agent, not all).
 */
function summarizeAgentFindings(agentResults: AgentResult[]): string {
  return agentResults
    .map((ar) => {
      const topFindings = ar.findings
        .slice(0, 5)
        .map(
          (f, i) =>
            `  ${i + 1}. [${f.confidence} | ${f.sourceTier}] ${f.statement}` +
            `\n     Evidence: ${f.evidence.slice(0, 200)}${f.evidence.length > 200 ? "..." : ""}` +
            `\n     Implication: ${f.implication}`,
        )
        .join("\n");

      const gaps = ar.gaps.length > 0 ? `\n  Gaps: ${ar.gaps.join("; ")}` : "";
      const signals = ar.signals.length > 0 ? `\n  Signals: ${ar.signals.join("; ")}` : "";

      return `### ${ar.agentName} (${ar.archetype} — ${ar.dimension})\n${topFindings}${gaps}${signals}`;
    })
    .join("\n\n");
}

/**
 * Format synthesis layers for the prompt.
 */
function formatSynthesisLayers(synthesis: SynthesisResult): string {
  return synthesis.layers
    .map(
      (layer) =>
        `### ${layer.name.toUpperCase()} Layer\n${layer.description}\n` +
        layer.insights.map((ins) => `- ${ins}`).join("\n"),
    )
    .join("\n\n");
}

/**
 * Format emergent insights with whyMultiAgent explanations.
 */
function formatEmergentInsights(synthesis: SynthesisResult): string {
  if (synthesis.emergentInsights.length === 0) {
    return "No emergent insights detected — do NOT force emergence slides.";
  }

  return synthesis.emergentInsights
    .map(
      (ei, i) =>
        `${i + 1}. **${ei.insight}**\n` +
        `   Algorithm: ${ei.algorithm}\n` +
        `   Supporting agents: ${ei.supportingAgents.join(", ")}\n` +
        `   Evidence sources: ${ei.evidenceSources.join("; ")}\n` +
        `   Quality: novelty=${ei.qualityScores.novelty}, grounding=${ei.qualityScores.grounding}, ` +
        `actionability=${ei.qualityScores.actionability}, depth=${ei.qualityScores.depth}, surprise=${ei.qualityScores.surprise}\n` +
        `   **Why only multi-agent finds this:** ${ei.whyMultiAgent}`,
    )
    .join("\n\n");
}

/**
 * Format tension points with both sides.
 */
function formatTensionPoints(synthesis: SynthesisResult): string {
  if (synthesis.tensionPoints.length === 0) {
    return "No significant tension points identified.";
  }

  return synthesis.tensionPoints
    .map(
      (tp) =>
        `**${tp.tension}** (${tp.conflictType})\n` +
        `  Side A: ${tp.sideA.position}\n` +
        `    Agents: ${tp.sideA.agents.join(", ")}\n` +
        `    Evidence: ${tp.sideA.evidence.join("; ")}\n` +
        `  Side B: ${tp.sideB.position}\n` +
        `    Agents: ${tp.sideB.agents.join(", ")}\n` +
        `    Evidence: ${tp.sideB.evidence.join("; ")}\n` +
        `  Resolution: ${tp.resolution}`,
    )
    .join("\n\n");
}

/**
 * Build the complete user prompt for presentation generation.
 */
function buildUserPrompt(
  synthesis: SynthesisResult,
  agentResults: AgentResult[],
  blueprint: Blueprint,
  memoryBus?: MemoryBus,
): string {
  const slideGuidance = getSlideGuidance(blueprint);
  const agentRoster = buildAgentRoster(agentResults, blueprint);
  const agentFindings = summarizeAgentFindings(agentResults);
  const synthesisLayers = formatSynthesisLayers(synthesis);
  const emergentInsights = formatEmergentInsights(synthesis);
  const tensionPoints = formatTensionPoints(synthesis);

  return `# Presentation Request

## Query & Title
**Query:** ${blueprint.query}
**Swarm Tier:** ${blueprint.tier}
**Agent Count:** ${blueprint.agents.length}
**Overall Confidence:** ${synthesis.overallConfidence}

## Slide Count Guidance
${slideGuidance}

## Agent Roster
${agentRoster}

## Synthesis Layers (5-layer intelligence pyramid)
${synthesisLayers}

## Emergent Insights
${emergentInsights}

## Tension Points
${tensionPoints}

## Agent Findings (top 3-5 per agent with source tiers)
${agentFindings}

## Provenance Context
- Total agents deployed: ${agentResults.length}
- Total findings across all agents: ${agentResults.reduce((sum, ar) => sum + ar.findings.length, 0)}
- Source tier distribution: PRIMARY=${countByTier(agentResults, "PRIMARY")}, SECONDARY=${countByTier(agentResults, "SECONDARY")}, TERTIARY=${countByTier(agentResults, "TERTIARY")}
- Confidence distribution: HIGH=${countByConfidence(agentResults, "HIGH")}, MEDIUM=${countByConfidence(agentResults, "MEDIUM")}, LOW=${countByConfidence(agentResults, "LOW")}
${synthesis.criticRevisions.length > 0 ? `- Critic revisions applied: ${synthesis.criticRevisions.join("; ")}` : ""}

## Branding
PRISM | Intelligence branding throughout. No Inovalon or other brand references.
Use "PRISM Intelligence" in the header mark and footer attributions.

## Output Instructions (CRITICAL)

1. Follow the Presentation System spec (your system prompt) exactly — it is the authoritative reference for all components, tokens, and structure.
2. Output ONLY raw HTML starting with <!DOCTYPE html>. No markdown fences.
3. Include exactly these external links in <head>:
   <link rel="stylesheet" href="/styles/presentation.css">
   <script src="/js/presentation.js" defer></script>
4. Do NOT write inline <style> or <script> tags. Do NOT use inline style="" except for slide-bg-glow background/position and grid column sizing.
5. The slide-footer is MANDATORY on every slide. Never omit it.

### Component Emphasis (CRITICAL — NO PLAIN BULLETS)
You MUST use rich components from the spec. Key reminders:

**Quantitative data** — Use SVG charts aggressively:
- .donut-chart with .segment circles for part-of-whole (use circumference 502.65 for dasharray math)
- .bar-chart-container with .bar-wrapper > .bar for vertical category comparisons
- .sparkline-container with .sparkline-line polyline inside .stat-block for inline trends
- .stat-number[data-target="N"] for animated counters (counters animate via presentation.js)
- .bar-row > .bar-track > .bar-fill for horizontal comparison bars

**Emergence slides** — Use the FULL emergence component hierarchy:
- <section class="slide emergent-slide"> (NOT just "slide")
- .emergent-number for large visual impact number
- .emergent-content wrapping all content
- .emergence-card (NOT .finding-card) for each cross-agent insight
- .emergent-why > .emergent-why-label explaining multi-agent methodology

**Animation stagger** — Use .d1 through .d7 CSS classes (NOT inline --delay styles):
- .anim.d1 = 100ms, .anim.d2 = 200ms, ..., .anim.d7 = 700ms
- Also use .anim-scale and .anim-blur for variety, not just .anim

### Editorial Judgment
- Thin data agents → merge into compact half-slide, do NOT pad
- No emergent insights → skip emergence slide entirely, do NOT fabricate
- Data-heavy agents → full slides with SVG charts and stat grids
- Qualitative agents → finding cards, quote blocks, policy boxes
- Use exact numbers, name sources, cite evidence tiers` +
    buildMemoryBusSections(memoryBus);
}

/**
 * Build optional MemoryBus context sections for the user prompt.
 * Returns an empty string when no bus is provided, preserving existing behavior.
 */
function buildMemoryBusSections(memoryBus?: MemoryBus): string {
  if (!memoryBus) return "";

  const sections: string[] = [];

  // --- Key Intelligence Signals (top 5 high/critical) ---
  const highSignals = memoryBus.readSignals({ priority: "high" }).slice(0, 5);
  if (highSignals.length > 0) {
    const signalLines = highSignals
      .map(
        (s, i) =>
          `${i + 1}. **[${s.priority.toUpperCase()}/${s.type}]** from ${s.from}: ${s.message}`,
      )
      .join("\n");
    sections.push(`\n\n## Key Intelligence Signals\n${signalLines}`);
  }

  // --- Resolved Disagreements (conflicts with resolutions) ---
  const allConflicts = memoryBus.getState().conflicts;
  const resolvedConflicts = allConflicts.filter(
    (c) => c.status === "resolved" && c.resolution,
  );
  if (resolvedConflicts.length > 0) {
    const conflictLines = resolvedConflicts
      .map(
        (c) =>
          `- **${c.claim}** — resolved via ${c.resolutionStrategy ?? "consensus"}: ${c.resolution}`,
      )
      .join("\n");
    sections.push(`\n\n## Resolved Disagreements\n${conflictLines}`);
  }

  return sections.join("");
}

// ─── Helpers ────────────────────────────────────────────────

function countByTier(results: AgentResult[], tier: string): number {
  return results.reduce(
    (sum, ar) => sum + ar.findings.filter((f) => f.sourceTier === tier).length,
    0,
  );
}

function countByConfidence(results: AgentResult[], level: string): number {
  return results.reduce(
    (sum, ar) => sum + ar.findings.filter((f) => f.confidence === level).length,
    0,
  );
}

/**
 * Extract the HTML from Claude's response text.
 * Handles both raw HTML output and markdown-wrapped (```html ... ```) output.
 */
function extractHtml(text: string): string {
  // Try to extract from markdown code fence first
  const fenceMatch = text.match(/```html\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Check if the text itself is HTML (starts with <!DOCTYPE or <html)
  const htmlStart = text.indexOf("<!DOCTYPE");
  if (htmlStart >= 0) {
    return text.slice(htmlStart).trim();
  }

  const htmlTagStart = text.indexOf("<html");
  if (htmlTagStart >= 0) {
    return text.slice(htmlTagStart).trim();
  }

  // Fallback: return the whole text (it may still be valid HTML)
  return text.trim();
}

/**
 * Count slides in the generated HTML.
 */
function countSlides(html: string): number {
  // Count <section> tags — each top-level section is one slide
  const sectionMatches = html.match(/<section[\s>]/g);
  return sectionMatches?.length ?? 0;
}

/**
 * Generate a URL-safe slug from the query for filename use.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Extract a subtitle from the blueprint query.
 * Uses the first sentence or up to 120 chars.
 */
function deriveSubtitle(blueprint: Blueprint): string {
  const agentCount = blueprint.agents.length;
  const dimensions = blueprint.dimensions
    .slice(0, 4)
    .map((d) => d.name)
    .join(", ");
  return `${agentCount}-agent ${blueprint.tier} analysis spanning ${dimensions}`;
}

// ─── Main Entry Point ───────────────────────────────────────

/**
 * Phase 4: Generate a complete HTML5 presentation from synthesis results.
 *
 * Loads the presentation-system.md spec as the system prompt, builds a
 * structured user prompt from synthesis + agent data, and calls Sonnet
 * to generate the full HTML.
 */
export async function present(input: PresentInput): Promise<PresentationResult> {
  const { synthesis, agentResults, blueprint, emitEvent, memoryBus } = input;

  // --- 1. Emit start event ---
  emitEvent({ type: "presentation_started" });

  // --- 2. Load presentation system spec ---
  const presentationSpec = loadPresentationSpec();

  // --- 3. Build the user prompt ---
  const userPrompt = buildUserPrompt(synthesis, agentResults, blueprint, memoryBus);

  // --- 4. Call Sonnet to generate the presentation ---
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: MODELS.PRESENT,
    max_tokens: 64000,
    system: [cachedSystemPrompt(presentationSpec)],
    messages: [{ role: "user", content: userPrompt }],
    stream: true,
  });

  let fullText = "";
  let stopReason = "unknown";
  for await (const chunk of response) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      fullText += chunk.delta.text;
      emitEvent({
        type: "thinking_token", // Reuse this to keep SSE alive
        token: chunk.delta.text,
      });
    } else if (chunk.type === "message_delta") {
      stopReason = (chunk as unknown as { delta?: { stop_reason?: string } }).delta?.stop_reason ?? stopReason;
    } else if (chunk.type === "message_stop") {
      console.log(`[PRESENT] Generation complete. Stop reason: ${stopReason}, output length: ${fullText.length} chars`);
      if (stopReason === "max_tokens") {
        console.warn("[PRESENT] WARNING: Output was truncated by max_tokens limit. Presentation may be incomplete.");
      }
    }
  }

  // --- 5. Extract HTML from response ---
  const html = extractHtml(fullText);

  // --- 6. Count slides ---
  const slideCount = countSlides(html);

  // --- 7. Generate title metadata ---
  const title = `PRISM Intelligence Brief — ${blueprint.query.slice(0, 80)}`;
  const subtitle = deriveSubtitle(blueprint);
  const slug = slugify(blueprint.query);

  // --- 8. Emit completion event ---
  emitEvent({
    type: "presentation_complete",
    title,
    slideCount,
    htmlPath: `prism-${slug}.html`,
  });

  // --- 9. Return result ---
  return {
    html,
    title,
    subtitle,
    slideCount,
  };
}
