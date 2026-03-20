/**
 * Slide Generator
 *
 * Generates individual slide HTML via LLM call, given:
 * - A SlideSpec (title, type, purpose, componentHints, dataPoints, etc.)
 * - Pre-computed ChartData fragments from the chart compiler
 * - Exemplar HTML for this slide type
 * - A compact component reference for the hinted CSS classes
 * - Relevant AgentFindings and deck context
 *
 * Also exposes generateSlidesBatch() for parallel execution with retry
 * logic and a 30% failure threshold that triggers legacy fallback.
 *
 * The system prompt loads the full compiled presentation-system.md spec,
 * then appends slide-level output overrides. This ensures per-slide
 * generation has access to the complete design system: all animation
 * classes, interactive components, background variants, chart specs,
 * composition rules, and choreography guidelines.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import {
  MODELS,
  getAnthropicClient,
  cachedSystemPrompt,
} from "../../ai/client";
import type {
  SlideHTML,
  SlideGeneratorInput,
  SlideSpec,
  ChartData,
  AgentFinding,
  SlideStructure,
} from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Opus requires more time per slide for richer output */
const SLIDE_TIMEOUT_MS = 90_000;

// ─── Presentation Spec Loader ─────────────────────────────────────────────────

let _cachedPresentationSpec: string | null = null;

/**
 * Loads the compiled presentation-system.md spec from disk.
 * Cached after first read — the spec doesn't change during a pipeline run.
 */
