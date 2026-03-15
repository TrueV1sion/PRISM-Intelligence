import { describe, it, expect } from "vitest";
import type {
  DataShape,
  DensityTier,
  EnrichedDataset,
  DatasetRegistry,
  ComputedMetrics,
  ResolvedEntity,
  DataRegistryPoint,
} from "../present/types";

describe("DatasetRegistry types", () => {
  it("EnrichedDataset has required fields", () => {
    const dataset: EnrichedDataset = {
      id: "test-1",
      sourceCallId: "call-1",
      metricName: "revenue",
      dataShape: "time_series",
      densityTier: "medium",
      values: [{ period: "FY2022", value: 743.2 }],
      computed: { min: 743.2, max: 743.2, mean: 743.2 },
      sourceLabel: "SEC EDGAR 10-K",
      chartWorthiness: 50,
    };
    expect(dataset.dataShape).toBe("time_series");
    expect(dataset.densityTier).toBe("medium");
  });

  it("DatasetRegistry holds datasets and entities", () => {
    const registry: DatasetRegistry = {
      runId: "run-1",
      datasets: [],
      entities: [],
    };
    expect(registry.datasets).toEqual([]);
  });

  it("ComputedMetrics supports all analytic fields", () => {
    const metrics: ComputedMetrics = {
      min: 0,
      max: 100,
      mean: 50,
      trend: "up",
      cagr: 0.083,
      yoyGrowth: 0.073,
    };
    expect(metrics.trend).toBe("up");
  });
});
