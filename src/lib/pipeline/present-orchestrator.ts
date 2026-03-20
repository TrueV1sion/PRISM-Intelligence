/**
 * Agentic Presentation Orchestrator
 *
 * Coordinates three presentation pipelines (in priority order):
 *
 * PRIMARY (Agent Presenter — skill-powered agentic generation):
 *   Stage 1:  Data Enrichment   — enrichToolCalls()              → DatasetRegistry (best-effort)
 *   Stage 2:  Agent Generation  — generatePresentationWithAgent() → SlideHTML[]
 *   Stages 3-7: Assemble → Validate → Review → Remediate → Finalize (shared)
 *
 * FALLBACK 1 (Template Pipeline — Stages 1-10):
 *   Stage 1:  Data Enrichment   — enrichToolCalls()       → DatasetRegistry
 *   Stage 2:  Planning           — planSlidesWithData()    → TemplateSlideManifest
 *   Stage 3:  Chart Compilation  — compileChartFromDataset()→ Map<slideIdx, Map<slotName, svgFragment>>
 *   Stage 4:  Content Generation — generateSlideContent()  → ContentGeneratorOutput[]
 *   Stage 5:  Template Rendering — renderSlide()           → string[]
 *   Stages 6-10: Assemble → Validate → Review → Remediate → Finalize (shared)
 *
 * FALLBACK 2 (Legacy Pipeline — 8-stage):
 *   Stage 1: Plan      — planSlides()         → SlideManifest
 *   Stage 2: Compile   — compileCharts()       → ChartDataMap
 *   Stage 3: Generate  — generateSlidesBatch() → SlideHTML[]
 *   Stage 4: Assemble  → Validate → Review → Remediate → Finalize (shared)
 *
 * Production safety default:
 *   - legacy is the default mode until the newer presenters beat it consistently
 *   - template / agent presenters are opt-in via PRISM_PRESENTATION_MODE
 */

import { generatePresentationWithAgent } from "./present/agent-presenter";
import { planSlides, planSlidesWithData, buildCompositionSpecs } from "./present/planner";
import { compileCharts, compileChartFromDataset } from "./present/chart-compiler";
import { generateSlidesBatch } from "./present/slide-generator";
import { generateSlideContent } from "./present/content-generator";
import { enrichToolCalls } from "./present/enricher";
import { renderSlide } from "./present/template-renderer";
import { getTemplate } from "./present/template-registry";
import { assemble } from "./present/assembler";
import { validate } from "./present/validator";
import { reviewDesign } from "./present/design-reviewer";
import { remediateSlides } from "./present/remediator";
import { finalize } from "./present/finalizer";
import { ComponentCatalog } from "./present/component-catalog";
import { assertPresentationQuality, PresentationQualityError } from "./present/quality-gate";
import { present } from "./present";
import { DEFAULT_COMPOSITION_SPECS, validateComposition, reviewDeckComposition } from "./present/composition-validator";
import type {
  ChartData,
  ChartDataMap,
  SlideGeneratorInput,
  SlideHTML,
  RemediationInput,
  RemediationChartFragment,
  DesignReview,
  PipelineTimings,
  DatasetRegistry,
  TemplateSlideManifest,
  ContentGeneratorInput,
  ContentGeneratorOutput,
  SlideCompositionSpec,
  SlideType,
} from "./present/types";
import type { PresentationResult, AgentResult } from "./types";
import type { PresentInput } from "./present";

// ─── Confidence ordering for finding sort ────────────────────────────────────

const CONFIDENCE_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

interface FinishPipelineContext {
  compositionSpecs?: Map<number, SlideCompositionSpec>;
  chartFragmentsBySlide?: Map<number, RemediationChartFragment[]>;
}

type PresentationPipelineMode = "legacy" | "template" | "agent" | "auto";

export function resolvePresentationPipelineMode(
  env: NodeJS.ProcessEnv = process.env,
): PresentationPipelineMode {
  const raw = env.PRISM_PRESENTATION_MODE?.trim().toLowerCase();
  if (raw === "template" || raw === "agent" || raw === "auto" || raw === "legacy") {
    return raw;
  }
  return "legacy";
}

function hasTemplateReadyDatasets(datasets: DatasetRegistry): boolean {
  if (datasets.datasets.length < 2) return false;

  const strongDatasetCount = datasets.datasets.filter((dataset) => dataset.chartWorthiness >= 40).length;
  const temporalDatasetCount = datasets.datasets.filter(
    (dataset) => dataset.dataShape === "time_series" && dataset.values.length >= 3,
  ).length;

  return strongDatasetCount >= 2 || temporalDatasetCount >= 1;
}

function inferFragmentType(markup: string): string {
  if (markup.includes("donut-chart")) return "donut";
  if (markup.includes("line-chart")) return "line";
  if (markup.includes("sparkline")) return "sparkline";
  if (markup.includes("bar-chart")) return "bar";
  if (markup.includes("bar-fill")) return "horizontal-bar";
  if (markup.includes("stat-number")) return "counter";
  return "chart";
}

