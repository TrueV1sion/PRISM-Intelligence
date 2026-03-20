/**
 * Remediator
 *
 * Targeted slide repair module for the PRESENT pipeline QA loop.
 * Takes slides flagged by the validator and/or design reviewer
 * and re-generates them with focused correction prompts.
 *
 * Runs all remediations in parallel (like slide-generator batch).
 * Returns SlideHTML[] with status "success" (repaired) or "fallback" (original HTML preserved).
 */

import Anthropic from "@anthropic-ai/sdk";
import { ComponentCatalog } from "./component-catalog";
import { generateSlideContent } from "./content-generator";
import { renderSlide } from "./template-renderer";
import type { RemediationInput, SlideHTML, ContentGeneratorInput, ContentGeneratorOutput } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const REMEDIATOR_MODEL = "claude-sonnet-4-20250514";
const REMEDIATOR_TIMEOUT_MS = 45_000;

const BASE_REMEDIATION_CLASSES = [
  "slide",
  "slide-inner",
  "slide-bg-glow",
  "slide-footer",
  "slide-title",
  "slide-subtitle",
  "eyebrow",
  "section-intro",
  "source-list",
  "source-item",
  "anim",
  "anim-scale",
  "anim-blur",
  "anim-slide-left",
  "anim-slide-right",
  "anim-spring",
  "anim-fade",
  "stagger-children",
  "d1",
  "d2",
  "d3",
  "d4",
  "gradient-dark",
  "gradient-blue",
  "gradient-radial",
  "dark-mesh",
  "dark-particles",
] as const;

const SLIDE_TYPE_REMEDIATION_CLASSES: Record<string, readonly string[]> = {
  title: [
    "title-slide",
    "hero-title",
    "hero-sub",
    "hero-date",
    "hero-badge",
    "hero-stats",
    "hero-stat",
    "agent-chip",
    "dot",
    "validation-box",
    "validation-card",
    "framework-card",
    "val-row",
    "val-icon",
    "framework-visual",
    "fw-node",
    "fw-arrow",
    "fw-center",
  ],
  "findings-toc": [
    "grid-3",
    "stat-card",
    "callout",
    "callout-title",
    "toc-group-header",
    "toc-item",
    "highlight",
  ],
  "executive-summary": [
    "grid-2",
    "callout",
    "callout-title",
    "summary-card-stack",
    "finding-card",
    "finding-title",
    "finding-body",
    "stat-grid",
    "strategic-impact-grid",
    "stat-block",
    "stat-block-mini",
  ],
  "dimension-deep-dive": [
    "grid-2",
    "finding-card",
    "finding-title",
    "finding-body",
    "confidence-badge",
    "tag",
    "quote-block",
    "quote-attr",
  ],
  "data-metrics": [
    "grid-2",
    "grid-3",
    "stat-block",
    "stat-number",
    "chart-container",
    "donut-chart",
    "bar-chart",
    "line-chart",
    "sparkline",
    "chart-legend",
    "legend-item",
    "legend-dot",
    "comparison-bars",
    "bar-row",
    "bar-label",
    "bar-track",
    "bar-fill",
  ],
  emergence: [
    "emergent-slide",
    "emergent-number",
    "emergent-content",
    "emergence-card",
    "emergent-why",
    "emergent-why-label",
    "finding-card",
  ],
  tension: [
    "grid-2",
    "finding-card",
    "finding-title",
    "finding-body",
    "policy-box",
    "tag",
  ],
  closing: [
    "grid-3",
    "finding-card",
    "finding-title",
    "finding-body",
    "stat-grid",
    "strategic-impact-grid",
    "section-intro",
  ],
};

const TEMPLATE_REMEDIATION_CLASSES: Record<string, readonly string[]> = {
  "CL-03": [
    "timeline",
    "timeline-phase",
    "timeline-dot",
    "timeline-year",
    "timeline-label",
    "timeline-items",
  ],
  "CL-04": [
    "comparison-bars",
    "bar-row",
    "bar-label",
    "bar-track",
    "bar-fill",
  ],
  "CL-08": [
    "grid-3",
    "stat-card",
    "callout",
    "callout-title",
    "toc-group-header",
    "toc-item",
    "highlight",
  ],
  "CO-05": [
    "grid-3",
    "finding-card",
    "finding-title",
    "finding-body",
    "stat-grid",
    "strategic-impact-grid",
    "section-intro",
  ],
  "CO-06": [
    "grid-2",
    "callout",
    "callout-title",
    "summary-card-stack",
    "finding-card",
    "finding-title",
    "finding-body",
    "stat-grid",
    "strategic-impact-grid",
    "stat-block",
    "stat-block-mini",
    "source-list",
  ],
};

// ─── Anthropic Client ─────────────────────────────────────────────────────────

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

function inferSlideTypeFromHtml(html: string): string | undefined {
  const match = html.match(/data-slide-type="([^"]+)"/);
  return match?.[1];
}

