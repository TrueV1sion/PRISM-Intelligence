import { describe, it, expect, vi } from "vitest";

// Mock resolveApiKey before importing
vi.mock("@/lib/resolve-api-key", () => ({
  resolveApiKey: vi.fn().mockResolvedValue("test-api-key"),
}));

// Shared mock for Anthropic messages.create
const mockCreate = vi.fn();

// Mock Anthropic SDK — the default export must be a constructor
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return { messages: { create: mockCreate } };
    }),
  };
});

import { generateSlideContent } from "../present/content-generator";
import type { ContentGeneratorInput } from "../present/types";

describe("Content Generator", () => {
  it("returns valid JSON matching slot schema", async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify({
          slots: {
            headline: "Revenue Acceleration",
            subhead: "Three years of growth",
            slide_class: "gradient-dark",
            source: "SEC EDGAR",
            stat_1: { value: "$872M", label: "FY2024", color_class: "cyan" },
            stat_2: { value: "8.3%", label: "CAGR", color_class: "green" },
            stat_3: { value: "15%", label: "Margin", color_class: "purple" },
          },
          chartDataRefs: { chart_primary: "metric_revenue" },
        }),
      }],
      usage: { input_tokens: 500, output_tokens: 300 },
    });

    const input: ContentGeneratorInput = {
      templateId: "DV-01",
      templateName: "Trend Hero",
      slideTitle: "Revenue trajectory",
      slideType: "data-metrics",
      slotSchema: [
        { name: "headline", type: "text", required: true, constraints: { maxLength: 60 } },
      ],
      componentSlotSchemas: [],
      datasets: [],
      slideIntent: "Show revenue trajectory",
      narrativePosition: "Slide 3 of 12",
      deckThesis: "Inovalon positioned for growth",
      priorSlideHeadlines: [],
    };

    const output = await generateSlideContent(input);
    expect(output.slots).toBeDefined();
    expect(output.slots.headline).toBe("Revenue Acceleration");
    expect(output.chartDataRefs).toBeDefined();
  });

  it("never returns HTML in slot values", async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify({
          slots: {
            headline: "Clean Text Only",
            subhead: "No <div> tags here",
            slide_class: "gradient-dark",
          },
          chartDataRefs: {},
        }),
      }],
      usage: { input_tokens: 100, output_tokens: 100 },
    });

    const output = await generateSlideContent({
      templateId: "SF-05",
      templateName: "Title Slide",
      slideTitle: "Opening",
      slideType: "title",
      slotSchema: [],
      componentSlotSchemas: [],
      datasets: [],
      slideIntent: "Opening",
      narrativePosition: "Slide 1",
      deckThesis: "Test",
      priorSlideHeadlines: [],
    });

    // Verify no HTML tags in any string slot
    for (const [, val] of Object.entries(output.slots)) {
      if (typeof val === "string") {
        expect(val).not.toMatch(/<[a-z]/i);
      }
    }
  });

  it("sanitizes and truncates component slot payloads to template constraints", async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify({
          slots: {
            headline: "Executive summary headline that is far too long for the slot",
            feature_1: {
              icon: "<b>📈</b>",
              title: "This title is much too long for a compact executive summary card",
              description: "This description is also too long and includes <i>HTML</i> that should be stripped before it reaches the renderer.",
              color_class: "cyan",
            },
          },
          chartDataRefs: {},
        }),
      }],
      usage: { input_tokens: 200, output_tokens: 180 },
    });

    const output = await generateSlideContent({
      templateId: "CL-02",
      templateName: "Three Column Features",
      slideTitle: "Executive summary",
      slideType: "executive-summary",
      slotSchema: [
        { name: "headline", type: "text", required: true, constraints: { maxLength: 20 } },
      ],
      componentSlotSchemas: [
        {
          name: "feature_1",
          component: "feature-card",
          required: true,
          fields: [
            { name: "icon", type: "text", required: true, constraints: { maxLength: 5 } },
            { name: "title", type: "text", required: true, constraints: { maxLength: 18 } },
            { name: "description", type: "text", required: true, constraints: { maxLength: 32 } },
            { name: "color_class", type: "enum", required: true, constraints: { enumValues: ["cyan", "green", "purple", "orange"] } },
          ],
        },
      ],
      datasets: [],
      slideIntent: "Executive summary",
      narrativePosition: "Slide 2",
      deckThesis: "Test",
      priorSlideHeadlines: [],
    });

    expect(typeof output.slots.headline).toBe("string");
    expect((output.slots.headline as string).length).toBeLessThanOrEqual(20);
    expect(output.slots.headline).not.toMatch(/<[a-z]/i);

    const feature = output.slots.feature_1;
    expect(Array.isArray(feature)).toBe(false);
    expect(typeof feature).toBe("object");
    expect(feature).toMatchObject({
      icon: "📈",
      color_class: "cyan",
    });
    expect((feature as Record<string, string>).title.length).toBeLessThanOrEqual(18);
    expect((feature as Record<string, string>).description.length).toBeLessThanOrEqual(32);
    expect((feature as Record<string, string>).title).not.toMatch(/<[a-z]/i);
    expect((feature as Record<string, string>).description).not.toMatch(/<[a-z]/i);
  });
});
