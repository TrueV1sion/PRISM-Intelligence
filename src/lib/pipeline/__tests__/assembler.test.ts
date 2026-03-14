import { describe, it, expect } from "vitest";
import { assemble } from "../present/assembler";
import type { SlideHTML, SlideManifest } from "../present/types";

const mockSlides: SlideHTML[] = [
  {
    slideNumber: 1,
    html: '<section class="slide" id="s1"><div class="slide-inner"><h2>Title</h2></div></section>',
    tokensUsed: 100,
    status: "success",
  },
  {
    slideNumber: 2,
    html: '<section class="slide" id="s2"><div class="slide-inner"><h2>Content</h2></div></section>',
    tokensUsed: 200,
    status: "success",
  },
];

const mockManifest: SlideManifest = {
  title: "Test Briefing",
  subtitle: "A test subtitle",
  slides: [
    {
      slideNumber: 1,
      title: "Title Slide",
      type: "title",
      purpose: "Introduction",
      agentSources: [],
      componentHints: [],
      animationType: "anim",
      dataPoints: [],
    },
    {
      slideNumber: 2,
      title: "Content Slide",
      type: "dimension-deep-dive",
      purpose: "Analysis",
      agentSources: ["Agent A"],
      componentHints: [],
      animationType: "anim",
      dataPoints: [],
    },
  ],
  totalSlides: 2,
};

describe("assembler", () => {
  it("generates valid HTML5 document structure", () => {
    const result = assemble({ slides: mockSlides, manifest: mockManifest });
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("<html");
    expect(result.html).toContain("<head>");
    expect(result.html).toContain("</html>");
  });

  it("includes CSS and JS references in head", () => {
    const result = assemble({ slides: mockSlides, manifest: mockManifest });
    expect(result.html).toContain("presentation.css");
    expect(result.html).toContain("presentation.js");
  });

  it("includes all slides in order", () => {
    const result = assemble({ slides: mockSlides, manifest: mockManifest });
    const s1Pos = result.html.indexOf('id="s1"');
    const s2Pos = result.html.indexOf('id="s2"');
    expect(s1Pos).toBeLessThan(s2Pos);
    expect(s1Pos).toBeGreaterThan(-1);
  });

  it("returns correct slideCount", () => {
    const result = assemble({ slides: mockSlides, manifest: mockManifest });
    expect(result.slideCount).toBe(2);
  });

  it("includes navigation panel", () => {
    const result = assemble({ slides: mockSlides, manifest: mockManifest });
    expect(result.html).toContain("nav-panel");
    expect(result.html).toContain("Title Slide");
  });

  it("includes progress bar", () => {
    const result = assemble({ slides: mockSlides, manifest: mockManifest });
    expect(result.html).toContain("progress-bar");
  });

  it("includes title in document head", () => {
    const result = assemble({ slides: mockSlides, manifest: mockManifest });
    expect(result.html).toContain("<title>Test Briefing</title>");
  });

  it("includes PRISM branding", () => {
    const result = assemble({ slides: mockSlides, manifest: mockManifest });
    expect(result.html).toContain("PRISM");
  });
});
