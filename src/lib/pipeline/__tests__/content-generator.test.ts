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
});
