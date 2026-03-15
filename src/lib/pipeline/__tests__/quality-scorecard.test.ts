import { describe, it, expect } from "vitest";
import { computeQualityScorecard, type ScorecardInput } from "../present/quality-scorecard";
import type { TemplateQualityScorecard } from "../present/types";

describe("Quality Scorecard", () => {
  it("computes overall score as weighted average", () => {
    const input: ScorecardInput = {
      templateCoverage: 1.0,
      renderSuccess: 1.0,
      chartCompilation: 1.0,
      dataBackedSlides: 0.8,
      sourceAttribution: 0.9,
      valueAccuracy: 1.0,
      noHallucinations: 1.0,
      headlineSpecificity: 0.8,
      narrativeArc: 0.7,
      insightDensity: 0.6,
      audienceAlignment: 0.8,
      templateVariety: 0.9,
      colorDistribution: 0.8,
      densityBalance: 0.7,
      transitionSmooth: 0.8,
    };

    const scorecard = computeQualityScorecard(input);
    expect(scorecard.overall).toBe(85);
    expect(scorecard.grade).toBe("B");
  });

  it("grades A for scores >= 90", () => {
    const input: ScorecardInput = {
      templateCoverage: 1.0, renderSuccess: 1.0, chartCompilation: 1.0,
      dataBackedSlides: 0.95, sourceAttribution: 1.0, valueAccuracy: 1.0, noHallucinations: 1.0,
      headlineSpecificity: 0.9, narrativeArc: 0.9, insightDensity: 0.9, audienceAlignment: 0.95,
      templateVariety: 0.95, colorDistribution: 0.9, densityBalance: 0.9, transitionSmooth: 0.9,
    };

    const scorecard = computeQualityScorecard(input);
    expect(scorecard.grade).toBe("A");
  });

  it("grades F for scores < 50", () => {
    const input: ScorecardInput = {
      templateCoverage: 0.3, renderSuccess: 0.5, chartCompilation: 0.2,
      dataBackedSlides: 0.1, sourceAttribution: 0.2, valueAccuracy: 0.3, noHallucinations: 0.5,
      headlineSpecificity: 0.2, narrativeArc: 0.1, insightDensity: 0.2, audienceAlignment: 0.3,
      templateVariety: 0.2, colorDistribution: 0.3, densityBalance: 0.2, transitionSmooth: 0.3,
    };

    const scorecard = computeQualityScorecard(input);
    expect(scorecard.grade).toBe("F");
  });
});
