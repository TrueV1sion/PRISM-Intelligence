// NAV PANEL
function toggleNav(){
  const p=document.getElementById('navPanel');
  const o=document.getElementById('navOverlay');
  const b=document.getElementById('navBtn');
  const isOpen=p.classList.contains('open');
  if(isOpen){p.classList.remove('open');o.classList.remove('open');b.innerHTML='&#9776;';}
  else{p.classList.add('open');o.classList.add('open');b.innerHTML='&#10005;';}
}

// SLIDE SNAP NAVIGATION
const slides=document.querySelectorAll('.slide');
const totalSlides=slides.length;
let currentSlide=0;
let counterTimeout;

function updateProgress(){
  const scrollTop=window.scrollY||document.documentElement.scrollTop;
  const docHeight=document.documentElement.scrollHeight-window.innerHeight;
  const pct=docHeight>0?(scrollTop/docHeight)*100:0;
  const progressEl = document.getElementById('progress') || document.getElementById('slideProgress');
  if (progressEl) progressEl.style.width=pct+'%';
  // Determine current slide
  let closest=0;
  let minDist=Infinity;
  slides.forEach((s,i)=>{
    const d=Math.abs(s.getBoundingClientRect().top);
    if(d<minDist){minDist=d;closest=i;}
  });
  currentSlide=closest;
  const counter=document.getElementById('slideCounter');
  counter.textContent=String(closest+1).padStart(2,'0')+' / '+String(totalSlides).padStart(2,'0');
  counter.classList.add('visible');
  clearTimeout(counterTimeout);
  counterTimeout=setTimeout(()=>counter.classList.remove('visible'),2000);
}

function goToSlide(idx){
  if(idx<0)idx=0;
  if(idx>=totalSlides)idx=totalSlides-1;
  slides[idx].scrollIntoView({behavior:'smooth',block:'start'});
}

// Keyboard navigation
document.addEventListener('keydown',function(e){
  const navOpen=document.getElementById('navPanel').classList.contains('open');
  if(e.key==='Escape'){if(navOpen)toggleNav();return;}
  if(navOpen)return;
  // Check if user is typing in an input
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
  switch(e.key){
    case'ArrowDown':case'PageDown':
      e.preventDefault();goToSlide(currentSlide+1);break;
    case'ArrowUp':case'PageUp':
      e.preventDefault();goToSlide(currentSlide-1);break;
    case' ':
      e.preventDefault();goToSlide(currentSlide+1);break;
    case'Home':
      e.preventDefault();goToSlide(0);break;
    case'End':
      e.preventDefault();goToSlide(totalSlides-1);break;
    case'ArrowRight':
      e.preventDefault();goToSlide(currentSlide+1);break;
    case'ArrowLeft':
      e.preventDefault();goToSlide(currentSlide-1);break;
  }
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click',function(e){
    e.preventDefault();
    const t=document.querySelector(this.getAttribute('href'));
    if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
  });
});

// Scroll listener
window.addEventListener('scroll',updateProgress,{passive:true});
window.addEventListener('load',function(){
  updateProgress();
  // Hide hint after 4 seconds
  setTimeout(()=>{document.getElementById('navHint').classList.remove('show');},4000);
});

// ANIMATED COUNTER — animates .stat-number[data-target] from 0 to target
function animateCounter(el) {
  const target = parseInt(el.dataset.target);
  if (isNaN(target)) return;
  const suffix = el.dataset.suffix || '';
  const prefix = el.dataset.prefix || '';
  const start = performance.now();
  const duration = 2000;
  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4); // ease-out quart
    el.textContent = prefix + Math.round(target * eased).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// All animation class selectors (original + enhanced)
const ANIM_SELECTOR = '.anim, .anim-scale, .anim-blur, .anim-slide-left, .anim-slide-right, .anim-spring, .anim-fade, .anim-zoom, .stagger-children';

// INTERSECTION OBSERVER FOR ANIMATIONS
const animObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    // Trigger if ANY part of the slide is intersecting
    if (entry.isIntersecting) {
      entry.target.querySelectorAll(ANIM_SELECTOR).forEach(el => el.classList.add('visible'));
      entry.target.querySelectorAll('.bar-fill').forEach(bar => {
        setTimeout(() => bar.classList.add('animate'), 300);
      });
      entry.target.querySelectorAll('.bar-chart, .line-chart, .donut-chart, .sparkline').forEach(chart => {
        chart.classList.add('is-visible');
      });
      // Animated counters — fire once per element
      entry.target.querySelectorAll('.stat-number[data-target]').forEach(el => {
        if (!el.dataset.animated) {
          el.dataset.animated = 'true';
          animateCounter(el);
        }
      });
    }
  });
}, { threshold: [0, 0.1, 0.5] });

