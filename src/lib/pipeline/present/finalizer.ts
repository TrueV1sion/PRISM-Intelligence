/**
 * Presentation Finalizer
 *
 * Post-processes generated HTML (CSS/JS inlining and design-system cleanup),
 * writes the deck to disk, and persists quality telemetry to the database.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { prisma } from "@/lib/prisma";
import type { QualityScorecard, PipelineTimings, DesignReview, SlideStructure } from "./types";

/**
 * Inline external CSS and JS assets into the HTML so the deck is fully
 * self-contained and shareable without a running server.
 */
function inlineAssets(html: string): string {
  const publicDir = join(process.cwd(), "public");
  const cssPath = join(publicDir, "styles", "presentation.css");
  const jsPath = join(publicDir, "js", "presentation.js");

  let processed = html;

  // Strip any LLM-generated <style> blocks that override the design system
  processed = processed.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Inline CSS — replace external <link> with inlined <style> for self-contained deck
  try {
    const css = readFileSync(cssPath, "utf-8");
    // Remove external link tag if present
    processed = processed.replace(
      /<link[^>]*href="[^"]*presentation\.css"[^>]*>\s*/g,
      "",
    );
    if (processed.includes("</head>")) {
      processed = processed.replace(
        "</head>",
        `  <style>\n${css}\n  </style>\n</head>`,
      );
    }
  } catch {
    // Keep external link if CSS file not found (already present from assembler)
  }

  // Inline ECharts — replace external <script src> with inlined <script> for self-contained deck
  try {
    const echartsJs = readFileSync(join(publicDir, "js", "echarts.min.js"), "utf-8");
    // Remove external echarts script tag if present
    processed = processed.replace(
      /<script[^>]*src="[^"]*echarts\.min\.js"[^>]*><\/script>\s*/g,
      "",
    );
    if (processed.includes("</body>")) {
      processed = processed.replace(
        "</body>",
        `  <script>\n${echartsJs}\n  </script>\n</body>`,
      );
    }
  } catch {
    // Keep external script if ECharts file not found
  }

  // Inline JS — replace external <script src> with inlined <script> for self-contained deck
  try {
    const js = readFileSync(jsPath, "utf-8");
    // Remove external script tag if present
    processed = processed.replace(
      /<script[^>]*src="[^"]*presentation\.js"[^>]*><\/script>\s*/g,
      "",
    );
    if (processed.includes("</body>")) {
      processed = processed.replace(
        "</body>",
        `  <script>\n${js}\n  </script>\n</body>`,
      );
    }
  } catch {
    // Keep external script if JS file not found
  }

  return processed;
}

/**
 * Deterministically enhance LLM-generated HTML with design system features
 * that the model tends to under-use: animation diversity, background variants,
 * and inline style cleanup.
 *
 * This runs BEFORE animation baking so the upgraded classes get the
 * `.visible` treatment.
 */
