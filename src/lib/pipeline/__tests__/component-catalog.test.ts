import { describe, it, expect } from "vitest";
import { ComponentCatalog } from "../present/component-catalog";

describe("ComponentCatalog", () => {
  const catalog = new ComponentCatalog();

  it("extracts valid CSS class names from presentation.css", () => {
    expect(catalog.validClasses.has("slide")).toBe(true);
    expect(catalog.validClasses.has("donut-chart")).toBe(true);
    expect(catalog.validClasses.has("bar-chart")).toBe(true);
    expect(catalog.validClasses.has("sparkline")).toBe(true);
    expect(catalog.validClasses.has("legend-item")).toBe(true);
    expect(catalog.validClasses.has("nonexistent-class")).toBe(false);
  });

  it("has at least 170 valid classes", () => {
    expect(catalog.validClasses.size).toBeGreaterThanOrEqual(170);
  });

  it("returns exemplar HTML for data-metrics slide type", () => {
    const html = catalog.exemplarForSlideType("data-metrics");
    expect(html).toContain("donut-chart");
    expect(html).toContain("bar-chart");
  });

  it("returns exemplar HTML for emergence slide type", () => {
    const html = catalog.exemplarForSlideType("emergence");
    expect(html).toContain("emergent-slide");
    expect(html).toContain("emergence-card");
  });

  it("routes executive summary slides to the premium summary exemplar", () => {
    const html = catalog.exemplarForSlideType("executive-summary");
    expect(html).toContain("comparison-bars");
    expect(html).toContain("feature-grid");
    expect(html).not.toContain("action-card");
  });

  it("routes findings toc slides to the intelligence map exemplar", () => {
    const html = catalog.exemplarForSlideType("findings-toc");
    expect(html).toContain("toc-item");
    expect(html).toContain("icon-grid");
    expect(html).toContain("callout");
  });

  it("routes closing slides to the action-oriented closing exemplar", () => {
    const html = catalog.exemplarForSlideType("closing");
    expect(html).toContain("feature-grid");
    expect(html).toContain("process-flow");
    expect(html).toContain("callout");
  });

  it("generates component reference for given classes", () => {
    const ref = catalog.componentReference(["donut-chart", "stat-block", "grid-2"]);
    expect(ref).toContain("donut-chart");
    expect(ref).toContain("stat-block");
    expect(ref).toContain("grid-2");
  });

  it("generates planner system prompt without exemplar HTML", () => {
    const prompt = catalog.plannerSystemPrompt();
    expect(prompt).toContain("donut-chart");
    expect(prompt.length).toBeLessThan(7000);
    expect(prompt).not.toContain("<section");
    // Verify enhanced animation classes are documented
    expect(prompt).toContain("anim-slide-left");
    expect(prompt).toContain("anim-slide-right");
    expect(prompt).toContain("anim-spring");
    expect(prompt).toContain("anim-zoom");
    expect(prompt).toContain("stagger-children");
    // Verify interactive components are documented
    expect(prompt).toContain("accordion");
    expect(prompt).toContain("tab-group");
    expect(prompt).toContain("tooltip");
    expect(prompt).toContain("callout");
    expect(prompt).toContain("process-flow");
    expect(prompt).toContain("feature-grid");
    expect(prompt).toContain("icon-grid");
    // Verify background variants are documented
    expect(prompt).toContain("gradient-dark");
    expect(prompt).toContain("gradient-blue");
    expect(prompt).toContain("dark-mesh");
    expect(prompt).toContain("dark-particles");
  });
});
