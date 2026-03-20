/**
 * Slide Planner
 *
 * Decomposes synthesis data into a SlideManifest via an LLM call.
 * Responsibilities:
 * - Build a structured planner prompt from synthesis + agent results
 * - Call Sonnet to generate a JSON SlideManifest
 * - Validate the response with SlideManifestSchema (Zod)
 * - Retry once on JSON parse / schema validation failures
 *
 * Also exports planSlidesWithData() for data-aware template selection
 * using a DatasetRegistry from the data capture pipeline.
 */

import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/client";
import { resolveApiKey } from "@/lib/resolve-api-key";
import { ComponentCatalog } from "./component-catalog";
import { getAllTemplates } from "./template-registry";
import { SlideManifestSchema, SlideTypeSchema } from "./types";
import type {
  AnimationType,
  DataPoint,
  SlideManifest,
  SlideCompositionSpec,
  SlideType,
  SlideSpec,
  PresentInput,
  PlannerInput,
  TemplateSlideManifest,
  TemplateSlideSpec,
} from "./types";
import type { SynthesisResult, AgentResult, Blueprint } from "@/lib/pipeline/types";
import { DEFAULT_COMPOSITION_SPECS } from "./composition-validator";

// Use the specific model version requested for the planner
const PLANNER_MODEL = "claude-sonnet-4-20250514";

// ─── Prompt Builders ──────────────────────────────────────────────────────────

/**
 * Build the agent roster section: name, archetype, dimension, finding count.
 */
function buildAgentRoster(agentResults: AgentResult[], blueprint: Blueprint): string {
  return agentResults
    .map((ar) => {
      const bpAgent = blueprint.agents.find(
        (a) => a.name === ar.agentName || a.dimension === ar.dimension,
      );
      const lens = bpAgent ? ` | Lens: ${bpAgent.lens}` : "";
      return `- ${ar.agentName} (${ar.archetype}) — Dimension: ${ar.dimension}${lens} | Findings: ${ar.findings.length}`;
    })
    .join("\n");
}

/**
 * Format synthesis layers: name + description + key insights.
 */
function buildSynthesisLayers(synthesis: SynthesisResult): string {
  return synthesis.layers
    .map(
      (layer) =>
        `### ${layer.name.toUpperCase()} Layer\n${layer.description}\n` +
        layer.insights.slice(0, 3).map((ins) => `- ${ins}`).join("\n"),
    )
    .join("\n\n");
}

/**
 * Format emergent insights (or indicate none).
 */
function buildEmergentInsights(synthesis: SynthesisResult): string {
  if (synthesis.emergentInsights.length === 0) {
    return "No emergent insights detected — do NOT include an 'emergence' slide.";
  }

  return synthesis.emergentInsights
    .map(
      (ei, i) =>
        `${i + 1}. **${ei.insight}**\n` +
        `   Algorithm: ${ei.algorithm}\n` +
        `   Supporting agents: ${ei.supportingAgents.join(", ")}\n` +
        `   Why only multi-agent finds this: ${ei.whyMultiAgent}`,
    )
    .join("\n\n");
}

/**
 * Format tension points (or indicate none).
 */
function buildTensionPoints(synthesis: SynthesisResult): string {
  if (synthesis.tensionPoints.length === 0) {
    return "No significant tension points — do NOT include a 'tension' slide.";
  }

  return synthesis.tensionPoints
    .map(
      (tp) =>
        `**${tp.tension}** (${tp.conflictType})\n` +
        `  Side A: ${tp.sideA.position} — agents: ${tp.sideA.agents.join(", ")}\n` +
        `  Side B: ${tp.sideB.position} — agents: ${tp.sideB.agents.join(", ")}\n` +
        `  Resolution: ${tp.resolution}`,
    )
    .join("\n\n");
}

/**
 * Derive appropriate slide count guidance from blueprint tier.
 */
function getSlideCountGuidance(blueprint: Blueprint): string {
  const ranges: Record<string, string> = {
    MICRO: "8-10",
    STANDARD: "10-13",
    EXTENDED: "13-16",
    MEGA: "16-20",
    CAMPAIGN: "16-20",
  };
  const range = ranges[blueprint.tier] ?? "10-13";
  return `${range} slides for ${blueprint.tier} tier with ${blueprint.agents.length} agents`;
}

const CROSSCUTTING_SLIDE_TYPES = new Set<SlideType>([
  "title",
  "findings-toc",
  "executive-summary",
  "closing",
]);

const TITLE_HINTS = [
  "hero-title",
  "hero-sub",
  "hero-stats",
  "hero-badge",
  "agent-chip",
  "validation-box",
  "stagger-children",
];

const FINDINGS_TOC_HINTS = [
  "toc-group-header",
  "toc-item",
  "callout",
  "icon-grid",
  "tooltip-wrap",
  "stagger-children",
];

const EXEC_SUMMARY_HINTS = [
  "stat-block",
  "sparkline",
  "comparison-bars",
  "callout",
  "feature-grid",
  "tooltip-wrap",
  "stagger-children",
];

const EMERGENCE_HINTS = [
  "emergence-card",
  "emergent-why",
  "emergent-number",
  "tab-group",
  "callout",
];

const TENSION_HINTS = [
  "grid-2",
  "finding-card",
  "comparison-bars",
  "threat-meter",
  "callout",
  "tooltip-wrap",
];