// AMBIENT PARALLAX DEPTH (Desktop Only)
document.addEventListener('mousemove', (e) => {
  if (window.innerWidth < 768) return;
  const x = (e.clientX / window.innerWidth - 0.5) * 40;
  const y = (e.clientY / window.innerHeight - 0.5) * 40;
  document.querySelectorAll('.slide-bg-glow').forEach(glow => {
    glow.style.translate = `${x}px ${y}px`;
  });
});

// Observe all slides
document.querySelectorAll('.slide').forEach(s => animObserver.observe(s));

// Fallback: trigger the first slide after the initial hidden state has painted
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const firstSlide = document.querySelector('.slide');
    if (!firstSlide) return;
    firstSlide.querySelectorAll(ANIM_SELECTOR).forEach(el => el.classList.add('visible'));
    firstSlide.querySelectorAll('.bar-fill').forEach(bar => {
      setTimeout(() => bar.classList.add('animate'), 300);
    });
    firstSlide.querySelectorAll('.bar-chart, .line-chart, .donut-chart, .sparkline').forEach(chart => {
      chart.classList.add('is-visible');
    });
    firstSlide.querySelectorAll('.stat-number[data-target]').forEach(el => {
      if (!el.dataset.animated) {
        el.dataset.animated = 'true';
        animateCounter(el);
      }
    });
  });
});

// ─── ACCORDION ──────────────────────────────────────────────
document.querySelectorAll('.accordion-trigger').forEach(trigger => {
  trigger.addEventListener('click', () => {
    const item = trigger.closest('.accordion-item');
    if (!item) return;
    // Close siblings in same container
    const parent = item.parentElement;
    if (parent) {
      parent.querySelectorAll('.accordion-item.open').forEach(open => {
        if (open !== item) open.classList.remove('open');
      });
    }
    item.classList.toggle('open');
  });
});

// ─── TABS ───────────────────────────────────────────────────
document.querySelectorAll('.tab-group').forEach(group => {
  const buttons = group.querySelectorAll('.tab-button');
  const panels = group.querySelectorAll('.tab-panel');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      buttons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      // Support both data-tab and data-panel on panels
      const panel = group.querySelector(`.tab-panel[data-tab="${target}"]`) ||
                    group.querySelector(`.tab-panel[data-panel="${target}"]`);
      if (panel) panel.classList.add('active');
    });
  });
});

// NAV ITEM CLICK → SLIDE NAVIGATION
document.querySelectorAll('.nav-item[data-slide]').forEach(item => {
  item.addEventListener('click', () => {
    const idx = parseInt(item.dataset.slide);
    if (!isNaN(idx)) { goToSlide(idx); toggleNav(); }
  });
});

// ─── ECHARTS INITIALIZATION ─────────────────────────────────
(function initECharts() {
  if (typeof echarts === 'undefined') return;

  // Track initialized elements to avoid double-init
  const initialized = new WeakSet();
  const chartInstances = [];

  /**
   * Initialize a single div[data-echart] element.
   */
  function initChart(el) {
    if (initialized.has(el)) return;
    initialized.add(el);

    try {
      const option = JSON.parse(el.dataset.echart);

      // Remove non-serializable function references (animationDelay, formatter)
      // ECharts handles delay internally via series config
      if (option.series) {
        option.series.forEach(function(s) {
          if (s.animationDelay) delete s.animationDelay;
        });
      }

      // Initialize with dark theme for PRISM styling
      const chart = echarts.init(el, 'dark', { renderer: 'canvas' });
      chart.setOption(option);
      chartInstances.push(chart);
    } catch (e) {
      console.warn('[PRISM] ECharts init failed:', e, el);
    }
  }

  /**
   * Initialize all charts within a slide element.
   */
  function initChartsInSlide(slide) {
    slide.querySelectorAll('[data-echart]').forEach(initChart);
  }

  // Lazy-init charts when their slide enters viewport
  const chartObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        initChartsInSlide(entry.target);
      }
    });
  }, { threshold: 0.05 });

  document.querySelectorAll('.slide').forEach(function(s) { chartObserver.observe(s); });

  // Init charts in first visible slide immediately
  requestAnimationFrame(function() {
    var firstSlide = document.querySelector('.slide');
    if (firstSlide) initChartsInSlide(firstSlide);
  });

  // Resize all chart instances on window resize
  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      chartInstances.forEach(function(c) { c.resize(); });
    }, 200);
  });
})();

