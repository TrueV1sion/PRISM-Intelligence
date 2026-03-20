/**
 * Template Renderer
 *
 * Deterministic template renderer that:
 * 1. Loads template HTML by ID from the templates/ directory
 * 2. Expands component slots ({{component:name slot:key}}) with namespaced sub-slots
 * 3. Injects chart SVG fragments (raw, no escaping)
 * 4. Resolves conditional blocks ({{#if slot:name}}...{{/if}})
 * 5. Injects text slot values (with HTML escaping)
 * 6. Validates no unreplaced slots remain
 *
 * Exports: renderSlide(), TemplateRenderError
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import type { ContentGeneratorOutput } from "./types";

// ── Template cache (loaded once at module init) ──
const templateCache = new Map<string, string>();
const componentCache = new Map<string, string>();
let resolvedTemplatesDir: string | null = null;

function getTemplatesDir(): string {
  if (resolvedTemplatesDir) return resolvedTemplatesDir;

  const candidates = [
    resolve(process.cwd(), "src/lib/pipeline/present/templates"),
    resolve(__dirname, "templates"),
  ];

  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(
      `Unable to locate presentation templates. Checked: ${candidates.join(", ")}`,
    );
  }

  resolvedTemplatesDir = match;
  return match;
}

function loadTemplateFile(templateId: string): string {
  if (templateCache.has(templateId)) return templateCache.get(templateId)!;

  // Map ID prefix to directory
  const dirMap: Record<string, string> = {
    SF: "layouts/single-focus",
    DV: "layouts/data-viz",
    CL: "layouts/content",
    CO: "layouts/composite",
  };
  const prefix = templateId.split("-")[0];
  const dir = dirMap[prefix];
  if (!dir) throw new Error(`Unknown template prefix: ${prefix}`);

  // Find matching file
  const fullDir = join(getTemplatesDir(), dir);
  const files: string[] = readdirSync(fullDir);
  const file = files.find((f: string) => f.startsWith(templateId));
  if (!file) throw new Error(`Template file not found: ${templateId} in ${fullDir}`);

  const content = readFileSync(join(fullDir, file), "utf-8");
  templateCache.set(templateId, content);
  return content;
}

function loadComponent(name: string): string {
  if (componentCache.has(name)) return componentCache.get(name)!;
  const filePath = join(getTemplatesDir(), "components", `${name}.html`);
  const content = readFileSync(filePath, "utf-8");
  componentCache.set(name, content);
  return content;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveSlotValue(
  slotPath: string,
  content: ContentGeneratorOutput,
): string | undefined {
  const parts = slotPath.split(".");
  if (parts.length === 1) {
    const val = content.slots[parts[0]];
    if (val === undefined || val === null) return undefined;
    if (typeof val === "string") return val;
    if (typeof val === "object" && !Array.isArray(val)) {
      // StatData — return the whole object as is (shouldn't be resolved as simple slot)
      return undefined;
    }
    return String(val);
  }
  // Nested: "stat_1.value" -> content.slots.stat_1.value
  const parentVal = content.slots[parts[0]];
  if (parentVal === undefined || parentVal === null) return undefined;
  // If parent is a plain string, return it for any sub-path
  // (supports simple components like source-citation where {{slot:text}} is used)
  if (typeof parentVal === "string") return parentVal;
  if (Array.isArray(parentVal)) return undefined;
  const nested = (parentVal as unknown as Record<string, unknown>)[parts[1]];
  if (nested === undefined || nested === null) return undefined;
  return String(nested);
}

function resolveSourceText(content: ContentGeneratorOutput): string | undefined {
  const source = content.slots.source;
  if (typeof source === "string") return source;
  if (source && typeof source === "object" && !Array.isArray(source) && "text" in source) {
    const text = source.text;
    if (typeof text === "string" && text.trim().length > 0) return text;
  }
  return undefined;
}

export class TemplateRenderError extends Error {
  public templateId: string;
  public unreplacedSlots: string[];

  constructor(templateId: string, unreplacedSlots: string[]) {
    super(`Template ${templateId} has unreplaced slots: ${unreplacedSlots.join(", ")}`);
    this.templateId = templateId;
    this.unreplacedSlots = unreplacedSlots;
    this.name = "TemplateRenderError";
  }
}

export interface RenderSlideOptions {
  slideNumber?: number;
  totalSlides?: number;
  slideType?: string;
}

export function renderSlide(
  templateId: string,
  content: ContentGeneratorOutput,
  chartFragments: Map<string, string>,
  options?: RenderSlideOptions,
): string {
  let html = loadTemplateFile(templateId);

  // ── Pass 1: Component expansion ──
  // {{component:stat-block slot:stat_1}} -> stat-block.html with namespaced slots
  html = html.replace(
    /\{\{component:(\S+)\s+slot:(\S+)\}\}/g,
    (_match, componentName: string, slotName: string) => {
      let fragment = loadComponent(componentName);
      // Namespace conditional slots first: {{#if slot:delta}} -> {{#if slot:stat_1.delta}}
      fragment = fragment.replace(
        /\{\{#if slot:(\w+)\}\}/g,
        `{{#if slot:${slotName}.$1}}`,
      );
      // Namespace internal slots: {{slot:value}} -> {{slot:stat_1.value}}
      fragment = fragment.replace(
        /\{\{slot:(\w+)\}\}/g,
        `{{slot:${slotName}.$1}}`,
      );
      return fragment;
    },
  );

  // ── Pass 2: Chart injection (raw SVG, no escaping) ──
  html = html.replace(
    /\{\{slot:(chart_\w+)\}\}/g,
    (_match, slotName: string) => {
      const svg = chartFragments.get(slotName);
      if (svg) return svg;
      // Check if content has a chart ref
      const ref = content.chartDataRefs[slotName];
      return ref ? `<!-- chart: ${ref} -->` : "";
    },
  );

  // ── Pass 3: Conditional resolution ──
  // Must run before slot injection so we can check presence
  // Process from innermost to outermost
  let prevHtml = "";
  while (prevHtml !== html) {
    prevHtml = html;
    html = html.replace(
      /\{\{#if slot:([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_match, slotPath: string, blockContent: string) => {
        const val = resolveSlotValue(slotPath, content);
        if (val !== undefined && val !== "") return blockContent;
        return "";
      },
    );
  }

  // ── Pass 4: Nested slot injection ──
  // {{slot:stat_1.value}} -> resolved from content.slots.stat_1.value
  html = html.replace(
    /\{\{slot:(\w+\.\w+)\}\}/g,
    (_match, slotPath: string) => {
      const val = resolveSlotValue(slotPath, content);
      if (val === undefined) return "";
      return escapeHtml(val);
    },
  );

  // ── Pass 5: Simple slot injection ──
  // {{slot:headline}} -> escaped text
  html = html.replace(
    /\{\{slot:(\w+)\}\}/g,
    (_match, slotName: string) => {
      const val = content.slots[slotName];
      if (val === undefined || val === null) return `{{slot:${slotName}}}`;
      if (typeof val === "string") return escapeHtml(val);
      return `{{slot:${slotName}}}`; // StatData or ListItem[] — should have been resolved in pass 4
    },
  );

  // ── Validation: check for unreplaced required slots ──
  const unreplaced = [...html.matchAll(/\{\{slot:(\w+)\}\}/g)].map(m => m[1]);
  if (unreplaced.length > 0) {
    throw new TemplateRenderError(templateId, unreplaced);
  }

  return ensureCanonicalShell(html, {
    slideNumber: options?.slideNumber,
    totalSlides: options?.totalSlides,
    slideType: options?.slideType,
    sourceText: resolveSourceText(content),
  });
}

function ensureCanonicalShell(
  html: string,
  options: {
    slideNumber?: number;
    totalSlides?: number;
    slideType?: string;
    sourceText?: string;
  },
): string {
  const trimmed = html.trim();
  const sectionMatch = trimmed.match(/^<section\b([^>]*)>([\s\S]*)<\/section>$/i);
  const rawSectionAttrs = sectionMatch?.[1] ?? ' class="slide"';
  let sectionClasses = extractClassName(rawSectionAttrs);
  if (!sectionClasses.includes("slide")) {
    sectionClasses = `slide ${sectionClasses}`.trim();
  }

  const idMatch = rawSectionAttrs.match(/\sid="([^"]+)"/);
  const sectionId = idMatch ? ` id="${idMatch[1]}"` : "";

  let body = sectionMatch?.[2]?.trim() ?? trimmed;
  body = body.replace(/<div class="slide-bg-glow"><\/div>\s*/g, "");
  body = body.replace(/<div class="slide-footer">[\s\S]*?<\/div>\s*$/g, "").trim();

  if (!/class="[^"]*\bslide-inner\b/.test(body)) {
    body = `<div class="slide-inner">\n${body}\n</div>`;
  }

  const footerSource = options.sourceText?.trim() || defaultFooterSource(options.slideType);
  const footerCount = options.slideNumber && options.totalSlides
    ? `${String(options.slideNumber).padStart(2, "0")} / ${String(options.totalSlides).padStart(2, "0")}`
    : "";
  const slideTypeAttr = options.slideType ? ` data-slide-type="${escapeHtml(options.slideType)}"` : "";
  const slideNumberAttr = options.slideNumber ? ` data-slide-number="${String(options.slideNumber)}"` : "";

  return [
    `<section class="${sectionClasses}"${sectionId}${slideTypeAttr}${slideNumberAttr}>`,
    `  <div class="slide-bg-glow"></div>`,
    indentBlock(body, 2),
    `  <div class="slide-footer">`,
    `    <span>PRISM Intelligence</span>`,
    `    <span>${escapeHtml(footerSource)}</span>`,
    `    <span>${escapeHtml(footerCount)}</span>`,
    `  </div>`,
    `</section>`,
  ].join("\n");
}

function extractClassName(attrs: string): string {
  const classMatch = attrs.match(/\sclass="([^"]+)"/);
  return classMatch?.[1] ?? "slide";
}

function indentBlock(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map(line => `${prefix}${line}`)
    .join("\n");
}

function defaultFooterSource(slideType?: string): string {
  switch (slideType) {
    case "findings-toc":
      return "Executive briefing map";
    case "executive-summary":
      return "Synthesized from source-backed findings";
    case "closing":
      return "Recommended next actions";
    default:
      return "Source-backed intelligence synthesis";
  }
}
