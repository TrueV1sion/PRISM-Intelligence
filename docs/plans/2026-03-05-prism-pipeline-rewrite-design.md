# PRISM Pipeline Rewrite Design

**Date:** 2026-03-05
**Status:** Approved
**Scope:** Rewrite protoprism pipeline to faithfully implement the PRISM skill methodology, producing reference-quality HTML5 briefs

---

## Problem Statement

The protoprism application has pipeline scaffolding (phases, UI, database) but does NOT faithfully implement the PRISM skill methodology. The reference-quality briefs (GLP-1 Strategic Opportunity, Post-Acute Transformation) were produced in Claude Desktop using custom skills and agent frameworks. The application must produce output of equivalent quality by following the methodology and presentation system specifications exactly.

## Success Criteria

Output parity with the reference briefs: full emergence detection, 40+ finding cards, provenance tables with source tiers, cinematic HTML5 with animated reveals, nav panel, PRISM | Intelligence branding. Agents must call real MCP tools (PubMed, CMS, NPI, ICD-10, Clinical Trials, bioRxiv, web search) during research.

---

## Architecture

```
Next.js 16 App (local-first, designed for self-hosted server later)

Frontend (React 19)              Backend (API Routes)
- Phase UI                       - Pipeline Executor (long-lived async)
  (Input -> Blueprint ->         - Anthropic SDK Direct
   Executing -> Triage ->          - Phase 0: THINK (Opus, extended thinking)
   Synthesis -> Complete)          - Phase 1: CONSTRUCT (Sonnet)
- HITL Gates                       - Phase 2: DEPLOY (Sonnet, parallel agents)
  (configurable autonomy:         - Phase 3: SYNTHESIZE (Opus, extended thinking)
   supervised/guided/autonomous)   - Phase 3.5: VERIFY (configurable gate)
- SSE streaming for progress       - Phase 4: PRESENT (Sonnet)
                                   - Phase 5: REFINE (nudge-driven)

Database: Prisma + SQLite (swap to PostgreSQL later)
MCP Tools: Native MCP server child processes (identical to Claude Desktop)
```

### Key Decisions

1. **Anthropic SDK direct** — Drop Vercel AI SDK, @ai-sdk/openai, @ai-sdk/google. Single dependency: @anthropic-ai/sdk
2. **Claude-only** — Opus for THINK/SYNTHESIZE/CRITIC-FACTUAL, Sonnet for CONSTRUCT/DEPLOY agents/PRESENT
3. **Native MCP servers** — Spawn MCP servers as child processes via @modelcontextprotocol/sdk, route tool_use calls to them. Same behavior as Claude Desktop.
4. **Claude generates full HTML** — presentation-system.md as system prompt, Claude produces the complete self-contained HTML file (matching how reference briefs were built)
5. **Local-first for v1** — SQLite, no infra dependencies. Prisma abstracts DB for future PostgreSQL migration.
6. **PRISM | Intelligence branding** — No Inovalon, no ARCHON, no framework internals in deliverables

---

## Pipeline Phases

### Phase 0: THINK (Opus)

- System prompt: methodology-core.md sections 1-2
- Extended thinking enabled for deep dimensional analysis
- Structured output via tool_use: dimensions, complexity scores (breadth/depth/interconnection), tier, agent roster with archetype + tool + skill assignments
- Quality checks: dimension qualification gates, known interconnection pair validation, ethical concern flagging

### Phase 1: CONSTRUCT (Sonnet)

- Build agent prompts from archetype templates (methodology-core.md section 3)
- Neutral Framing Protocol for ethically-charged topics
- Source Tier Classification requirement injected into every agent's output format
- MCP tools assigned per agent based on dimension and archetype
- Auto-forge protocol for unknown archetypes (Sonnet generates custom archetype)

### Phase 2: DEPLOY (Sonnet, parallel)

- Launch ALL agents as parallel Claude API calls
- Each agent gets: constructed prompt + MCP tool access via tool_use
- Tool calls proxied through MCP server child processes (real API calls)
- For EXTENDED+ tiers: Wave 1 runs first, findings go to blackboard, Wave 2 agents receive that context
- For Depth >= 4: CRITIC-FACTUAL agent auto-spawns after primary agents, verifies top 10 claims via web search
- Each agent streams progress events back through SSE

