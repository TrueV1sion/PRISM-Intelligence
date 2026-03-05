/**
 * PRISM Presentation Generator V3
 *
 * Spec-faithful implementation per presentation-system.md (1510 lines),
 * SKILL.md Phase 4, and methodology-core.md synthesis layers.
 *
 * Components: all 25 from the spec.
 * Editorial judgment: slide count matrix, component selection, error recovery.
 */

import type {
  IntelligenceManifest,
  AgentFinding,
  AgentResult,
  StructuredDataPoint,
  EmergentInsight,
  TensionPoint,
  SynthesisLayer,
  ConfidenceLevel,
} from "./pipeline/types";
import type { QualityAssuranceReport } from "./pipeline/quality-assurance";

// V3 Presentation CSS — Complete from presentation-system.md
const V3_CSS = `
:root {
  --inov-navy:#003D79;--inov-cerulean:#4E84C4;--inov-sky:#59DDFD;
  --inov-midnight:#001E3C;--inov-jade:#00E49F;--inov-sand:#F5E6BB;
  --inov-violet:#6C6CFF;--inov-cloud:#F4F0EA;
  --bg-primary:#0a0b10;--bg-secondary:#10121a;--bg-tertiary:#181b26;
  --bg-elevated:#1e2130;--bg-card:rgba(30,33,48,0.85);
  --text-primary:#f0f2f8;--text-secondary:#a0a8c0;--text-tertiary:#5c6480;
  --accent:#4E84C4;--accent-bright:#59DDFD;--accent-success:#00E49F;
  --accent-warning:#F5E6BB;--accent-error:#ff5c5c;--accent-violet:#6C6CFF;
  --border:rgba(78,132,196,0.12);--border-bright:rgba(89,221,253,0.25);
  --chart-1:#003D79;--chart-2:#4E84C4;--chart-3:#59DDFD;--chart-4:#001E3C;
  --chart-5:#00E49F;--chart-6:#F5E6BB;--chart-7:#6C6CFF;--chart-8:#F4F0EA;
  --text-xs:clamp(0.65rem,0.6rem + 0.2vw,0.8rem);
  --text-sm:clamp(0.8rem,0.74rem + 0.3vw,1rem);
  --text-base:clamp(1rem,0.92rem + 0.4vw,1.2rem);
  --text-lg:clamp(1.2rem,1.1rem + 0.5vw,1.5rem);
  --text-xl:clamp(1.5rem,1.35rem + 0.65vw,1.9rem);
  --text-2xl:clamp(1.9rem,1.7rem + 0.85vw,2.5rem);
  --text-3xl:clamp(2.4rem,2.1rem + 1.1vw,3.2rem);
  --text-hero:clamp(3.2rem,2.8rem + 1.6vw,4.5rem);
  --ease-out-expo:cubic-bezier(0.16,1,0.3,1);
  --ease-out-quart:cubic-bezier(0.25,1,0.5,1);
  --ease-spring:cubic-bezier(0.34,1.56,0.64,1);
  --dur-fast:200ms;--dur-normal:350ms;--dur-slow:600ms;--dur-cinematic:1000ms;
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important;}}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--bg-primary);color:var(--text-primary);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
html{scroll-snap-type:y mandatory;overflow-y:scroll;scroll-behavior:smooth;}
/* Slide framework */
.slide{min-height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:center;position:relative;padding:3rem 5vw;overflow:hidden;}
.slide-inner{max-width:1200px;margin:0 auto;width:100%;position:relative;z-index:2;}
.slide-bg-glow{position:absolute;width:600px;height:600px;border-radius:50%;filter:blur(120px);opacity:0.08;z-index:0;pointer-events:none;}
/* Fixed UI */
#slideProgress{position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,var(--inov-navy),var(--inov-cerulean),var(--inov-sky));z-index:100;transition:width 0.3s var(--ease-out-quart);width:0%;}
.prism-mark{position:fixed;top:1.5rem;left:2rem;font-size:var(--text-xs);font-weight:700;letter-spacing:0.25em;color:var(--accent);z-index:100;text-transform:uppercase;}
.slide-counter{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:1001;font-size:11px;color:var(--text-tertiary);letter-spacing:2px;font-weight:600;background:rgba(10,11,16,0.85);padding:4px 14px;border-radius:20px;border:1px solid var(--border);backdrop-filter:blur(8px);opacity:0;transition:opacity 0.3s;}
.slide-counter.visible{opacity:1;}
.slide-nav-hint{position:fixed;bottom:50px;left:50%;transform:translateX(-50%);z-index:1001;font-size:10px;color:var(--text-tertiary);letter-spacing:1px;text-align:center;opacity:0;transition:opacity 1s;pointer-events:none;}
.slide-nav-hint.show{opacity:0.6;}
/* Animation */
.anim{opacity:0;transform:translateY(24px);transition:opacity var(--dur-slow) var(--ease-out-expo),transform var(--dur-slow) var(--ease-out-expo);}
.anim.visible{opacity:1;transform:translateY(0);}
.anim.d1{transition-delay:100ms;}.anim.d2{transition-delay:200ms;}.anim.d3{transition-delay:300ms;}
.anim.d4{transition-delay:400ms;}.anim.d5{transition-delay:500ms;}.anim.d6{transition-delay:600ms;}.anim.d7{transition-delay:700ms;}
/* Typography */
.eyebrow{font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:var(--text-tertiary);margin-bottom:12px;}
.slide-title{font-size:var(--text-3xl);font-weight:700;line-height:1.15;margin-bottom:16px;background:linear-gradient(135deg,var(--text-primary) 0%,var(--accent-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.slide-subtitle{font-size:var(--text-base);color:var(--text-secondary);max-width:700px;margin-bottom:28px;line-height:1.7;}
.section-intro{font-size:13.5px;line-height:1.7;max-width:800px;margin-bottom:20px;color:var(--text-secondary);}
.hero-title{font-size:var(--text-hero);font-weight:800;line-height:1.1;background:linear-gradient(135deg,#fff 0%,var(--inov-sky) 60%,var(--inov-cerulean) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:16px;}
.hero-sub{font-size:var(--text-lg);color:var(--text-secondary);max-width:800px;margin:0 auto 12px;}
.hero-date{font-size:var(--text-sm);color:var(--text-tertiary);margin-bottom:28px;}
.hero-badge{display:inline-block;padding:6px 18px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;background:rgba(78,132,196,0.15);border:1px solid rgba(78,132,196,0.3);color:var(--accent);margin-bottom:20px;}
/* Tags */
.tag{display:inline-block;padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-right:6px;}
.tag.clinical{background:rgba(89,221,253,0.15);color:var(--accent-bright);}
.tag.financial{background:rgba(0,228,159,0.15);color:var(--accent-success);}
.tag.regulatory{background:rgba(255,92,92,0.15);color:var(--accent-error);}
.tag.quality{background:rgba(108,108,255,0.15);color:var(--accent-violet);}
.tag.strategic{background:rgba(78,132,196,0.15);color:var(--accent);}
.tag.competitive{background:rgba(249,115,22,0.15);color:#f97316;}
.tag.emergent{background:rgba(89,221,253,0.15);color:var(--accent-bright);}
.tag.ma{background:rgba(249,115,22,0.15);color:#f97316;}
.tag-red{background:rgba(255,92,92,0.15);color:var(--accent-error);}
.tag-green{background:rgba(0,228,159,0.15);color:var(--accent-success);}
.tag-blue{background:rgba(78,132,196,0.15);color:var(--accent);}
.tag-orange{background:rgba(249,115,22,0.15);color:#f97316;}
.tag-purple{background:rgba(108,108,255,0.15);color:var(--accent-violet);}
.tag-gold{background:rgba(245,230,187,0.15);color:var(--accent-warning);}
.tag-cyan{background:rgba(89,221,253,0.15);color:var(--accent-bright);}
/* Stat */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.5rem;margin-top:16px;}
.stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center;transition:transform 0.2s;}
.stat-card:hover{transform:translateY(-2px);}
.stat-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-tertiary);margin-bottom:6px;}
.stat-value{font-size:28px;font-weight:800;color:var(--text-primary);}
.stat-value.negative{color:var(--accent-error);}.stat-value.positive{color:var(--accent-success);}.stat-value.warn{color:var(--accent-warning);}
.stat-context{font-size:11px;color:var(--text-secondary);margin-top:4px;}
.stat-block{text-align:center;padding:24px;}
.stat-eyebrow{display:block;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-tertiary);margin-bottom:4px;}
.stat-number{font-size:48px;font-weight:800;color:var(--accent-bright);line-height:1;}
.stat-suffix{font-size:28px;font-weight:700;color:var(--accent-bright);}
.stat-trend{display:inline-block;font-size:11px;padding:2px 8px;border-radius:4px;margin-top:8px;}
.stat-trend.positive{background:rgba(0,228,159,0.15);color:var(--accent-success);}
.stat-trend.negative{background:rgba(255,92,92,0.15);color:var(--accent-error);}
/* Finding cards */
.finding-card{background:var(--bg-card);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:0 12px 12px 0;padding:16px 20px;margin:10px 0;}
.finding-card.emergent{border-left-color:var(--accent-bright);}
.finding-card.risk{border-left-color:var(--accent-error);}
.finding-card.opportunity{border-left-color:var(--accent-success);}
.finding-title{font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:6px;}
.finding-body{font-size:12.5px;color:var(--text-secondary);line-height:1.65;}
.confidence-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-top:8px;}
.confidence-badge.high{background:rgba(0,228,159,0.15);color:var(--accent-success);}
.confidence-badge.medium{background:rgba(245,230,187,0.15);color:var(--accent-warning);}
.confidence-badge.low{background:rgba(255,92,92,0.15);color:var(--accent-error);}
/* Agent chips */
.agent-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(78,132,196,0.1);border:1px solid rgba(78,132,196,0.25);border-radius:20px;padding:4px 12px;font-size:10.5px;color:var(--text-secondary);margin:3px;}
.agent-chip .dot{width:6px;height:6px;border-radius:50%;}
/* Hero stats */
.hero-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:18px;max-width:1100px;margin:0 auto;}
.hero-stat{background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:22px 14px;text-align:center;transition:transform 0.2s;}
.hero-stat:hover{transform:translateY(-2px);}
.hero-stat .value{font-size:26px;font-weight:800;margin-bottom:4px;}
.hero-stat .label{font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1.5px;}
/* Validation box */
.validation-box{display:flex;gap:16px;max-width:1100px;margin:24px auto 0;text-align:left;}
.validation-card{flex:1;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px;padding:14px 18px;}
.validation-card h4{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--accent-success);margin-bottom:8px;font-weight:700;}
.framework-card h4{color:var(--accent-violet);}
.val-row{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:11px;color:var(--text-secondary);}
.val-icon{width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;}
.val-icon.green{background:rgba(0,228,159,0.2);color:var(--accent-success);}
.framework-visual{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;}
.fw-node{background:rgba(108,108,255,0.1);border:1px solid rgba(108,108,255,0.3);border-radius:6px;padding:3px 8px;font-size:9px;color:var(--accent-violet);font-weight:600;}
.fw-arrow{color:var(--text-tertiary);font-size:10px;}
.fw-center{background:linear-gradient(135deg,rgba(108,108,255,0.2),rgba(78,132,196,0.2));border:1px solid rgba(108,108,255,0.4);border-radius:8px;padding:4px 12px;font-size:10px;color:var(--text-primary);font-weight:700;}
/* Grids */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:16px;}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:16px;}
.grid-4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-top:16px;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:2.5rem;}
/* Tables */
.prov-table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:12px;}
.prov-table th{text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);border-bottom:1px solid var(--border);}
.prov-table td{padding:8px 10px;border-bottom:1px solid rgba(78,132,196,0.06);color:var(--text-secondary);vertical-align:top;}
.prov-table tr:hover td{background:rgba(78,132,196,0.04);}
.compact-table{width:100%;border-collapse:collapse;font-size:11px;margin-top:10px;}
.compact-table th{text-align:left;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);border-bottom:1px solid var(--border);}
.compact-table td{padding:6px 8px;border-bottom:1px solid rgba(78,132,196,0.06);color:var(--text-secondary);}
/* Policy box */
.policy-box{background:rgba(255,92,92,0.05);border:1px solid rgba(255,92,92,0.2);border-radius:10px;padding:12px 16px;margin:6px 0;}
.policy-box.positive{background:rgba(0,228,159,0.05);border-color:rgba(0,228,159,0.2);}
.policy-box.neutral{background:rgba(78,132,196,0.05);border-color:rgba(78,132,196,0.2);}
.policy-box h4{font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px;}
.policy-box p{font-size:11.5px;color:var(--text-secondary);line-height:1.5;}
.impact{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;margin-top:5px;}
.impact-severe{color:var(--accent-error);}.impact-moderate{color:var(--accent-warning);}.impact-positive{color:var(--accent-success);}.impact-neutral{color:var(--accent);}
/* Emergence */
.emergent-slide{background:linear-gradient(135deg,var(--bg-primary) 0%,rgba(108,108,255,0.04) 100%);}
.emergent-number{font-size:120px;font-weight:900;color:rgba(89,221,253,0.06);position:absolute;top:-20px;left:-10px;}
.emergent-why{background:var(--bg-card);border:1px solid var(--border-bright);border-radius:12px;padding:1.5rem;margin-top:1.5rem;}
.emergent-why-label{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--accent-bright);margin-bottom:8px;font-weight:700;}
.emergence-card{background:linear-gradient(135deg,rgba(108,108,255,0.08),rgba(78,132,196,0.08));border:1px solid rgba(108,108,255,0.3);border-radius:14px;padding:20px;margin:8px 0;}
.emergence-card h4{color:var(--accent-violet);font-size:15px;margin-bottom:6px;}
.emergence-card p{font-size:12px;color:var(--text-secondary);line-height:1.6;}
/* Timeline */
.timeline{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:20px;position:relative;}
.timeline::before{content:'';position:absolute;top:15px;left:5%;right:5%;height:3px;background:linear-gradient(90deg,var(--accent-error),var(--accent-warning),var(--accent-success));border-radius:2px;}
.timeline-phase{text-align:center;padding:0 12px;position:relative;z-index:1;}
.timeline-dot{width:12px;height:12px;border-radius:50%;margin:10px auto 12px;border:2px solid var(--bg-primary);}
.timeline-year{font-size:18px;font-weight:800;margin-bottom:4px;}
.timeline-label{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-tertiary);margin-bottom:10px;}
.timeline-items{font-size:11.5px;color:var(--text-secondary);line-height:1.8;text-align:left;padding:0 6px;}
.timeline-items div{margin-bottom:4px;padding-left:12px;position:relative;}
.timeline-items div::before{content:'\\2022';position:absolute;left:0;color:var(--text-tertiary);}
/* Bars */
.bar-row{margin:8px 0;}
.bar-label{font-size:11px;color:var(--text-secondary);margin-bottom:4px;display:flex;justify-content:space-between;}
.bar-track{height:24px;background:rgba(255,255,255,0.04);border-radius:6px;overflow:hidden;position:relative;}
.bar-fill{height:100%;border-radius:6px;transform-origin:left;transform:scaleX(0);transition:transform 0.8s var(--ease-out-expo);display:flex;align-items:center;padding-left:8px;}
.bar-fill.animate{transform:scaleX(1);}
.bar-fill-value{font-size:10px;font-weight:700;color:white;white-space:nowrap;}
/* Threat meter */
.threat-meter{display:flex;gap:2px;align-items:center;}
.threat-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.1);}
.threat-dot.active-red{background:var(--accent-error);}
.threat-dot.active-orange{background:#f97316;}
.threat-dot.active-yellow{background:var(--accent-warning);}
.threat-dot.active-green{background:var(--accent-success);}
.threat-dot.active-blue{background:var(--accent);}
/* SVG charts */
.chart-container{margin:16px 0;text-align:center;}
.bar-chart .bar{transform-origin:bottom;transform:scaleY(0);transition:transform 0.6s var(--ease-out-expo),opacity 0.3s;}
.bar-chart.is-visible .bar{transform:scaleY(1);}
.bar-chart .bar:nth-child(1){transition-delay:0.1s;}.bar-chart .bar:nth-child(2){transition-delay:0.2s;}
.bar-chart .bar:nth-child(3){transition-delay:0.3s;}.bar-chart .bar:nth-child(4){transition-delay:0.4s;}
.bar-chart .bar:nth-child(5){transition-delay:0.5s;}.bar-chart .bar:nth-child(6){transition-delay:0.6s;}
.bar-chart .bar:hover,.bar-chart .bar:focus{opacity:0.85;outline:2px solid var(--accent);outline-offset:2px;}
.donut-chart .segment{transition:stroke-dashoffset 1s var(--ease-out-expo),opacity 0.2s;}
.donut-chart .segment:hover{opacity:0.8;stroke-width:28;}
.chart-legend{display:flex;flex-wrap:wrap;gap:12px;list-style:none;padding:0;margin-top:16px;}
.legend-dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;}
.donut-wrapper{display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
/* Quote */
.quote-block{border-left:3px solid var(--accent-warning);padding:10px 18px;margin:10px 0;background:rgba(245,230,187,0.05);border-radius:0 8px 8px 0;font-style:italic;color:var(--text-primary);font-size:14px;}
.quote-attr{font-style:normal;font-size:11px;color:var(--text-secondary);margin-top:4px;}
/* Inovalon header */
.inovalon-header{background:linear-gradient(135deg,rgba(78,132,196,0.1),rgba(0,228,159,0.1));border:1px solid rgba(78,132,196,0.2);border-radius:14px;padding:20px;margin-bottom:16px;text-align:center;}
.inovalon-header h3{color:var(--accent);margin-bottom:4px;font-size:18px;}
.inovalon-header p{font-size:12px;color:var(--text-secondary);}
/* State grid */
.state-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px;}
.state-item{background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:10.5px;}
.state-item .state-name{font-weight:600;color:var(--text-primary);}
.state-item .state-impact{color:var(--accent);font-weight:700;}
/* Timeline bar */
.timeline-bar{display:flex;height:6px;border-radius:3px;overflow:hidden;margin-top:5px;background:rgba(255,255,255,0.05);}
.timeline-segment{height:100%;}.tl-done{background:var(--accent-success);}.tl-active{background:var(--accent-warning);}.tl-pending{background:rgba(255,255,255,0.1);}
.pipeline-caption{font-size:9.5px;color:var(--text-tertiary);margin:3px 0 0;}
/* TOC */
.toc-group-header{font-size:11px;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border);color:var(--text-tertiary);}
.toc-item{border:1px solid var(--border);border-radius:8px;margin-bottom:6px;}
/* Source */
.source-list{margin-top:8px;font-size:9.5px;color:var(--text-tertiary);line-height:1.8;}
.source-list a{font-size:9.5px;color:var(--accent);text-decoration:none;border-bottom:1px dotted rgba(78,132,196,0.3);}
.source-unverified{color:var(--accent-warning);font-size:0.75em;vertical-align:super;cursor:help;opacity:0.85;}
/* Slide footer */
.slide-footer{position:absolute;bottom:16px;left:40px;right:40px;display:flex;justify-content:space-between;font-size:10px;color:var(--text-tertiary);border-top:1px solid var(--border);padding-top:8px;}
/* Nav */
.nav-toggle{position:fixed;top:20px;right:20px;z-index:1000;width:44px;height:44px;border-radius:50%;background:rgba(78,132,196,0.15);border:1px solid rgba(78,132,196,0.3);color:var(--accent);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;backdrop-filter:blur(12px);transition:all 0.3s;}
.nav-toggle:hover{background:rgba(78,132,196,0.3);transform:scale(1.05);}
.nav-panel{position:fixed;top:0;right:-340px;width:320px;height:100vh;background:rgba(10,11,16,0.97);border-left:1px solid var(--border);z-index:999;transition:right 0.35s ease;overflow-y:auto;padding:70px 20px 30px;backdrop-filter:blur(20px);}
.nav-panel.open{right:0;}
.nav-panel h3{font-size:11px;text-transform:uppercase;letter-spacing:3px;color:var(--accent);margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid var(--border);}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:all 0.2s;text-decoration:none;margin-bottom:2px;}
.nav-item:hover{background:rgba(78,132,196,0.1);}
.nav-item .nav-num{font-size:10px;color:var(--text-tertiary);min-width:24px;font-weight:700;}
.nav-item .nav-label{font-size:12.5px;color:var(--text-primary);font-weight:500;}
.nav-item .nav-tag{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-left:auto;}
.nav-tag-key{color:var(--accent-warning);}.nav-tag-new{color:var(--accent-bright);}
.nav-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:998;display:none;}
.nav-overlay.open{display:block;}
/* Utility color */
.highlight{color:var(--text-primary);font-weight:600;}
.red{color:var(--accent-error);}.green{color:var(--accent-success);}.blue{color:var(--accent);}
.purple{color:var(--accent-violet);}.gold{color:var(--accent-warning);}.cyan{color:var(--accent-bright);}
.card-accent{border-left:3px solid var(--accent-error);}.card-blue{border-left:3px solid var(--accent);}
.card-green{border-left:3px solid var(--accent-success);}.card-purple{border-left:3px solid var(--accent-violet);}
a{color:var(--accent);text-decoration:none;}a:hover{color:var(--accent-bright);}
/* Responsive */
@media(max-width:1024px){.slide{padding:40px 30px;}.hero-stats{grid-template-columns:repeat(3,1fr);}.grid-2,.grid-3,.grid-4{grid-template-columns:1fr;}.state-grid{grid-template-columns:1fr 1fr;}.validation-box{flex-direction:column;}.nav-toggle{top:12px;right:12px;}}
@media(max-width:768px){.two-col{grid-template-columns:1fr;}.hero-stats{grid-template-columns:repeat(2,1fr);}}
`;