const CLOSING_HINTS = [
  "hero-title",
  "hero-sub",
  "callout",
  "feature-grid",
  "icon-grid",
  "process-flow",
  "tag-cyan",
];

const DEEP_DIVE_HINT_VARIANTS = [
  ["finding-card", "confidence-badge", "callout", "quote-block", "tooltip-wrap", "tag"],
  ["finding-card", "confidence-badge", "tab-group", "callout", "tooltip-wrap", "tag"],
  ["finding-card", "confidence-badge", "process-flow", "icon-grid", "tooltip-wrap", "tag"],
];

const DATA_METRICS_HINT_VARIANTS = [
  ["stat-block", "stat-number", "line-chart", "sparkline", "callout", "stagger-children"],
  ["stat-block", "stat-number", "bar-chart", "comparison-bars", "callout", "stagger-children"],
  ["stat-block", "stat-number", "donut-chart", "comparison-bars", "callout", "feature-grid", "stagger-children"],
];

const DEEP_DIVE_ANIMATIONS: AnimationType[] = [
  "anim-blur",
  "stagger-children",
  "anim-scale",
];

const DATA_METRICS_ANIMATIONS: AnimationType[] = [
  "stagger-children",
  "anim-scale",
  "anim-spring",
];

/**
 * Build the full planner user prompt from synthesis + agent results + blueprint.
 */
export function buildPlannerUserPrompt(
  synthesis: SynthesisResult,
  agentResults: AgentResult[],
  blueprint: Blueprint,
): string {
  const agentRoster = buildAgentRoster(agentResults, blueprint);
  const synthesisLayers = buildSynthesisLayers(synthesis);
  const emergentInsights = buildEmergentInsights(synthesis);
  const tensionPoints = buildTensionPoints(synthesis);
  const slideCountGuidance = getSlideCountGuidance(blueprint);

  const totalFindings = agentResults.reduce((sum, ar) => sum + ar.findings.length, 0);

  return `# Slide Planner Request

## Query
${blueprint.query}

## Swarm Configuration
- Tier: ${blueprint.tier}
- Agent count: ${blueprint.agents.length}
- Total findings: ${totalFindings}
- Overall confidence: ${synthesis.overallConfidence}

## Target Slide Count
${slideCountGuidance}

## Agent Roster
${agentRoster}

## Synthesis Layers
${synthesisLayers}

## Emergent Insights
${emergentInsights}

## Tension Points
${tensionPoints}

## Slide Type Assignment Rules

Use these slide types from the allowed enum:
- "title" — Opening hero slide (MANDATORY — always exactly 1, always slide #1)
- "findings-toc" — Table of contents with grouped navigation (MANDATORY — always exactly 1, always slide #2)
- "executive-summary" — 3-4 key takeaways with an executive callout, KPI surface, and prioritization view (MANDATORY — always exactly 1, always slide #3)
- "dimension-deep-dive" — One per agent/dimension; rich qualitative analysis; use tabs, process-flow, icon-grid, quotes, and callouts before defaulting to accordions
- "data-metrics" — For numeric/quantitative findings; favor mixed chart grammar (line/sparkline for time series, donut for composition, comparison-bars for prioritization)
- "emergence" — ONLY if emergent insights exist (use at most 1); componentHints: ["emergence-card","emergent-why"]
- "tension" — ONLY if tension points exist (use at most 1); componentHints: ["grid-2","finding-card"]
- "closing" — Final call-to-action slide (MANDATORY — always exactly 1, always last slide)

CRITICAL ORDERING: The first three slides MUST be: title → findings-toc → executive-summary. The closing slide MUST be last. Never omit any MANDATORY slide.

## Animation Type Assignment Rules
Distribute these animation types across the deck — DO NOT use "anim" for every slide:
- "anim" — Default fade-up, use for findings-toc and standard slides
- "anim-scale" — Cards and stat blocks, use for data-metrics and closing slides
- "anim-blur" — Hero text reveals, use for title and emergence slides
- "anim-slide-left" — Left column in tension/comparison slides
- "anim-slide-right" — Right column in tension/comparison slides
- "anim-spring" — Bouncy emphasis for executive-summary highlights
- "anim-fade" — Subtle entrance for source lists and footnotes
- "anim-zoom" — Dramatic reveal for emergence slides (use sparingly, max 1-2)
- "stagger-children" — Auto-staggers grid children, use for data-metrics and deep-dive grids

CRITICAL: Each slide's animationType should be the PRIMARY animation class for that slide. The slide generator will also apply supporting classes. Vary animation types across the deck — if you use "anim" for one dimension-deep-dive, use "anim-scale" or "stagger-children" for the next.

## Component Hints Rules
- dimension-deep-dive slides → ["finding-card", "confidence-badge", "callout", "quote-block", "tab-group", "process-flow", "icon-grid", "tooltip-wrap"] and DO NOT make accordion the primary organizing device unless details truly need collapsing
- data-metrics slides → ["stat-block", "stat-number", "line-chart", "sparkline", "comparison-bars", "callout", "stagger-children"] and use bar-chart only when ranking or chronology does not fit better
- emergence slides → ["emergence-card", "emergent-why", "emergent-number", "tab-group", "callout", "anim-zoom"]
- tension slides → ["grid-2", "finding-card", "comparison-bars", "threat-meter", "callout", "anim-slide-left", "anim-slide-right"]
- executive-summary slides → ["stat-block", "sparkline", "comparison-bars", "callout", "feature-grid", "tooltip-wrap"]
- title slides → ["hero-title", "hero-stats", "agent-chip", "hero-badge", "stagger-children", "anim-blur"]
- closing slides → ["hero-title", "hero-sub", "callout", "feature-grid", "icon-grid", "process-flow", "tag-cyan"]
- findings-toc slides → ["toc-group-header", "toc-item", "callout", "icon-grid", "tooltip-wrap", "stagger-children"]

## Quality Bar
- This deck should feel like a premium executive briefing, not a report dump.
- findings-toc must behave like an intelligence map, not a plain list.
- executive-summary must combine a decisive callout, a metric surface, and a prioritization frame.
- emergence and tension slides must be diagrammatic and compressed; avoid long paragraphs.
- For decks with 10+ slides, include at least one icon-grid or feature-grid slide, one tab-group or process-flow slide, and one comparison-bars slide.
- Never make accordion the primary organizing device on adjacent slides.

## agentSources Field
For each dimension/data-metrics slide, set agentSources to the list of agent names that inform that slide.
For cross-cutting slides (title, summary, closing), set agentSources to all agent names.

## dataPoints Field
Extract 1-3 numeric data points per slide where meaningful. Each dataPoint needs:
- label: descriptive label
- value: a number (integer or float)
- unit: optional unit string (e.g. "%", "M", "B")
- prefix: optional prefix (e.g. "$")
- chartRole: one of "donut-segment", "bar-value", "sparkline-point", "counter-target", "bar-fill-percent", "line-point"

For qualitative slides with no clear metrics, dataPoints may be an empty array [].

## dataPoints Chart Role Guidance
- Use "line-point" or "sparkline-point" when labels are temporal (years, quarters, phases, trend sequences).
- Use "donut-segment" for composition, mix, share, or distribution views.
- Use "bar-fill-percent" for readiness, prioritization, or score-like comparisons that naturally fit a 0-100 scale.
- Use "bar-value" for ranked comparisons that are not percentages.
- Use "counter-target" for hero KPIs you want called out as the largest number on the slide.

## Output Format

Respond with ONLY a valid JSON object matching this schema:
{
  "title": "PRISM Intelligence Brief — <short query summary>",
  "subtitle": "<N>-agent <tier> analysis spanning <dimension names>",
  "totalSlides": <integer>,
  "slides": [
    {
      "slideNumber": 1,
      "title": "Slide Title",
      "type": "<slide type>",
      "purpose": "One-sentence purpose of this slide",
      "agentSources": ["Agent Name 1", "Agent Name 2"],
      "componentHints": ["class-name-1", "class-name-2"],
      "animationType": "anim",
      "dataPoints": [
        { "label": "Label", "value": 42, "unit": "%", "chartRole": "counter-target" }
      ]
    }
  ]
}

The slides array must contain exactly totalSlides entries with sequential slideNumber values starting at 1.
OUTPUT ONLY THE JSON OBJECT. No markdown fences, no explanation text.`;
}