### Phase 3: SYNTHESIZE (Opus)

- System prompt: methodology-core.md sections 4-6
- Extended thinking for emergence detection
- All 4 algorithms applied:
  1. Cross-Agent Theme Mining (with Source Independence Test)
  2. Tension Point Mapping (with conflict classification)
  3. Gap Triangulation
  4. Structural Pattern Recognition
- Produces 5 synthesis layers: foundation, convergence, tension, emergence, gap
- Emergence quality gate: 4+ on >= 3 of 5 dimensions (novelty, grounding, actionability, depth, surprise)
- For STANDARD+: CRITIC agent reviews synthesis, Opus revises

### Phase 3.5: VERIFY (configurable gate)

- Supervised mode: pause, present top 10 claims with source tiers, wait for approval/modification
- Guided mode: auto-approve after 60s timeout
- Autonomous mode: skip
- Finding actions (keep/dismiss/boost/flag) persisted to database and influence presentation

### Phase 4: PRESENT (Sonnet)

- System prompt: full presentation-system.md spec (~1500 lines) with prompt caching
- User prompt: complete synthesis output (all 5 layers, agent roster, findings, emergence cards, provenance)
- Claude generates complete self-contained HTML5 file in one response
- Stream response to frontend, save file, create Presentation DB record

Output requirements (matching reference briefs):
- Self-contained single HTML file (all CSS/JS inline, zero external deps)
- Scroll-snap navigation + keyboard arrows
- Nav panel (right-side, toggle, KEY/NEW tags for 6+ agents)
- Animated reveals (IntersectionObserver, staggered .d1-.d7 delays)
- Stat cards with animated counters, color-coded values
- Finding cards with confidence badges (HIGH/MEDIUM/LOW)
- Emergence cards with "Why Only Multi-Agent" explanation boxes
- Provenance table (agent -> findings -> sources -> source tier)
- Source notation: dagger notation for unverified secondary/tertiary claims
- Strategic timeline (3-phase horizon when applicable)
- Extended brief format with TOC + grouped nav for 6+ agents
- PRISM | Intelligence branding throughout

### Phase 5: REFINE (user nudges, post-delivery)

- User provides nudges after viewing brief
- Backend classifies nudge type: CORRECT / DEEPEN / EXTEND / MODEL / TARGET
- Spawn 1-3 focused agents inheriting original context
- Synthesize new findings with original synthesis
- Output: slide addendum, corrected brief, or strategic supplement

---

## MCP Tool Architecture

Native MCP server child processes, managed by @modelcontextprotocol/sdk client:

| Server | Tools | API Keys |
|--------|-------|----------|
| PubMed | search_articles, get_article_metadata, get_full_text_article, find_related_articles | NCBI_API_KEY (recommended) |
| CMS Coverage | search_national_coverage, search_local_coverage, batch_get_ncds, sad_exclusion_list, get_whats_new_report, get_contractors | None (public) |
| ICD-10 | search_codes, lookup_code, validate_code, get_hierarchy, get_by_category, get_by_body_system | None (public) |
| NPI Registry | npi_search, npi_lookup, npi_validate | None (public) |
| Clinical Trials | search_trials, get_trial_details, search_by_sponsor, analyze_endpoints, search_by_eligibility | None (public) |
| bioRxiv | search_preprints, get_preprint, get_categories, search_published_preprints | None (public) |
| Web Search | Anthropic native web_search tool (built into Claude API) | None (included) |
| Web Fetch | Server-side fetch + HTML-to-text extraction | None |

Tool routing per archetype defined in methodology SKILL.md:
- RESEARCHER-DATA: pubmed, clinical_trials, biorxiv, icd10
- REGULATORY-RADAR / LEGISLATIVE-PIPELINE: cms_coverage, web_search
- ANALYST-FINANCIAL: cms_coverage, web_search
- ANALYST-TECHNICAL: icd10, cms_coverage
- RESEARCHER-DOMAIN: npi, web_search
- ANALYST-STRATEGIC: npi, web_search
- RESEARCHER-WEB: web_search, web_fetch (any dimension)
- CRITIC-FACTUAL: web_search, web_fetch

Replaces current mcp-tools.ts (1800+ lines of custom REST wrappers) with ~100 lines of MCP client routing.

---