function loadPresentationSpec(): string {
  if (_cachedPresentationSpec) return _cachedPresentationSpec;
  const specPath = path.resolve(
    process.cwd(),
    "references/presentation-system.md",
  );
  _cachedPresentationSpec = fs.readFileSync(specPath, "utf8");
  return _cachedPresentationSpec;
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

/**
 * Builds the system prompt for single-slide generation.
 *
 * Structure:
 * 1. Full presentation-system.md (design system, components, animation,
 *    interactive components, composition rules, choreography)
 * 2. Slide-level output overrides (single <section> mode)
 * 3. Exemplar HTML for this slide type
 * 4. Component reference for hinted classes
 */
function buildSlideSystemPrompt(
  exemplarHtml: string,
  componentRef: string,
  spec: SlideSpec,
  compositionSpec?: import("./types").SlideCompositionSpec,
): string {
  const presentationSpec = loadPresentationSpec();

  return `${presentationSpec}

---

## SLIDE-LEVEL GENERATION MODE

**CRITICAL: You are generating a SINGLE slide as a self-contained \`<section>\` element — NOT a full HTML document.**

The design system, component library, animation system, and composition rules above are your complete reference. Now apply them to generate one slide.

### Output Rules (OVERRIDE the "Output Format" section above)
1. Output ONLY the raw \`<section>\` element — no \`<!DOCTYPE>\`, no \`<html>\`, no \`<head>\`, no surrounding markup, no markdown fences.
2. The section MUST open with: \`<section class="slide" id="s${spec.slideNumber}">\`
3. Every slide MUST contain these three direct children in order:
   - \`<div class="slide-bg-glow" style="background:var(--glow-color);top:-200px;right:-200px;">\` — decorative glow (see Glow Color Mapping above for the correct color)
   - \`<div class="slide-inner">\` — all content goes here
   - \`<div class="slide-footer">\` — three \`<span>\` columns: PRISM Intelligence | Source Agent | Slide N
4. **NEVER use inline \`style\` attributes** except for these four allowed cases:
   - \`.slide-bg-glow\` background/position (glow placement)
   - \`.legend-dot\` / \`.dot\` background color (chart legend colors)
   - \`.bar-fill\` \`--fill-pct\` custom property
   - \`stroke-dasharray\` / \`stroke-dashoffset\` on SVG chart elements

   **EXPLICITLY FORBIDDEN inline styles (use CSS classes instead):**
   - \`style="color:var(--accent)"\` → use class \`accent\` or \`accent-bright\`
   - \`style="color:var(--accent-success)"\` → use class \`accent-success\` or \`green\`
   - \`style="color:var(--accent-error)"\` → use class \`accent-error\` or \`red\`
   - \`style="text-align:center"\` → use class \`text-center\`
   - \`style="margin-top:1.5rem"\` → use class \`mt-md\` or \`mt-lg\`
   - \`style="display:flex"\` → use class \`stat-row\` or \`chart-with-legend\`
   - \`style="font-size:..."\` → use class \`text-xs\`, \`text-sm\`, etc.
   - \`style="opacity:..."\` → never needed, use animation classes
   - \`style="width:100%"\` → use class \`full-width\`

   Use semantic CSS class names from presentation.css for ALL styling.
5. Do NOT add inline \`<style>\` or \`<script>\` tags.
6. Use ONLY CSS classes from the design system above. Never invent class names.
7. Terminate properly with \`</section>\`.

### Slide Background — MANDATORY
You MUST add a background variant class on the \`<section>\` element. Never output \`<section class="slide" ...\` without a variant.

| Content Type | Background Class |
|---|---|
| Default / general | \`gradient-dark\` |
| Data-heavy / analytical | \`gradient-blue\` |
| Emergent insights | \`gradient-radial\` |
| Technical / process | \`dark-mesh\` |
| Innovation / future | \`dark-particles\` |

**CORRECT:** \`<section class="slide gradient-blue" id="s${spec.slideNumber}">\`
**WRONG:** \`<section class="slide" id="s${spec.slideNumber}">\`

### Animation Choreography — MANDATORY DIVERSITY
You MUST use at least 2 DIFFERENT animation classes per slide. Using \`.anim\` on every element is WRONG.

**Animation class palette:**
- \`.anim\` — Basic fade-up (use for secondary content only)
- \`.anim-blur\` — Blur-reveal (use on h2 slide titles and hero text)
- \`.anim-scale\` — Scale-in (use on cards and stat blocks)
- \`.anim-slide-left\` — Enter from left (use on left column in grid-2)
- \`.anim-slide-right\` — Enter from right (use on right column in grid-2)
- \`.anim-spring\` — Bouncy emphasis (use on callouts, badges, key stats)
- \`.anim-fade\` — Opacity only (use on footnotes, source lists)
- \`.anim-zoom\` — Dramatic zoom-out (use on emergence reveal numbers, sparingly)
- \`.stagger-children\` — Auto-staggers children (use on grids, card lists, stat groups)

**MANDATORY per slide type:**
- Title: h1 uses \`.anim-blur\`, stats use \`.anim-spring\`, agent chips use \`.stagger-children\`
- Data metrics: stat grid uses \`.stagger-children\`, charts use \`.anim-spring\`
- Deep dive: title uses \`.anim-blur\`, cards use \`.anim-scale\` or \`.stagger-children\`
- Emergence: number uses \`.anim-zoom\`, title uses \`.anim-blur\`, cards use \`.stagger-children\`
- Tension: left column uses \`.anim-slide-left\`, right column uses \`.anim-slide-right\`
- Closing: title uses \`.anim-blur\`, CTAs use \`.anim-spring\`

**CORRECT example:**
\`\`\`html
<h2 class="slide-title anim-blur d1">Title</h2>
<div class="grid-3 stagger-children d3">...</div>
<div class="callout anim-spring d5">...</div>
\`\`\`

**WRONG example (all same animation):**
\`\`\`html
<h2 class="slide-title anim d1">Title</h2>
<div class="grid-3 anim d3">...</div>
<div class="callout anim d5">...</div>
\`\`\`

### Interactive Components — USE THEM
Include at least ONE interactive component per slide when the content has enough depth. These are real CSS-only or JS-powered components in presentation.css/js:

- **Accordions** (\`.accordion-item > .accordion-trigger + .accordion-content\`) — expandable finding details, methodology, source info
- **Tabs** (\`.tab-group > .tab-list > .tab-button + .tab-panel\`) — multi-agent comparisons, dimensional analysis
- **Tooltips** (\`.tooltip-wrap > text + .tooltip-text\`) — domain terminology, acronyms, source notes
- **Callout boxes** (\`.callout > .callout-title + p\`) — executive highlights, key takeaways
- **Process flows** (\`.process-flow > .process-step + .process-arrow\`) — methodology, decision sequences
- **Feature grids** (\`.feature-grid > .feature-card > .feature-icon + .feature-title\`) — capability displays
- **Icon grids** (\`.icon-grid > .icon-grid-item > .icon + .icon-label\`) — compact category displays

**When to use which:**
- Slide has 3+ finding cards → wrap extras in an accordion, but accordion should stay a secondary device
- Slide compares 2+ agents or dimensions → use tabs
- Slide has domain jargon → wrap terms in tooltips
- Slide has a key takeaway → use a callout box
- Slide describes a methodology → use process-flow
- Title/closing with 4+ features → use feature-grid or icon-grid
- Simple 1-2 finding slides → a callout for the key insight is sufficient
- Do NOT make accordion the primary organizing device on adjacent slides in the deck

### Slide Structure Template
\`\`\`html
<section class="slide gradient-dark" id="s${spec.slideNumber}">
  <div class="slide-bg-glow" style="background:var(--inov-cerulean);top:-200px;right:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim d1"><span class="tag strategic">SOURCE AGENT</span> Agent Name</div>
    <h2 class="slide-title anim-blur d2">Slide Title</h2>
    <p class="section-intro anim d3">Brief framing sentence for this slide's content.</p>
    <!-- main content grid/components here -->
  </div>
  <div class="slide-footer">
    <span>PRISM Intelligence</span>
    <span>Source Agent | Analysis</span>
    <span>Slide ${spec.slideNumber}</span>
  </div>
</section>
\`\`\`

${componentRef}

## Exemplar HTML (slide type: ${spec.type})
Study this exemplar for component patterns, layout structure, and class usage.
Match its level of visual richness — use multiple component types, varied animations, and interactive elements where appropriate.

\`\`\`html
${exemplarHtml}
\`\`\`

${compositionSpec ? `## COMPOSITION CONTRACT (BINDING — your output WILL be validated against this)
- **Required components:** ${compositionSpec.requiredComponentClasses.join(", ")} — your HTML MUST contain elements with each of these classes
- **Minimum animation types:** ${compositionSpec.minAnimationTypes} distinct types from: anim-blur, anim-spring, anim-scale, anim-fade, anim-zoom, anim-slide-left, anim-slide-right, stagger-children
- **Interactive requirement:** ${compositionSpec.interactiveRequirement === "none" ? "None required" : compositionSpec.interactiveRequirement === "one" ? "At least ONE interactive component (accordion, tabs, callout, tooltip, process-flow)" : "At least TWO interactive components from different types"}
- **Visual density:** ${compositionSpec.densityTarget} (${compositionSpec.densityTarget === "rich" ? "6-10 content elements, must fit in one viewport" : compositionSpec.densityTarget === "standard" ? "4-8 content elements, must fit in one viewport" : "2-5 content elements"})
- **Background:** Use \`${compositionSpec.backgroundVariant}\` on the section element
- **Charts:** ${compositionSpec.chartRequirement === "none" ? "No charts required" : compositionSpec.chartRequirement === "mixed-types" ? "Use 2+ DIFFERENT chart types (e.g., donut + sparkline, bar + line)" : compositionSpec.chartRequirement === "multiple" ? "Include 2+ charts" : "Include at least 1 chart"}

**VIOLATION CONSEQUENCES:** Missing required components → slide will be REGENERATED. Missing animation variety or interactive elements → slide will be sent to remediator for fixes. Meeting this contract is NOT optional.

` : ""}## VIEWPORT CONSTRAINT (CRITICAL)
Each slide MUST fit within a single viewport (height: 100vh). The slide container has strict max-height: 100vh with overflow hidden.
- Maximum 4-5 top-level content elements in .slide-inner (stat grids, finding cards, charts, etc.)
- Finding cards are ~130px tall each, stat blocks ~120px, charts ~200px. Budget ~600px for the content area after title and footer.
- NEVER generate more than 3 finding-cards per slide. Use accordions to collapse secondary details if needed.
- Prefer information density through charts and stat-blocks rather than many individual cards.
- If content exceeds what fits, split across multiple slides rather than overstuffing one.

## Editorial Rules
- Match component density to data richness: many data points → charts and grids; qualitative → finding-cards, quotes, accordions
- Every slide needs ONE clear hero element (biggest stat, key chart, primary finding card, or dramatic callout)
- **NEVER use plain bullet lists** when a component fits the data shape — use finding-cards, stat-blocks, tabs, accordions, feature-grids instead
- Use interactive components (accordions, tabs, tooltips) when content has enough depth
- Vary animation types across the deck — different slides should enter differently
- For \`data-metrics\` slides: lead with stat-blocks and SVG charts, use .stagger-children on stat grids
- For \`dimension-deep-dive\` slides: use finding-cards with confidence badges, consider tabs for multi-facet analysis
- For \`dimension-deep-dive\` slides: prefer tabs, process-flow, quote-block, icon-grid, or callout before defaulting to another accordion stack
- For \`emergence\` slides: use emergence-card with emergent-why, apply .anim-zoom for the reveal
- For \`tension\` slides: use .grid-2 with .anim-slide-left / .anim-slide-right for opposing viewpoints, comparison-bars or threat-meter for the decision tension, and concise copy
- For \`title\` / \`closing\` slides: use hero-title, hero-sub, feature-grid, process-flow, and strongest choreography
- For \`executive-summary\` slides: combine a callout, metrics, prioritization view, and recommended moves — avoid stacking plain finding cards
- For \`findings-toc\` slides: use toc-group-header and toc-item with icon-grid or callout so the slide feels like an intelligence map
- If chart SVG fragments are provided in the user message, INSERT them directly — do NOT recreate or modify them`;
}

