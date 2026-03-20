import { describe, it, expect } from "vitest";
import { renderSlide, TemplateRenderError } from "../present/template-renderer";

describe("Template Renderer", () => {
  it("injects simple text slots", () => {
    const html = renderSlide(
      "SF-05",  // title slide
      { slots: { headline: "Test Title", subhead: "Test Subtitle", badge: "ANALYSIS", date: "March 2026", slide_class: "gradient-dark" }, chartDataRefs: {} },
      new Map(),
      { slideType: "title", slideNumber: 1, totalSlides: 5 },
    );
    expect(html).toContain("Test Title");
    expect(html).toContain("Test Subtitle");
    expect(html).toContain("gradient-dark");
    expect(html).toContain("slide-bg-glow");
    expect(html).toContain("slide-footer");
    expect(html).toContain('data-slide-type="title"');
    expect(html).not.toContain("{{slot:");
  });

  it("injects chart SVG fragments", () => {
    const chartSvg = '<svg class="line-chart"><polyline points="0,0 100,50" /></svg>';
    const html = renderSlide(
      "DV-01",
      {
        slots: {
          headline: "Revenue", subhead: "Growth", slide_class: "gradient-dark",
          source: "SEC EDGAR",
          stat_1: { value: "$872M", label: "Rev", color_class: "cyan" },
          stat_2: { value: "8.3%", label: "CAGR", color_class: "green" },
          stat_3: { value: "15%", label: "Margin", color_class: "purple" },
        },
        chartDataRefs: {},
      },
      new Map([["chart_primary", chartSvg]]),
      { slideType: "data-metrics", slideNumber: 4, totalSlides: 8 },
    );
    expect(html).toContain("line-chart");
    expect(html).toContain("polyline");
    expect(html).toContain("slide-footer");
  });

  it("expands component slots into component HTML", () => {
    const html = renderSlide(
      "DV-01",
      {
        slots: {
          headline: "Test", subhead: "Test", slide_class: "gradient-dark",
          source: "Test Source",
          stat_1: { value: "$100", label: "Rev", color_class: "cyan", delta: "+5%", trend_direction: "up" },
          stat_2: { value: "$200", label: "Growth", color_class: "green" },
          stat_3: { value: "$300", label: "Margin", color_class: "purple" },
        },
        chartDataRefs: {},
      },
      new Map(),
      { slideType: "data-metrics", slideNumber: 4, totalSlides: 8 },
    );
    expect(html).toContain("stat-block");
    expect(html).toContain("$100");
    expect(html).toContain("cyan");
    expect(html).toContain("+5%");
  });

  it("resolves conditional blocks — renders when slot present", () => {
    const html = renderSlide(
      "DV-01",
      {
        slots: {
          headline: "Test", subhead: "Sub", slide_class: "gradient-dark",
          source: "Source",
          stat_1: { value: "X", label: "L", color_class: "cyan", delta: "+1%", trend_direction: "up" },
          stat_2: { value: "Y", label: "M", color_class: "green" },
          stat_3: { value: "Z", label: "N", color_class: "orange" },
        },
        chartDataRefs: {},
      },
      new Map(),
      { slideType: "data-metrics", slideNumber: 4, totalSlides: 8 },
    );
    expect(html).toContain("+1%");
    expect(html).toContain("stat-trend");
  });

  it("resolves conditional blocks — removes when slot absent", () => {
    const html = renderSlide(
      "DV-01",
      {
        slots: {
          headline: "Test", subhead: "Sub", slide_class: "gradient-dark",
          source: "Source",
          stat_1: { value: "X", label: "L", color_class: "cyan" },
          stat_2: { value: "Y", label: "M", color_class: "green" },
          stat_3: { value: "Z", label: "N", color_class: "orange" },
        },
        chartDataRefs: {},
      },
      new Map(),
      { slideType: "data-metrics", slideNumber: 4, totalSlides: 8 },
    );
    // No delta on any stat, so conditional block should be removed
    expect(html).not.toContain("stat-trend");
  });

  it("throws TemplateRenderError for unreplaced slots", () => {
    expect(() =>
      renderSlide("SF-05", { slots: {}, chartDataRefs: {} }, new Map()),
    ).toThrow(TemplateRenderError);
  });

  it("renders dedicated executive-summary templates with semantic metadata", () => {
    const html = renderSlide(
      "CO-06",
      {
        slots: {
          eyebrow: "Executive Summary",
          headline: "Three moves define the brief",
          subhead: "What matters most, why it matters, and what to do next.",
          slide_class: "gradient-dark",
          thesis_label: "Core Thesis",
          thesis_body: "Market pressure is rising fastest where operational friction is already highest.",
          source: { text: "Synthesized from source-backed findings" },
          summary_1: { title: "Margin pressure compounds", description: "Costs are rising faster than revenue quality.", color_class: "orange" },
          summary_2: { title: "Demand is resilient", description: "Volume remains stronger than sentiment suggests.", color_class: "green" },
          summary_3: { title: "Timing matters", description: "A six-month delay materially weakens the upside case.", color_class: "purple" },
          impact_1: { value: "3x", label: "Sensitivity", color_class: "cyan" },
        },
        chartDataRefs: {},
      },
      new Map(),
      { slideType: "executive-summary", slideNumber: 3, totalSlides: 10 },
    );

    expect(html).toContain("summary-card-stack");
    expect(html).toContain("Core Thesis");
    expect(html).toContain('data-slide-type="executive-summary"');
    expect(html).toContain("Synthesized from source-backed findings");
  });

  it("renders timeline components from registry-shaped step data", () => {
    const html = renderSlide(
      "CL-03",
      {
        slots: {
          headline: "Regulatory path",
          subhead: "Three milestones shape the year.",
          slide_class: "gradient-dark",
          source: "Primary timeline synthesis",
          step_1: { label: "Q1", title: "Draft rule", description: "Initial rulemaking enters review.", color_class: "cyan" },
          step_2: { label: "Q2", title: "Comment window", description: "Stakeholder feedback drives revisions.", color_class: "green" },
          step_3: { label: "Q4", title: "Implementation", description: "Operational teams absorb the change.", color_class: "orange" },
        },
        chartDataRefs: {},
      },
      new Map(),
      { slideType: "dimension-deep-dive", slideNumber: 5, totalSlides: 10 },
    );

    expect(html).toContain("timeline-dot cyan");
    expect(html).toContain("Draft rule");
    expect(html).toContain("Comment window");
  });

  it("escapes HTML in text slots to prevent injection", () => {
    const html = renderSlide(
      "SF-05",
      {
        slots: {
          headline: '<script>alert("xss")</script>',
          subhead: "Safe",
          badge: "TEST",
          date: "2026",
          slide_class: "gradient-dark",
        },
        chartDataRefs: {},
      },
      new Map(),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