function enhanceDesignSystem(html: string): string {
  let processed = html;

  // ── 0a. Normalize hero stat counters: .value[data-target] → .stat-number[data-target] ──
  // The agent sometimes uses <div class="value cyan" data-target="56"> on hero slides
  // but the JS counter animation targets .stat-number[data-target]
  processed = processed.replace(
    /<(div|span)\s+class="value([^"]*)"\s+data-target="(\d+)">/g,
    '<$1 class="stat-number$2" data-target="$3">',
  );

  // ── 1. Upgrade animation classes based on element context ──
  // Slide titles: anim → anim-blur (blur-reveal for headings)
  processed = processed.replace(
    /class="([^"]*\bslide-title\b[^"]*)\banim\b(?!-)([^"]*)"/g,
    (match, before, after) => {
      if (/anim-(blur|slide|spring|fade|zoom|scale)/.test(before + after)) return match;
      return `class="${before}anim-blur${after}"`;
    },
  );

  // Hero titles: anim → anim-blur
  processed = processed.replace(
    /class="([^"]*\bhero-title\b[^"]*)\banim\b(?!-)([^"]*)"/g,
    (match, before, after) => {
      if (/anim-(blur|slide|spring|fade|zoom|scale)/.test(before + after)) return match;
      return `class="${before}anim-blur${after}"`;
    },
  );

  // Stat grids/blocks: anim on grid-3 → stagger-children
  processed = processed.replace(
    /class="([^"]*\bgrid-3\b[^"]*)\banim\b(?!-)([^"]*)"/g,
    (match, before, after) => {
      if (/stagger-children/.test(before + after)) return match;
      return `class="${before}stagger-children${after}"`;
    },
  );

  // Stat blocks and stat cards: anim → anim-scale
  processed = processed.replace(
    /class="([^"]*\bstat-card\b[^"]*)\banim\b(?!-)([^"]*)"/g,
    (match, before, after) => {
      if (/anim-(blur|slide|spring|fade|zoom|scale)/.test(before + after)) return match;
      return `class="${before}anim-scale${after}"`;
    },
  );

  // Hero stats: anim → anim-spring
  processed = processed.replace(
    /class="([^"]*\bhero-stats\b[^"]*)\banim\b(?!-)([^"]*)"/g,
    (match, before, after) => {
      if (/anim-(blur|slide|spring|fade|zoom|scale)/.test(before + after)) return match;
      return `class="${before}anim-spring${after}"`;
    },
  );

  // Emergence cards in grid: anim on grid-2 inside emergent sections → stagger-children
  processed = processed.replace(
    /class="([^"]*\bemergence-card\b[^"]*)\banim\b(?!-)([^"]*)"/g,
    (match, before, after) => {
      if (/anim-(blur|slide|spring|fade|zoom|scale)/.test(before + after)) return match;
      return `class="${before}anim-scale${after}"`;
    },
  );

  // Emergent number: anim → anim-zoom
  processed = processed.replace(
    /class="([^"]*\bemergent-number\b[^"]*)\banim\b(?!-)([^"]*)"/g,
    (match, before, after) => {
      if (/anim-(blur|slide|spring|fade|zoom|scale)/.test(before + after)) return match;
      return `class="${before}anim-zoom${after}"`;
    },
  );

  // Source lists and footnotes: anim → anim-fade
  processed = processed.replace(
    /class="([^"]*\bsource-list\b[^"]*)\banim\b(?!-)([^"]*)"/g,
    (match, before, after) => {
      if (/anim-(blur|slide|spring|fade|zoom|scale)/.test(before + after)) return match;
      return `class="${before}anim-fade${after}"`;
    },
  );
  processed = processed.replace(
    /class="([^"]*\bdagger-footnote\b[^"]*)\banim\b(?!-)([^"]*)"/g,
    (match, before, after) => {
      if (/anim-(blur|slide|spring|fade|zoom|scale)/.test(before + after)) return match;
      return `class="${before}anim-fade${after}"`;
    },
  );

  // Validation box: anim → anim-scale
  processed = processed.replace(
    /class="([^"]*\bvalidation-box\b[^"]*)\banim\b(?!-)([^"]*)"/g,
    (match, before, after) => {
      if (/anim-(blur|slide|spring|fade|zoom|scale)/.test(before + after)) return match;
      return `class="${before}anim-scale${after}"`;
    },
  );

  // ── 2. Add background variant classes to bare <section> elements ──
  // Rotate through variants based on slide position
  const bgVariants = [
    "gradient-dark",     // slide 1: title
    "gradient-dark",     // slide 2: TOC
    "gradient-blue",     // slide 3: exec summary
    "gradient-blue",     // slide 4+: data slides
    "dark-particles",
    "gradient-dark",
    "dark-mesh",
    "gradient-blue",
    "dark-particles",
    "gradient-dark",
    "dark-mesh",
    "gradient-blue",
    "dark-particles",
    "gradient-radial",   // emergence slides tend to be later
    "gradient-radial",
    "dark-mesh",
    "gradient-dark",
    "dark-particles",
    "gradient-blue",
    "gradient-dark",
  ];

  let slideIdx = 0;
  processed = processed.replace(
    /<section\s+class="slide(?:\s+emergent-slide)?(?:\s+title-slide)?"(\s+id="s\d+")/g,
    (match, idPart) => {
      // Don't touch sections that already have a background variant
      if (/gradient-dark|gradient-blue|gradient-radial|dark-mesh|dark-particles/.test(match)) {
        slideIdx++;
        return match;
      }
      const variant = bgVariants[slideIdx % bgVariants.length] || "gradient-dark";
      slideIdx++;
      // Check if it has emergent-slide or title-slide modifiers
      if (match.includes("emergent-slide")) {
        return `<section class="slide ${variant} emergent-slide"${idPart}`;
      }
      if (match.includes("title-slide")) {
        return `<section class="slide ${variant} title-slide"${idPart}`;
      }
      return `<section class="slide ${variant}"${idPart}`;
    },
  );

  // ── 3. Strip non-allowed inline styles ──
  // Keep ONLY: slide-bg-glow styles, legend-dot/dot background, bar-fill, SVG attributes, chart elements
  processed = processed.replace(
    /(\<(?!div\s+class="[^"]*slide-bg-glow)[^\>]*?)\s+style="([^"]*)"([^\>]*\>)/g,
    (fullMatch, before, styleValue, after) => {
      // Allow legend-dot and dot background colors
      if (/class="[^"]*\b(legend-dot|dot)\b/.test(before) && /background/.test(styleValue)) {
        return fullMatch;
      }
      // Allow bar-fill (--fill-pct, width, background)
      if (/class="[^"]*\bbar-fill\b/.test(before)) {
        return fullMatch;
      }
      // Allow SVG elements (stroke, fill, height, width, etc.)
      if (/\<(circle|rect|line|polyline|path|svg|text)\b/.test(before)) {
        return fullMatch;
      }
      // Allow chart containers with max-width
      if (/class="[^"]*\b(chart-container|donut-chart|bar-chart|line-chart)\b/.test(before)) {
        return fullMatch;
      }
      // Strip all other inline styles
      return `${before}${after}`;
    },
  );

  return processed;
}