function buildSlideTypeDirective(
  spec: SlideSpec,
  charts: ChartData[],
): string {
  const chartTypes = charts.map((chart) => chart.type);

  switch (spec.type) {
    case "findings-toc":
      return [
        "Render this as an intelligence map, not a plain agenda.",
        "Use grouped TOC structure plus one visual orientation device such as icon-grid or callout.",
        "Do not use more than one accordion on this slide.",
        "Keep copy compressed and directional; no long paragraphs.",
      ].join(" ");
    case "executive-summary":
      return [
        "This slide must feel board-ready.",
        "Combine one decisive callout, a KPI surface, and one prioritization or action frame.",
        "Prefer feature-grid or comparison-bars over generic stacks of finding cards.",
        "Keep prose short: no more than two brief paragraphs total.",
      ].join(" ");
    case "dimension-deep-dive":
      return [
        "Vary the visual grammar from other deep-dive slides.",
        "Prefer tabs, process-flow, quote-block, icon-grid, or callout before defaulting to accordion.",
        "Use accordion only for secondary evidence or methodology detail.",
        "Lead with the strongest implication, not a scene-setting paragraph.",
      ].join(" ");
    case "data-metrics":
      return [
        chartTypes.includes("line") || chartTypes.includes("sparkline")
          ? "The temporal chart is the hero element on this slide."
          : "Use the strongest chart as the hero element and support it with concise metrics.",
        "Pair charts with stat-blocks or a decisive callout, not multiple paragraphs.",
        "If multiple chart fragments are provided, compose them into a coherent analytical surface rather than separating them mechanically.",
      ].join(" ");
    case "emergence":
      return [
        "This slide must feel synthetic and surprising.",
        "Use cards, tabs, or compressed why-it-matters framing rather than long narrative blocks.",
        "The emergence should read like a non-obvious pattern executives can act on, not just a list of observations.",
      ].join(" ");
    case "tension":
      return [
        "Render the tension symmetrically with opposing columns or opposing visual weights.",
        "Use comparison-bars, threat-meter, or concise finding cards to make the tradeoff legible.",
        "End with a resolution principle or decision criterion, not an essay.",
      ].join(" ");
    case "closing":
      return [
        "Close with explicit decisions, workstreams, or watch-signals.",
        "Prefer feature-grid, process-flow, or icon-grid to make the next moves feel operational.",
        "This slide should create momentum, not just restate the thesis.",
      ].join(" ");
    case "title":
      return [
        "Make the title slide premium and cinematic.",
        "Use the hero zone to establish the scope, confidence, and analytical ambition of the brief immediately.",
      ].join(" ");
    default:
      return "Build a high-density executive slide with one clear hero element and disciplined supporting structure.";
  }
}

