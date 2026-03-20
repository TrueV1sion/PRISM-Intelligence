import { describe, it, expect } from "vitest";
import { validate } from "../present/validator";

const VALID_SLIDE = `<section class="slide" id="s1" data-slide-type="title">
  <div class="slide-bg-glow" style="background:var(--inov-cerulean);top:-200px;right:-200px;"></div>
  <div class="slide-inner">
    <h2 class="slide-title anim d1">Title</h2>
  </div>
  <div class="slide-footer">
    <span>PRISM Intelligence</span>
    <span>Source: PRIMARY</span>
    <span>Slide 1 of 1</span>
  </div>
</section>`;

const FULL_DOC = `<!DOCTYPE html><html><head></head><body>${VALID_SLIDE}</body></html>`;

describe("validator", () => {
  it("returns 100 classNameValidity for valid classes", () => {
    const result = validate(FULL_DOC);
    expect(result.metrics.classNameValidity.score).toBe(100);
  });

  it("flags unknown class names", () => {
    const bad = FULL_DOC.replace('class="slide-title anim d1"', 'class="slide-title bogus-class"');
    const result = validate(bad);
    expect(result.metrics.classNameValidity.score).toBeLessThan(100);
    expect(result.perSlideIssues.some(i => i.message.includes("bogus-class"))).toBe(true);
  });

  it("flags missing slide-footer", () => {
    const noFooter = FULL_DOC.replace(/<div class="slide-footer">[\s\S]*?<\/div>/, "");
    const result = validate(noFooter);
    expect(result.metrics.structuralIntegrity.score).toBeLessThan(100);
  });

  it("computes overall score and grade", () => {
    const result = validate(FULL_DOC);
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(result.grade).toMatch(/^[A-F][+]?$/);
  });

  it("handles multi-slide documents", () => {
    const twoSlides = `<!DOCTYPE html><html><head></head><body>${VALID_SLIDE}${VALID_SLIDE.replace('id="s1"', 'id="s2"')}</body></html>`;
    const result = validate(twoSlides);
    expect(result.overall).toBeGreaterThanOrEqual(0);
  });

  it("accepts common utility classes as valid", () => {
    const withUtils = FULL_DOC.replace('class="slide-title anim d1"', 'class="slide-title anim d1 d2 d3"');
    const result = validate(withUtils);
    expect(result.metrics.classNameValidity.score).toBe(100);
  });

  it("scores executive sequence when slide types are present", () => {
    const findings = VALID_SLIDE
      .replace('data-slide-type="title"', 'data-slide-type="findings-toc"')
      .replace("Title", "Contents");
    const summary = VALID_SLIDE
      .replace('data-slide-type="title"', 'data-slide-type="executive-summary"')
      .replace("Title", "Summary");
    const closing = VALID_SLIDE
      .replace('data-slide-type="title"', 'data-slide-type="closing"')
      .replace("Title", "Closing");
    const deck = `<!DOCTYPE html><html><head></head><body>${VALID_SLIDE}${findings}${summary}${closing}</body></html>`;
    const result = validate(deck);

    expect(result.metrics.compositionCompliance?.score).toBeGreaterThanOrEqual(70);
    expect(result.perSlideIssues.some(issue => issue.message.includes("Expected slide type"))).toBe(false);
  });

  it("flags missing executive sequence markers on multi-slide decks", () => {
    const deck = `<!DOCTYPE html><html><head></head><body>${VALID_SLIDE}${VALID_SLIDE.replace('id="s1"', 'id="s2"')}${VALID_SLIDE.replace('id="s1"', 'id="s3"')}${VALID_SLIDE.replace('id="s1"', 'id="s4"')}</body></html>`;
    const result = validate(deck);

    expect(result.perSlideIssues.some(issue => issue.message.includes('Expected slide type "findings-toc"'))).toBe(true);
    expect(result.metrics.compositionCompliance?.score).toBeLessThan(100);
  });
});