function extractKnownClassesFromHtml(
  html: string,
  validClasses: Set<string>,
): string[] {
  const matches = html.matchAll(/class\s*=\s*["']([^"']+)["']/g);
  const classes = new Set<string>();

  for (const match of matches) {
    for (const cls of match[1].split(/\s+/)) {
      if (validClasses.has(cls)) {
        classes.add(cls);
      }
    }
  }

  return [...classes];
}

export function buildRemediationContext(
  input: RemediationInput,
  catalog: ComponentCatalog,
): {
  slideType: string;
  slideLabel: string;
  exemplarHtml: string;
  componentRef: string;
  componentClasses: string[];
} {
  const slideType = input.slideType ?? inferSlideTypeFromHtml(input.originalHtml) ?? "dimension-deep-dive";
  const templateId = input.templateId ?? undefined;
  const classCandidates = new Set<string>(BASE_REMEDIATION_CLASSES);

  for (const cls of SLIDE_TYPE_REMEDIATION_CLASSES[slideType] ?? []) {
    classCandidates.add(cls);
  }

  if (templateId) {
    for (const cls of TEMPLATE_REMEDIATION_CLASSES[templateId] ?? []) {
      classCandidates.add(cls);
    }
  }

  for (const cls of input.componentHints ?? []) {
    classCandidates.add(cls);
  }

  for (const cls of extractKnownClassesFromHtml(input.originalHtml, catalog.validClasses)) {
    classCandidates.add(cls);
  }

  const componentClasses = [...classCandidates]
    .filter((cls) => catalog.validClasses.has(cls))
    .sort();

  const slideLabel = templateId
    ? `${slideType} slide (${templateId})`
    : `${slideType} slide`;

  return {
    slideType,
    slideLabel,
    exemplarHtml: input.exemplarHtml || catalog.exemplarForSlideType(slideType),
    componentRef: catalog.componentReference(componentClasses),
    componentClasses,
  };
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

/**
 * System prompt for a single slide remediation.
 * Includes exemplar HTML and component reference from the catalog.
 */
function buildRemediatorSystemPrompt(
  slideLabel: string,
  exemplarHtml: string,
  componentRef: string,
): string {
  return `You are a PRISM Intelligence slide remediator. Your task is to fix a ${slideLabel} that has been flagged with quality issues.

## Output Rules (CRITICAL)
1. Output ONLY the raw \`<section>\` element — no \`<!DOCTYPE>\`, no \`<html>\`, no \`<head>\`, no surrounding markup.
2. The section MUST open with \`<section class="slide"\` (preserve the existing \`id\` attribute from the original).
3. Every slide MUST contain these three direct children in order:
   - \`<div class="slide-bg-glow" ...>\` — decorative glow (position via inline style)
   - \`<div class="slide-inner">\` — all content goes here
   - \`<div class="slide-footer">\` — three \`<span>\` columns
4. Do NOT add inline \`<style>\` or \`<script>\` tags.
5. Use ONLY the CSS classes listed in the Component Reference below. Never invent class names.
6. Terminate properly with \`</section>\`.
7. Preserve all working content — only fix the listed issues.

${componentRef}

## Exemplar HTML (reference pattern for this slide type)
Study this for correct component structure and class usage:

\`\`\`html
${exemplarHtml}
\`\`\`

## Remediation Approach
- Fix ONLY the issues listed in the user message
- Preserve all working elements (charts, data values, source attributions, text content)
- If chart SVG/HTML fragments are provided, INSERT them directly — do NOT recreate them
- Prefer surgical fixes over full rewrites when possible`;
}

/**
 * User prompt listing the issues to fix and the original HTML.
 */
function buildRemediatorUserPrompt(input: RemediationInput): string {
  const parts: string[] = [];
  const slideTypeLabel = input.slideType ?? inferSlideTypeFromHtml(input.originalHtml) ?? "unknown";
  const templateLabel = input.templateId ? `Template ${input.templateId}` : "Template unknown";

  parts.push(`# Slide Remediation Request — Slide ${input.slideNumber} (${slideTypeLabel})`);
  parts.push(`- ${templateLabel}`);
  parts.push(``);

  // Validator issues
  if (input.validatorIssues.length > 0) {
    parts.push(`## Validator Issues to Fix`);
    for (const issue of input.validatorIssues) {
      const classNote = issue.className ? ` (class: \`.${issue.className}\`)` : "";
      parts.push(`- [${issue.severity.toUpperCase()}] ${issue.message}${classNote}`);
    }
    parts.push(``);
  }

  // Composition violations (with concrete fix suggestions)
  if (input.compositionViolations && input.compositionViolations.length > 0) {
    parts.push(`## COMPOSITION VIOLATIONS (Fix these — your output will be re-validated)`);
    for (const v of input.compositionViolations) {
      parts.push(`- [${v.severity.toUpperCase()}] ${v.detail}`);
      parts.push(`  → FIX: ${v.suggestion}`);
    }
    parts.push(``);
  }

  // Reviewer feedback
  if (input.reviewerFeedback) {
    parts.push(`## Design Reviewer Feedback`);
    parts.push(input.reviewerFeedback);
    parts.push(``);
  }

  // Chart data fragments for reference
  if (input.chartFragments.length > 0) {
    parts.push(`## Pre-Computed Chart Fragments`);
    parts.push(`INSERT these fragments directly into the repaired slide if they are missing or malformed.`);
    parts.push(``);

    for (let i = 0; i < input.chartFragments.length; i++) {
      const chart = input.chartFragments[i];
      const slotLabel = chart.slotName ? `, slot: ${chart.slotName}` : "";
      parts.push(`### Chart ${i + 1} (type: ${chart.type}${slotLabel})`);
      parts.push("```html");
      parts.push(chart.markup);
      parts.push("```");
      parts.push(``);
    }
  }

  // Original HTML
  parts.push(`## Original Slide HTML`);
  parts.push(`Fix the issues above while preserving all working content:`);
  parts.push(``);
  parts.push("```html");
  parts.push(input.originalHtml);
  parts.push("```");
  parts.push(``);

  parts.push(`## Task`);
  parts.push(
    `Output a single repaired \`<section class="slide">\` element with the issues corrected. ` +
    `OUTPUT ONLY THE \`<section>...</section>\` ELEMENT — nothing else.`,
  );

  return parts.join("\n");
}

// ─── Single Slide Remediator ──────────────────────────────────────────────────

/**
 * Remediates a single slide. Returns the repaired SlideHTML on success,
 * or the original HTML with status "fallback" on any error.
 */
async function remediateSlide(
  input: RemediationInput,
  client: Anthropic,
  catalog: ComponentCatalog,
): Promise<SlideHTML> {
  const context = buildRemediationContext(input, catalog);
  const systemPrompt = buildRemediatorSystemPrompt(
    context.slideLabel,
    context.exemplarHtml,
    context.componentRef,
  );
  const userPrompt = buildRemediatorUserPrompt(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMEDIATOR_TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: REMEDIATOR_MODEL,
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const text = response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Extract the <section> HTML
    const sectionMatch = text.match(/<section[\s\S]*?<\/section>/);
    if (!sectionMatch) {
      console.warn(
        `[remediator] Slide ${input.slideNumber}: no <section> found in LLM response, using original`,
      );
      return {
        slideNumber: input.slideNumber,
        html: input.originalHtml,
        tokensUsed: 0,
        status: "fallback",
      };
    }

    return {
      slideNumber: input.slideNumber,
      html: sectionMatch[0],
      tokensUsed: response.usage?.output_tokens ?? 0,
      status: "success",
    };
  } catch (error) {
    clearTimeout(timeout);
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[remediator] Slide ${input.slideNumber} error: ${reason}. Preserving original.`,
    );
    return {
      slideNumber: input.slideNumber,
      html: input.originalHtml,
      tokensUsed: 0,
      status: "fallback",
    };
  }
}

// ─── Batch Parallel Remediator ────────────────────────────────────────────────

/**
 * Remediates multiple slides in parallel.
 *
 * For each RemediationInput:
 * - Builds a focused repair prompt (validator issues + reviewer feedback + chart fragments)
 * - Calls the LLM with a 45s timeout
 * - Extracts the <section> element from the response
 * - Falls back to the original HTML if the LLM fails
 *
 * Returns SlideHTML[] sorted by slideNumber with status "success" or "fallback".
 */
export async function remediateSlides(
  inputs: RemediationInput[],
): Promise<SlideHTML[]> {
  if (inputs.length === 0) return [];

  const client = getAnthropicClient();
  const catalog = new ComponentCatalog();

  // Run all remediations in parallel
  const results = await Promise.all(
    inputs.map((input) => remediateSlide(input, client, catalog)),
  );

  // Return sorted by slideNumber
  return results.sort((a, b) => a.slideNumber - b.slideNumber);
}

// ─── Content-Only Remediation (template pipeline) ────────────────────────────

/**
 * Remediates content-level issues by re-running the content generator with
 * issue-aware prompting, then re-rendering through the deterministic template.
 *
 * This is for the template pipeline only — structural issues are impossible
 * since templates are hand-crafted. Only content quality issues need fixing.
 */
export async function remediateContentIssues(
  originalInput: ContentGeneratorInput,
  originalOutput: ContentGeneratorOutput,
  issues: string[],
  chartFragments: Map<string, string>,
): Promise<{ content: ContentGeneratorOutput; html: string }> {
  const remediationInput: ContentGeneratorInput = {
    ...originalInput,
    slideIntent: `${originalInput.slideIntent}\n\nREMEDIATION REQUIRED — fix these issues:\n${issues.map(i => `- ${i}`).join("\n")}`,
  };

  const updatedContent = await generateSlideContent(remediationInput);
  const html = renderSlide(originalInput.templateId, updatedContent, chartFragments);

  return { content: updatedContent, html };
}