/**
 * Builds the user prompt for a single slide.
 * Includes spec metadata, chart fragments, relevant findings, and deck context.
 */
function buildSlideUserPrompt(
  spec: SlideSpec,
  charts: ChartData[],
  findings: AgentFinding[],
  deckContext: { title: string; subtitle: string; totalSlides: number },
): string {
  const parts: string[] = [];

  // Deck context header
  parts.push(`# Slide ${spec.slideNumber} of ${deckContext.totalSlides}`);
  parts.push(`**Deck:** ${deckContext.title}`);
  parts.push(`**Deck Subtitle:** ${deckContext.subtitle}`);
  parts.push(``);

  // Slide spec
  parts.push(`## Slide Specification`);
  parts.push(`- **Title:** ${spec.title}`);
  parts.push(`- **Type:** ${spec.type}`);
  parts.push(`- **Purpose:** ${spec.purpose}`);
  parts.push(`- **Animation Style:** ${spec.animationType}`);
  parts.push(
    `- **Source Agents:** ${spec.agentSources.join(", ") || "Analysis"}`,
  );
  parts.push(
    `- **Component Hints:** ${spec.componentHints.join(", ") || "standard"}`,
  );
  parts.push(``);
  parts.push(`## Slide-Type Direction`);
  parts.push(buildSlideTypeDirective(spec, charts));
  parts.push(``);

  // Data points
  if (spec.dataPoints.length > 0) {
    parts.push(`## Data Points`);
    for (const dp of spec.dataPoints) {
      const prefix = dp.prefix ?? "";
      const unit = dp.unit ?? "";
      parts.push(
        `- **${dp.label}:** ${prefix}${dp.value}${unit} (role: ${dp.chartRole})`,
      );
    }
    parts.push(``);
  }

  // Pre-computed chart fragments
  if (charts.length > 0) {
    parts.push(`## Pre-Computed Chart Fragments`);
    parts.push(
      `INSERT these fragments directly into the slide — do NOT recreate them.`,
    );
    parts.push(``);

    for (let i = 0; i < charts.length; i++) {
      const chart = charts[i];
      parts.push(`### Chart ${i + 1} (type: ${chart.type})`);

      if ("svgFragment" in chart) {
        parts.push("```html");
        parts.push(chart.svgFragment);
        parts.push("```");
      } else if ("htmlFragment" in chart) {
        parts.push("```html");
        parts.push(chart.htmlFragment);
        parts.push("```");
      }
      parts.push(``);
    }
  }

  // Relevant findings (top 5)
  if (findings.length > 0) {
    parts.push(`## Relevant Findings (use in slide content)`);
    const topFindings = findings.slice(0, 5);
    for (const f of topFindings) {
      parts.push(
        `- [${f.confidence} | ${f.sourceTier}] **${f.statement}**\n  Evidence: ${f.evidence.slice(0, 150)}${f.evidence.length > 150 ? "..." : ""}\n  Implication: ${f.implication}`,
      );
    }
    parts.push(``);
  }

  // Final instruction
  parts.push(`## Task`);
  parts.push(
    `Generate the complete \`<section class="slide" id="s${spec.slideNumber}">\` element for this slide. ` +
      `Choose an appropriate background variant class for the content mood. ` +
      `Use varied animation classes with choreographed stagger delays — not just .anim on everything. ` +
      `Use interactive components (accordions, tabs, tooltips) where content depth warrants it. ` +
      `Insert chart fragments exactly as provided. Use specific numbers and source attributions from the findings above. ` +
      `NEVER use inline style attributes except for the allowed cases (glow position, legend dots, bar-fill --fill-pct, SVG stroke attributes). ` +
      `Output ONLY the \`<section>...</section>\` element — nothing else.`,
  );

  return parts.join("\n");
}