// ─── Mandatory Slide Enforcement ──────────────────────────────────────────────

/**
 * Ensure the manifest includes all mandatory slide types.
 * If the LLM omitted a required slide, inject it at the correct position
 * and renumber all slides.
 */
function enforceMandatorySlides(manifest: SlideManifest, agentResults: AgentResult[]): SlideManifest {
  const allAgentNames = agentResults.map((ar) => ar.agentName);
  const slides = [...manifest.slides];

  const hasType = (type: string) => slides.some((s) => s.type === type);

  // Ensure title is slide #1
  if (!hasType("title")) {
    slides.unshift({
      slideNumber: 1,
      title: manifest.title,
      type: "title",
      purpose: "Opening hero slide with dramatic title and PRISM branding",
      agentSources: allAgentNames,
      componentHints: ["hero-title", "hero-stats", "agent-chip", "hero-badge"],
      animationType: "anim-scale",
      dataPoints: [],
    });
  }

  // Ensure findings-toc exists (should be slide #2)
  if (!hasType("findings-toc")) {
    const tocSlide = {
      slideNumber: 2,
      title: "Intelligence Map",
      type: "findings-toc" as const,
      purpose: "Table of contents with grouped navigation to each analysis dimension",
      agentSources: allAgentNames,
      componentHints: ["toc-group-header", "toc-item", "tag"],
      animationType: "anim" as const,
      dataPoints: [],
    };
    // Insert after title
    const titleIdx = slides.findIndex((s) => s.type === "title");
    slides.splice(titleIdx + 1, 0, tocSlide);
  }

  // Ensure executive-summary exists (should be slide #3)
  if (!hasType("executive-summary")) {
    const execSlide = {
      slideNumber: 3,
      title: "Executive Summary",
      type: "executive-summary" as const,
      purpose: "3-4 key takeaways distilled from multi-agent synthesis",
      agentSources: allAgentNames,
      componentHints: ["finding-card", "card-blue", "card-green", "confidence-badge"],
      animationType: "anim" as const,
      dataPoints: [],
    };
    // Insert after findings-toc
    const tocIdx = slides.findIndex((s) => s.type === "findings-toc");
    slides.splice(tocIdx + 1, 0, execSlide);
  }

  // Ensure closing is present
  if (!hasType("closing")) {
    slides.push({
      slideNumber: slides.length + 1,
      title: "Strategic Outlook",
      type: "closing",
      purpose: "Final call-to-action with key recommendations",
      agentSources: allAgentNames,
      componentHints: ["hero-title", "hero-sub", "tag-cyan"],
      animationType: "anim-scale",
      dataPoints: [],
    });
  }

  // Renumber all slides sequentially
  slides.forEach((s, i) => (s.slideNumber = i + 1));

  return {
    ...manifest,
    slides,
    totalSlides: slides.length,
  };
}

