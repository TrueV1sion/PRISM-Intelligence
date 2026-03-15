import { describe, it, expect } from "vitest";
import { validateDataIntegrity } from "../present/validator";
import type { ContentGeneratorOutput, EnrichedDataset } from "../present/types";

describe("Data Integrity Validation", () => {
  const mockDataset: EnrichedDataset = {
    id: "d1",
    sourceCallId: "c1",
    metricName: "revenue",
    dataShape: "time_series",
    densityTier: "medium",
    values: [
      { period: "FY2022", value: 743.2 },
      { period: "FY2023", value: 812.6 },
      { period: "FY2024", value: 872.3 },
    ],
    computed: { min: 743.2, max: 872.3, mean: 809.4, trend: "up" },
    sourceLabel: "SEC EDGAR Filing (INVA)",
    chartWorthiness: 65,
  };

  it("passes when stat values match dataset", () => {
    const content: ContentGeneratorOutput = {
      slots: {
        headline: "Revenue Growth",
        subhead: "Consistent",
        source: "SEC EDGAR Filing (INVA)",
        stat_1: { value: "$872.3M", label: "FY2024", color_class: "cyan" },
      },
      chartDataRefs: {},
    };

    const result = validateDataIntegrity("<section>...</section>", content, [mockDataset]);
    expect(result.sourceAttribution).toBe(true);
  });

  it("flags missing source attribution", () => {
    const content: ContentGeneratorOutput = {
      slots: {
        headline: "Revenue Growth",
        subhead: "Consistent",
      },
      chartDataRefs: {},
    };

    const result = validateDataIntegrity("<section>...</section>", content, [mockDataset]);
    expect(result.sourceAttribution).toBe(false);
  });

  it("handles empty datasets gracefully", () => {
    const content: ContentGeneratorOutput = {
      slots: { headline: "Title", subhead: "Sub" },
      chartDataRefs: {},
    };

    const result = validateDataIntegrity("<section>...</section>", content, []);
    expect(result.issues).toHaveLength(0);
  });
});
