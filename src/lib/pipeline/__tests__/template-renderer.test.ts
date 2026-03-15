import { describe, it, expect } from "vitest";
import { renderSlide, TemplateRenderError } from "../present/template-renderer";

describe("Template Renderer", () => {
  it("injects simple text slots", () => {
    const html = renderSlide(
      "SF-05",  // title slide
      { slots: { headline: "Test Title", subhead: "Test Subtitle", badge: "ANALYSIS", date: "March 2026", slide_class: "gradient-dark" }, chartDataRefs: {} },
      new Map(),
    );
    expect(html).toContain("Test Title");
    expect(html).toContain("Test Subtitle");
    expect(html).toContain("gradient-dark");
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
    );
    expect(html).toContain("line-chart");
    expect(html).toContain("polyline");
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
    );
    // No delta on any stat, so conditional block should be removed
    expect(html).not.toContain("stat-trend");
  });

  it("throws TemplateRenderError for unreplaced slots", () => {
    expect(() =>
      renderSlide("SF-05", { slots: {}, chartDataRefs: {} }, new Map()),
    ).toThrow(TemplateRenderError);
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