function mergeUniqueClasses(...classGroups: readonly string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of classGroups) {
    for (const cls of group) {
      if (!cls || seen.has(cls)) continue;
      seen.add(cls);
      merged.push(cls);
    }
  }
  return merged;
}

function getVariant<T>(variants: readonly T[], index: number): T {
  return variants[index % variants.length];
}

function hasTemporalLabel(dataPoints: DataPoint[]): boolean {
  return dataPoints.some((dp) =>
    /^(?:fy)?20\d{2}$|^q[1-4]\b|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|^phase\b|^wave\b/i.test(
      dp.label.trim(),
    ),
  );
}

function prefersTemporalCharts(slide: SlideSpec): boolean {
  const text = `${slide.title} ${slide.purpose}`.toLowerCase();
  return (
    /trend|trajectory|momentum|growth|decline|forecast|history|historical|over time|timeline|phasing|phase[- ]?in|adoption curve|run-rate/.test(
      text,
    ) || hasTemporalLabel(slide.dataPoints)
  );
}

function prefersCompositionCharts(slide: SlideSpec): boolean {
  const text = `${slide.title} ${slide.purpose}`.toLowerCase();
  return /mix|share|split|composition|distribution|allocation|portfolio|coverage mix/.test(
    text,
  );
}

function prefersPriorityBars(slide: SlideSpec): boolean {
  const text = `${slide.title} ${slide.purpose}`.toLowerCase();
  return /priority|priorit|rank|ranking|readiness|score|benchmark|compare|comparison|gap|opportunit|risk|trade-?off|watchlist/.test(
    text,
  );
}

function shouldUsePercentBars(points: DataPoint[]): boolean {
  return points.every(
    (pt) => (pt.unit === "%" || (pt.value >= 0 && pt.value <= 100)),
  );
}

function toCounterPoint(point: DataPoint): DataPoint {
  return { ...point, chartRole: "counter-target" as const };
}

function normalizeDataPointsForSlide(slide: SlideSpec): DataPoint[] {
  const points = slide.dataPoints.filter((pt) => Number.isFinite(pt.value));
  if (points.length === 0 || slide.type === "findings-toc") return [];

  if (slide.type === "title" || slide.type === "closing") {
    return points.slice(0, Math.min(points.length, 3)).map(toCounterPoint);
  }

  if (slide.type === "executive-summary") {
    const counters = points.slice(0, 1).map(toCounterPoint);
    const priorityPoints = points
      .slice(counters.length)
      .map((pt) => ({
        ...pt,
        chartRole: shouldUsePercentBars(points) ? "bar-fill-percent" as const : "bar-value" as const,
      }));
    return [...counters, ...priorityPoints];
  }

  if (prefersTemporalCharts(slide) && points.length >= 3) {
    return [toCounterPoint(points[points.length - 1]), ...points.map((pt) => ({
      ...pt,
      chartRole: "line-point" as const,
    }))];
  }

  if (prefersCompositionCharts(slide) && points.length >= 2) {
    const topPoint = [...points].sort((a, b) => b.value - a.value)[0];
    return [toCounterPoint(topPoint), ...points.map((pt) => ({
      ...pt,
      chartRole: "donut-segment" as const,
    }))];
  }

  if (prefersPriorityBars(slide) && points.length >= 2) {
    const chartRole: "bar-fill-percent" | "bar-value" = shouldUsePercentBars(points) ? "bar-fill-percent" : "bar-value";
    const lead = [...points].sort((a, b) => b.value - a.value)[0];
    return [toCounterPoint(lead), ...points.map((pt) => ({ ...pt, chartRole }))];
  }

  if (slide.type === "data-metrics") {
    return [toCounterPoint(points[0]), ...points.map((pt) => ({
      ...pt,
      chartRole: "bar-value" as const,
    }))];
  }

  return points.slice(0, Math.min(points.length, 2)).map(toCounterPoint);
}

function pickComponentHints(
  slide: SlideSpec,
  occurrenceIndex: number,
): string[] {
  switch (slide.type) {
    case "title":
      return mergeUniqueClasses(TITLE_HINTS, slide.componentHints);
    case "findings-toc":
      return mergeUniqueClasses(FINDINGS_TOC_HINTS, slide.componentHints);
    case "executive-summary":
      return mergeUniqueClasses(EXEC_SUMMARY_HINTS, slide.componentHints);
    case "emergence":
      return mergeUniqueClasses(EMERGENCE_HINTS, slide.componentHints);
    case "tension":
      return mergeUniqueClasses(TENSION_HINTS, slide.componentHints);
    case "closing":
      return mergeUniqueClasses(CLOSING_HINTS, slide.componentHints);
    case "data-metrics":
      return mergeUniqueClasses(
        getVariant(DATA_METRICS_HINT_VARIANTS, occurrenceIndex),
        slide.componentHints,
      );
    case "dimension-deep-dive":
    default:
      return mergeUniqueClasses(
        getVariant(DEEP_DIVE_HINT_VARIANTS, occurrenceIndex),
        slide.componentHints,
      );
  }
}