/**
 * Close any unclosed <section>, </body>, and </html> tags caused by LLM
 * truncation mid-generation.
 */
function recoverTruncation(html: string): string {
  let processed = html;

  if (!processed.includes("</body>")) {
    const openSections = (processed.match(/<section/g) || []).length;
    const closedSections = (processed.match(/<\/section>/g) || []).length;
    const unclosedSections = openSections - closedSections;
    if (unclosedSections > 0) {
      processed += `\n</div></div></section>`.repeat(unclosedSections);
    }
    processed += `\n</body>\n</html>`;
  }

  return processed;
}

/**
 * Upsert a PresentationQuality record in the database with all quality
 * telemetry from the agentic pipeline run.
 */
async function persistQuality(
  runId: string,
  quality: QualityScorecard,
  review?: DesignReview | null,
  timings?: PipelineTimings,
  remediationRounds?: number,
): Promise<void> {
  const { metrics, overall, grade, perSlideIssues } = quality;

  const data = {
    overall,
    grade,
    classNameValidity: metrics.classNameValidity.score,
    structuralIntegrity: metrics.structuralIntegrity.score,
    chartAdoption: metrics.chartAdoption.score,
    animationVariety: metrics.animationVariety.score,
    counterAdoption: metrics.counterAdoption.score,
    emergenceHierarchy: metrics.emergenceHierarchy.score,
    sourceAttribution: metrics.sourceAttribution.score,
    slideCount: new Set(perSlideIssues.map((i) => i.slideNumber)).size,
    issueCount: perSlideIssues.length,
    reviewScore: review?.overallScore ?? null,
    remediationRounds: remediationRounds ?? 0,
    planMs: timings?.planMs ?? null,
    chartCompileMs: timings?.chartCompileMs ?? null,
    generateMs: timings?.generateMs ?? null,
    assembleMs: timings?.assembleMs ?? null,
    validateMs: timings?.validateMs ?? null,
    reviewMs: timings?.reviewMs ?? null,
    remediateMs: timings?.remediateMs ?? null,
    finalizeMs: timings?.finalizeMs ?? null,
    totalMs: timings?.totalMs ?? null,
  };

  await prisma.presentationQuality.upsert({
    where: { runId },
    create: { runId, ...data },
    update: data,
  });
}

