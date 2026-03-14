import type { AssemblerInput, AssemblerOutput } from "./types";

export function assemble(input: AssemblerInput): AssemblerOutput {
  const { slides, manifest } = input;

  // Build navigation panel items
  const navItems = manifest.slides
    .map(
      (s, i) =>
        `      <div class="nav-item" data-slide="${i}">${escapeHtml(s.title)}</div>`
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
</head>
<body>
  <!-- Navigation Panel -->
  <div class="nav-panel">
    <div class="nav-header">
      <span class="nav-logo">PRISM | Intelligence</span>
    </div>
    <div class="nav-items">
${navItems}
    </div>
  </div>

  <!-- Progress Bar -->
  <div id="slideProgress" class="progress-bar">
    <div class="progress-fill"></div>
  </div>

  <!-- PRISM Branding -->
  <div class="prism-mark">PRISM Intelligence</div>

  <!-- Slide Counter -->
  <div class="slide-counter" id="slideCounter">01 / ${String(totalSlides).padStart(2, "0")}</div>

  <!-- Navigation Hint -->
  <div class="slide-nav-hint show" id="navHint">&#8595; Arrow Down / Spacebar to navigate &#8595;</div>

  <!-- Slides -->
  ${slideHtml}

  <script>
const slides=document.querySelectorAll('.slide');const totalSlides=slides.length;let currentSlide=0;let counterTimeout;
function goToSlide(n){n=Math.max(0,Math.min(n,totalSlides-1));currentSlide=n;slides[n].scrollIntoView({behavior:'smooth'});}
document.addEventListener('keydown',(e)=>{if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;switch(e.key){case'ArrowDown':case'PageDown':case' ':case'ArrowRight':e.preventDefault();goToSlide(currentSlide+1);break;case'ArrowUp':case'PageUp':case'ArrowLeft':e.preventDefault();goToSlide(currentSlide-1);break;case'Home':e.preventDefault();goToSlide(0);break;case'End':e.preventDefault();goToSlide(totalSlides-1);break;}});
function updateProgress(){const scrollTop=window.scrollY||document.documentElement.scrollTop;const docHeight=document.documentElement.scrollHeight-window.innerHeight;const pct=docHeight>0?(scrollTop/docHeight)*100:0;document.getElementById('slideProgress').style.width=pct+'%';let closest=0,minDist=Infinity;slides.forEach((s,i)=>{const d=Math.abs(s.getBoundingClientRect().top);if(d<minDist){minDist=d;closest=i;}});currentSlide=closest;const counter=document.getElementById('slideCounter');counter.textContent=String(closest+1).padStart(2,'0')+' / '+String(totalSlides).padStart(2,'0');counter.classList.add('visible');clearTimeout(counterTimeout);counterTimeout=setTimeout(()=>counter.classList.remove('visible'),2000);}
window.addEventListener('scroll',updateProgress,{passive:true});
const animObserver=new IntersectionObserver((entries)=>{entries.forEach(entry=>{if(entry.isIntersecting&&entry.intersectionRatio>0.15){entry.target.querySelectorAll('.anim').forEach(el=>el.classList.add('visible'));entry.target.querySelectorAll('.bar-fill').forEach(bar=>{setTimeout(()=>bar.classList.add('animate'),300);});entry.target.querySelectorAll('.bar-chart,.donut-chart,.line-chart,.sparkline').forEach(chart=>chart.classList.add('is-visible'));entry.target.querySelectorAll('.stat-number[data-target]').forEach(el=>{if(!el.dataset.animated){el.dataset.animated='true';animateCounter(el);}});}});},{threshold:[0,0.15,0.5]});
slides.forEach(s=>animObserver.observe(s));
function animateCounter(el){const target=parseInt(el.dataset.target);const start=performance.now();const duration=2000;function update(now){const progress=Math.min((now-start)/duration,1);const eased=1-Math.pow(1-progress,4);el.textContent=Math.round(target*eased);if(progress<1)requestAnimationFrame(update);}requestAnimationFrame(update);}
window.addEventListener('load',()=>{setTimeout(()=>document.getElementById('navHint').classList.remove('show'),4000);});
  </script>
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