// V3 Presentation JS — Complete from presentation-system.md
const V3_JS = `
const slides = document.querySelectorAll('.slide');
const totalSlides = slides.length;
let currentSlide = 0;
let counterTimeout;

function goToSlide(n) {
  n = Math.max(0, Math.min(n, totalSlides - 1));
  currentSlide = n;
  slides[n].scrollIntoView({ behavior: 'smooth' });
}

function toggleNav() {
  const p = document.getElementById('navPanel');
  const o = document.getElementById('navOverlay');
  const b = document.getElementById('navBtn');
  const isOpen = p.classList.contains('open');
  if (isOpen) { p.classList.remove('open'); o.classList.remove('open'); b.innerHTML = '&#9776;'; }
  else { p.classList.add('open'); o.classList.add('open'); b.innerHTML = '&#10005;'; }
}

function updateProgress() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  document.getElementById('slideProgress').style.width = pct + '%';
  let closest = 0, minDist = Infinity;
  slides.forEach((s, i) => {
    const d = Math.abs(s.getBoundingClientRect().top);
    if (d < minDist) { minDist = d; closest = i; }
  });
  currentSlide = closest;
  const counter = document.getElementById('slideCounter');
  counter.textContent = String(closest + 1).padStart(2, '0') + ' / ' + String(totalSlides).padStart(2, '0');
  counter.classList.add('visible');
  clearTimeout(counterTimeout);
  counterTimeout = setTimeout(() => counter.classList.remove('visible'), 2000);
}

function animateCounter(el) {
  const target = parseInt(el.dataset.target);
  if (isNaN(target)) return;
  const start = performance.now();
  const duration = 2000;
  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    el.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

const animObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && entry.intersectionRatio > 0.15) {
      entry.target.querySelectorAll('.anim').forEach(el => el.classList.add('visible'));
      entry.target.querySelectorAll('.bar-fill').forEach(bar => {
        setTimeout(() => bar.classList.add('animate'), 300);
      });
      entry.target.querySelectorAll('.bar-chart, .line-chart, .donut-chart, .sparkline, .comparison-bars')
        .forEach(chart => chart.classList.add('is-visible'));
      entry.target.querySelectorAll('.stat-number[data-target]').forEach(el => {
        if (!el.dataset.animated) { el.dataset.animated = 'true'; animateCounter(el); }
      });
    }
  });
}, { threshold: [0, 0.15, 0.5] });
slides.forEach(s => animObserver.observe(s));

document.addEventListener('keydown', (e) => {
  const navOpen = document.getElementById('navPanel').classList.contains('open');
  if (e.key === 'Escape') { if (navOpen) toggleNav(); return; }
  if (navOpen) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  switch (e.key) {
    case 'ArrowDown': case 'PageDown': e.preventDefault(); goToSlide(currentSlide + 1); break;
    case 'ArrowUp': case 'PageUp': e.preventDefault(); goToSlide(currentSlide - 1); break;
    case ' ': case 'ArrowRight': e.preventDefault(); goToSlide(currentSlide + 1); break;
    case 'ArrowLeft': e.preventDefault(); goToSlide(currentSlide - 1); break;
    case 'Home': e.preventDefault(); goToSlide(0); break;
    case 'End': e.preventDefault(); goToSlide(totalSlides - 1); break;
  }
});

window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('load', () => {
  setTimeout(() => { const h = document.getElementById('navHint'); if (h) h.classList.remove('show'); }, 4000);
  updateProgress();
});
`;