function pickAnimationType(
  slideType: SlideType,
  occurrenceIndex: number,
): AnimationType {
  switch (slideType) {
    case "title":
      return "anim-blur";
    case "findings-toc":
      return "stagger-children";
    case "executive-summary":
      return "anim-spring";
    case "data-metrics":
      return getVariant(DATA_METRICS_ANIMATIONS, occurrenceIndex);
    case "dimension-deep-dive":
      return getVariant(DEEP_DIVE_ANIMATIONS, occurrenceIndex);
    case "emergence":
      return "anim-zoom";
    case "tension":
      return "anim-slide-left";
    case "closing":
      return "anim-spring";
    default:
      return "anim";
  }
}

function createLegacyRequiredSlide(
  type: Extract<SlideType, "title" | "findings-toc" | "executive-summary" | "closing">,
  title: string,
  allAgentNames: string[],
): SlideSpec {
  switch (type) {
    case "title":
      return {
        slideNumber: 1,
        title,
        type,
        purpose: "Opening hero slide with dramatic title and PRISM branding",
        agentSources: allAgentNames,
        componentHints: [...TITLE_HINTS],
        animationType: "anim-blur",
        dataPoints: [],
      };
    case "findings-toc":
      return {
        slideNumber: 2,
        title: "Intelligence Map",
        type,
        purpose: "Orient the reader to the narrative spine, decision lenses, and major sections of the brief",
        agentSources: allAgentNames,
        componentHints: [...FINDINGS_TOC_HINTS],
        animationType: "stagger-children",
        dataPoints: [],
      };
    case "executive-summary":
      return {
        slideNumber: 3,
        title: "Executive Summary",
        type,
        purpose: "Condense the highest-impact findings into a decisive executive briefing with metrics, priorities, and action framing",
        agentSources: allAgentNames,
        componentHints: [...EXEC_SUMMARY_HINTS],
        animationType: "anim-spring",
        dataPoints: [],
      };
    case "closing":
      return {
        slideNumber: 4,
        title: "Strategic Outlook",
        type,
        purpose: "Close with recommended moves, sequencing, and the signals leadership should watch next",
        agentSources: allAgentNames,
        componentHints: [...CLOSING_HINTS],
        animationType: "anim-spring",
        dataPoints: [],
      };
  }
}

export function normalizeLegacyManifest(
  manifest: SlideManifest,
  agentResults: AgentResult[],
): SlideManifest {
  const allAgentNames = agentResults.map((agent) => agent.agentName);
  const slides = [...manifest.slides];

  const pickFirstByType = (type: SlideType): SlideSpec | undefined =>
    slides.find((slide) => slide.type === type);

  const titleSlide =
    pickFirstByType("title") ??
    createLegacyRequiredSlide("title", manifest.title, allAgentNames);
  const tocSlide =
    pickFirstByType("findings-toc") ??
    createLegacyRequiredSlide("findings-toc", manifest.title, allAgentNames);
  const summarySlide =
    pickFirstByType("executive-summary") ??
    createLegacyRequiredSlide("executive-summary", manifest.title, allAgentNames);
  const closingSlide =
    [...slides].reverse().find((slide) => slide.type === "closing") ??
    createLegacyRequiredSlide("closing", manifest.title, allAgentNames);

  const protectedSlides = new Set([titleSlide, tocSlide, summarySlide, closingSlide]);
  const bodySlides = slides.filter(
    (slide) => !protectedSlides.has(slide) && !CROSSCUTTING_SLIDE_TYPES.has(slide.type),
  );

  const orderedSlides = [titleSlide, tocSlide, summarySlide, ...bodySlides, closingSlide];
  const typeCounts = new Map<SlideType, number>();

  const normalizedSlides = orderedSlides.map((slide, index) => {
    const occurrenceIndex = typeCounts.get(slide.type) ?? 0;
    typeCounts.set(slide.type, occurrenceIndex + 1);

    const normalized: SlideSpec = {
      ...slide,
      slideNumber: index + 1,
      agentSources:
        CROSSCUTTING_SLIDE_TYPES.has(slide.type)
          ? allAgentNames
          : slide.agentSources.length > 0
            ? slide.agentSources
            : allAgentNames,
      componentHints: pickComponentHints(slide, occurrenceIndex),
      animationType: pickAnimationType(slide.type, occurrenceIndex),
    };

    return {
      ...normalized,
      dataPoints: normalizeDataPointsForSlide(normalized),
    };
  });

  return {
    ...manifest,
    slides: normalizedSlides,
    totalSlides: normalizedSlides.length,
  };
}

// ─── Composition Spec Builder ────────────────────────────────────────────────

/**
 * Background variant assignment by slide type.
 * Adjacent slides never share the same background.
 */
const SLIDE_TYPE_BACKGROUNDS: Partial<Record<SlideType, string>> = {
  "title": "gradient-dark",
  "findings-toc": "gradient-dark",
  "dimension-deep-dive": "gradient-blue",
  "data-metrics": "gradient-blue",
  "emergence": "dark-particles",
  "tension": "gradient-radial",
  "executive-summary": "gradient-dark",
  "closing": "gradient-dark",
};

