import Anthropic from "@anthropic-ai/sdk";
import type { ContentGeneratorInput, ContentGeneratorOutput, ContentSlotValue } from "./types";
import { resolveApiKey } from "@/lib/resolve-api-key";

const SYSTEM_PROMPT = `You are a presentation content writer for PRISM Intelligence briefs.
Your job is to write compelling, data-rich content for a single slide that will be rendered
through a sophisticated template pipeline with rich visual components.

## Content Rules
- Return ONLY valid JSON matching the slot schema below
- Every stat value must come from the provided datasets — never invent numbers
- Headlines: max 60 characters, action-oriented, specific (not generic). "GLP-1 Spending Surges 340%" not "Key Metrics Overview"
- Subheads: connect the data to the narrative thesis with a concrete insight
- Source citations: use the sourceLabel from the dataset verbatim
- Color classes must be one of: cyan, green, purple, orange
- slide_class must be one of: gradient-dark, gradient-blue, gradient-radial,
  dark-mesh, dark-particles
- trend_direction must be one of: up, down, flat

## Visual Richness Rules
- When generating stat values: include trend direction (up/down/flat) and comparison context (e.g., "▲ 18% YoY")
- When multiple datasets are available: use ALL of them — more data = richer slide
- When generating lists: structure content for ACCORDION display (title + expandable detail), not flat bullets
- When findings span multiple agents: structure content for TAB display (Agent A view / Agent B view)
- When dataset has time series: include sparkline-ready data arrays
- For stat-blocks: always include stat_trend with direction and delta percentage
- Prefer 3-4 stat-blocks per data-heavy slide (fills a grid-3 or grid-4 layout)
- Include source attribution with every stat value

You do NOT write HTML. You do NOT choose layouts. You do NOT reference CSS.
Focus entirely on making the content compelling, accurate, and DENSE with real data.`;

function buildUserPrompt(input: ContentGeneratorInput): string {
  const parts: string[] = [];

  parts.push(`## Template: ${input.templateId} — ${input.templateName}`);
  parts.push(`## Slide Type: ${input.slideType}`);
  parts.push(`## Slide Title: ${input.slideTitle}`);
  parts.push(`## Slide Intent: ${input.slideIntent}`);
  parts.push(`## Narrative Position: ${input.narrativePosition}`);
  parts.push(`## Deck Thesis: ${input.deckThesis}`);

  if (input.priorSlideHeadlines.length > 0) {
    parts.push(`## Prior Headlines (avoid repetition):\n${input.priorSlideHeadlines.map(h => `- ${h}`).join("\n")}`);
  }

  if (input.slotSchema.length > 0) {
    parts.push(`## Slot Schema:\n${JSON.stringify(input.slotSchema, null, 2)}`);
  }

  if (input.componentSlotSchemas.length > 0) {
    parts.push(`## Component Slots:\n${JSON.stringify(input.componentSlotSchemas, null, 2)}`);
  }

  if (input.datasets.length > 0) {
    parts.push(`## Available Datasets:\n${JSON.stringify(
      input.datasets.map(d => ({
        id: d.id,
        metricName: d.metricName,
        dataShape: d.dataShape,
        values: d.values,
        computed: d.computed,
        sourceLabel: d.sourceLabel,
      })),
      null, 2,
    )}`);
  }

  parts.push(`\nReturn a single JSON object with this structure:
{
  "slots": { ... },
  "chartDataRefs": { "chart_slot_name": "dataset_id", ... },
  "contentNotes": "optional notes about content decisions"
}`);

  return parts.join("\n\n");
}

function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

function sanitizeSlotValue(value: ContentSlotValue): ContentSlotValue {
  if (typeof value === "string") {
    return stripHtmlTags(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => ({
      ...item,
      text: stripHtmlTags(item.text),
      ...(item.icon ? { icon: stripHtmlTags(item.icon) } : {}),
    }));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      typeof nestedValue === "string" ? stripHtmlTags(nestedValue) : nestedValue,
    ]),
  );
}

function sanitizeOutput(output: ContentGeneratorOutput): ContentGeneratorOutput {
  const sanitized: Record<string, ContentSlotValue> = {};

  for (const [key, val] of Object.entries(output.slots)) {
    sanitized[key] = sanitizeSlotValue(val);
  }

  return { ...output, slots: sanitized };
}

function truncateText(value: string, maxLength?: number): string {
  if (!maxLength || value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function enforceConstraints(
  output: ContentGeneratorOutput,
  input: ContentGeneratorInput,
): ContentGeneratorOutput {
  const rootMaxLengths = new Map<string, number>();
  const rootMaxItems = new Map<string, number>();
  const nestedMaxLengths = new Map<string, number>();

  for (const slot of input.slotSchema) {
    if (slot.constraints.maxLength) rootMaxLengths.set(slot.name, slot.constraints.maxLength);
    if (slot.constraints.maxItems) rootMaxItems.set(slot.name, slot.constraints.maxItems);
  }

  for (const componentSlot of input.componentSlotSchemas) {
    for (const field of componentSlot.fields) {
      if (field.constraints?.maxLength) {
        nestedMaxLengths.set(`${componentSlot.name}.${field.name}`, field.constraints.maxLength);
      }
    }
  }

  const constrainedSlots: Record<string, ContentSlotValue> = {};
  for (const [key, value] of Object.entries(output.slots)) {
    if (typeof value === "string") {
      constrainedSlots[key] = truncateText(value, rootMaxLengths.get(key));
      continue;
    }

    if (Array.isArray(value)) {
      const maxItems = rootMaxItems.get(key);
      constrainedSlots[key] = maxItems ? value.slice(0, maxItems) : value;
      continue;
    }

    constrainedSlots[key] = Object.fromEntries(
      Object.entries(value).map(([fieldName, fieldValue]) => [
        fieldName,
        typeof fieldValue === "string"
          ? truncateText(fieldValue, nestedMaxLengths.get(`${key}.${fieldName}`))
          : fieldValue,
      ]),
    );
  }

  return { ...output, slots: constrainedSlots };
}

export async function generateSlideContent(
  input: ContentGeneratorInput,
): Promise<ContentGeneratorOutput> {
  const apiKey = await resolveApiKey("anthropic");
  const client = new Anthropic({ apiKey: apiKey ?? undefined });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in LLM response");
  }

  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  const parsed: ContentGeneratorOutput = JSON.parse(jsonStr);
  const sanitized = sanitizeOutput(parsed);
  return enforceConstraints(sanitized, input);
}

// NOTE: Content generation is done sequentially in the orchestrator to
// accumulate priorSlideHeadlines across slides. Do not add batch/parallel
// generation — it would break headline deduplication.