// ─── V3 Slide Builder Logic ─────────────────────────────────────

// ─── Helpers ────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function shortSource(source: string): string {
  try { return new URL(source).hostname.replace("www.", ""); } catch { /* not a URL */ }
  return truncate(source, 40);
}

function fmtDate(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const AGENT_COLORS = [
  "var(--accent-bright)", "var(--accent-success)", "#f97316",
  "var(--accent-error)", "var(--accent-violet)", "var(--accent-warning)",
  "var(--accent)", "var(--inov-cloud)",
];
function agentColor(i: number): string { return AGENT_COLORS[i % AGENT_COLORS.length]; }

/** Map dimension/archetype keywords to tag classes */
function dimTag(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("clinical") || n.includes("health")) return "clinical";
  if (n.includes("financ") || n.includes("revenue") || n.includes("cost")) return "financial";
  if (n.includes("regulat") || n.includes("compliance") || n.includes("cms")) return "regulatory";
  if (n.includes("quality") || n.includes("star") || n.includes("hedis")) return "quality";
  if (n.includes("competit") || n.includes("market")) return "competitive";
  if (n.includes("m&a") || n.includes("acqui")) return "ma";
  return "strategic";
}

/** Confidence badge HTML */
function confBadge(conf: string, source: string): string {
  const cls = conf === "HIGH" ? "high" : conf === "MEDIUM" ? "medium" : "low";
  return `<span class="confidence-badge ${cls}">${conf} &mdash; ${esc(shortSource(source))}</span>`;
}

/** Finding card HTML */
function findingCard(f: AgentFinding, cls?: string): string {
  const cardCls = cls || (f.confidence === "HIGH" ? "opportunity" : f.confidence === "LOW" ? "risk" : "");
  return `<div class="finding-card ${cardCls}">
  <div class="finding-title">${esc(truncate(f.statement, 120))}</div>
  <div class="finding-body">${esc(f.implication || f.evidence)}</div>
  ${confBadge(f.confidence, f.source)}
</div>`;
}

/** Source list from findings — hyperlinked for URLs, styled for text references */
function sourceList(findings: AgentFinding[]): string {
  const seen = new Set<string>();
  const sources: string[] = [];
  for (const f of findings) {
    const s = f.source;
    if (!s || s.length < 3 || seen.has(s)) continue;
    seen.add(s);
    try {
      const url = new URL(s);
      sources.push(`<a href="${esc(s)}" target="_blank">${esc(url.hostname.replace("www.", ""))}</a>`);
    } catch {
      // Non-URL source — render as styled text reference, not broken <a> tag
      sources.push(`<span style="color:var(--accent)">${esc(truncate(s, 50))}</span>`);
    }
    if (sources.length >= 6) break;
  }
  if (sources.length === 0) return "";
  return `<div class="source-list anim d5"><strong>Sources:</strong> ${sources.join(" | ")}</div>`;
}

/** Slide footer */
function slideFooter(agentName: string, findingCount: number, confidence: number): string {
  return `<div class="slide-footer"><span>${esc(agentName)} | ${findingCount} findings | Confidence: ${confidence.toFixed(2)}</span><span>PRISM Executive Intelligence Brief</span></div>`;
}


// ─── Structured Data Extraction Helpers ─────────────────────────

/** Extract all structured data points from findings */
function extractAllStructured(findings: AgentFinding[]): StructuredDataPoint[] {
  return findings.flatMap(f => f.structuredData || []);
}

/** Extract metric-type data points (dollar amounts, percentages, KPIs) */
function extractMetrics(findings: AgentFinding[]): StructuredDataPoint[] {
  return extractAllStructured(findings).filter(d => d.type === "metric");
}

/** Extract comparison/ranking data points */
function extractComparisons(findings: AgentFinding[]): StructuredDataPoint[] {
  return extractAllStructured(findings).filter(d => d.type === "comparison" || d.type === "ranking");
}

/** Extract entity data points (companies, drugs, regulations) */
function extractEntities(findings: AgentFinding[]): StructuredDataPoint[] {
  return extractAllStructured(findings).filter(d => d.type === "entity");
}

/** Extract timeline events */
function extractTimeline(findings: AgentFinding[]): StructuredDataPoint[] {
  return extractAllStructured(findings).filter(d => d.type === "timeline_event");
}

/** Extract geographic data points */
function extractGeographic(findings: AgentFinding[]): StructuredDataPoint[] {
  return extractAllStructured(findings).filter(d => d.type === "geographic");
}

/** Format a structured data point value for display */
function fmtValue(dp: StructuredDataPoint): string {
  const v = String(dp.value);
  if (dp.unit === "$") return `$${v}`;
  if (dp.unit === "%") return `${v}%`;
  return dp.unit ? `${v} ${dp.unit}` : v;
}

/** Color class from structured data colorHint */
function colorClass(hint?: string): string {
  if (hint === "positive") return "positive";
  if (hint === "negative") return "negative";
  if (hint === "warning") return "warn";
  return "";
}


// ─── Missing Component Generators ───────────────────────────────

/** Quote block component — for sourced citations */
function quoteBlock(text: string, attribution: string): string {
  return `<div class="quote-block anim d3">${esc(text)}<div class="quote-attr">— ${esc(attribution)}</div></div>`;
}

/** State grid — geographic data visualization */
function stateGrid(items: Array<{ name: string; impact: string }>): string {
  if (items.length === 0) return "";
  return `<div class="state-grid anim d3">${items.slice(0, 12).map(i =>
    `<div class="state-item"><span class="state-name">${esc(i.name)}</span> <span class="state-impact">${esc(i.impact)}</span></div>`
  ).join("\n")}</div>`;
}

/** Compact table — competitive landscape, regulatory tracker */
function compactTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "";
  return `<table class="compact-table anim d3">
  <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.slice(0, 12).map(row =>
    `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join("")}</tr>`
  ).join("\n")}</tbody>
</table>`;
}

/** Animated counter — for headline numbers */
function animatedCounter(value: number, label: string, suffix?: string): string {
  return `<div class="stat-block anim d2">
  <span class="stat-eyebrow">${esc(label)}</span>
  <span class="stat-number" data-target="${value}">${value}</span>${suffix ? `<span class="stat-suffix">${esc(suffix)}</span>` : ""}
</div>`;
}