function chartDataToRemediationFragments(
  charts: ChartData[],
): RemediationChartFragment[] {
  return charts.flatMap((chart): RemediationChartFragment[] => {
    if ("svgFragment" in chart) {
      return [{ type: chart.type, markup: chart.svgFragment }];
    }
    if ("htmlFragment" in chart) {
      return [{ type: chart.type, markup: chart.htmlFragment }];
    }
    return [];
  });
}

function templateChartMapToRemediationFragments(
  chartMap: Map<string, string>,
): RemediationChartFragment[] {
  return [...chartMap.entries()].map(([slotName, markup]) => ({
    type: inferFragmentType(markup),
    slotName,
    markup,
  }));
}

function buildTemplateCompositionSpecs(
  manifest: TemplateSlideManifest,
): Map<number, SlideCompositionSpec> {
  const specs = new Map<number, SlideCompositionSpec>();
  const templateOverrides: Record<string, Partial<SlideCompositionSpec>> = {
    "SF-05": { requiredComponentClasses: ["hero-title", "hero-stats", "agent-chip"] },
    "CL-08": { requiredComponentClasses: ["callout", "toc-group-header", "toc-item"] },
    "CO-06": {
      requiredComponentClasses: ["callout", "summary-card-stack", "finding-card"],
      interactiveRequirement: "one",
      chartRequirement: "none",
    },
    "CO-05": { requiredComponentClasses: ["finding-card", "section-intro"] },
    "DV-01": { requiredComponentClasses: ["chart-container", "stat-block"] },
    "DV-03": { requiredComponentClasses: ["comparison-bars", "section-intro"] },
    "DV-04": { requiredComponentClasses: ["stat-block", "section-intro"], chartRequirement: "none" },
  };

  for (const slide of manifest.slides) {
    const slideType = slide.type as SlideType;
    const defaults = DEFAULT_COMPOSITION_SPECS[slideType] ?? DEFAULT_COMPOSITION_SPECS["dimension-deep-dive"];
    const override = templateOverrides[slide.templateId] ?? {};
    const chartSlotCount = Object.keys(slide.datasetBindings.chartSlots).length;
    const chartRequirement = chartSlotCount === 0
      ? (override.chartRequirement ?? defaults.chartRequirement)
      : chartSlotCount >= 2
        ? "multiple"
        : "one";

    specs.set(slide.index + 1, {
      ...defaults,
      ...override,
      backgroundVariant: slide.slideClass || defaults.backgroundVariant,
      chartRequirement,
    });
  }

  return specs;
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Present a slide deck using the agentic pipeline.
 *
 * Mode behavior:
 * - legacy (default): use the proven legacy presenter
 * - template: attempt template pipeline, then fall back to legacy
 * - agent: attempt agent presenter, then fall back through template/legacy
 * - auto: agent presenter only when explicitly enabled, template only when dataset-ready
 */
export async function presentOrchestrated(
  input: PresentInput,
): Promise<PresentationResult> {
  const { emitEvent } = input;
  const capturedCount = input.capturedCalls?.length ?? 0;
  const hasCapturedData = capturedCount > 0;
  const mode = resolvePresentationPipelineMode();

  console.log(
    `[orchestrator] 🎬 Starting presentation pipeline — mode=${mode}, capturedCalls: ${capturedCount}, hasCapturedData: ${hasCapturedData}`,
  );

  // ── Stage 1: Data Enrichment (best-effort, non-blocking) ──────────────────
  let datasets: DatasetRegistry = { runId: input.runId, datasets: [], entities: [] };
  if (hasCapturedData) {
    try {
      datasets = enrichToolCalls(input.runId, input.capturedCalls ?? []);
      console.log(`[orchestrator] Enriched ${datasets.datasets.length} datasets from ${capturedCount} captured calls`);
    } catch (enrichErr) {
      console.warn(
        `[orchestrator] Enrichment failed (non-blocking): ${enrichErr instanceof Error ? enrichErr.message : String(enrichErr)}`,
      );
    }
  }

  const templateReady = hasCapturedData && hasTemplateReadyDatasets(datasets);
  const agentPresenterEnabled = mode === "agent" || (mode === "auto" && process.env.PRISM_ENABLE_AGENT_PRESENTER === "1");

  if (mode === "legacy") {
    console.log("[orchestrator] Using legacy presenter by default");
    return presentLegacy(input);
  }

  // ── Primary: Agent Presenter ──────────────────────────────────────────────
  if (agentPresenterEnabled) {
    try {
      return await presentWithAgent(input, datasets);
    } catch (agentErr) {
      if (agentErr instanceof PresentationQualityError) {
        console.error(
          `[orchestrator] Agent presenter failed quality gate: ${agentErr.message}`,
        );
        throw agentErr;
      }
      const msg = agentErr instanceof Error ? agentErr.message : String(agentErr);
      console.warn(`[orchestrator] Agent presenter failed, trying fallbacks: ${msg}`);
      emitEvent({
        type: "agent_progress",
        agentName: "orchestrator",
        progress: 0,
        message: `Agent presenter failed (${msg}) — falling back`,
      });
    }
  } else if ((mode as string) === "agent") {
    console.warn(
      "[orchestrator] Agent presenter requested but disabled; set PRISM_ENABLE_AGENT_PRESENTER=1 to enable it",
    );
    emitEvent({
      type: "agent_progress",
      agentName: "orchestrator",
      progress: 0,
      message: "Agent presenter disabled — falling back",
    });
  }

  // ── Fallback 1: Template Pipeline ─────────────────────────────────────────
  if (mode === "template" || mode === "auto") {
    if (!templateReady) {
      const readinessMessage = hasCapturedData
        ? `only ${datasets.datasets.length} enriched datasets available`
        : "no captured research data available";
      console.warn(
        `[orchestrator] Skipping template pipeline: ${readinessMessage}`,
      );
      emitEvent({
        type: "agent_progress",
        agentName: "orchestrator",
        progress: 0,
        message: `Skipping template pipeline (${readinessMessage}) — using legacy presenter`,
      });
    }
  }

  if ((mode === "template" && hasCapturedData) || (mode === "auto" && templateReady)) {
    try {
      return await presentWithTemplates(input);
    } catch (templateErr) {
      if (templateErr instanceof PresentationQualityError) {
        console.error(
          `[orchestrator] Template pipeline failed quality gate; refusing legacy downgrade: ${templateErr.message}`,
        );
        throw templateErr;
      }
      const msg = templateErr instanceof Error ? templateErr.message : String(templateErr);
      console.warn(`[orchestrator] Template pipeline failed, falling back to legacy: ${msg}`);
      emitEvent({
        type: "agent_progress",
        agentName: "orchestrator",
        progress: 0,
        message: `Template pipeline failed (${msg}) — falling back to legacy pipeline`,
      });
    }
  }

  // ── Fallback 2: Legacy Pipeline ───────────────────────────────────────────
  console.log("[orchestrator] Falling back to legacy presenter");
  return presentLegacy(input);
}

// ─── Agent Presenter (Primary) ────────────────────────────────────────────────

/**
 * Skill-powered agent presenter.
 * Uses the agent-presenter module with full skill knowledge to generate
 * high-quality presentations via an agentic tool-use loop.
 */
async function presentWithAgent(
  input: PresentInput,
  datasets: DatasetRegistry,
): Promise<PresentationResult> {
  const { emitEvent, runId } = input;
  const startMs = Date.now();

  console.log(`[orchestrator] 🤖 Agent Presenter: starting with ${datasets.datasets.length} datasets`);

  emitEvent({
    type: "phase_change",
    phase: "PRESENT_GENERATING",
    message: `Generating presentation with agent presenter (${datasets.datasets.length} datasets)...`,
  });

  const { slides, manifest } = await generatePresentationWithAgent({
    runId,
    synthesis: input.synthesis,
    agentResults: input.agentResults,
    datasets,
    blueprint: input.blueprint,
    emitEvent,
  });

  const generateMs = Date.now() - startMs;
  console.log(
    `[orchestrator] 🤖 Agent Presenter: generated ${slides.length} slides in ${generateMs}ms`,
  );

  // Continue with shared finish pipeline (assemble → validate → review → remediate → finalize)
  return finishPipeline(input, slides, manifest, {
    planMs: 0,
    chartCompileMs: 0,
    generateMs,
  });
}

// ─── Template Pipeline (Fallback 1) ──────────────────────────────────────────

/**
 * Data-driven template pipeline.
 * Uses captured MCP tool call data to enrich datasets, select templates,
 * generate content, compile charts, and render slides deterministically.
 */
async function presentWithTemplates(
  input: PresentInput,
): Promise<PresentationResult> {
  const { emitEvent, runId } = input;

  function emitStageEvent(
    stage: string,
    status: "running" | "complete",
    details?: Record<string, unknown>,
  ): void {
    emitEvent({
      type: "agent_progress",
      agentName: "orchestrator",
      progress: status === "running" ? 10 : 50,
      message: `[${stage}] ${status}${details ? ": " + JSON.stringify(details) : ""}`,
    });
  }

  // ── Stage 1: Data Enrichment ──────────────────────────────────────────────

  emitStageEvent("data-enrichment", "running");
  const registry: DatasetRegistry = enrichToolCalls(runId, input.capturedCalls ?? []);
  emitStageEvent("data-enrichment", "complete", {
    datasetsEnriched: registry.datasets.length,
    entitiesResolved: registry.entities.length,
  });

  console.log(
    `[orchestrator] Stage 1 Data Enrichment complete: ${registry.datasets.length} datasets, ${registry.entities.length} entities`,
  );

  // If no datasets were enriched, fall back to legacy (not enough structured data)
  if (registry.datasets.length === 0) {
    throw new Error("No datasets enriched from captured tool calls — insufficient structured data for template pipeline");
  }

  // ── Stage 2: Planning (data-aware) ────────────────────────────────────────

  emitStageEvent("planning", "running");
  const planStart = Date.now();

  const manifest: TemplateSlideManifest = await planSlidesWithData({
    brief: input.synthesis.layers.map(l => l.description).join(" "),
    maxSlides: 12,
    audience: "executive",
    deckThesis: input.synthesis.emergentInsights[0]?.insight ?? "Analysis",
    keyInsights: input.synthesis.emergentInsights.map(ei => ei.insight),
    datasetRegistry: registry,
  });

  const planMs = Date.now() - planStart;
  emitStageEvent("planning", "complete", { slideCount: manifest.slides.length });

  console.log(
    `[orchestrator] Stage 2 Planning complete: ${manifest.slides.length} slides planned in ${planMs}ms`,
  );

  // ── Stage 3: Chart Compilation ────────────────────────────────────────────

  emitStageEvent("chart-compilation", "running");
  const chartCompileStart = Date.now();
  const slideCharts = new Map<number, Map<string, string>>();

  for (const slide of manifest.slides) {
    const chartMap = new Map<string, string>();
    for (const [slotName, datasetId] of Object.entries(slide.datasetBindings.chartSlots)) {
      const dataset = registry.datasets.find(d => d.id === datasetId);
      if (dataset) {
        const chartType = dataset.dataShape === "time_series" ? "line"
          : dataset.dataShape === "composition" ? "donut"
          : "bar";
        const chart = compileChartFromDataset(dataset, chartType);
        // Use svgFragment for SVG-based charts, htmlFragment for counter/horizontal-bar
        const fragment = "svgFragment" in chart ? chart.svgFragment : (chart as { htmlFragment: string }).htmlFragment;
        chartMap.set(slotName, fragment);
      } else {
        console.warn(`[orchestrator] Chart binding references unknown dataset: ${datasetId} for slot ${slotName}`);
      }
    }
    slideCharts.set(slide.index, chartMap);
  }

  const chartCompileMs = Date.now() - chartCompileStart;
  emitStageEvent("chart-compilation", "complete");

  const chartFragmentsBySlide = new Map<number, RemediationChartFragment[]>();
  for (const slide of manifest.slides) {
    const chartMap = slideCharts.get(slide.index) ?? new Map<string, string>();
    chartFragmentsBySlide.set(slide.index + 1, templateChartMapToRemediationFragments(chartMap));
  }

  const compositionSpecs = buildTemplateCompositionSpecs(manifest);

  console.log(
    `[orchestrator] Stage 3 Chart Compilation complete in ${chartCompileMs}ms`,
  );

  // ── Stage 4: Content Generation (sequential for headline accumulation) ────

  emitStageEvent("content-generation", "running");
  const generateStart = Date.now();
  const contentOutputs: ContentGeneratorOutput[] = [];
  const priorHeadlines: string[] = [];

  for (const slide of manifest.slides) {
    const templateEntry = getTemplate(slide.templateId);
    const contentInput: ContentGeneratorInput = {
      templateId: slide.templateId,
      templateName: templateEntry?.name ?? slide.templateId,
      slideTitle: slide.title,
      slideType: slide.type,
      slotSchema: templateEntry?.slots ?? [],
      componentSlotSchemas: templateEntry?.componentSlots ?? [],
      datasets: registry.datasets.filter(d =>
        Object.values(slide.datasetBindings.chartSlots).includes(d.id) ||
        Object.values(slide.datasetBindings.statSources).includes(d.id)
      ),
      slideIntent: slide.slideIntent,
      narrativePosition: slide.narrativePosition,
      deckThesis: manifest.thesis,
      priorSlideHeadlines: [...priorHeadlines],
    };

    const content = await generateSlideContent(contentInput);
    contentOutputs.push(content);

    // Accumulate headlines for narrative deduplication
    if (typeof content.slots.headline === "string") {
      priorHeadlines.push(content.slots.headline);
    }
  }

  const generateMs = Date.now() - generateStart;
  emitStageEvent("content-generation", "complete");

  console.log(
    `[orchestrator] Stage 4 Content Generation complete: ${contentOutputs.length} slides in ${generateMs}ms`,
  );

  // ── Stage 5: Template Rendering ───────────────────────────────────────────

  emitStageEvent("template-rendering", "running");
  const renderStart = Date.now();
  const renderedSlides: SlideHTML[] = [];

  for (let i = 0; i < manifest.slides.length; i++) {
    const slide = manifest.slides[i];
    const content = contentOutputs[i];
    const charts = slideCharts.get(slide.index) ?? new Map();
    const html = renderSlide(slide.templateId, content, charts, {
      slideNumber: i + 1,
      totalSlides: manifest.slides.length,
      slideType: slide.type,
    });
    renderedSlides.push({
      slideNumber: i + 1,
      html,
      tokensUsed: 0, // Template rendering uses no tokens
      status: "success",
    });
  }

  const renderMs = Date.now() - renderStart;
  emitStageEvent("template-rendering", "complete");

  console.log(
    `[orchestrator] Stage 5 Template Rendering complete: ${renderedSlides.length} slides in ${renderMs}ms`,
  );

  // ── Stages 6-10: Assemble → Validate → Review → Remediate → Finalize ─────
  // These stages are shared with the legacy pipeline.

  return finishPipeline(input, renderedSlides, manifest, {
    planMs,
    chartCompileMs,
    generateMs: generateMs + renderMs,
  }, {
    compositionSpecs,
    chartFragmentsBySlide,
  });
}

// ─── Legacy Pipeline ─────────────────────────────────────────────────────────

/**
 * Legacy 8-stage pipeline.
 * Uses LLM-generated HTML via generateSlidesBatch() rather than deterministic
 * template rendering. Preserved for backward compatibility and as fallback.
 */
async function presentLegacy(
  input: PresentInput,
): Promise<PresentationResult> {
  const { emitEvent } = input;

  try {
    // ── Stage 1: Plan ────────────────────────────────────────────────────────

    emitEvent({
      type: "phase_change",
      phase: "PRESENT_PLANNING",
      message: "Planning slide deck...",
    });

    const planStart = Date.now();
    console.log(`[orchestrator] Legacy Stage 1: Planning slides...`);
    const manifest = await planSlides(input);
    const planMs = Date.now() - planStart;

    console.log(
      `[orchestrator] ✅ Legacy Stage 1 Plan complete: ${manifest.slides.length} slides planned in ${planMs}ms`,
    );

    // ── Stage 1b: Build Composition Specs ────────────────────────────────────
    const compositionSpecs = buildCompositionSpecs(manifest);
    console.log(`[orchestrator] Composition specs built for ${compositionSpecs.size} slides`);

    // ── Stage 2: Compile Charts ───────────────────────────────────────────────

    console.log(`[orchestrator] Legacy Stage 2: Compiling charts...`);
    const chartStart = Date.now();
    const chartDataMap: ChartDataMap = {};

    for (const slide of manifest.slides) {
      if (slide.dataPoints.length > 0) {
        try {
          chartDataMap[slide.slideNumber] = compileCharts(slide.dataPoints);
        } catch (chartErr) {
          console.warn(`[orchestrator] Chart compile error for slide ${slide.slideNumber}: ${chartErr}`);
          chartDataMap[slide.slideNumber] = [];
        }
      } else {
        chartDataMap[slide.slideNumber] = [];
      }
    }

    const chartCompileMs = Date.now() - chartStart;
    const chartCount = Object.values(chartDataMap).reduce((s, v) => s + v.length, 0);
    console.log(
      `[orchestrator] ✅ Legacy Stage 2 Chart compile complete: ${chartCount} charts in ${chartCompileMs}ms`,
    );

    // ── Stage 3: Generate Slides ──────────────────────────────────────────────

    emitEvent({
      type: "phase_change",
      phase: "PRESENT_GENERATING",
      message: `Generating ${manifest.slides.length} slides in parallel...`,
    });

    const catalog = new ComponentCatalog();
    const generateStart = Date.now();

    const slideGeneratorInputs: SlideGeneratorInput[] = manifest.slides.map(
      (spec) => {
        // Get exemplar HTML for this slide type
        const exemplarHtml = catalog.exemplarForSlideType(spec.type);

        // Get component reference for hinted class names
        const componentRef = catalog.componentReference(spec.componentHints);

        // Collect findings from matching agents (agentSources → agentResults.agentName)
        const matchingAgentNames = new Set(spec.agentSources);
        const relevantFindings = input.agentResults
          .filter((ar) => matchingAgentNames.has(ar.agentName))
          .flatMap((ar) => ar.findings)
          .sort(
            (a, b) =>
              (CONFIDENCE_ORDER[a.confidence] ?? 2) -
              (CONFIDENCE_ORDER[b.confidence] ?? 2),
          )
          .slice(0, 5);

        // Attach chart data for this slide
        const charts = chartDataMap[spec.slideNumber] ?? [];

        return {
          spec,
          charts,
          exemplarHtml,
          componentRef,
          findings: relevantFindings,
          deckContext: {
            title: manifest.title,
            subtitle: manifest.subtitle,
            totalSlides: manifest.totalSlides,
          },
          compositionSpec: compositionSpecs.get(spec.slideNumber),
        };
      },
    );

    console.log(`[orchestrator] Legacy Stage 3: Generating ${slideGeneratorInputs.length} slides in parallel...`);
    const slides = await generateSlidesBatch(slideGeneratorInputs);
    const generateMs = Date.now() - generateStart;

    const successCount = slides.filter(s => s.status === "success").length;
    const fallbackCount = slides.filter(s => s.status !== "success").length;

    emitEvent({
      type: "phase_change",
      phase: "PRESENT_GENERATING",
      message: `Generated ${slides.length} slides in ${Math.round(generateMs / 1000)}s`,
    });

    console.log(
      `[orchestrator] ✅ Legacy Stage 3 Generate complete: ${successCount} success, ${fallbackCount} fallback in ${generateMs}ms`,
    );

    // ── Stage 3b: Composition Validation (per-slide) ──────────────────────────

    let compositionViolationCount = 0;
    for (const slide of slides) {
      const spec = compositionSpecs.get(slide.slideNumber);
      if (!spec || slide.status === "failed") continue;

      const result = validateComposition(slide.html, spec);
      if (!result.passed) {
        compositionViolationCount += result.violations.length;
        console.warn(
          `[orchestrator] Slide ${slide.slideNumber} composition: score=${result.score}, violations=${result.violations.length} (${result.violations.map(v => v.type).join(", ")})`,
        );
      }
    }

    if (compositionViolationCount > 0) {
      console.log(`[orchestrator] Total composition violations across deck: ${compositionViolationCount}`);
    }

    // ── Stages 4-8: Assemble → Validate → Review → Remediate → Finalize ──────

    return finishPipeline(input, slides, manifest, {
      planMs,
      chartCompileMs,
      generateMs,
    }, {
      compositionSpecs,
      chartFragmentsBySlide: new Map(
        Object.entries(chartDataMap).map(([slideNumber, charts]) => [
          Number(slideNumber),
          chartDataToRemediationFragments(charts),
        ]),
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    console.error(`[orchestrator] ❌ Legacy pipeline failed: ${message}`);
    console.error(`[orchestrator] Stack: ${stack}`);

    emitEvent({
      type: "agent_progress",
      agentName: "orchestrator",
      progress: 0,
      message: `Legacy pipeline error: ${message} — attempting base presenter as last resort`,
    });

    // ── Fallback: base present() ────────────────────────────────────────────
    // Log this so we know the base presenter was used instead of templates
    console.warn(`[orchestrator] ⚠️ USING BASE PRESENTER — template system NOT active. Fix the legacy pipeline error above.`);
    return present(input);
  }
}

// ─── Shared Pipeline Finish (Stages 6-10) ─────────────────────────────────────

interface EarlyTimings {
  planMs: number;
  chartCompileMs: number;
  generateMs: number;
}

/**
 * Shared finish stages: Assemble → Validate → Review → Remediate → Finalize.
 * Used by both the template pipeline and the legacy pipeline.
 *
 * Accepts a manifest with either SlideManifest or TemplateSlideManifest shape.
 * Only the title, subtitle, and slide count are needed for assembly.
 */
async function finishPipeline(
  input: PresentInput,
  slides: SlideHTML[],
  manifest: { title: string; subtitle: string; slides: unknown[] },
  earlyTimings: EarlyTimings,
  context?: FinishPipelineContext,
): Promise<PresentationResult> {
  const { emitEvent } = input;
  const timings: { reviewMs?: number; remediateMs?: number } = {};
  const catalog = new ComponentCatalog();

  // ── Stage 6: Assemble ──────────────────────────────────────────────────────

  const assembleStart = Date.now();
  // Build a compatible manifest for the assembler
  const assemblerManifest = {
    title: manifest.title,
    subtitle: manifest.subtitle,
    totalSlides: manifest.slides.length,
    slides: manifest.slides.map((s, i) => {
      // Extract title from either SlideManifest or TemplateSlideManifest slides
      const slideObj = s as Record<string, unknown> | null;
      const slideTitle =
        (slideObj && typeof slideObj.title === "string" ? slideObj.title : null) ??
        `Slide ${i + 1}`;
      const slideType =
        (slideObj && typeof slideObj.type === "string" ? slideObj.type : null) ??
        "data-metrics";
      const templateId =
        (slideObj && typeof slideObj.templateId === "string" ? slideObj.templateId : null) ??
        null;
      const componentHints = slideObj && Array.isArray(slideObj.componentHints)
        ? slideObj.componentHints.filter((hint): hint is string => typeof hint === "string")
        : [];
      return {
        slideNumber: i + 1,
        title: slideTitle,
        type: slideType as "data-metrics",
        templateId,
        purpose: "",
        agentSources: [] as string[],
        componentHints,
        animationType: "anim" as const,
        dataPoints: [],
      };
    }),
  };
  const assemblerOutput = assemble({ slides, manifest: assemblerManifest });
  const assembleMs = Date.now() - assembleStart;

  console.log(
    `[orchestrator] Stage 6 Assemble complete: ${assemblerOutput.slideCount} slides, ${assemblerOutput.html.length} chars in ${assembleMs}ms`,
  );

  // ── Stage 7: Validate ──────────────────────────────────────────────────────

  const validateStart = Date.now();
  let scorecard = validate(assemblerOutput.html);
  const validateMs = Date.now() - validateStart;

  console.log(
    `[orchestrator] Stage 7 Validate complete: grade=${scorecard.grade}, score=${scorecard.overall} in ${validateMs}ms`,
  );

  // ── Stage 7b: Deck-Level Composition Review ────────────────────────────────

  const slidesHtml = slides.map(s => s.html);
  const backgroundVariants = slides.map(s => {
    const bgMatch = s.html.match(/class="slide\s+([^"]*?)"/);
    if (!bgMatch) return "gradient-dark";
    const classes = bgMatch[1].split(/\s+/);
    return classes.find(c => c.startsWith("gradient-") || c.startsWith("dark-")) ?? "gradient-dark";
  });
  const deckReview = reviewDeckComposition(slidesHtml, backgroundVariants);

  console.log(
    `[orchestrator] Deck composition review: vocabulary=${deckReview.componentVocabulary}, ` +
    `animation=${deckReview.animationDiversity}, charts=${deckReview.chartTypeDiversity}, ` +
    `interactive=${deckReview.interactiveRichness}, bgAlt=${deckReview.backgroundAlternation}, ` +
    `rhythm=${deckReview.visualRhythm}, overall=${deckReview.overallDesignScore}`,
  );

  // Emit quality report
  emitEvent({
    type: "quality_report",
    report: {
      totalFindings: input.agentResults.reduce(
        (sum, ar) => sum + ar.findings.length,
        0,
      ),
      sourcedFindings: input.agentResults
        .flatMap((ar) => ar.findings)
        .filter((f) => f.source && f.source.trim().length > 0).length,
      sourceCoveragePercent: 0,
      confidenceDistribution: {
        high: countByConf(input.agentResults, "HIGH"),
        medium: countByConf(input.agentResults, "MEDIUM"),
        low: countByConf(input.agentResults, "LOW"),
      },
      sourceTierDistribution: {
        primary: countByTier(input.agentResults, "PRIMARY"),
        secondary: countByTier(input.agentResults, "SECONDARY"),
        tertiary: countByTier(input.agentResults, "TERTIARY"),
      },
      emergenceYield: input.synthesis.emergentInsights.length,
      gapCount: input.agentResults.reduce((sum, ar) => sum + ar.gaps.length, 0),
      provenanceComplete: false,
      grade: scorecard.grade,
      overallScore: scorecard.overall,
    },
  });

  // ── Stages 8-9: Design Review + Remediation Loop ───────────────────────────

  let bestHtml = assemblerOutput.html;
  let bestScore = scorecard.overall;
  let remediationRounds = 0;
  let lastReview: DesignReview | null = null;
  const MAX_ITERATIONS = 2;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const compositionResults = new Map<number, ReturnType<typeof validateComposition>>();
    if (context?.compositionSpecs) {
      for (const slide of slides) {
        const spec = context.compositionSpecs.get(slide.slideNumber);
        if (!spec || slide.status === "failed") continue;
        const result = validateComposition(slide.html, spec);
        if (!result.passed) {
          compositionResults.set(slide.slideNumber, result);
        }
      }
    }

    // Stage 8: Design Review
    const reviewStart = Date.now();
    const review = await reviewDesign({
      html: bestHtml,
      manifest: assemblerManifest,
      scorecard,
    });
    timings.reviewMs = (timings.reviewMs ?? 0) + (Date.now() - reviewStart);

    if (review) {
      lastReview = review;
      console.log(
        `[orchestrator] Stage 8 Design Review (iteration ${iteration + 1}): overallScore=${review.overallScore.toFixed(1)} in ${timings.reviewMs}ms`,
      );
    } else {
      console.warn(
        `[orchestrator] Stage 8 Design Review unavailable on iteration ${iteration + 1}; using validator/composition signals only`,
      );
    }

    // Collect slides needing remediation
    const slidesToRemediate: RemediationInput[] = [];

    const reviewBySlide = new Map(
      (review?.slides ?? []).map((slideReview) => [slideReview.slideNumber, slideReview] as const),
    );
    const slideNumbersToEvaluate = new Set<number>();

    for (const issue of scorecard.perSlideIssues) {
      if (issue.severity === "error" || issue.severity === "warning") {
        slideNumbersToEvaluate.add(issue.slideNumber);
      }
    }
    for (const slideNumber of compositionResults.keys()) {
      slideNumbersToEvaluate.add(slideNumber);
    }
    for (const slideReview of review?.slides ?? []) {
      if (slideReview.regenerate) {
        slideNumbersToEvaluate.add(slideReview.slideNumber);
      }
    }

    for (const slideNumber of [...slideNumbersToEvaluate].sort((a, b) => a - b)) {
      const validatorIssues = scorecard.perSlideIssues.filter((issue) => issue.slideNumber === slideNumber);
      const compositionViolations = compositionResults.get(slideNumber)?.violations ?? [];
      const slideReview = reviewBySlide.get(slideNumber);
      const hasValidatorIssues = validatorIssues.some(
        (issue) => issue.severity === "error" || issue.severity === "warning",
      );
      const shouldRemediate = Boolean(slideReview?.regenerate) || hasValidatorIssues || compositionViolations.length > 0;

      if (!shouldRemediate) continue;

      const slideIdx = slides.findIndex((slide) => slide.slideNumber === slideNumber);
      const slideMeta = assemblerManifest.slides[slideIdx];

      if (slideIdx >= 0 && slideMeta) {
        slidesToRemediate.push({
          slideNumber,
          slideType: slideMeta.type,
          templateId: "templateId" in slideMeta ? slideMeta.templateId : null,
          componentHints: slideMeta.componentHints,
          originalHtml: slides[slideIdx].html,
          validatorIssues,
          reviewerFeedback: slideReview?.feedback,
          exemplarHtml: catalog.exemplarForSlideType(slideMeta.type),
          chartFragments: context?.chartFragmentsBySlide?.get(slideNumber) ?? [],
          compositionViolations,
        });
      }
    }

    if (slidesToRemediate.length === 0) break;

    console.log(
      `[orchestrator] Stage 9 Remediating ${slidesToRemediate.length} slides (iteration ${iteration + 1})...`,
    );

    // Stage 9: Remediate
    const remediateStart = Date.now();
    const remediated = await remediateSlides(slidesToRemediate);
    timings.remediateMs = (timings.remediateMs ?? 0) + (Date.now() - remediateStart);
    remediationRounds++;

    // Replace remediated slides
    for (const fixed of remediated) {
      const idx = slides.findIndex(s => s.slideNumber === fixed.slideNumber);
      if (idx >= 0) slides[idx] = fixed;
    }

    // Re-assemble and re-validate
    const reAssembled = assemble({ slides, manifest: assemblerManifest });
    const reScored = validate(reAssembled.html);

    console.log(
      `[orchestrator] Stage 9 Remediation round ${remediationRounds} complete: score ${bestScore} → ${reScored.overall} (${reScored.grade})`,
    );

    // Regression detection: keep the better version
    if (reScored.overall >= bestScore) {
      bestHtml = reAssembled.html;
      bestScore = reScored.overall;
      scorecard = reScored;
    } else {
      console.warn(
        `[orchestrator] Remediation regression detected (${reScored.overall} < ${bestScore}) — reverting`,
      );
      break;
    }
  }

  console.log(
    `[orchestrator] QA loop complete: ${remediationRounds} remediation round(s), final score=${bestScore} (${scorecard.grade})`,
  );

  assertPresentationQuality(scorecard);

  // ── Stage 10: Finalize ──────────────────────────────────────────────────────

  const pipelineTimings: PipelineTimings = {
    planMs: earlyTimings.planMs,
    chartCompileMs: earlyTimings.chartCompileMs,
    generateMs: earlyTimings.generateMs,
    assembleMs,
    validateMs,
    reviewMs: timings.reviewMs ?? 0,
    remediateMs: timings.remediateMs ?? 0,
    finalizeMs: 0,
    totalMs: 0,
  };

  // Extract slide structures for editor persistence (Phase 4a)
  const slideStructures = slides
    .filter(s => s.structure)
    .map(s => s.structure!);

  const finalizeStart = Date.now();
  const htmlPath = await finalize(
    bestHtml,
    input.runId,
    scorecard,
    lastReview,
    pipelineTimings,
    remediationRounds,
    slideStructures.length > 0 ? slideStructures : undefined,
  );
  pipelineTimings.finalizeMs = Date.now() - finalizeStart;
  pipelineTimings.totalMs =
    earlyTimings.planMs + earlyTimings.chartCompileMs + earlyTimings.generateMs +
    assembleMs + validateMs +
    (timings.reviewMs ?? 0) + (timings.remediateMs ?? 0) + pipelineTimings.finalizeMs;

  console.log(
    `[orchestrator] Pipeline complete in ${pipelineTimings.totalMs}ms — grade: ${scorecard.grade}`,
  );

  emitEvent({
    type: "presentation_complete",
    title: manifest.title,
    slideCount: assemblerOutput.slideCount,
    htmlPath,
  });

  // Read back the finalized HTML (with inlined CSS/JS and runtime animations intact)
  const { readFileSync } = await import("fs");
  const { resolve } = await import("path");
  const finalizedHtml = readFileSync(resolve(process.cwd(), htmlPath), "utf-8");

  return {
    html: finalizedHtml,
    htmlPath: `/decks/${input.runId}.html`,
    title: manifest.title,
    subtitle: manifest.subtitle,
    slideCount: assemblerOutput.slideCount,
    slideStructures: slideStructures.length > 0 ? slideStructures : undefined,
    quality: { overall: scorecard.overall, grade: scorecard.grade },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countByConf(results: AgentResult[], level: string): number {
  return results.reduce(
    (sum, ar) => sum + ar.findings.filter((f) => f.confidence === level).length,
    0,
  );
}

function countByTier(results: AgentResult[], tier: string): number {
  return results.reduce(
    (sum, ar) => sum + ar.findings.filter((f) => f.sourceTier === tier).length,
    0,
  );
}