// ─── Single Slide Generator ───────────────────────────────────────────────────

/**
 * Generates a single slide HTML element via LLM call.
 * Uses Opus (via MODELS.PRESENT) with the full presentation design system.
 * Returns a fallback slide on timeout or LLM error.
 */
export async function generateSlide(
  input: SlideGeneratorInput,
): Promise<SlideHTML> {
  const { spec, charts, exemplarHtml, componentRef, findings, deckContext, compositionSpec } =
    input;

  const client = getAnthropicClient();
  const systemPromptText = buildSlideSystemPrompt(
    exemplarHtml,
    componentRef,
    spec,
    compositionSpec,
  );
  const userPrompt = buildSlideUserPrompt(spec, charts, findings, deckContext);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLIDE_TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: MODELS.PRESENT,
        max_tokens: 16_000,
        system: [cachedSystemPrompt(systemPromptText)],
        messages: [{ role: "user", content: userPrompt }],
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const text = response.content
      .filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === "text",
      )
      .map((block) => block.text)
      .join("");

    // Extract the <section> HTML from response
    const sectionMatch = text.match(/<section[\s\S]*<\/section>/);
    if (!sectionMatch) {
      console.warn(
        `[slide-generator] Slide ${spec.slideNumber}: no <section> found in LLM response, using fallback`,
      );
      return generateFallbackSlide(spec, charts);
    }

    // Extract structured content for editor persistence
    const structure = extractSlideStructure(spec, findings);

    return {
      slideNumber: spec.slideNumber,
      html: sectionMatch[0],
      tokensUsed: response.usage?.output_tokens ?? 0,
      status: "success",
      structure,
    };
  } catch (error) {
    clearTimeout(timeout);
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[slide-generator] Slide ${spec.slideNumber} error: ${reason}. Using fallback.`,
    );
    return generateFallbackSlide(spec, charts);
  }
}

// ─── Batch Parallel Generator ─────────────────────────────────────────────────

/**
 * Generates multiple slides in parallel via Promise.allSettled.
 * Rejected promises are retried once individually.
 * If >= 30% of slides fail after retry, throws BatchFailureError to
 * allow the caller to fall back to the legacy monolithic generator.
 */
export async function generateSlidesBatch(
  inputs: SlideGeneratorInput[],
): Promise<SlideHTML[]> {
  if (inputs.length === 0) return [];

  // Parallel first pass
  const settled = await Promise.allSettled(
    inputs.map((input) => generateSlide(input)),
  );

  const slides: SlideHTML[] = [];
  let failCount = 0;

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];

    if (result.status === "fulfilled") {
      slides.push(result.value);
    } else {
      // First pass rejected — retry once individually
      failCount++;
      console.warn(
        `[slide-generator] Batch: slide ${inputs[i].spec.slideNumber} failed (${result.reason}), retrying once.`,
      );

      try {
        const retried = await generateSlide(inputs[i]);
        slides.push(retried);
        // Successful retry — decrement fail count
        failCount--;
      } catch {
        console.warn(
          `[slide-generator] Batch: slide ${inputs[i].spec.slideNumber} retry also failed. Using fallback.`,
        );
        slides.push(generateFallbackSlide(inputs[i].spec, inputs[i].charts));
      }
    }
  }

  // Enforce 30% failure threshold
  if (inputs.length > 0 && failCount / inputs.length >= 0.3) {
    throw new Error(
      `BatchFailureError: ${failCount}/${inputs.length} slides failed (>= 30% threshold). Triggering legacy fallback.`,
    );
  }

  // Return slides sorted by slideNumber to preserve order
  return slides.sort((a, b) => a.slideNumber - b.slideNumber);
}

// ─── Fallback Slide Generator ─────────────────────────────────────────────────

/**
 * Generates a minimal but valid fallback slide using spec metadata
 * and any pre-computed chart fragments. Used when LLM generation fails.
 */
function generateFallbackSlide(
  spec: SlideSpec,
  charts: ChartData[],
): SlideHTML {
  const chartFragments = charts
    .map((c) => {
      if ("svgFragment" in c) return c.svgFragment;
      if ("htmlFragment" in c) return c.htmlFragment;
      return "";
    })
    .filter(Boolean)
    .join("\n");

  const sourcesText = spec.agentSources.join(", ") || "Analysis";

  const html = `<section class="slide gradient-dark" id="s${spec.slideNumber}">
  <div class="slide-bg-glow" style="background:var(--inov-cerulean);top:-200px;right:-200px;"></div>
  <div class="slide-inner">
    <h2 class="slide-title anim-blur d1">${escapeHtml(spec.title)}</h2>
    <p class="section-intro anim d2">${escapeHtml(spec.purpose)}</p>
    ${chartFragments ? `<div class="chart-container anim d3">${chartFragments}</div>` : ""}
  </div>
  <div class="slide-footer">
    <span>PRISM Intelligence</span>
    <span>${escapeHtml(sourcesText)}</span>
    <span>Slide ${spec.slideNumber}</span>
  </div>
</section>`;

  return {
    slideNumber: spec.slideNumber,
    html,
    tokensUsed: 0,
    status: "fallback",
  };
}

// ─── Structure Extraction ─────────────────────────────────────────────────────

/**
 * Extract structured content from the slide spec and findings at generation time.
 * This avoids the fragile problem of reverse-engineering HTML later.
 */
function extractSlideStructure(
  spec: SlideSpec,
  findings: AgentFinding[],
): SlideStructure {
  // Detect background variant from spec type
  const bgMap: Record<string, string> = {
    title: "gradient-dark",
    "executive-summary": "gradient-blue",
    "data-metrics": "gradient-blue",
    "dimension-deep-dive": "dark-mesh",
    emergence: "gradient-radial",
    tension: "dark-particles",
    closing: "gradient-dark",
  };

  return {
    slideNumber: spec.slideNumber,
    templateId: null, // Set by template pipeline if applicable
    backgroundVariant: bgMap[spec.type] ?? "gradient-dark",
    animationType: spec.animationType,
    content: {
      headline: spec.title,
      body: spec.purpose,
      stats: spec.dataPoints
        .filter(dp => dp.chartRole === "counter-target")
        .map(dp => ({
          label: dp.label,
          value: String(dp.value),
          prefix: dp.prefix,
          suffix: dp.unit,
        })),
      chartData: spec.dataPoints
        .filter(dp => dp.chartRole !== "counter-target")
        .map(dp => ({
          type: dp.chartRole,
          label: dp.label,
          value: typeof dp.value === "number" ? dp.value : parseFloat(String(dp.value)) || 0,
          unit: dp.unit,
        })),
      findings: findings.slice(0, 5).map((f, i) => ({
        id: `f-${spec.slideNumber}-${i}`,
        statement: f.statement,
        confidence: f.confidence,
        sourceTier: f.sourceTier,
      })),
      sources: spec.agentSources,
    },
    sourceAgentIds: spec.agentSources,
    sourceFindingIds: findings.slice(0, 5).map((_, i) => `f-${spec.slideNumber}-${i}`),
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