/** Inovalon header banner */
function inovalonHeader(title: string, subtitle: string): string {
  return `<div class="inovalon-header anim d1">
  <h3>${esc(title)}</h3>
  <p>${esc(subtitle)}</p>
</div>`;
}

/** Policy box with severity variant */
function policyBox(title: string, body: string, variant: "positive" | "neutral" | "risk" = "risk", impactLabel?: string): string {
  const cls = variant === "positive" ? " positive" : variant === "neutral" ? " neutral" : "";
  const impactCls = variant === "positive" ? "impact-positive" : variant === "risk" ? "impact-severe" : "impact-moderate";
  return `<div class="policy-box${cls}">
  <h4>${esc(title)}</h4>
  <p>${esc(body)}</p>
  ${impactLabel ? `<div class="impact ${impactCls}">${esc(impactLabel)}</div>` : ""}
</div>`;
}


// ─── Domain-Specific Slide Templates ────────────────────────────

/** Build a financial-focused slide with stat cards, comparison bars, and metrics */
function buildFinancialSlide(
  ar: { agent: { name: string; dimension: string }; result: AgentResult },
  slideId: string, tag: string
): string {
  const findings = ar.result.findings;
  const metrics = extractMetrics(findings);
  const avgConf = findings.length > 0
    ? findings.reduce((s, f) => s + (f.confidence === "HIGH" ? 1 : f.confidence === "MEDIUM" ? 0.66 : 0.33), 0) / findings.length
    : 0;

  // Stat grid from extracted metrics (up to 4)
  const statCards = metrics.slice(0, 4).map(m => {
    const cls = colorClass(m.colorHint);
    return `<div class="stat-card"><div class="stat-label">${esc(m.label)}</div><div class="stat-value ${cls}">${esc(fmtValue(m))}</div>${m.context ? `<div class="stat-context">${esc(m.context)}</div>` : ""}</div>`;
  }).join("\n      ");

  // Comparison bars from metrics with numeric values
  const numericMetrics = metrics.filter(m => typeof m.value === "number").slice(0, 6);
  const barsHtml = numericMetrics.length >= 3
    ? comparisonBars(numericMetrics.map(m => ({
      label: m.label,
      value: m.value as number,
      max: Math.max(...numericMetrics.map(n => n.value as number)) * 1.2,
      metric: fmtValue(m),
    })))
    : "";

  // Top finding cards for context
  const topF = findings.slice(0, 2).map(f => findingCard(f)).join("\n        ");

  return `<section class="slide" id="${slideId}">
  <div class="slide-bg-glow" style="background:var(--inov-jade);bottom:-200px;right:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag ${tag}">${esc(ar.agent.dimension.split(" ").slice(0, 2).join(" "))}</span> ${esc(ar.agent.dimension)}</div>
    <h2 class="slide-title anim d1">${esc(truncate((ar.result.summary || findings[0]?.statement || ar.agent.dimension).split('.')[0], 80))}</h2>
    <p class="section-intro anim d2">${esc(truncate(ar.result.summary, 200))}</p>
    ${statCards ? `<div class="stat-grid anim d3">${statCards}</div>` : ""}
    <div class="grid-2 anim d4">
      <div>${topF}</div>
      <div>${barsHtml || `<div class="stat-card"><div class="stat-label">Findings</div><div class="stat-value positive">${findings.length}</div></div>`}</div>
    </div>
    ${sourceList(findings)}
  </div>
  ${slideFooter(ar.agent.name, findings.length, avgConf)}
</section>`;
}

/** Build a regulatory-focused slide with policy boxes and timeline bars */
function buildRegulatorySlide(
  ar: { agent: { name: string; dimension: string }; result: AgentResult },
  slideId: string, tag: string
): string {
  const findings = ar.result.findings;
  const avgConf = findings.length > 0
    ? findings.reduce((s, f) => s + (f.confidence === "HIGH" ? 1 : f.confidence === "MEDIUM" ? 0.66 : 0.33), 0) / findings.length
    : 0;

  // Policy boxes from findings (positive/neutral/risk based on confidence + implication)
  const policyBoxes = findings.slice(0, 6).map(f => {
    const variant = f.confidence === "HIGH" && f.implication.toLowerCase().includes("opportunit") ? "positive" as const
      : f.confidence === "LOW" || f.implication.toLowerCase().includes("risk") || f.implication.toLowerCase().includes("threat") ? "risk" as const
        : "neutral" as const;
    const severity = f.confidence === "LOW" ? "SEVERE" : f.confidence === "MEDIUM" ? "MODERATE" : "NOTABLE";
    return policyBox(truncate(f.statement, 80), truncate(f.implication, 120), variant, severity);
  }).join("\n      ");

  // Timeline from structured data
  const timeline = extractTimeline(findings);
  const timelineHtml = timeline.length >= 2
    ? `<div class="timeline anim d4"><div class="timeline-phase"><div class="timeline-dot" style="background:var(--accent-error);"></div><div class="timeline-year" style="color:var(--accent-error);">Near-Term</div><div class="timeline-items">${timeline.slice(0, Math.ceil(timeline.length / 2)).map(t => `<div>${esc(t.label)}: ${esc(String(t.value))}</div>`).join("")}</div></div><div class="timeline-phase"><div class="timeline-dot" style="background:var(--accent-success);"></div><div class="timeline-year" style="color:var(--accent-success);">Upcoming</div><div class="timeline-items">${timeline.slice(Math.ceil(timeline.length / 2)).map(t => `<div>${esc(t.label)}: ${esc(String(t.value))}</div>`).join("")}</div></div></div>`
    : "";

  return `<section class="slide" id="${slideId}">
  <div class="slide-bg-glow" style="background:var(--accent-error);top:-200px;left:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag ${tag}">${esc(ar.agent.dimension.split(" ").slice(0, 2).join(" "))}</span> ${esc(ar.agent.dimension)}</div>
    <h2 class="slide-title anim d1">${esc(truncate((ar.result.summary || findings[0]?.statement || ar.agent.dimension).split('.')[0], 80))}</h2>
    <p class="section-intro anim d2">${esc(truncate(ar.result.summary, 200))}</p>
    <div class="grid-2 anim d3">
      <div>${policyBoxes}</div>
      <div>
        ${timelineHtml}
        ${ar.result.gaps.length > 0 ? `<div class="policy-box neutral"><h4>Regulatory Unknowns</h4><p>${ar.result.gaps.slice(0, 2).map(g => esc(truncate(g, 80))).join("<br>")}</p></div>` : ""}
      </div>
    </div>
    ${sourceList(findings)}
  </div>
  ${slideFooter(ar.agent.name, findings.length, avgConf)}
</section>`;
}

/** Build a competitive-focused slide with compact tables and threat meters */
function buildCompetitiveSlide(
  ar: { agent: { name: string; dimension: string }; result: AgentResult },
  slideId: string, tag: string
): string {
  const findings = ar.result.findings;
  const entities = extractEntities(findings);
  const metrics = extractMetrics(findings);
  const avgConf = findings.length > 0
    ? findings.reduce((s, f) => s + (f.confidence === "HIGH" ? 1 : f.confidence === "MEDIUM" ? 0.66 : 0.33), 0) / findings.length
    : 0;

  // Build competitive table from entities
  const tableHtml = entities.length >= 2
    ? compactTable(
      ["Entity", "Category", "Assessment"],
      entities.slice(0, 10).map(e => [
        e.label,
        e.metadata?.category || "Competitor",
        String(e.value),
      ])
    )
    : "";

  // Threat meters for key competitors
  const threatHtml = entities.slice(0, 5).map(e => {
    const level = e.metadata?.threat_level ? parseInt(e.metadata.threat_level) : (e.colorHint === "negative" ? 4 : e.colorHint === "warning" ? 3 : 2);
    return `<div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0;font-size:11px;color:var(--text-secondary);"><span>${esc(e.label)}</span>${threatMeter(Math.min(level, 5))}</div>`;
  }).join("\n        ");

  // Stat cards from financial metrics
  const statCards = metrics.slice(0, 3).map(m =>
    `<div class="stat-card"><div class="stat-label">${esc(m.label)}</div><div class="stat-value ${colorClass(m.colorHint)}">${esc(fmtValue(m))}</div></div>`
  ).join("\n      ");

  return `<section class="slide" id="${slideId}">
  <div class="slide-bg-glow" style="background:var(--accent-warning);top:-200px;right:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag ${tag}">${esc(ar.agent.dimension.split(" ").slice(0, 2).join(" "))}</span> ${esc(ar.agent.dimension)}</div>
    <h2 class="slide-title anim d1">${esc(truncate((ar.result.summary || findings[0]?.statement || ar.agent.dimension).split('.')[0], 80))}</h2>
    <p class="section-intro anim d2">${esc(truncate(ar.result.summary, 200))}</p>
    ${statCards ? `<div class="stat-grid anim d3">${statCards}</div>` : ""}
    <div class="grid-2 anim d4">
      <div>${tableHtml || findings.slice(0, 3).map(f => findingCard(f)).join("\n        ")}</div>
      <div>
        ${threatHtml ? `<div class="stat-card"><div class="stat-label">Threat Assessment</div>${threatHtml}</div>` : ""}
        ${ar.result.gaps.length > 0 ? `<div class="policy-box neutral"><h4>Intelligence Gaps</h4><p>${ar.result.gaps.slice(0, 2).map(g => esc(truncate(g, 80))).join("<br>")}</p></div>` : ""}
      </div>
    </div>
    ${sourceList(findings)}
  </div>
  ${slideFooter(ar.agent.name, findings.length, avgConf)}
</section>`;
}

