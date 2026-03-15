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

import { planSlidesWithData } from "../present/planner";
import type { DatasetRegistry } from "../present/types";

describe("Data-Aware Planner", () => {
  it("selects templates based on data shapes", async () => {
    const registry: DatasetRegistry = {
      runId: "test-run",
      datasets: [
        {
          id: "d1",
          sourceCallId: "c1",
          metricName: "revenue",
          dataShape: "time_series",
          densityTier: "medium",
          values: [
            { period: "2022", value: 743 },
            { period: "2023", value: 812 },
            { period: "2024", value: 872 },
          ],
          computed: { min: 743, max: 872, mean: 809, trend: "up", cagr: 0.083 },
          sourceLabel: "SEC EDGAR",
          chartWorthiness: 65,
        },
      ],
      entities: [],
    };

    // Mock LLM response with a valid manifest
    mockCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify({
          title: "Test Deck",
          subtitle: "Analysis",
          thesis: "Growth story",
          narrativeArc: {
            opening: "Context",
            development: "Evidence",
            climax: "Insight",
            resolution: "Action",
          },
          slides: [
            {
              index: 0,
              templateId: "SF-05",
              slideIntent: "transition",
              narrativePosition: "Opening",
              datasetBindings: { chartSlots: {}, statSources: {} },
              transitionFrom: null,
              transitionTo: "evidence",
              slideClass: "gradient-radial",
              accentColor: "cyan",
            },
            {
              index: 1,
              templateId: "DV-01",
              slideIntent: "trend",
              narrativePosition: "Revenue trajectory",
              datasetBindings: {
                chartSlots: { chart_primary: "d1" },
                statSources: {},
              },
              transitionFrom: "transition",
              transitionTo: "summary",
              slideClass: "gradient-dark",
              accentColor: "cyan",
            },
          ],
        }),
      }],
      usage: { input_tokens: 500, output_tokens: 800 },
    });

    const manifest = await planSlidesWithData({
      brief: "Inovalon revenue analysis",
      maxSlides: 12,
      audience: "executive",
      deckThesis: "Accelerating growth",
      keyInsights: ["Revenue growing at 8.3% CAGR"],
      datasetRegistry: registry,
    });

    expect(manifest.slides.length).toBeGreaterThanOrEqual(2);
    // First slide should be title
    expect(manifest.slides[0].templateId).toBe("SF-05");
  });
});