/**
 * Finalize a generated presentation:
 * 1. Strip LLM-generated embedded styles, then inline canonical CSS/JS assets
 * 2. Recover from LLM truncation
 * 3. Write HTML file to disk
 * 4. Persist quality telemetry to the database
 *
 * Returns the relative path to the written HTML file (e.g. `public/decks/<runId>.html`).
 */
export async function finalize(
  html: string,
  runId: string,
  quality: QualityScorecard,
  review?: DesignReview | null,
  timings?: PipelineTimings,
  remediationRounds?: number,
  slideStructures?: SlideStructure[],
): Promise<string> {
  // 1. CSS/JS inlining
  let processed = html;
  processed = inlineAssets(processed);

  // 1b. Design system enhancement (animation upgrades, background variants, inline style cleanup)
  processed = enhanceDesignSystem(processed);

  // 2. Truncation recovery
  processed = recoverTruncation(processed);

  // 3. Write file
  const htmlPath = `public/decks/${runId}.html`;
  const fullPath = resolve(process.cwd(), htmlPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, processed, "utf-8");

  // 4. Persist quality telemetry (non-blocking — don't crash pipeline on DB errors)
  try {
    await persistQuality(runId, quality, review, timings, remediationRounds);
  } catch (dbError) {
    console.warn(
      `[finalizer] Failed to persist quality telemetry for run ${runId}: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
    );
  }

  // 7. Persist structured slide data for editor (Phase 4a)
  if (slideStructures && slideStructures.length > 0) {
    try {
      await persistSlideStructures(runId, slideStructures);
    } catch (dbError) {
      console.warn(
        `[finalizer] Failed to persist slide structures for run ${runId}: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
      );
    }
  }

  return htmlPath;
}

/**
 * Persist slide structures as PresentationVersion + SlideVersion records.
 * Creates the initial "AI-generated" version (v1) that the editor can modify.
 */
async function persistSlideStructures(
  runId: string,
  structures: SlideStructure[],
): Promise<void> {
  // Find the presentation record for this run
  const presentation = await prisma.presentation.findUnique({
    where: { runId },
  });

  if (!presentation) {
    console.warn(`[finalizer] No Presentation record found for run ${runId}, skipping structure persistence`);
    return;
  }

  // Create version v1 with all slide structures
  const version = await prisma.presentationVersion.create({
    data: {
      presentationId: presentation.id,
      versionNumber: 1,
      status: "published",
      label: "AI-generated",
      publishedAt: new Date(),
      slides: {
        create: structures.map((s) => ({
          slideNumber: s.slideNumber,
          templateId: s.templateId,
          backgroundVariant: s.backgroundVariant,
          animationType: s.animationType,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: s.content as any, // Prisma Json field accepts any serializable value
          sourceAgentIds: s.sourceAgentIds,
          sourceFindingIds: s.sourceFindingIds,
        })),
      },
    },
  });

  // Set as current and published version
  await prisma.presentation.update({
    where: { id: presentation.id },
    data: {
      currentVersionId: version.id,
      publishedVersionId: version.id,
    },
  });

  console.log(`[finalizer] Persisted ${structures.length} slide structures as version v1 for presentation ${presentation.id}`);
}