/** Build a clinical/quality slide with data-rich visualization */
function buildClinicalSlide(
  ar: { agent: { name: string; dimension: string }; result: AgentResult },
  slideId: string, tag: string
): string {
  const findings = ar.result.findings;
  const metrics = extractMetrics(findings);
  const geographic = extractGeographic(findings);
  const avgConf = findings.length > 0
    ? findings.reduce((s, f) => s + (f.confidence === "HIGH" ? 1 : f.confidence === "MEDIUM" ? 0.66 : 0.33), 0) / findings.length
    : 0;

  // Quote block from highest-confidence finding with a good source
  const quoteFinding = findings.find(f => f.confidence === "HIGH" && f.source.length > 10);
  const quoteHtml = quoteFinding ? quoteBlock(truncate(quoteFinding.statement, 150), shortSource(quoteFinding.source)) : "";

  // State grid for geographic data
  const geoHtml = geographic.length >= 3
    ? stateGrid(geographic.slice(0, 12).map(g => ({ name: g.label, impact: String(g.value) })))
    : "";

  // Metrics as stat cards
  const statCards = metrics.slice(0, 4).map(m => {
    const cls = colorClass(m.colorHint);
    return `<div class="stat-card"><div class="stat-label">${esc(m.label)}</div><div class="stat-value ${cls}">${esc(fmtValue(m))}</div>${m.context ? `<div class="stat-context">${esc(m.context)}</div>` : ""}</div>`;
  }).join("\n      ");

  // Regular finding cards for non-quote findings
  const cards = findings.filter(f => f !== quoteFinding).slice(0, 3).map(f => findingCard(f)).join("\n        ");

  return `<section class="slide" id="${slideId}">
  <div class="slide-bg-glow" style="background:var(--accent-bright);bottom:-200px;left:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag ${tag}">${esc(ar.agent.dimension.split(" ").slice(0, 2).join(" "))}</span> ${esc(ar.agent.dimension)}</div>
    <h2 class="slide-title anim d1">${esc(truncate((ar.result.summary || findings[0]?.statement || ar.agent.dimension).split('.')[0], 80))}</h2>
    <p class="section-intro anim d2">${esc(truncate(ar.result.summary, 200))}</p>
    ${quoteHtml}
    ${statCards ? `<div class="stat-grid anim d3">${statCards}</div>` : ""}
    <div class="grid-2 anim d4">
      <div>${cards}</div>
      <div>${geoHtml || (ar.result.gaps.length > 0 ? `<div class="policy-box neutral"><h4>Knowledge Gaps</h4><p>${ar.result.gaps.slice(0, 2).map(g => esc(truncate(g, 80))).join("<br>")}</p></div>` : "")}</div>
    </div>
    ${sourceList(findings)}
  </div>
  ${slideFooter(ar.agent.name, findings.length, avgConf)}
</section>`;
}

/** Build a strategic/Inovalon impact slide */
function buildStrategicSlide(
  ar: { agent: { name: string; dimension: string }; result: AgentResult },
  slideId: string, tag: string
): string {
  const findings = ar.result.findings;
  const metrics = extractMetrics(findings);
  const avgConf = findings.length > 0
    ? findings.reduce((s, f) => s + (f.confidence === "HIGH" ? 1 : f.confidence === "MEDIUM" ? 0.66 : 0.33), 0) / findings.length
    : 0;

  // Inovalon header if strategic
  const header = ar.agent.dimension.toLowerCase().includes("inovalon") || ar.agent.dimension.toLowerCase().includes("strategic")
    ? inovalonHeader(ar.agent.dimension, truncate(ar.result.summary, 100))
    : "";

  // Impact bars from metrics
  const impactBars = metrics.length >= 3
    ? comparisonBars(metrics.slice(0, 6).map(m => ({
      label: m.label,
      value: typeof m.value === "number" ? m.value : parseFloat(String(m.value)) || 50,
      max: 100,
      metric: fmtValue(m),
      color: m.colorHint === "positive" ? "var(--accent-success)" : m.colorHint === "negative" ? "var(--accent-error)" : undefined,
    })))
    : "";

  // Recommendation cards from action-oriented findings
  const recommendations = findings
    .filter(f => f.implication.length > 20)
    .slice(0, 3)
    .map(f => policyBox(truncate(f.statement, 60), truncate(f.implication, 120), f.confidence === "HIGH" ? "positive" : "neutral"))
    .join("\n      ");

  return `<section class="slide" id="${slideId}">
  <div class="slide-bg-glow" style="background:var(--inov-cerulean);top:-200px;left:-200px;"></div>
  <div class="slide-inner">
    ${header}
    <div class="eyebrow anim"><span class="tag ${tag}">${esc(ar.agent.dimension.split(" ").slice(0, 2).join(" "))}</span> ${esc(ar.agent.dimension)}</div>
    <h2 class="slide-title anim d1">${esc(truncate((ar.result.summary || findings[0]?.statement || ar.agent.dimension).split('.')[0], 80))}</h2>
    <p class="section-intro anim d2">${esc(truncate(ar.result.summary, 200))}</p>
    <div class="grid-2 anim d3">
      <div>${impactBars || findings.slice(0, 3).map(f => findingCard(f)).join("\n        ")}</div>
      <div>${recommendations}</div>
    </div>
    ${sourceList(findings)}
  </div>
  ${slideFooter(ar.agent.name, findings.length, avgConf)}
</section>`;
}

/** Generic fallback slide (original finding card pattern, improved) */
function buildGenericSlide(
  ar: { agent: { name: string; dimension: string }; result: AgentResult },
  slideId: string, tag: string
): string {
  const findings = ar.result.findings;
  const metrics = extractMetrics(findings);
  const topF = findings.slice(0, 3);
  const avgConf = findings.length > 0
    ? findings.reduce((s, f) => s + (f.confidence === "HIGH" ? 1 : f.confidence === "MEDIUM" ? 0.66 : 0.33), 0) / findings.length
    : 0;

  // Use real metrics for bar chart if available, otherwise fall back to confidence chart
  const barChart = metrics.length >= 3
    ? svgBarChart(
      metrics.slice(0, 6).map(m => ({
        label: truncate(m.label, 15),
        value: typeof m.value === "number" ? m.value : parseFloat(String(m.value)) || 0,
      })),
      `Data from ${ar.agent.dimension}`
    )
    : findings.length >= 3
      ? svgBarChart(
        findings.slice(0, 6).map(f => ({
          label: truncate(f.statement.split(" ").slice(0, 3).join(" "), 15),
          value: f.confidence === "HIGH" ? 3 : f.confidence === "MEDIUM" ? 2 : 1,
        })),
        `Confidence distribution for ${ar.agent.dimension}`
      )
      : "";

  return `<section class="slide" id="${slideId}">
  <div class="slide-bg-glow" style="background:var(--inov-sky);bottom:-200px;right:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag ${tag}">${esc(ar.agent.dimension.split(" ").slice(0, 2).join(" "))}</span> ${esc(ar.agent.dimension)}</div>
    <h2 class="slide-title anim d1">${esc(truncate((ar.result.summary || findings[0]?.statement || ar.agent.dimension).split('.')[0], 80))}</h2>
    <p class="section-intro anim d2">${esc(truncate(ar.result.summary, 200))}</p>
    <div class="grid-2 anim d3">
      <div>${topF.map(f => findingCard(f)).join("\n        ")}</div>
      <div>
        ${barChart || `<div class="stat-card" style="margin-bottom:12px;"><div class="stat-label">Findings</div><div class="stat-value positive">${findings.length}</div></div>`}
        <div class="stat-card" style="margin-bottom:12px;">
          <div class="stat-label">Agent Summary</div>
          <div class="stat-context" style="text-align:left;font-size:12px;">${esc(truncate(ar.result.summary, 150))}</div>
        </div>
        ${ar.result.gaps.length > 0 ? `<div class="policy-box neutral"><h4>Knowledge Gaps</h4><p>${ar.result.gaps.slice(0, 2).map(g => esc(truncate(g, 80))).join("<br>")}</p></div>` : ""}
      </div>
    </div>
    ${sourceList(findings)}
  </div>
  ${slideFooter(ar.agent.name, findings.length, avgConf)}
</section>`;
}

/** Route an agent result to the appropriate slide template based on contentType */
function routeToSlideTemplate(
  ar: { agent: { name: string; dimension: string }; result: AgentResult; meta: { agentId: string } },
  slideId: string,
): SlideManifest {
  const tag = dimTag(ar.agent.dimension);
  const contentType = ar.result.contentType || "general";

  let html: string;
  switch (contentType) {
    case "financial":
      html = buildFinancialSlide(ar, slideId, tag);
      break;
    case "regulatory":
      html = buildRegulatorySlide(ar, slideId, tag);
      break;
    case "competitive":
      html = buildCompetitiveSlide(ar, slideId, tag);
      break;
    case "clinical":
    case "quality":
      html = buildClinicalSlide(ar, slideId, tag);
      break;
    case "strategic":
      html = buildStrategicSlide(ar, slideId, tag);
      break;
    default:
      html = buildGenericSlide(ar, slideId, tag);
  }

  return { id: slideId, type: "dimension", title: ar.agent.dimension, html };
}

// ─── SVG Chart Builders ─────────────────────────────────────────

/** Build SVG bar chart from label/value pairs */
function svgBarChart(data: Array<{ label: string; value: number; color?: string }>, ariaLabel: string): string {
  if (data.length < 3) return ""; // Rule: never chart < 3 data points
  const maxVal = Math.max(...data.map(d => d.value));
  const barW = Math.min(65, Math.floor(400 / data.length) - 10);
  const chartW = data.length * (barW + 10) + 60;
  const maxH = 180;
  const bars = data.map((d, i) => {
    const h = maxVal > 0 ? Math.round((d.value / maxVal) * maxH) : 10;
    const x = 55 + i * (barW + 10);
    const y = 210 - h;
    const color = d.color || `var(--chart-${(i % 7) + 1})`;
    return `<rect class="bar" x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${color}" tabindex="0"><title>${esc(d.label)}: ${d.value}</title></rect>`;
  }).join("\n        ");
  const labels = data.map((d, i) => {
    const x = 55 + i * (barW + 10) + barW / 2;
    return `<text x="${x}" y="${240}" text-anchor="middle">${esc(truncate(d.label, 12))}</text>`;
  }).join("\n        ");
  const values = data.map((d, i) => {
    const h = maxVal > 0 ? Math.round((d.value / maxVal) * maxH) : 10;
    const x = 55 + i * (barW + 10) + barW / 2;
    const y = 210 - h - 5;
    return `<text x="${x}" y="${y}" text-anchor="middle" font-weight="700">${d.value}</text>`;
  }).join("\n        ");

  return `<div class="chart-container anim d3" role="img" aria-label="${esc(ariaLabel)}">
  <svg viewBox="0 0 ${chartW} 260" class="bar-chart" style="width:100%;max-width:${chartW}px;">
    <g class="grid-lines" stroke="var(--border)" stroke-dasharray="4,4">
      <line x1="50" y1="30" x2="${chartW - 10}" y2="30"/><line x1="50" y1="90" x2="${chartW - 10}" y2="90"/>
      <line x1="50" y1="150" x2="${chartW - 10}" y2="150"/>
    </g>
    <g class="bars">${bars}</g>
    <g fill="var(--text-secondary)" font-size="10" font-weight="500">${labels}</g>
    <g fill="var(--text-primary)" font-size="10">${values}</g>
  </svg>
</div>`;
}

