import type { AssemblerInput, AssemblerOutput } from "./types";

export function assemble(input: AssemblerInput): AssemblerOutput {
  const { slides, manifest } = input;

  // Build navigation panel items with structured sub-elements
  const navItems = manifest.slides
    .map(
      (s, i) =>
        `      <div class="nav-item" data-slide="${i}"><span class="nav-num">${String(i + 1).padStart(2, '0')}</span><span class="nav-label">${escapeHtml(s.title)}</span></div>`
    )
    .join("\n");

  // Build slide HTML in slide number order
  const slideHtml = slides
    .slice()
    .sort((a, b) => a.slideNumber - b.slideNumber)
    .map((s) => s.html)
    .join("\n\n");

  const totalSlides = slides.length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(manifest.title)}</title>
  <link rel="stylesheet" href="/styles/presentation.css">
  <noscript><style>
    .anim,.anim-scale,.anim-blur,.anim-slide-left,.anim-slide-right,
    .anim-spring,.anim-fade,.anim-zoom,.stagger-children,.stagger-children>*
    {opacity:1!important;transform:none!important;filter:none!important}
    .bar-fill{transform:scaleX(1)!important}
    .bar-chart .bar{transform:scaleY(1)!important}
    .donut-chart .segment{stroke-dashoffset:0!important}
    .sparkline-line{stroke-dashoffset:0!important}
    .sparkline-dot{opacity:1!important}
    .stat-number[data-target]{visibility:visible}
  </style></noscript>
</head>
<body>
  <!-- Navigation Toggle Button -->
  <button class="nav-toggle" id="navBtn" onclick="toggleNav()">&#9776;</button>
  <div class="nav-overlay" id="navOverlay" onclick="toggleNav()"></div>

  <!-- Navigation Panel -->
  <div class="nav-panel" id="navPanel">
    <h3>PRISM | Intelligence</h3>
${navItems}
  </div>

  <!-- Progress Bar -->
  <div id="progress"></div>

  <!-- PRISM Branding -->
  <div class="prism-mark">PRISM Intelligence</div>

  <!-- Slide Counter -->
  <div class="slide-counter" id="slideCounter">01 / ${String(totalSlides).padStart(2, "0")}</div>

  <!-- Navigation Hint -->
  <div class="slide-nav-hint show" id="navHint">&#8595; Arrow Down / Spacebar to navigate &#8595;</div>

  <!-- Slides -->
  ${slideHtml}

  <script src="/js/echarts.min.js"></script>
  <script src="/js/presentation.js" defer></script>
</body>
</html>`;

  return { html, slideCount: totalSlides };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