const BG_ALTERNATES: Record<string, string> = {
  "gradient-dark": "dark-mesh",
  "gradient-blue": "dark-mesh",
  "dark-mesh": "gradient-blue",
  "dark-particles": "gradient-radial",
  "gradient-radial": "dark-particles",
};

/**
 * Build composition specs for every slide in a manifest.
 * Ensures no two adjacent slides share the same background variant.
 */
export function buildCompositionSpecs(
  manifest: SlideManifest,
): Map<number, SlideCompositionSpec> {
  const specs = new Map<number, SlideCompositionSpec>();
  let prevBg = "";

  for (const slide of manifest.slides) {
    const slideType = slide.type as SlideType;
    const defaults = DEFAULT_COMPOSITION_SPECS[slideType] ?? DEFAULT_COMPOSITION_SPECS["dimension-deep-dive"];

    // Assign background, ensuring no adjacent same
    let bg = SLIDE_TYPE_BACKGROUNDS[slideType] ?? "gradient-dark";
    if (bg === prevBg) {
      bg = BG_ALTERNATES[bg] ?? "dark-mesh";
    }
    prevBg = bg;

    const spec: SlideCompositionSpec = {
      ...defaults,
      backgroundVariant: bg,
      // If the slide has data points, upgrade chart requirement
      chartRequirement: slide.dataPoints.length > 0
        ? (slide.dataPoints.length >= 4 ? "multiple" : "one")
        : defaults.chartRequirement,
    };

    specs.set(slide.slideNumber, spec);
  }

  return specs;
}

// ─── Main Planner Function ────────────────────────────────────────────────────

/**
 * Plan the slide deck structure from synthesis data.
 *
 * Makes an LLM call to decompose the synthesis result into a SlideManifest —
 * a structured list of slide specs that downstream generators will render.
 * Retries once on JSON or schema validation failures.
 */
export async function planSlides(input: PresentInput): Promise<SlideManifest> {
  const { synthesis, agentResults, blueprint, emitEvent } = input;

  emitEvent?.({
    type: "phase_change",
    phase: "PRESENT_PLANNING",
    message: "Planning slide deck structure...",
  });

  const catalog = new ComponentCatalog();
  const client = getAnthropicClient();
  const systemPrompt = catalog.plannerSystemPrompt();
  const userPrompt = buildPlannerUserPrompt(synthesis, agentResults, blueprint);

  async function attemptPlan(systemOverride?: string, userSuffix?: string): Promise<SlideManifest> {
    const response = await client.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 8192,
      system: systemOverride ?? systemPrompt,
      messages: [
        {
          role: "user",
          content: userSuffix ? userPrompt + userSuffix : userPrompt,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((block) => (block as any).text as string)
      .join("");

    // Strip markdown fences if present
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in planner response");
    }

    let parsed: unknown;
    try {
      // Repair common LLM JSON issues: trailing commas before ] or }
      const repaired = jsonMatch[0]
        .replace(/,\s*]/g, "]")
        .replace(/,\s*}/g, "}");
      parsed = JSON.parse(repaired);
    } catch (e) {
      throw new Error(`Planner response is not valid JSON: ${(e as Error).message}`);
    }

    // Validate with Zod schema
    const manifest = SlideManifestSchema.parse(parsed);

    // Programmatic enforcement: ensure mandatory slide types are present and
    // normalize the deck toward a premium executive-briefing shape.
    return normalizeLegacyManifest(
      enforceMandatorySlides(manifest, agentResults),
      agentResults,
    );
  }

  try {
    return await attemptPlan();
  } catch (firstError) {
    const errMsg = (firstError as Error).message ?? "";
    const isJsonError = errMsg.includes("No JSON") || errMsg.includes("not valid JSON");
    const isZodError = (firstError as Error).name === "ZodError";

    if (isJsonError || isZodError) {
      console.warn("[PLANNER] First attempt failed, retrying with stricter instruction:", errMsg);

      try {
        return await attemptPlan(
          "You are a JSON generator. Output ONLY a valid JSON object matching the SlideManifest schema. No markdown, no explanation, no code fences.",
          "\n\nOUTPUT VALID JSON ONLY. The JSON must start with { and end with }.",
        );
      } catch (retryError) {
        throw new Error(
          `Slide planner failed after retry: ${(retryError as Error).message}`,
        );
      }
    }

    throw firstError;
  }
}

// ─── Data-Aware Planner (Template-Based) ──────────────────────────────────────

const SlideIntentSchema = z.enum([
  "context", "evidence", "comparison", "trend", "composition",
  "ranking", "process", "recommendation", "summary", "transition",
]);

const NarrativeArcSchema = z.object({
  opening: z.string(),
  development: z.string(),
  climax: z.string(),
  resolution: z.string(),
});

const TemplateSlideSpecSchema = z.object({
  index: z.number(),
  templateId: z.string(),
  title: z.string().optional(),
  type: SlideTypeSchema.optional(),
  slideIntent: SlideIntentSchema,
  narrativePosition: z.string(),
  datasetBindings: z.object({
    chartSlots: z.record(z.string(), z.string()),
    statSources: z.record(z.string(), z.string()),
  }),
  transitionFrom: z.string().nullable(),
  transitionTo: z.string().nullable(),
  slideClass: z.string(),
  accentColor: z.string(),
});