/** Build SVG donut chart */
function svgDonutChart(segments: Array<{ label: string; value: number; color: string }>, centerText: string, centerLabel: string): string {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total === 0) return "";
  const circ = 502.65;
  let cumOffset = 0;
  const circles = segments.map((d) => {
    const pct = d.value / total;
    const dash = pct * circ;
    const html = `<circle class="segment" r="80" fill="none" stroke="${d.color}" stroke-width="24" stroke-dasharray="${dash.toFixed(1)} ${circ}" stroke-dashoffset="${-cumOffset}" transform="rotate(-90)" tabindex="0" aria-label="${esc(d.label)}: ${Math.round(pct * 100)}%"><title>${esc(d.label)}: ${d.value}</title></circle>`;
    cumOffset += dash;
    return html;
  }).join("\n        ");
  const legend = segments.map(d =>
    `<li><span class="legend-dot" style="background:${d.color}"></span>${esc(d.label)}</li>`
  ).join("\n      ");

  return `<div class="chart-container donut-wrapper anim d3" role="img" aria-label="Distribution chart">
  <svg viewBox="0 0 200 200" class="donut-chart" style="width:180px;height:180px;">
    <g transform="translate(100,100)">
      <circle r="80" fill="none" stroke="var(--bg-tertiary)" stroke-width="24"/>
      ${circles}
    </g>
    <text x="100" y="95" text-anchor="middle" fill="var(--text-primary)" font-size="28" font-weight="700">${esc(centerText)}</text>
    <text x="100" y="115" text-anchor="middle" fill="var(--text-tertiary)" font-size="10">${esc(centerLabel)}</text>
  </svg>
  <ul class="chart-legend" role="list" style="flex-direction:column;">${legend}</ul>
</div>`;
}

/** Comparison bars */
function comparisonBars(data: Array<{ label: string; value: number; max: number; color?: string; metric?: string }>): string {
  return data.map((d, i) => {
    const pct = d.max > 0 ? Math.round((d.value / d.max) * 100) : 0;
    const color = d.color || `var(--chart-${(i % 7) + 1})`;
    return `<div class="bar-row anim d${Math.min(i + 3, 7)}">
  <div class="bar-label"><span>${esc(d.label)}</span><span>${d.metric || String(d.value)}</span></div>
  <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${color},${color}88)"><span class="bar-fill-value">${d.metric || String(d.value)}</span></div></div>
</div>`;
  }).join("\n");
}

/** Threat meter (1-5 dots) */
function threatMeter(level: number, max = 5): string {
  const colors = ["active-green", "active-green", "active-yellow", "active-orange", "active-red"];
  const activeColor = colors[Math.min(level - 1, 4)] || "active-green";
  return `<span class="threat-meter">${Array.from({ length: max }, (_, i) =>
    `<span class="threat-dot${i < level ? ` ${activeColor}` : ""}"></span>`
  ).join("")}</span>`;
}

// ─── Slide Count & Editorial Judgment ───────────────────────────

interface SlideManifest {
  id: string;
  type: string;
  title: string;
  tag?: string;       // nav-tag-key or nav-tag-new
  html: string;
}

function decideSlideCount(agentCount: number, totalFindings: number): { format: "compact" | "standard" | "extended"; maxSlides: number } {
  if (totalFindings < 10) return { format: "compact", maxSlides: 10 };
  if (agentCount <= 3) return { format: "standard", maxSlides: 12 };
  if (agentCount <= 5) return { format: "standard", maxSlides: 15 };
  if (agentCount <= 8) return { format: "extended", maxSlides: 18 };
  return { format: "extended", maxSlides: 22 };
}

// ─── Main Generator ─────────────────────────────────────────────

export function generatePresentation(
  manifest: IntelligenceManifest,
  qaReport: QualityAssuranceReport,
): string {
  const { meta, blueprint, agentResults, synthesis } = manifest;
  const allFindings = agentResults.flatMap(ar => ar.result.findings);
  const { format } = decideSlideCount(meta.agentCount, meta.totalFindings);
  const slideManifest: SlideManifest[] = [];
  let slideNum = 0;
  const sId = () => `s${++slideNum}`;

  // ─── Derived data ─────────────────────────────────────────
  const highConf = allFindings.filter(f => f.confidence === "HIGH").length;
  // Compute directly from raw findings to avoid confDist ambiguity
  const meanConfidence = allFindings.length > 0
    ? allFindings.reduce((acc, f) => acc + (f.confidence === "HIGH" ? 1 : f.confidence === "MEDIUM" ? 0.7 : 0.4), 0) / allFindings.length
    : 0;

  // ════════════════════════════════════════════════════════════
  // SLIDE: TITLE
  // ════════════════════════════════════════════════════════════
  const titleId = sId();
  // Hero title: use first emergent insight or short dimension summary (never raw query)
  const firstEmergent = synthesis.emergentInsights[0];
  const heroTitle = firstEmergent
    ? truncate(firstEmergent.insight, 65)
    : blueprint.dimensions.slice(0, 3).map(d => d.name.split(" ").slice(0, 3).join(" ")).join(" × ");

  const agentChips = agentResults.map((ar, i) =>
    `<span class="agent-chip"><span class="dot" style="background:${agentColor(i)}"></span>${esc(ar.agent.name)}</span>`
  ).join("\n      ");

  // 5-column hero stats per spec — prioritize domain-specific headline numbers
  const heroAllMetrics = extractAllStructured(allFindings).filter(m => m.type === "metric");
  // Sort: $ metrics first, then %, then numeric values, then text
  const heroSortedMetrics = heroAllMetrics.sort((a, b) => {
    const score = (m: StructuredDataPoint) => (m.unit === "$" ? 4 : m.unit === "%" ? 3 : typeof m.value === "number" ? 2 : 1);
    return score(b) - score(a);
  });
  const headlineMetrics = heroSortedMetrics.slice(0, 3);

  const heroStats: Array<{ value: string; label: string; color: string }> = [];
  // Lead with domain-specific numbers if available
  for (const m of headlineMetrics) {
    heroStats.push({
      value: fmtValue(m),
      label: truncate(m.label, 18),
      color: m.colorHint === "positive" ? "green" : m.colorHint === "negative" ? "red" : "cyan",
    });
  }
  // Fill remaining slots with standard pipeline metrics
  if (heroStats.length < 5) heroStats.push({ value: String(meta.agentCount), label: "Parallel Agents", color: "cyan" });
  if (heroStats.length < 5) heroStats.push({ value: String(meta.totalFindings), label: "Verified Findings", color: "green" });
  if (heroStats.length < 5) heroStats.push({ value: String(synthesis.emergentInsights.length), label: "Emergent Insights", color: "purple" });
  if (heroStats.length < 5) heroStats.push({ value: String(highConf), label: "High-Confidence", color: "gold" });
  if (heroStats.length < 5) heroStats.push({ value: `${Math.round(meanConfidence * 100)}%`, label: "Overall Confidence", color: "blue" });

  // Validation box + framework visual
  const fwNodes = agentResults.map(ar =>
    `<span class="fw-node">${esc(ar.agent.name.split(" ").slice(0, 2).join(" "))}</span>`
  ).join("\n            ");

  const titleHtml = `<section class="slide" id="${titleId}" style="text-align:center;">
  <div class="slide-bg-glow" style="background:var(--inov-cerulean);top:-200px;right:-200px;"></div>
  <div class="slide-bg-glow" style="background:var(--inov-violet);bottom:-200px;left:-200px;"></div>
  <div class="slide-inner">
    <div class="anim"><div class="hero-badge">PRISM Multi-Source Validated</div></div>
    <h1 class="hero-title anim d1">${esc(heroTitle)}</h1>
    <p class="hero-sub anim d2">${esc(meta.query)}</p>
    <p class="hero-date anim d3">${fmtDate()} | ${meta.agentCount}-Agent Swarm | ${meta.tier} Validated Synthesis</p>
    <div class="anim d4" style="margin-bottom:28px;">${agentChips}</div>
    <div class="hero-stats anim d5">
      ${heroStats.map(s => `<div class="hero-stat"><div class="value ${s.color}">${s.value}</div><div class="label">${s.label}</div></div>`).join("\n      ")}
    </div>
    <div class="validation-box anim d6">
      <div class="validation-card">
        <h4>&#10003; Validation</h4>
        <div class="val-row"><span class="val-icon green">&#10003;</span>${meta.totalFindings} findings across ${meta.agentCount} agents</div>
        <div class="val-row"><span class="val-icon green">&#10003;</span>${Math.round(synthesis.qualityReport.sourceCoveragePercent)}% source coverage</div>
        <div class="val-row"><span class="val-icon green">&#10003;</span>${highConf} high-confidence findings</div>
      </div>
      <div class="validation-card framework-card">
        <h4>&#9670; PRISM Framework</h4>
        <div class="framework-visual">
            ${fwNodes}
            <span class="fw-arrow">&#8594;</span>
            <span class="fw-center">Cross-Agent Synthesis</span>
            <span class="fw-arrow">&#8594;</span>
            <span class="fw-node" style="border-color:rgba(0,228,159,0.4);color:var(--accent-success)">${synthesis.emergentInsights.length} Emergent</span>
        </div>
      </div>
    </div>
  </div>
</section>`;
  slideManifest.push({ id: titleId, type: "title", title: "Title", html: titleHtml });

  // ════════════════════════════════════════════════════════════
  // SLIDE: TOC (Extended format only, or 6+ agents)
  // ════════════════════════════════════════════════════════════
  if (format === "extended" || meta.agentCount >= 6) {
    const tocId = sId();
    // Group: Dimensions | Synthesis | Intelligence Quality
    const dimItems = agentResults.map((ar, i) =>
      `<a class="nav-item toc-item" href="#s${i + 3}"><span class="nav-num">${String(i + 3).padStart(2, "0")}</span><span class="nav-label">${esc(ar.agent.dimension)}</span></a>`
    ).join("\n          ");

    const tocHtml = `<section class="slide" id="${tocId}" style="background:linear-gradient(135deg,var(--bg-primary),var(--bg-secondary));">
  <div class="slide-inner">
    <h2 class="slide-title anim">Executive <span style="color:var(--accent)">Intelligence Map</span></h2>
    <p class="section-intro anim d1">${slideManifest.length + agentResults.length + synthesis.emergentInsights.length + 4}-slide analysis spanning ${blueprint.dimensions.length} dimensions.</p>
    <div class="grid-3 anim d2">
      <div>
        <h3 class="toc-group-header">Dimensions</h3>
        ${dimItems}
      </div>
      <div>
        <h3 class="toc-group-header">Synthesis</h3>
        <a class="nav-item toc-item" href="#"><span class="nav-num">—</span><span class="nav-label">Tension Points</span><span class="nav-tag nav-tag-key">KEY</span></a>
        ${synthesis.emergentInsights.map((_, i) =>
      `<a class="nav-item toc-item" href="#"><span class="nav-num">—</span><span class="nav-label">Emergent #${i + 1}</span><span class="nav-tag nav-tag-new">NEW</span></a>`
    ).join("\n        ")}
      </div>
      <div>
        <h3 class="toc-group-header">Quality</h3>
        <a class="nav-item toc-item" href="#"><span class="nav-num">—</span><span class="nav-label">Strategic Timeline</span></a>
        <a class="nav-item toc-item" href="#"><span class="nav-num">—</span><span class="nav-label">Provenance</span></a>
        <a class="nav-item toc-item" href="#"><span class="nav-num">—</span><span class="nav-label">Gaps & Next Steps</span></a>
      </div>
    </div>
  </div>
