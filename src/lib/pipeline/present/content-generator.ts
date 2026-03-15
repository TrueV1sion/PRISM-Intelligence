import Anthropic from "@anthropic-ai/sdk";
import type { ContentGeneratorInput, ContentGeneratorOutput, StatData, ListItem } from "./types";
import { resolveApiKey } from "@/lib/resolve-api-key";

const SYSTEM_PROMPT = `You are a presentation content writer. Your job is to write compelling,
concise content for a single slide.

Rules:
- Return ONLY valid JSON matching the slot schema below
- Every stat value must come from the provided datasets — never invent numbers
- Headlines: max 60 characters, action-oriented, no jargon
- Subheads: connect the data to the narrative thesis
- Source citations: use the sourceLabel from the dataset verbatim
- Color classes must be one of: cyan, green, purple, orange
- slide_class must be one of: gradient-dark, gradient-blue, gradient-radial,
  dark-mesh, dark-particles
- trend_direction must be one of: up, down, flat

You do NOT write HTML. You do NOT choose layouts. You do NOT reference CSS.
Focus entirely on making the content compelling and accurate.`;

function buildUserPrompt(input: ContentGeneratorInput): string {
  const parts: string[] = [];

  parts.push(`## Template: ${input.templateId} — ${input.templateName}`);
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

function sanitizeOutput(output: ContentGeneratorOutput): ContentGeneratorOutput {
  const sanitized: Record<string, string | StatData | ListItem[]> = {};

  for (const [key, val] of Object.entries(output.slots)) {
    if (typeof val === "string") {
      sanitized[key] = stripHtmlTags(val);
    } else if (Array.isArray(val)) {
      sanitized[key] = val.map(item => ({
        ...item,
        text: stripHtmlTags(item.text),
      }));
    } else if (typeof val === "object" && val !== null) {
      // StatData — sanitize string fields
      const stat = val as StatData;
      sanitized[key] = {
        ...stat,
        value: stripHtmlTags(stat.value),
        label: stripHtmlTags(stat.label),
        ...(stat.delta ? { delta: stripHtmlTags(stat.delta) } : {}),
      };
    } else {
      sanitized[key] = val;
    }
  }

  return { ...output, slots: sanitized };
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
  return sanitizeOutput(parsed);
}

// NOTE: Content generation is done sequentially in the orchestrator to
// accumulate priorSlideHeadlines across slides. Do not add batch/parallel
// generation — it would break headline deduplication.