export const TemplateSlideManifestSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  thesis: z.string(),
  narrativeArc: NarrativeArcSchema,
  slides: z.array(TemplateSlideSpecSchema).min(1),
});

/**
 * Data-aware slide planner that uses the DatasetRegistry to select
 * templates based on data shapes, density tiers, and chart-worthiness.
 *
 * This is the new pipeline entry point; the legacy planSlides() is
 * preserved above for backward compatibility.
 */
export async function planSlidesWithData(
  input: PlannerInput,
): Promise<TemplateSlideManifest> {
  const apiKey = await resolveApiKey("anthropic");
  const client = new Anthropic({ apiKey: apiKey ?? undefined });

  // Rank datasets by chart-worthiness
  const rankedDatasets = [...input.datasetRegistry.datasets]
    .sort((a, b) => b.chartWorthiness - a.chartWorthiness);

  // Build template catalog summary
  const templateCatalog = getAllTemplates().map(t => ({
    id: t.id,
    name: t.name,
    category: t.category,
    dataShapes: t.dataShapes,
    densityRange: t.densityRange,
  }));

  // Compute adaptive slide count
  const strongSlides = rankedDatasets.filter(d => d.chartWorthiness > 40).length;
  const contentSlides = Math.ceil(input.keyInsights.length / 2);
  const recommendedCount = Math.min(
    input.maxSlides,
    Math.max(8, strongSlides + contentSlides + 2),
  );

  const prompt = `You are a presentation architect. Design a ${recommendedCount}-slide deck.

## Brief
${input.brief}

## Thesis
${input.deckThesis}

## Audience
${input.audience}

## Key Insights
${input.keyInsights.map(i => `- ${i}`).join("\n")}

## Available Datasets (ranked by chart-worthiness)
${JSON.stringify(rankedDatasets.map(d => ({
  id: d.id, metricName: d.metricName, dataShape: d.dataShape,
  densityTier: d.densityTier, pointCount: d.values.length,
  chartWorthiness: d.chartWorthiness, sourceLabel: d.sourceLabel,
})), null, 2)}

## Template Catalog
${JSON.stringify(templateCatalog, null, 2)}

## Rules
- The deck MUST include these slide types in this order: title, findings-toc, executive-summary, body slides, closing
- The title slide must use SF-05
- The findings-toc and executive-summary slides must appear immediately after the title
- The closing slide must be the final slide
- Select templates that match dataset data shapes and density ranges
- Bind high chart-worthiness datasets to chart slots
- No template used more than twice
- Adjacent slides must NOT share the same slideClass + accentColor
- Accent colors: cyan, green, purple, orange — distribute evenly
- Slide classes: gradient-dark, gradient-blue, gradient-radial, dark-mesh, dark-particles
- slideIntent must be one of: context, evidence, comparison, trend, composition, ranking, process, recommendation, summary, transition
- type must be one of: title, findings-toc, executive-summary, dimension-deep-dive, data-metrics, emergence, tension, closing
- title must be a concise human-readable slide label

Return a JSON object matching this schema:
{
  "title": "string",
  "subtitle": "string",
  "thesis": "string",
  "narrativeArc": { "opening": "...", "development": "...", "climax": "...", "resolution": "..." },
  "slides": [{ "index": 0, "templateId": "SF-05", "title": "Cover", "type": "title", "slideIntent": "transition", "narrativePosition": "...", "datasetBindings": { "chartSlots": {}, "statSources": {} }, "transitionFrom": null, "transitionTo": "...", "slideClass": "...", "accentColor": "..." }, ...]
}`;

  const response = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in planner LLM response");
  }

  let jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  const parsed = JSON.parse(jsonStr);
  const validated = TemplateSlideManifestSchema.parse(parsed);

  return normalizeTemplateManifest(validated, input);
}

type TemplateSlideDraft = z.infer<typeof TemplateSlideSpecSchema>;
type TemplateManifestDraft = z.infer<typeof TemplateSlideManifestSchema>;

function normalizeTemplateManifest(
  manifest: TemplateManifestDraft,
  input: PlannerInput,
): TemplateSlideManifest {
  const rankedDatasets = [...input.datasetRegistry.datasets]
    .sort((a, b) => b.chartWorthiness - a.chartWorthiness);
  const slides = manifest.slides.map((slide, index) =>
    normalizeTemplateSlide(slide, index),
  );
  const usedIndexes = new Set<number>();

  const openingSlides = [
    pickOrCreateRequiredSlide(
      slides,
      usedIndexes,
      (slide) => slide.type === "title" || slide.templateId === "SF-05",
      () => createRequiredSlide("title", manifest, rankedDatasets),
    ),
    pickOrCreateRequiredSlide(
      slides,
      usedIndexes,
      (slide) => slide.type === "findings-toc",
      () => createRequiredSlide("findings-toc", manifest, rankedDatasets),
    ),
    pickOrCreateRequiredSlide(
      slides,
      usedIndexes,
      (slide) => slide.type === "executive-summary" || slide.slideIntent === "summary",
      () => createRequiredSlide("executive-summary", manifest, rankedDatasets),
    ),
  ];

  const closingSlide = pickOrCreateRequiredSlide(
    slides,
    usedIndexes,
    (slide) => slide.type === "closing",
    () => createRequiredSlide("closing", manifest, rankedDatasets),
  );

  const bodyBudget = Math.max(input.maxSlides - openingSlides.length - 1, 0);
  const bodySlides = slides
    .filter((_, index) => !usedIndexes.has(index))
    .filter((slide) => slide.type !== "closing")
    .slice(0, bodyBudget);

  const orderedSlides = [...openingSlides, ...bodySlides, closingSlide].map((slide, index, all) => ({
    ...slide,
    index,
    transitionFrom: index === 0 ? null : all[index - 1]?.slideIntent ?? null,
    transitionTo: index === all.length - 1 ? null : all[index + 1]?.slideIntent ?? null,
  }));

  return {
    title: manifest.title,
    subtitle: manifest.subtitle,
    thesis: manifest.thesis,
    narrativeArc: manifest.narrativeArc,
    slides: orderedSlides,
  };
}