</section>`;
    slideManifest.push({ id: tocId, type: "toc", title: "Intelligence Map", html: tocHtml });
  }

  // ════════════════════════════════════════════════════════════
  // SLIDE: EXECUTIVE SUMMARY
  // ════════════════════════════════════════════════════════════
  const execId = sId();
  // Stat cards from structured metrics first, then high-conf finding summaries
  const convergenceLayer = synthesis.layers.find(l => l.name === "convergence") || synthesis.layers[1];
  const execMetrics = extractAllStructured(allFindings).filter(m => m.type === "metric");
  const execStatData: Array<{ label: string; value: string; context: string; cls: string }> = [];

  // Prioritize real metrics for stat cards
  for (const m of execMetrics.slice(0, 4)) {
    execStatData.push({
      label: truncate(m.label, 30),
      value: fmtValue(m),
      context: m.context || "",
      cls: colorClass(m.colorHint),
    });
  }

  // Fill remaining with high-confidence finding summaries (clean, not raw statement text)
  const topFindings = allFindings.filter(f => f.confidence === "HIGH");
  for (const f of topFindings) {
    if (execStatData.length >= 4) break;
    const agentMatch = agentResults.find(ar => ar.result.findings.includes(f));
    execStatData.push({
      label: agentMatch ? truncate(agentMatch.agent.dimension, 30) : "Analysis",
      value: truncate(f.statement.split(".")[0], 45),
      context: truncate(f.implication || f.evidence, 120),
      cls: "positive",
    });
  }

  const statCards = execStatData.slice(0, 4).map(s =>
    `<div class="stat-card"><div class="stat-label">${esc(s.label)}</div><div class="stat-value ${s.cls}">${esc(s.value)}</div>${s.context ? `<div class="stat-context">${esc(s.context)}</div>` : ""}</div>`
  ).join("\n      ");

  // Convergent intelligence box
  const convergenceText = convergenceLayer?.insights[0] || synthesis.emergentInsights[0]?.insight || "";

  const execHtml = `<section class="slide" id="${execId}">
  <div class="slide-bg-glow" style="background:var(--inov-sky);top:-150px;left:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag emergent">Synthesis</span> Executive Summary</div>
    <h2 class="slide-title anim d1">Strategic Intelligence Overview</h2>
    <p class="slide-subtitle anim d2">${meta.agentCount}-agent convergence across ${blueprint.dimensions.length} dimensions reveals ${synthesis.emergentInsights.length} emergent insights and ${synthesis.tensions.length} strategic tension points.</p>
    <div class="stat-grid anim d3">${statCards}</div>
    ${convergenceText ? `<div class="finding-card emergent anim d4" style="margin-top:16px;"><div class="finding-title">Convergent Intelligence</div><div class="finding-body">${esc(truncate(convergenceText, 250))}</div></div>` : ""}
  </div>
  <div class="slide-footer"><span>${meta.agentCount} Agents | Source-Validated</span><span>PRISM Executive Intelligence Brief</span></div>
</section>`;
  slideManifest.push({ id: execId, type: "exec", title: "Executive Summary", html: execHtml });

  // ════════════════════════════════════════════════════════════
  // SLIDES: DIMENSIONS (one per agent result) — content-aware routing
  // ════════════════════════════════════════════════════════════
  // Error recovery: merge thin agents, drop 0-finding agents
  const normalAgents = agentResults.filter(ar => ar.result.findings.length >= 3);
  const thinAgents = agentResults.filter(ar => ar.result.findings.length > 0 && ar.result.findings.length < 3);
  // 0-finding agents are dropped per spec

  for (const ar of normalAgents) {
    const dimId = sId();
    slideManifest.push(routeToSlideTemplate(ar, dimId));
  }

  // Merge thin agents into combined slide (error recovery per spec)
  if (thinAgents.length > 0) {
    const mergeId = sId();
    const mergedFindings = thinAgents.flatMap(ar => ar.result.findings);
    const mergedCards = thinAgents.map(ar =>
      ar.result.findings.map(f => {
        const tagCls = dimTag(ar.agent.dimension);
        return `<div class="finding-card"><div class="eyebrow" style="margin-bottom:4px;"><span class="tag ${tagCls}">${esc(ar.agent.name)}</span></div><div class="finding-title">${esc(truncate(f.statement, 100))}</div><div class="finding-body">${esc(truncate(f.implication || f.evidence, 100))}</div>${confBadge(f.confidence, f.source)}</div>`;
      }).join("\n      ")
    ).join("\n      ");

    const mergeHtml = `<section class="slide" id="${mergeId}">
  <div class="slide-bg-glow" style="background:var(--accent-violet);top:-200px;left:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag strategic">Additional</span> Perspectives</div>
    <h2 class="slide-title anim d1">Additional Intelligence</h2>
    <p class="section-intro anim d2">Supplementary findings from agents with limited data coverage.</p>
    <div class="grid-2 anim d3">${mergedCards}</div>
    ${sourceList(mergedFindings)}
  </div>
  <div class="slide-footer"><span>${thinAgents.length} Agents | ${mergedFindings.length} findings</span><span>PRISM Executive Intelligence Brief</span></div>
</section>`;
    slideManifest.push({ id: mergeId, type: "merged", title: "Additional Perspectives", html: mergeHtml });
  }

  // ════════════════════════════════════════════════════════════
  // SLIDE: TENSION POINTS (two-col pro vs con)
  // ════════════════════════════════════════════════════════════
  if (synthesis.tensions.length > 0) {
    const tensionId = sId();
    const tensions = synthesis.tensions.slice(0, 3);
    const tensionCards = tensions.map(t => `
      <div class="policy-box neutral" style="margin:10px 0;">
        <h4>${esc(truncate(t.description, 80))}</h4>
        <div class="two-col" style="gap:1rem;margin-top:8px;">
          <div><div class="stat-label">${esc(t.agentA)}</div><p style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;">${esc(truncate(t.positionA, 120))}</p></div>
          <div><div class="stat-label">${esc(t.agentB)}</div><p style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;">${esc(truncate(t.positionB, 120))}</p></div>
        </div>
        ${t.resolution ? `<div class="impact impact-neutral" style="margin-top:8px;">Resolution: ${esc(truncate(t.resolution, 100))}</div>` : `<div class="impact impact-moderate" style="margin-top:8px;">Preserved as genuine complexity</div>`}
      </div>`).join("\n    ");

    const tensionHtml = `<section class="slide" id="${tensionId}">
  <div class="slide-bg-glow" style="background:var(--accent-warning);top:-200px;right:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag-gold tag">Tension</span> Synthesis</div>
    <h2 class="slide-title anim d1">Strategic Tension Points</h2>
    <p class="section-intro anim d2">Where analytical perspectives create productive disagreement — these tensions trace deeper structural complexity.</p>
    <div class="anim d3">${tensionCards}</div>
  </div>
  <div class="slide-footer"><span>Cross-Agent Synthesis | ${tensions.length} tensions</span><span>PRISM Executive Intelligence Brief</span></div>
</section>`;
    slideManifest.push({ id: tensionId, type: "tension", title: "Tension Points", tag: "nav-tag-key", html: tensionHtml });
  }

  // ════════════════════════════════════════════════════════════
  // SLIDES: EMERGENT INSIGHTS (one per insight, emergent-slide template)
  // ════════════════════════════════════════════════════════════
  synthesis.emergentInsights.forEach((e, idx) => {
    const eId = sId();
    const qualityScores = [
      { name: "Novelty", score: e.quality.novelty },
      { name: "Grounding", score: e.quality.grounding },
      { name: "Actionability", score: e.quality.actionability },
      { name: "Depth", score: e.quality.depth },
      { name: "Surprise", score: e.quality.surprise },
    ];

    const eHtml = `<section class="slide emergent-slide" id="${eId}">
  <div class="slide-inner" style="position:relative;">
    <div class="emergent-number anim">${String(idx + 1).padStart(2, "0")}</div>
    <div class="eyebrow anim">Emergent Insight</div>
    <h2 class="slide-title anim d1">${esc(truncate(e.insight, 80))}</h2>
    <p class="slide-subtitle anim d2">${esc(e.type)} emergence — ${e.contributingAgents.length} agents converged</p>
    <div class="grid-2 anim d3">
      <div>
        ${e.evidence.slice(0, 3).map((ev, i) => `<div class="emergence-card"><h4>${esc(e.contributingAgents[i] || "Agent")}</h4><p>${esc(truncate(ev, 150))}</p></div>`).join("\n        ")}
      </div>
      <div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">
          ${qualityScores.map(q => `<div class="stat-card" style="padding:12px 6px;"><div class="stat-label" style="font-size:8px;">${q.name}</div><div class="stat-value" style="font-size:20px;color:${q.score >= 4 ? "var(--accent-success)" : q.score >= 3 ? "var(--accent-warning)" : "var(--accent-error)"};">${q.score}/5</div></div>`).join("\n          ")}
        </div>
        ${e.actionableRecommendation ? `<div class="policy-box positive"><h4>Recommended Action</h4><p>${esc(truncate(e.actionableRecommendation, 150))}</p></div>` : ""}
      </div>
    </div>
    <div class="emergent-why anim d4">
      <div class="emergent-why-label">Why Only Multi-Agent Analysis Finds This</div>
      <div class="finding-body">${esc(e.contributingAgents.join(", "))} each provided independent evidence from different analytical lenses. This ${e.type} insight emerges only when these perspectives are synthesized — no single agent would surface this pattern.</div>
    </div>
  </div>
  <div class="slide-footer"><span>Emergence Detection | ${e.contributingAgents.length} agents</span><span>PRISM Executive Intelligence Brief</span></div>