## HITL Gate Configuration

Three autonomy modes stored in Settings:

| Mode | Blueprint Gate | Findings Gate | Verification Gate |
|------|---------------|---------------|-------------------|
| Supervised | Required (user approves) | Required (user triages) | Required (user verifies top claims) |
| Guided | Required | Optional (auto-approve after 60s) | Skipped |
| Autonomous | Auto-approve | Auto-approve | Skipped |

Finding actions (keep/dismiss/boost/flag) persist to DB and influence synthesis/presentation.

---

## Branding: PRISM | Intelligence

All user-facing surfaces:
- Header: "PRISM | Intelligence" with Layers icon + gradient (prism-sky to prism-cerulean)
- Brief headers: "PRISM | Intelligence" fixed top-left mark
- Brief titles: "PRISM Strategic Brief" or "PRISM Intelligence Analysis"
- Agent names in provenance: descriptive names (not archetype codes)
- Confidence badge: "PRISM Multi-Source Validated"
- No Inovalon, ARCHON, or framework internals exposed

Color palette (PRISM brand):
- Navy: #003D79
- Cerulean: #4E84C4
- Sky: #59DDFD
- Jade: #00E49F
- Sand: #F5E6BB
- Violet: #6C6CFF
- Executive Dark background: #0a0b10

---

## Database Schema

Existing Prisma schema is well-aligned. Key additions needed:
- Finding.sourceTier field (PRIMARY/SECONDARY/TERTIARY)
- Run.autonomyMode already exists
- Settings.data JSON blob supports all configuration

SQLite for v1, Prisma abstracts for PostgreSQL migration later.

---

## Dependencies (v1)

### Add
- @anthropic-ai/sdk
- @modelcontextprotocol/sdk

### Remove
- @ai-sdk/anthropic
- @ai-sdk/openai
- @ai-sdk/google
- ai (Vercel AI SDK)

### Keep
- next, react, react-dom
- @prisma/client, @prisma/adapter-better-sqlite3, better-sqlite3, prisma
- framer-motion, lucide-react
- zod, dotenv
- tailwindcss, typescript

---

## What Gets Rewritten vs Kept

### Rewrite (pipeline core)
- src/lib/pipeline/think.ts — add extended thinking, tool_use structured output
- src/lib/pipeline/construct.ts — enforce source tier, proper MCP tool assignment
- src/lib/pipeline/deploy.ts — Anthropic SDK, MCP tool_use loop, fix Wave 2 blackboard
- src/lib/pipeline/synthesize.ts — Anthropic SDK, extended thinking for emergence
- src/lib/pipeline/mcp-tools.ts — replace entirely with MCP client router (~100 lines)
- src/lib/pipeline/tool-bridge.ts — replace with MCP protocol bridge
- src/lib/pipeline/executor.ts — add Phase 3.5, Phase 5, configurable autonomy
- src/lib/pipeline/quality-assurance.ts — implement verification gate workflow
- src/lib/pipeline/index.ts — update pipeline orchestration
- src/lib/presentation.ts — replace with Claude-generates-HTML approach
- API routes for pipeline execution and streaming

### New
- src/lib/mcp/client.ts — MCP server lifecycle management
- src/lib/mcp/config.ts — MCP server configuration
- src/lib/pipeline/verify.ts — Phase 3.5 verification gate
- src/lib/pipeline/refine.ts — Phase 5 nudge protocol
- src/lib/pipeline/present.ts — Claude HTML generation with presentation-system.md

### Keep (frontend mostly intact)
- src/app/page.tsx — phase routing (minor updates for new phases)
- src/components/phases/* — UI components (update props for new data shapes)
- src/components/AgentCard.tsx, FindingCard.tsx, etc.
- src/components/DeckViewer.tsx, DeckLibrary.tsx
- src/components/AdminSettings.tsx — update for new settings shape
- src/hooks/use-research-stream.ts — update SSE event types
- src/app/globals.css — keep, update branding text
- src/app/layout.tsx — update header branding to "PRISM | Intelligence"
- Prisma schema — minor additions (sourceTier field)

### Delete
- src/lib/pipeline/opensecrets.ts — not needed for v1
- src/lib/pipeline/prism-mcp-server.ts — replaced by native MCP client
- src/lib/mock-data.ts — replaced by real pipeline data