function normalizeTemplateSlide(
  slide: TemplateSlideDraft,
  index: number,
): TemplateSlideSpec {
  const inferredType = inferSlideType(slide, index);
  return {
    index,
    templateId: slide.templateId,
    title: slide.title?.trim() || defaultTitleForType(inferredType),
    type: inferredType,
    slideIntent: slide.slideIntent,
    narrativePosition: slide.narrativePosition,
    datasetBindings: slide.datasetBindings,
    transitionFrom: slide.transitionFrom,
    transitionTo: slide.transitionTo,
    slideClass: slide.slideClass,
    accentColor: slide.accentColor,
  };
}

function inferSlideType(slide: TemplateSlideDraft, index: number): SlideType {
  if (slide.type) return slide.type;
  if (slide.templateId === "SF-05") return "title";
  if (slide.templateId === "CL-08") return "findings-toc";
  if (slide.templateId === "CO-06") return "executive-summary";
  if (slide.templateId === "CO-05" && index > 1) return "closing";

  switch (slide.slideIntent) {
    case "summary":
      return "executive-summary";
    case "trend":
    case "comparison":
    case "composition":
    case "ranking":
    case "evidence":
      return "data-metrics";
    case "process":
    case "context":
    case "transition":
    case "recommendation":
    default:
      return "dimension-deep-dive";
  }
}

function defaultTitleForType(type: SlideType): string {
  switch (type) {
    case "title":
      return "Cover";
    case "findings-toc":
      return "What This Brief Covers";
    case "executive-summary":
      return "Executive Summary";
    case "closing":
      return "Recommended Next Moves";
    case "emergence":
      return "Emergent Insight";
    case "tension":
      return "Critical Tension";
    case "dimension-deep-dive":
      return "Strategic Context";
    case "data-metrics":
    default:
      return "Evidence";
  }
}

function pickOrCreateRequiredSlide(
  slides: TemplateSlideSpec[],
  usedIndexes: Set<number>,
  matcher: (slide: TemplateSlideSpec) => boolean,
  createFallback: () => TemplateSlideSpec,
): TemplateSlideSpec {
  const foundIndex = slides.findIndex((slide, index) => !usedIndexes.has(index) && matcher(slide));
  if (foundIndex >= 0) {
    usedIndexes.add(foundIndex);
    return slides[foundIndex];
  }
  return createFallback();
}

function createRequiredSlide(
  type: Extract<SlideType, "title" | "findings-toc" | "executive-summary" | "closing">,
  manifest: TemplateManifestDraft,
  rankedDatasets: PlannerInput["datasetRegistry"]["datasets"],
): TemplateSlideSpec {
  const topDatasetIds = rankedDatasets.slice(0, 3).map((dataset) => dataset.id);
  const summaryBindings = Object.fromEntries(
    topDatasetIds.map((datasetId, index) => [`summary_${index + 1}`, datasetId] as const),
  );

  switch (type) {
    case "title":
      return {
        index: 0,
        templateId: "SF-05",
        title: manifest.title,
        type: "title",
        slideIntent: "transition",
        narrativePosition: "Opening title",
        datasetBindings: { chartSlots: {}, statSources: {} },
        transitionFrom: null,
        transitionTo: "context",
        slideClass: "gradient-dark",
        accentColor: "cyan",
      };
    case "findings-toc":
      return {
        index: 1,
        templateId: "CL-08",
        title: "What This Brief Covers",
        type: "findings-toc",
        slideIntent: "context",
        narrativePosition: "Brief navigation",
        datasetBindings: { chartSlots: {}, statSources: {} },
        transitionFrom: "transition",
        transitionTo: "summary",
        slideClass: "gradient-blue",
        accentColor: "green",
      };
    case "executive-summary":
      return {
        index: 2,
        templateId: "CO-06",
        title: "Executive Summary",
        type: "executive-summary",
        slideIntent: "summary",
        narrativePosition: "Executive summary",
        datasetBindings: { chartSlots: {}, statSources: summaryBindings },
        transitionFrom: "context",
        transitionTo: "evidence",
        slideClass: "gradient-blue",
        accentColor: "orange",
      };
    case "closing":
    default:
      return {
        index: 999,
        templateId: "CO-05",
        title: "Recommended Next Moves",
        type: "closing",
        slideIntent: "recommendation",
        narrativePosition: "Closing recommendation",
        datasetBindings: { chartSlots: {}, statSources: summaryBindings },
        transitionFrom: "summary",
        transitionTo: null,
        slideClass: "gradient-dark",
        accentColor: "purple",
      };
  }
}