</section>`;
    slideManifest.push({ id: eId, type: "emergent", title: `Emergent: ${truncate(e.insight, 30)}`, tag: "nav-tag-new", html: eHtml });
  });

  // ════════════════════════════════════════════════════════════
  // SLIDE: STRATEGIC TIMELINE (3-phase)
  // ════════════════════════════════════════════════════════════
  const timelineId = sId();
  // Build timeline from synthesis layers
  const gapLayer = synthesis.layers.find(l => l.name === "gaps");
  const foundationLayer = synthesis.layers.find(l => l.name === "foundation");
  const emergenceLayer = synthesis.layers.find(l => l.name === "emergence");

  const timelineHtml = `<section class="slide" id="${timelineId}">
  <div class="slide-bg-glow" style="background:var(--accent-success);bottom:-200px;left:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag strategic">Strategic</span> Timeline</div>
    <h2 class="slide-title anim d1">Implementation Horizon</h2>
    <p class="section-intro anim d2">Three-phase approach: defensive positioning, transitional investment, offensive expansion.</p>
    <div class="timeline anim d3">
      <div class="timeline-phase">
        <div class="timeline-dot" style="background:var(--accent-error);"></div>
        <div class="timeline-year" style="color:var(--accent-error);">Q1-Q2</div>
        <div class="timeline-label">Defensive</div>
        <div class="timeline-items">
          ${(foundationLayer?.insights || []).slice(0, 3).map(i => `<div>${esc(truncate(i, 60))}</div>`).join("\n          ")}
        </div>
      </div>
      <div class="timeline-phase">
        <div class="timeline-dot" style="background:var(--accent-warning);"></div>
        <div class="timeline-year" style="color:var(--accent-warning);">Q3-Q4</div>
        <div class="timeline-label">Transitional</div>
        <div class="timeline-items">
          ${(convergenceLayer?.insights || []).slice(0, 3).map(i => `<div>${esc(truncate(i, 60))}</div>`).join("\n          ")}
        </div>
      </div>
      <div class="timeline-phase">
        <div class="timeline-dot" style="background:var(--accent-success);"></div>
        <div class="timeline-year" style="color:var(--accent-success);">2027+</div>
        <div class="timeline-label">Offensive</div>
        <div class="timeline-items">
          ${(emergenceLayer?.insights || []).slice(0, 3).map(i => `<div>${esc(truncate(i, 60))}</div>`).join("\n          ")}
        </div>
      </div>
    </div>
  </div>
  <div class="slide-footer"><span>Strategic Synthesis</span><span>PRISM Executive Intelligence Brief</span></div>
</section>`;
  slideManifest.push({ id: timelineId, type: "timeline", title: "Strategic Timeline", html: timelineHtml });

  // ════════════════════════════════════════════════════════════
  // SLIDE: PROVENANCE & CONFIDENCE
  // ════════════════════════════════════════════════════════════
  const provId = sId();
  const confHigh = allFindings.filter(f => f.confidence === "HIGH").length;
  const confMed = allFindings.filter(f => f.confidence === "MEDIUM").length;
  const confLow = allFindings.length - confHigh - confMed;
  const confDonut = svgDonutChart(
    [
      { label: `High (${confHigh})`, value: confHigh, color: "var(--accent-success)" },
      { label: `Medium (${confMed})`, value: confMed, color: "var(--accent-warning)" },
      { label: `Low (${confLow})`, value: confLow, color: "var(--accent-error)" },
    ],
    String(meta.totalFindings),
    "Total Findings"
  );

  // Provenance table rows (max 10)
  const provRows = manifest.provenance.slice(0, 10).map(p => `
    <tr>
      <td>${esc(truncate(p.finding, 60))}</td>
      <td><span class="tag ${dimTag(p.agent)}">${esc(p.agent.split(" ").slice(0, 2).join(" "))}</span></td>
      <td>${esc(shortSource(p.source))}</td>
      <td>${confBadge(p.confidence, "")}</td>
    </tr>`).join("");

  const provHtml = `<section class="slide" id="${provId}">
  <div class="slide-bg-glow" style="background:var(--accent);top:-200px;left:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag quality">Quality</span> Provenance</div>
    <h2 class="slide-title anim d1">Provenance &amp; Confidence</h2>
    <div class="grid-2 anim d2">
      <div>
        ${confDonut}
        <div class="stat-card" style="margin-top:12px;">
          <div class="stat-label">Quality Score</div>
          <div class="stat-value ${qaReport.score.overallScore >= 80 ? "positive" : qaReport.score.overallScore >= 60 ? "warn" : "negative"}">${qaReport.score.grade} (${qaReport.score.overallScore}%)</div>
          <div class="stat-context">Chain completeness: ${qaReport.provenance.chainCompleteness}%</div>
        </div>
      </div>
      <div>
        <table class="prov-table">
          <thead><tr><th>Finding</th><th>Agent</th><th>Source</th><th>Confidence</th></tr></thead>
          <tbody>${provRows}</tbody>
        </table>
      </div>
    </div>
  </div>
  <div class="slide-footer"><span>Quality Assurance System</span><span>PRISM Executive Intelligence Brief</span></div>
</section>`;
  slideManifest.push({ id: provId, type: "provenance", title: "Provenance & Confidence", html: provHtml });

  // ════════════════════════════════════════════════════════════
  // SLIDE: GAPS & NEXT STEPS (two-col)
  // ════════════════════════════════════════════════════════════
  const gapsId = sId();
  const allGaps = agentResults.flatMap(ar => ar.result.gaps);
  const uniqueGaps = [...new Set(allGaps)].slice(0, 6);

  const gapsHtml = `<section class="slide" id="${gapsId}">
  <div class="slide-bg-glow" style="background:var(--accent-warning);bottom:-200px;right:-200px;"></div>
  <div class="slide-inner">
    <div class="eyebrow anim"><span class="tag-gold tag">Gaps</span> Intelligence</div>
    <h2 class="slide-title anim d1">Intelligence Gaps &amp; Next Steps</h2>
    <p class="section-intro anim d2">What the swarm could not determine — and recommended follow-up investigations.</p>
    <div class="two-col anim d3">
      <div>
        <h3 style="font-size:13px;color:var(--accent-error);margin-bottom:12px;font-weight:700;">&#9888; Unknown Variables</h3>
        ${uniqueGaps.map(g => `<div class="policy-box" style="margin-bottom:8px;"><p>${esc(truncate(g, 120))}</p></div>`).join("\n        ")}
      </div>
      <div>
        <h3 style="font-size:13px;color:var(--accent-success);margin-bottom:12px;font-weight:700;">&#8594; Recommended Follow-Up</h3>
        ${synthesis.emergentInsights.filter(e => e.actionableRecommendation).slice(0, 4).map(e =>
    `<div class="policy-box positive" style="margin-bottom:8px;"><h4>${esc(truncate(e.insight, 50))}</h4><p>${esc(truncate(e.actionableRecommendation || "", 100))}</p></div>`
  ).join("\n        ")}
        ${qaReport.score.recommendations.slice(0, 2).map(r =>
    `<div class="policy-box neutral" style="margin-bottom:8px;"><p>${esc(truncate(r, 100))}</p></div>`
  ).join("\n        ")}
      </div>
    </div>
  </div>
  <div class="slide-footer"><span>Gap Triangulation</span><span>PRISM Executive Intelligence Brief</span></div>
</section>`;
  slideManifest.push({ id: gapsId, type: "gaps", title: "Gaps & Next Steps", html: gapsHtml });

  // ════════════════════════════════════════════════════════════
  // SLIDE: CLOSING
  // ════════════════════════════════════════════════════════════
  const closingId = sId();
  const closingHtml = `<section class="slide" id="${closingId}" style="text-align:center;">
  <div class="slide-bg-glow" style="background:var(--inov-cerulean);top:-200px;left:-200px;"></div>
  <div class="slide-bg-glow" style="background:var(--inov-jade);bottom:-200px;right:-200px;"></div>
  <div class="slide-inner">
    <div class="hero-badge anim">PRISM ${meta.tier} Analysis Complete</div>
    <h2 class="hero-title anim d1" style="font-size:var(--text-3xl);">${esc(heroTitle)}</h2>
    <p class="hero-sub anim d2">${meta.agentCount} agents · ${meta.totalFindings} findings · ${synthesis.emergentInsights.length} emergent insights</p>
    <div class="anim d3" style="margin-top:28px;">${agentChips}</div>
    <p class="anim d4" style="margin-top:24px;font-size:var(--text-sm);color:var(--text-tertiary);">Generated ${fmtDate()} · Run ID: ${meta.runId}</p>
  </div>
</section>`;
  slideManifest.push({ id: closingId, type: "closing", title: "Closing", html: closingHtml });

  // ════════════════════════════════════════════════════════════
  // ASSEMBLE HTML
  // ════════════════════════════════════════════════════════════
  const navItems = slideManifest.map((s, i) =>
    `<a class="nav-item" href="#${s.id}" onclick="toggleNav()"><span class="nav-num">${String(i + 1).padStart(2, "0")}</span><span class="nav-label">${esc(s.title)}</span>${s.tag ? `<span class="nav-tag ${s.tag}">${s.tag === "nav-tag-key" ? "KEY" : "NEW"}</span>` : ""}</a>`
  ).join("\n  ");

  const allSlides = slideManifest.map(s => s.html).join("\n\n");

  // Inline the CSS — read from the template strings
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PRISM Strategic Brief — ${esc(truncate(meta.query, 60))}</title>
<style>${V3_CSS}</style>
</head>
<body>
<div id="slideProgress"></div>
<div class="prism-mark">PRISM Intelligence</div>
<div class="slide-counter" id="slideCounter">01 / ${String(slideManifest.length).padStart(2, "0")}</div>
<div class="slide-nav-hint show" id="navHint">&#8595; Arrow Down / Spacebar to navigate &#8595;</div>

<button class="nav-toggle" onclick="toggleNav()" id="navBtn" title="Table of Contents">&#9776;</button>
<div class="nav-overlay" id="navOverlay" onclick="toggleNav()"></div>
<div class="nav-panel" id="navPanel">
  <h3>Table of Contents</h3>
  ${navItems}
</div>

${allSlides}

<script>${V3_JS}</script>
</body>
</html>`;
}
