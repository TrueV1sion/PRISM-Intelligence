/**
 * Quality Scorecard
 *
 * Computes a 4-category quality scorecard for the template-based presentation
 * pipeline. Categories: structural, data integrity, content quality, visual design.
 *
 * Each metric is a 0-1 float. The overall score is a weighted average mapped to 0-100.
 */

import type { TemplateQualityScorecard } from "./types";

export interface ScorecardInput {
  templateCoverage: number;
  renderSuccess: number;
  chartCompilation: number;
  dataBackedSlides: number;
  sourceAttribution: number;
  valueAccuracy: number;
  noHallucinations: number;
  headlineSpecificity: number;
  narrativeArc: number;
  insightDensity: number;
  audienceAlignment: number;
  templateVariety: number;
  colorDistribution: number;
  densityBalance: number;
  transitionSmooth: number;
}

const WEIGHTS = {
  structural: 0.15,
  dataIntegrity: 0.30,
  contentQuality: 0.30,
  visualDesign: 0.25,
};

function avg(...vals: number[]): number {
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function gradeFromScore(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function computeQualityScorecard(input: ScorecardInput): TemplateQualityScorecard {
  const structural = avg(input.templateCoverage, input.renderSuccess, input.chartCompilation);
  const dataIntegrity = avg(input.dataBackedSlides, input.sourceAttribution, input.valueAccuracy, input.noHallucinations);
  const contentQuality = avg(input.headlineSpecificity, input.narrativeArc, input.insightDensity, input.audienceAlignment);
  const visualDesign = avg(input.templateVariety, input.colorDistribution, input.densityBalance, input.transitionSmooth);

  const overall = Math.round(
    (structural * WEIGHTS.structural +
     dataIntegrity * WEIGHTS.dataIntegrity +
     contentQuality * WEIGHTS.contentQuality +
     visualDesign * WEIGHTS.visualDesign) * 100
  );

  return {
    structural: {
      templateCoverage: input.templateCoverage,
      renderSuccess: input.renderSuccess,
      chartCompilation: input.chartCompilation,
    },
    dataIntegrity: {
      dataBackedSlides: input.dataBackedSlides,
      sourceAttribution: input.sourceAttribution,
      valueAccuracy: input.valueAccuracy,
      noHallucinations: input.noHallucinations,
    },
    contentQuality: {
      headlineSpecificity: input.headlineSpecificity,
      narrativeArc: input.narrativeArc,
      insightDensity: input.insightDensity,
      audienceAlignment: input.audienceAlignment,
    },
    visualDesign: {
      templateVariety: input.templateVariety,
      colorDistribution: input.colorDistribution,
      densityBalance: input.densityBalance,
      transitionSmooth: input.transitionSmooth,
    },
    overall,
    grade: gradeFromScore(overall),
  };
}
