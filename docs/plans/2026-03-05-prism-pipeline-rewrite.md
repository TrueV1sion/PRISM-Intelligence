# PRISM Pipeline Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the protoprism pipeline to faithfully implement the PRISM skill methodology, producing reference-quality HTML5 briefs via Claude API orchestration with native MCP tool access.

**Architecture:** Next.js 16 app using Anthropic SDK direct (replacing Vercel AI SDK). Claude Opus for THINK/SYNTHESIZE/CRITIC, Claude Sonnet for CONSTRUCT/DEPLOY/PRESENT. MCP servers spawned as child processes via @modelcontextprotocol/sdk. Pipeline runs as long-lived async functions with SSE streaming. SQLite for v1, Prisma abstracts for PostgreSQL later.

**Tech Stack:** Next.js 16, React 19, @anthropic-ai/sdk, @modelcontextprotocol/sdk, Prisma 7, SQLite, Zod 4, Framer Motion, TypeScript 5

**Design Doc:** `docs/plans/2026-03-05-prism-pipeline-rewrite-design.md`

**Reference Specs:**
- `prism-skill-SKILL.md` (or `prism 2/SKILL.md`) — Pipeline phases, MCP tool routing, domain skill routing, branding rules, agent prompt hardening
- `prism-skill-methodology-core.md` (or `prism 2/references/methodology-core.md`) — Dimensional analysis, complexity scoring, archetypes, emergence detection, conflict resolution, synthesis protocol
- `prism-skill-presentation-system.md` (or `prism 2/references/presentation-system.md`) — HTML5 template system, design tokens, slide framework, component library, animations, navigation

---

## Phase 1: Foundation (Dependencies, Types, Schema, MCP Client)

### Task 1: Swap AI SDK Dependencies

**Files:**
- Modify: `package.json`
- Modify: `.env`

**Step 1: Update package.json**

Remove Vercel AI SDK and multi-provider packages:
```bash
cd "/Users/jared.peck/Desktop/Prism Intelligent Deck Proto/protoprism"
npm uninstall ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google
```

Install Anthropic SDK and MCP SDK:
```bash
npm install @anthropic-ai/sdk @modelcontextprotocol/sdk
```

**Step 2: Verify installation**

Run: `cd "/Users/jared.peck/Desktop/Prism Intelligent Deck Proto/protoprism" && npx tsc --noEmit 2>&1 | head -5`

Expected: TypeScript errors about missing `ai` and `@ai-sdk/*` imports (this is correct — we'll fix these in subsequent tasks).

**Step 3: Update .env**

Replace Serper/FRED/Census/Congress key slots with the keys relevant to the new architecture. Keep `ANTHROPIC_API_KEY` and `DATABASE_URL` as-is. Add `NCBI_API_KEY` slot (optional, for PubMed higher rate limits). Remove unused key slots.

**Step 4: Commit**

```bash
git add package.json package-lock.json .env
git commit -m "chore: swap Vercel AI SDK for Anthropic SDK + MCP SDK"
```

---

### Task 2: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add sourceTier to Finding model**

Add after `source` field (line 76):
```prisma
sourceTier  String @default("SECONDARY") // PRIMARY | SECONDARY | TERTIARY
```

**Step 2: Run migration**

```bash
cd "/Users/jared.peck/Desktop/Prism Intelligent Deck Proto/protoprism"
npx prisma migrate dev --name add-source-tier
```

**Step 3: Verify generated client**

```bash
npx prisma generate
```

Check that `src/generated/prisma/models/Finding.ts` includes `sourceTier` field.

**Step 4: Commit**

```bash
git add prisma/ src/generated/
git commit -m "feat: add sourceTier field to Finding model"
```

---

### Task 3: Rewrite Pipeline Types

**Files:**
- Rewrite: `src/lib/pipeline/types.ts`

**Step 1: Rewrite types.ts**

This file defines the core data structures for the entire pipeline. The current version (265 lines) uses Zod schemas. Keep Zod but update to match the PRISM methodology spec exactly.

Key types to define:
```typescript
// Enums
SwarmTier: "MICRO" | "STANDARD" | "EXTENDED" | "MEGA" | "CAMPAIGN"
ConfidenceLevel: "HIGH" | "MEDIUM" | "LOW"
SourceTier: "PRIMARY" | "SECONDARY" | "TERTIARY"
EvidenceType: "direct" | "inferred" | "analogical" | "modeled"
FindingAction: "keep" | "dismiss" | "boost" | "flag"
AutonomyMode: "supervised" | "guided" | "autonomous"
ConflictType: "factual" | "interpretive" | "methodological" | "predictive" | "values_based" | "scope"
NudgeType: "CORRECT" | "DEEPEN" | "EXTEND" | "MODEL" | "TARGET"

// Phase 0 output
Blueprint: {
  query, dimensions[], complexityScore: { breadth, depth, interconnection, total, urgency, adjusted },
  tier: SwarmTier, agents: AgentRecommendation[], ethicalConcerns: string[]
}

// Phase 1 output
ConstructedAgent: {
  name, archetype, dimension, mandate, systemPrompt, researchPrompt,
  tools: string[], skills: string[], color: string, neutralFramingApplied: boolean
}

// Phase 2 output (per agent)
AgentFinding: {
  statement, evidence, confidence: ConfidenceLevel, sourceTier: SourceTier,
  evidenceType: EvidenceType, source, implication, tags: string[]
}
AgentResult: {
  agentName, archetype, dimension, findings: AgentFinding[],
  gaps: string[], signals: string[], minorityViews: string[],
  toolsUsed: string[], tokensUsed: number
}

// Phase 3 output
EmergentInsight: {
  insight, algorithm, supportingAgents: string[], evidenceSources: string[],
  qualityScores: { novelty, grounding, actionability, depth, surprise },
  whyMultiAgent: string
}
TensionPoint: {
  tension, sideA: { position, agents, evidence },
  sideB: { position, agents, evidence },
  conflictType: ConflictType, resolution: string
}
SynthesisLayer: {
  name: "foundation" | "convergence" | "tension" | "emergence" | "gap",
  insights: string[], description: string
}
SynthesisResult: {
  layers: SynthesisLayer[], emergentInsights: EmergentInsight[],
  tensionPoints: TensionPoint[], overallConfidence: ConfidenceLevel,
  criticRevisions: string[]
}

// Phase 4 output
PresentationResult: {
  html: string, title: string, subtitle: string, slideCount: number
}

// Pipeline events (SSE)
PipelineEvent: discriminated union of all event types
  phase_change | blueprint | agent_spawned | agent_progress | tool_call |
  finding_added | agent_complete | synthesis_started | synthesis_layer |
  emergence_detected | critic_review | verification_gate | quality_report |
  presentation_started | presentation_complete | complete | error

// Full manifest
IntelligenceManifest: {
  blueprint, agentResults: AgentResult[], synthesis: SynthesisResult,
  presentation: PresentationResult, qualityReport, metadata: { startTime, endTime, totalTokens }
}
```

Implement all types with Zod schemas for runtime validation. Export both the Zod schemas and inferred TypeScript types.

**Step 2: Verify types compile**

```bash
npx tsc --noEmit src/lib/pipeline/types.ts 2>&1 | head -20
```

Expected: Clean compilation (may have errors from files importing old types — that's fine, we're rewriting those next).

**Step 3: Commit**

```bash
git add src/lib/pipeline/types.ts
git commit -m "feat: rewrite pipeline types to match PRISM methodology spec"
```

---

### Task 4: Create Anthropic Client Wrapper

**Files:**
- Create: `src/lib/ai/client.ts`

**Step 1: Create client.ts**

Centralized Anthropic SDK client with model constants, prompt caching helpers, and extended thinking configuration:

```typescript
import Anthropic from "@anthropic-ai/sdk";

// Singleton client
let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  }
  return client;
}

// Model routing per pipeline phase
export const MODELS = {
  THINK: "claude-opus-4-0-20250514",       // Phase 0: dimensional analysis
  CONSTRUCT: "claude-sonnet-4-20250514",    // Phase 1: prompt building
  DEPLOY: "claude-sonnet-4-20250514",       // Phase 2: research agents
  CRITIC: "claude-opus-4-0-20250514",       // CRITIC-FACTUAL + synthesis critic
  SYNTHESIZE: "claude-opus-4-0-20250514",   // Phase 3: emergence detection
  PRESENT: "claude-sonnet-4-20250514",      // Phase 4: HTML generation
} as const;

// Extended thinking config (for THINK and SYNTHESIZE phases)
export const EXTENDED_THINKING = {
  type: "enabled" as const,
  budget_tokens: 10000,
};

// Helper to create a cached system prompt (for large specs like presentation-system.md)
export function cachedSystemPrompt(text: string): Anthropic.Messages.TextBlockParam {
  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/lib/ai/client.ts
```

**Step 3: Commit**

```bash
git add src/lib/ai/client.ts
git commit -m "feat: add Anthropic SDK client wrapper with model routing"
```

---

### Task 5: Create MCP Client Infrastructure

**Files:**
- Create: `src/lib/mcp/config.ts`
- Create: `src/lib/mcp/client.ts`

**Step 1: Create config.ts**

Define MCP server configurations. These mirror what Claude Desktop uses:

```typescript
export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// MCP servers to spawn as child processes
// Package names TBD — verify actual npm package names before implementation
export const MCP_SERVERS: Record<string, MCPServerConfig> = {
  pubmed: {
    command: "npx",
    args: ["-y", "@anthropic/mcp-pubmed"],
    env: { NCBI_API_KEY: process.env.NCBI_API_KEY ?? "" },
  },
  cms_coverage: {
    command: "npx",
    args: ["-y", "@anthropic/mcp-cms-coverage"],
  },
  icd10: {
    command: "npx",
    args: ["-y", "@anthropic/mcp-icd10"],
  },
  npi: {
    command: "npx",
    args: ["-y", "@anthropic/mcp-npi"],
  },
  clinical_trials: {
    command: "npx",
    args: ["-y", "@anthropic/mcp-clinical-trials"],
  },
  biorxiv: {
    command: "npx",
    args: ["-y", "@anthropic/mcp-biorxiv"],
  },
};

// Tool routing: which MCP servers each archetype can access
export const ARCHETYPE_TOOL_ROUTING: Record<string, string[]> = {
  "RESEARCHER-DATA":     ["pubmed", "clinical_trials", "biorxiv", "icd10"],
  "RESEARCHER-DOMAIN":   ["npi"],
  "RESEARCHER-WEB":      [], // uses Anthropic native web_search
  "RESEARCHER-LATERAL":  ["biorxiv", "pubmed"],
  "ANALYST-FINANCIAL":   ["cms_coverage"],
  "ANALYST-STRATEGIC":   ["npi"],
  "ANALYST-TECHNICAL":   ["icd10", "cms_coverage"],
  "ANALYST-RISK":        ["pubmed", "clinical_trials"],
  "REGULATORY-RADAR":    ["cms_coverage"],
  "LEGISLATIVE-PIPELINE":["cms_coverage"],
  "CRITIC-FACTUAL":      [], // uses Anthropic native web_search
  "FUTURIST":            ["pubmed", "clinical_trials"],
  "MACRO-CONTEXT":       ["cms_coverage"],
};
```

**IMPORTANT NOTE:** The actual npm package names for these MCP servers need to be verified. The servers available in Claude Desktop (claude.ai) may be hosted differently than standalone npm packages. Before implementing, research:
1. Check if `@anthropic/mcp-*` packages exist on npm
2. If not, check `@modelcontextprotocol/*` packages
3. If neither exist as standalone packages, we may need to implement direct REST API calls wrapped in MCP server protocol — which is what the current `mcp-tools.ts` does, just with cleaner architecture

**Step 2: Create client.ts**

MCP client that manages server lifecycle and routes tool calls:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCP_SERVERS, ARCHETYPE_TOOL_ROUTING, type MCPServerConfig } from "./config";

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  tools: Map<string, any>; // tool name -> tool schema
}

class MCPManager {
  private connections = new Map<string, MCPConnection>();
  private initialized = false;

  // Start all MCP servers and discover their tools
  async initialize(): Promise<void> {
    if (this.initialized) return;

    for (const [name, config] of Object.entries(MCP_SERVERS)) {
      try {
        await this.connectServer(name, config);
      } catch (err) {
        console.warn(`MCP server '${name}' failed to start:`, err);
        // Graceful degradation — agents note unavailable tools in Gaps
      }
    }
    this.initialized = true;
  }

  private async connectServer(name: string, config: MCPServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env },
    });

    const client = new Client({ name: `prism-${name}`, version: "1.0.0" }, {});
    await client.connect(transport);

    // Discover available tools
    const toolList = await client.listTools();
    const tools = new Map<string, any>();
    for (const tool of toolList.tools) {
      tools.set(tool.name, tool);
    }

    this.connections.set(name, { client, transport, tools });
  }

  // Get tool definitions for a specific archetype (for Claude API tools parameter)
  getToolsForArchetype(archetype: string): Anthropic.Messages.Tool[] {
    const serverNames = ARCHETYPE_TOOL_ROUTING[archetype] ?? [];
    const tools: Anthropic.Messages.Tool[] = [];

    for (const serverName of serverNames) {
      const conn = this.connections.get(serverName);
      if (!conn) continue;
      for (const [toolName, toolSchema] of conn.tools) {
        tools.push({
          name: `${serverName}__${toolName}`,
          description: toolSchema.description ?? "",
          input_schema: toolSchema.inputSchema,
        });
      }
    }

    return tools;
  }

  // Execute a tool call (called when Claude returns tool_use)
  async executeTool(qualifiedName: string, input: Record<string, unknown>): Promise<string> {
    const [serverName, ...toolParts] = qualifiedName.split("__");
    const toolName = toolParts.join("__");
    const conn = this.connections.get(serverName);

    if (!conn) {
      return JSON.stringify({ error: `MCP server '${serverName}' not available` });
    }

    const result = await conn.client.callTool({ name: toolName, arguments: input });
    return typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);
  }

  // Shutdown all servers
  async shutdown(): Promise<void> {
    for (const [, conn] of this.connections) {
      await conn.transport.close();
    }
    this.connections.clear();
    this.initialized = false;
  }
}

// Singleton
let manager: MCPManager | null = null;

export function getMCPManager(): MCPManager {
  if (!manager) {
    manager = new MCPManager();
  }
  return manager;
}
```

**Step 3: Verify compilation**

```bash
npx tsc --noEmit src/lib/mcp/client.ts src/lib/mcp/config.ts
```

**Step 4: Commit**

```bash
git add src/lib/mcp/
git commit -m "feat: add MCP client infrastructure for native tool server management"
```

---

## Phase 2: Pipeline Core (THINK, CONSTRUCT, DEPLOY, SYNTHESIZE)

### Task 6: Rewrite Phase 0 — THINK

**Files:**
- Rewrite: `src/lib/pipeline/think.ts` (279 lines)

**Reference:** Read `prism 2/references/methodology-core.md` sections 1-2 before implementing.

**Step 1: Rewrite think.ts**

Replace the current Vercel AI SDK `generateObject()` call with Anthropic SDK `messages.create()` using:
- Model: `MODELS.THINK` (Opus)
- Extended thinking enabled (`EXTENDED_THINKING`)
- System prompt: methodology-core.md sections 1-2 (Dimensional Analysis Framework + Complexity Scoring)
- Tool use for structured output: define a `submit_blueprint` tool that accepts the Blueprint schema, forcing Claude to return structured JSON
- Include the Dimension Signal Heuristics table, Dimension Qualification Criteria, Known Interconnection Pairs, Complexity Scoring rubrics, and Tier Mapping table in the system prompt

Key logic to preserve from current implementation:
- Ethical concern detection patterns (lines 34-44)
- Known interconnection pair validation (lines 266-278)
- Tier-to-agent-count mapping

Key changes:
- Use `getAnthropicClient()` instead of `anthropic("claude-sonnet-4-20250514")`
- Use extended thinking for deeper dimensional analysis
- Add Urgency multiplier from methodology-core.md section 2
- Return Blueprint type from new types.ts

The system prompt must include the FULL text of methodology-core.md sections 1-2 (Dimensional Analysis + Complexity Scoring), including all tables. Use `cachedSystemPrompt()` so it's cached across runs.

**Step 2: Verify think.ts compiles**

```bash
npx tsc --noEmit src/lib/pipeline/think.ts
```

**Step 3: Commit**

```bash
git add src/lib/pipeline/think.ts
git commit -m "feat: rewrite Phase 0 THINK with Anthropic SDK + extended thinking"
```

---

### Task 7: Rewrite Phase 1 — CONSTRUCT

**Files:**
- Rewrite: `src/lib/pipeline/construct.ts` (271 lines)
- Keep: `src/lib/pipeline/archetypes.ts` (798 lines — registry is good, no changes needed)
- Keep: `src/lib/pipeline/skill-router.ts` (535 lines — skill system is good, no changes needed)

**Reference:** Read `prism 2/SKILL.md` Phase 1 section and methodology-core.md section 3 (Agent Archetypes).

**Step 1: Rewrite construct.ts**

The CONSTRUCT phase is mostly deterministic — it builds agent prompts from the blueprint. Current implementation is close but needs:

1. **Source Tier Classification** injected into EVERY agent's output format. Add to the Output Requirements section of every agent prompt:
```
For each finding, classify source tier:
- **Source Tier:** PRIMARY | SECONDARY | TERTIARY
- If SECONDARY/TERTIARY for regulatory, clinical, or financial claims,
  you MUST attempt to locate the PRIMARY source and verify the claim.
```

2. **MCP tool assignment** per agent based on archetype. Import `ARCHETYPE_TOOL_ROUTING` from `src/lib/mcp/config.ts` and list the specific tool names each agent can access in their prompt.

3. **Neutral Framing Protocol** — preserve current implementation (lines 32-64) but also apply to archetype bias/lens descriptions in the system prompt, not just the mandate.

4. **CRITIC-FACTUAL auto-spawn** — when blueprint.complexityScore.depth >= 4, add a CRITIC-FACTUAL agent to the roster. This agent runs AFTER primary agents (in Phase 2 deploy logic), receives top 10 claims, and verifies sources.

5. **Web search tool** — for agents with RESEARCHER-WEB archetype or CRITIC-FACTUAL, include Anthropic's native `web_search` tool in their tool list (this is passed as a server-side tool in the Claude API, not an MCP server).

Output: array of `ConstructedAgent` objects (from new types.ts).

**Step 2: Verify construct.ts compiles**

```bash
npx tsc --noEmit src/lib/pipeline/construct.ts
```

**Step 3: Commit**

```bash
git add src/lib/pipeline/construct.ts
git commit -m "feat: rewrite Phase 1 CONSTRUCT with source tier enforcement + MCP tool routing"
```

---

### Task 8: Rewrite Phase 2 — DEPLOY

**Files:**
- Rewrite: `src/lib/pipeline/deploy.ts` (525 lines)

**Reference:** Read `prism 2/SKILL.md` Phase 2 section.

This is the most complex phase — it runs all agents in parallel with real MCP tool access.

**Step 1: Rewrite deploy.ts**

Core flow per agent:
1. Build Claude API message with agent's system prompt + research prompt
2. Include MCP tools (from `getMCPManager().getToolsForArchetype(archetype)`) + Anthropic native `web_search` tool (if applicable) in `tools` parameter
3. Call `client.messages.create()` with streaming enabled
4. Handle tool_use loop:
   - When Claude returns `tool_use` content block → call `mcpManager.executeTool(name, input)` → return `tool_result` → continue
   - When Claude returns `text` content block → parse as agent findings
5. Parse final text response into `AgentResult` (findings, gaps, signals, minority views)
6. Emit SSE events: `agent_spawned`, `agent_progress`, `tool_call`, `finding_added`, `agent_complete`

Parallel execution:
- Use `Promise.allSettled()` to run all agents concurrently
- For EXTENDED+ tiers: Wave 1 (first N/2 agents) → write to MemoryBus blackboard → Wave 2 (remaining agents) with blackboard context injected into their research prompt
- **Fix the current bug:** Wave 2 agents MUST receive Wave 1 findings in their prompt

CRITIC-FACTUAL (when depth >= 4):
- Runs AFTER all primary agents complete
- Receives top 10 claims from all agents
- Has access to Anthropic native `web_search` tool
- Verifies source tier claims, flags discrepancies
- Output feeds into synthesis as factual ground truth

Agent output parsing:
- Each agent must return structured findings matching `AgentFinding` type
- Use a `parse_findings` tool (tool_use) to force structured output from each agent
- Validate against Zod schema

**Step 2: Verify deploy.ts compiles**

```bash
npx tsc --noEmit src/lib/pipeline/deploy.ts
```

**Step 3: Commit**

```bash
git add src/lib/pipeline/deploy.ts
git commit -m "feat: rewrite Phase 2 DEPLOY with Anthropic SDK + MCP tool_use loop"
```

---

### Task 9: Rewrite Phase 3 — SYNTHESIZE

**Files:**
- Rewrite: `src/lib/pipeline/synthesize.ts` (674 lines)

**Reference:** Read `prism 2/references/methodology-core.md` sections 4-6 (Emergence Detection, Conflict Resolution, Tiered Synthesis Protocol).

**Step 1: Rewrite synthesize.ts**

Core flow:
1. Collect all `AgentResult` outputs
2. Build synthesis prompt with ALL agent findings, gaps, signals, minority views
3. System prompt: methodology-core.md sections 4-6 (cached)
4. Call Opus with **extended thinking** enabled — this is the hardest cognitive task
5. Use tool_use for structured output: `submit_synthesis` tool accepting `SynthesisResult` schema

The system prompt must instruct Claude to apply ALL 4 emergence algorithms:
1. **Cross-Agent Theme Mining** — with Source Independence Test (check if "different evidence" traces to same primary source; if so, downgrade from CONVERGENT EMERGENCE to CORROBORATED FINDING)
2. **Tension Point Mapping** — classify conflict type (factual/interpretive/methodological/predictive/values_based/scope), apply resolution strategies
3. **Gap Triangulation** — shared gaps from multiple agents, ask "WHY is this missing?"
4. **Structural Pattern Recognition** — compare structure (not content) of agent outputs

Produce all 5 synthesis layers: foundation, convergence, tension, emergence, gap.

Emergence quality gate: each emergent insight scored on 5 dimensions (novelty, grounding, actionability, depth, surprise). Must score 4+ on >= 3 dimensions to qualify.

Each emergent insight must include `whyMultiAgent` explanation (this appears in the presentation as "Why Only Multi-Agent Analysis Finds This" boxes).

Tier-specific synthesis:
- MICRO (2-4 agents): Direct synthesis (single Opus call)
- STANDARD (5-8): Synthesis → CRITIC review → revision (two Opus calls)
- EXTENDED (9-12): Cluster agents by interconnection → sub-synthesize clusters → meta-synthesize
- MEGA (13-15): Hierarchical sub-swarms
- CAMPAIGN (15+): Sequential phases

If CRITIC-FACTUAL ran in Phase 2, its verification report is included as a "factual ground truth" layer that synthesis cannot override.

**Step 2: Verify synthesize.ts compiles**

```bash
npx tsc --noEmit src/lib/pipeline/synthesize.ts
```

**Step 3: Commit**

```bash
git add src/lib/pipeline/synthesize.ts
git commit -m "feat: rewrite Phase 3 SYNTHESIZE with Opus extended thinking + 4 emergence algorithms"
```

---

## Phase 3: Pipeline Extensions (VERIFY, PRESENT, REFINE)

### Task 10: Create Phase 3.5 — VERIFY

**Files:**
- Create: `src/lib/pipeline/verify.ts`

**Reference:** Read `prism 2/SKILL.md` Source Validation Protocol and Pre-PRESENT Verification Gate sections.

**Step 1: Create verify.ts**

This phase gates the pipeline between synthesis and presentation. Behavior depends on autonomy mode:

```typescript
export interface VerifyInput {
  synthesis: SynthesisResult;
  agentResults: AgentResult[];
  autonomyMode: AutonomyMode;
  emitEvent: (event: PipelineEvent) => void;
}

export interface VerifyOutput {
  approved: boolean;
  modifications: FindingModification[];
  topClaims: VerifiedClaim[];
}

interface VerifiedClaim {
  claim: string;
  sourceTier: SourceTier;
  verified: boolean;
  correction?: string;
}
```

Logic:
1. Extract top 10 highest-impact claims from synthesis (stat card candidates, key numbers, policy summaries)
2. Classify each by source tier
3. For SECONDARY/TERTIARY-sourced claims: flag for verification
4. Emit `verification_gate` SSE event with claims list
5. In **supervised** mode: wait for user response (approve/modify via API endpoint)
6. In **guided** mode: auto-approve after 60s timeout
7. In **autonomous** mode: return approved immediately
8. Apply any finding modifications (keep/dismiss/boost/flag actions from HITL)

**Step 2: Commit**

```bash
git add src/lib/pipeline/verify.ts
git commit -m "feat: add Phase 3.5 VERIFY with configurable autonomy gates"
```

---

### Task 11: Create Phase 4 — PRESENT

**Files:**
- Create: `src/lib/pipeline/present.ts`
- Delete (later): `src/lib/presentation.ts` (current template-based generation)

**Reference:** Read `prism 2/references/presentation-system.md` — the FULL spec. This is the system prompt for Sonnet.

**Step 1: Create present.ts**

This is where Claude generates the complete HTML5 presentation. The approach:

1. Load `presentation-system.md` as system prompt with `cachedSystemPrompt()` (it's ~1500 lines but only loaded once via prompt caching)
2. Build user prompt containing:
   - Query and title
   - Agent roster (names, archetypes, dimensions, colors)
   - All 5 synthesis layers
   - All emergent insights with `whyMultiAgent` explanations
   - All tension points
   - All agent findings with source tiers and confidence levels
   - Provenance chain (agent → finding → source → source tier)
   - Quality report summary
   - Slide count guidance based on tier and agent count
   - PRISM | Intelligence branding instruction
3. Call Sonnet with `max_tokens: 16000` (reference briefs are 700-1200 lines)
4. Stream the response — emit `presentation_started` and `presentation_complete` events
5. Save HTML to `public/decks/prism-[topic-slug]-[runId].html`
6. Create Presentation record in database

The instruction prompt must include:
- "Generate a self-contained HTML5 presentation following the spec exactly"
- "PRISM | Intelligence branding — no other brand references"
- "Executive Dark theme with PRISM brand colors"
- Slide count: "15 slides for MICRO/STANDARD, 16-20 for EXTENDED, scale for MEGA"
- For 6+ agents: "Use Extended Brief format with TOC slide and nav panel grouping"

**Step 2: Commit**

```bash
git add src/lib/pipeline/present.ts
git commit -m "feat: add Phase 4 PRESENT — Claude generates full HTML5 from presentation-system.md"
```

---

### Task 12: Create Phase 5 — REFINE

**Files:**
- Create: `src/lib/pipeline/refine.ts`

**Reference:** Read `prism 2/SKILL.md` Phase 5: REFINE section.

**Step 1: Create refine.ts**

Post-delivery nudge protocol:

```typescript
export interface NudgeInput {
  nudge: string;
  originalManifest: IntelligenceManifest;
  emitEvent: (event: PipelineEvent) => void;
}

export interface NudgeOutput {
  type: NudgeType;
  newAgentResults: AgentResult[];
  updatedSynthesis: SynthesisResult;
  output: "addendum" | "corrected_brief" | "supplement";
  presentation?: PresentationResult;
}
```

Logic:
1. **Classify nudge** — send to Sonnet with the 5 nudge types table from SKILL.md. Return NudgeType.
2. **Inherit context** — extract relevant findings from original manifest for new agents
3. **Deploy focused agents** (1-3) using the Nudge Agent Prompt Template from SKILL.md
4. **Synthesize** new findings WITH original synthesis
5. **Present** as:
   - CORRECT → regenerate full brief with corrections
   - DEEPEN/EXTEND/MODEL → 3-5 slide addendum appended to original
   - TARGET → standalone strategic supplement (5-7 slides)

**Step 2: Commit**

```bash
git add src/lib/pipeline/refine.ts
git commit -m "feat: add Phase 5 REFINE — nudge classification and focused agent re-deployment"
```

---

## Phase 4: Executor, API Routes, Streaming

### Task 13: Rewrite Pipeline Executor

**Files:**
- Rewrite: `src/lib/pipeline/executor.ts` (424 lines)

**Step 1: Rewrite executor.ts**

The executor orchestrates all phases and manages SSE event emission. It runs as a long-lived async function (not serverless-shaped).

```typescript
export async function executePipeline(
  input: { query: string; autonomyMode: AutonomyMode; urgency: string },
  emitEvent: (event: PipelineEvent) => void,
): Promise<IntelligenceManifest> {
  const mcpManager = getMCPManager();
  await mcpManager.initialize();

  try {
    // Phase 0: THINK
    emitEvent({ type: "phase_change", phase: "think", message: "Analyzing query dimensions..." });
    const blueprint = await think({ query: input.query, urgency: input.urgency });
    emitEvent({ type: "blueprint", blueprint });
    // HITL Gate 1: Blueprint approval (if supervised/guided)
    // ... wait for approval or auto-approve based on autonomyMode

    // Phase 1: CONSTRUCT
    emitEvent({ type: "phase_change", phase: "construct", message: "Building agent prompts..." });
    const constructedAgents = await construct({ blueprint, mcpManager });

    // Phase 2: DEPLOY
    emitEvent({ type: "phase_change", phase: "deploy", message: "Deploying agents..." });
    const agentResults = await deploy({ agents: constructedAgents, blueprint, mcpManager, emitEvent });

    // HITL Gate 2: Findings triage (if supervised)
    // ... emit findings, wait for triage actions

    // Phase 3: SYNTHESIZE
    emitEvent({ type: "phase_change", phase: "synthesize", message: "Detecting emergence..." });
    const synthesis = await synthesize({ agentResults, blueprint, emitEvent });

    // Phase 3.5: VERIFY
    const verifyResult = await verify({ synthesis, agentResults, autonomyMode: input.autonomyMode, emitEvent });

    // Phase 4: PRESENT
    emitEvent({ type: "phase_change", phase: "present", message: "Generating presentation..." });
    const presentation = await present({ synthesis, agentResults, blueprint, emitEvent });

    // Save to database
    // ... create Run, Agents, Findings, Synthesis, Presentation records

    emitEvent({ type: "complete", manifest });
    return manifest;
  } finally {
    // Don't shutdown MCP servers — they persist for Phase 5 REFINE
  }
}
```

Key changes from current:
- Initialize MCP manager at start
- Pass `emitEvent` through all phases for SSE streaming
- Implement HITL gates with autonomy mode checking
- Add Phase 3.5 VERIFY and Phase 4 PRESENT
- Save all results to Prisma database
- Handle errors gracefully — partial results are still valuable

**Step 2: Commit**

```bash
git add src/lib/pipeline/executor.ts
git commit -m "feat: rewrite executor with full PRISM pipeline phases + HITL gates"
```

---

### Task 14: Rewrite Pipeline Index (Re-exports)

**Files:**
- Rewrite: `src/lib/pipeline/index.ts` (122 lines)

**Step 1: Update index.ts**

Clean re-exports matching the new module structure:

```typescript
export { executePipeline } from "./executor";
export { think } from "./think";
export { construct } from "./construct";
export { deploy } from "./deploy";
export { synthesize, criticReview } from "./synthesize";
export { verify } from "./verify";
export { present } from "./present";
export { refine } from "./refine";
export { MemoryBus } from "./memory-bus";
export { ARCHETYPE_REGISTRY } from "./archetypes";
export { getSkillRouter } from "./skill-router";
export { getMCPManager } from "../mcp/client";
export type * from "./types";
```

**Step 2: Delete obsolete files**

```bash
rm src/lib/pipeline/mcp-tools.ts      # replaced by MCP client
rm src/lib/pipeline/tool-bridge.ts     # replaced by MCP client
rm src/lib/pipeline/prism-mcp-server.ts # replaced by MCP client
rm src/lib/pipeline/opensecrets.ts     # not needed for v1
rm src/lib/presentation.ts            # replaced by present.ts
```

**Step 3: Commit**

```bash
git add src/lib/pipeline/index.ts
git rm src/lib/pipeline/mcp-tools.ts src/lib/pipeline/tool-bridge.ts src/lib/pipeline/prism-mcp-server.ts src/lib/pipeline/opensecrets.ts src/lib/presentation.ts
git commit -m "feat: update pipeline index, remove obsolete MCP/presentation files"
```

---

### Task 15: Rewrite SSE Streaming Route

**Files:**
- Rewrite: `src/app/api/pipeline/stream/route.ts` (226 lines)

**Step 1: Rewrite stream route**

This is the primary pipeline execution endpoint. It receives a query, starts the pipeline, and streams events via SSE.

```typescript
import { NextRequest } from "next/server";
import { executePipeline } from "@/lib/pipeline";
import { prisma } from "@/lib/prisma";
import type { PipelineEvent, AutonomyMode } from "@/lib/pipeline/types";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query");
  const autonomyMode = (req.nextUrl.searchParams.get("autonomy") ?? "guided") as AutonomyMode;
  const urgency = req.nextUrl.searchParams.get("urgency") ?? "balanced";

  if (!query) {
    return new Response("Missing query parameter", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emitEvent = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const manifest = await executePipeline({ query, autonomyMode, urgency }, emitEvent);
        controller.close();
      } catch (err) {
        emitEvent({ type: "error", message: String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

**Step 2: Update or remove other API routes that are now obsolete**

- `src/app/api/analyze/route.ts` — currently creates mock blueprints. Either remove (pipeline/stream handles everything) or keep as a lightweight "preview blueprint" endpoint that calls only `think()`.
- `src/app/api/deploy/route.ts` — currently mock agent execution. Remove (pipeline/stream handles it).
- `src/app/api/pipeline/execute/route.ts` — non-streaming version. Keep as alternative for autonomous mode.

**Step 3: Create HITL gate endpoints**

Create `src/app/api/pipeline/gate/route.ts` for handling HITL gate responses:

```typescript
// POST /api/pipeline/gate
// Body: { runId, gate: "blueprint" | "findings" | "verification", action: "approve" | "modify", modifications?: ... }
```

This endpoint is called by the frontend when the user approves/modifies at a HITL gate. The executor awaits this response before proceeding.

**Step 4: Create refine endpoint**

Create `src/app/api/pipeline/refine/route.ts`:

```typescript
// POST /api/pipeline/refine
// Body: { runId, nudge: string }
// Returns: SSE stream of refine events
```

**Step 5: Commit**

```bash
git add src/app/api/pipeline/
git commit -m "feat: rewrite SSE streaming route + add HITL gate and refine endpoints"
```

---

### Task 16: Update Remaining API Routes

**Files:**
- Modify: `src/app/api/presentation/[runId]/route.ts` (47 lines)
- Modify: `src/app/api/history/route.ts` (36 lines)
- Modify: `src/app/api/run/[id]/route.ts` (53 lines)
- Modify: `src/app/api/settings/route.ts` (29 lines)
- Modify: `src/app/api/decks/[id]/provenance/route.ts` (55 lines)
- Delete: `src/app/api/seed/route.ts` (136 lines) — mock data seeder, no longer needed
- Delete or keep: `src/app/api/briefs/route.ts` (83 lines) — depends on whether DeckLibrary uses it

**Step 1: Update presentation route**

`[runId]/route.ts` serves the generated HTML file. Update to read from the new file path (`public/decks/prism-[slug]-[runId].html`).

**Step 2: Update history and run routes**

These query the database — they should mostly work as-is since the Prisma schema is compatible. Add `sourceTier` to finding includes where relevant.

**Step 3: Update settings route**

Ensure it reads/writes the new settings shape (autonomy mode, model selection with only Claude options, MCP server toggles).

**Step 4: Update provenance route**

Include `sourceTier` in provenance chain response.

**Step 5: Commit**

```bash
git add src/app/api/
git commit -m "feat: update API routes for new pipeline data model"
```

---

## Phase 5: Frontend Updates

### Task 17: Update Branding

**Files:**
- Modify: `src/app/layout.tsx` (line 31-52, header section)
- Modify: `src/app/globals.css` (if any brand text changes needed)
- Modify: `src/components/phases/InputPhase.tsx` (line 41, "Strategic Intelligence" text)

**Step 1: Update header**

Change "PRISM" to "PRISM | Intelligence" in `layout.tsx`. The Layers icon + gradient stays. Remove "v3.0" badge — replace with a subtle "System Online" indicator.

**Step 2: Update InputPhase title**

Change "Strategic Intelligence" to "PRISM | Intelligence" or just keep the input clean.

**Step 3: Commit**

```bash
git add src/app/layout.tsx src/components/phases/InputPhase.tsx
git commit -m "feat: update branding to PRISM | Intelligence"
```

---

### Task 18: Update useResearchStream Hook

**Files:**
- Modify: `src/hooks/use-research-stream.ts` (401 lines)

**Step 1: Update SSE event handling**

The hook processes SSE events from the pipeline. Update event type handling to match new `PipelineEvent` types:

- Add handlers for: `tool_call`, `verification_gate`, `presentation_started`, `presentation_complete`
- Update `StreamState` to include: `verificationClaims`, `presentationProgress`, `autonomyMode`
- Update `startStream` to pass `autonomy` and `urgency` query params

**Step 2: Add HITL gate interaction**

When a `verification_gate` event arrives in supervised mode, the hook should set state that causes the UI to show the verification panel. When the user approves, the hook calls `POST /api/pipeline/gate`.

**Step 3: Commit**

```bash
git add src/hooks/use-research-stream.ts
git commit -m "feat: update research stream hook for new pipeline events + HITL gates"
```

---

### Task 19: Update Phase Components

**Files:**
- Modify: `src/components/phases/ExecutingPhase.tsx` — add tool call display (show which MCP tools agents are calling in real-time)
- Modify: `src/components/phases/TriagePhase.tsx` — connect finding actions to backend via `/api/pipeline/gate`
- Modify: `src/components/phases/SynthesisPhase.tsx` — show emergence algorithm progress
- Modify: `src/components/phases/CompletePhase.tsx` — show presentation generation progress, link to generated HTML, add "Refine" button for Phase 5 nudges
- Modify: `src/components/BlueprintApproval.tsx` — fix non-functional "Edit Roster" button (either implement or remove)

**Step 1: Update each component**

Focus on connecting the UI to real pipeline data instead of mock data. Key changes:
- ExecutingPhase: show `tool_call` events as they arrive (e.g., "Financial Analyst → search_national_coverage")
- TriagePhase: POST finding actions to `/api/pipeline/gate` so they influence synthesis
- CompletePhase: add "Refine Analysis" input for Phase 5 nudges
- BlueprintApproval: remove "Edit Roster" button (YAGNI for v1) or implement it

**Step 2: Commit**

```bash
git add src/components/phases/ src/components/BlueprintApproval.tsx
git commit -m "feat: update phase components for real pipeline data + HITL interactions"
```

---

### Task 20: Update AdminSettings

**Files:**
- Modify: `src/components/AdminSettings.tsx` (420 lines)
- Modify: `src/lib/settings-types.ts`

**Step 1: Update settings shape**

- Models tab: Remove GPT-4o and Gemini options. Show only Claude Opus and Claude Sonnet with phase-specific assignment (THINK=Opus, DEPLOY=Sonnet, etc.)
- Pipeline tab: Add autonomy mode selector (supervised/guided/autonomous)
- Skills tab: Keep as-is (9 domain skills)
- API Keys tab: Simplify to just ANTHROPIC_API_KEY (required) and NCBI_API_KEY (optional). Remove Serper/FRED/Census/Congress.
- Add MCP Servers tab: Show which MCP servers are available, their connection status, and toggle to enable/disable

**Step 2: Commit**

```bash
git add src/components/AdminSettings.tsx src/lib/settings-types.ts
git commit -m "feat: update admin settings for Claude-only + MCP server management"
```

---

### Task 21: Update Main Page + Types

**Files:**
- Modify: `src/app/page.tsx` (346 lines)
- Modify: `src/lib/types.ts` (37 lines)
- Delete: `src/lib/mock-data.ts` — no longer needed with real pipeline

**Step 1: Update page.tsx**

- Remove demo mode logic (lines 78-130) — pipeline always runs for real
- Add autonomy mode state (read from settings)
- Pass autonomy mode to `startStream`
- Add Phase 5 REFINE flow: after CompletePhase, user can enter a nudge → triggers refine endpoint → shows refinement progress → delivers addendum

**Step 2: Update types.ts**

- Remove re-exports from mock-data.ts
- Re-export types from `@/lib/pipeline/types` that the frontend needs

**Step 3: Commit**

```bash
git add src/app/page.tsx src/lib/types.ts
git rm src/lib/mock-data.ts
git commit -m "feat: update main page for real pipeline execution + Phase 5 refine flow"
```

---

## Phase 6: Integration & Verification

### Task 22: Update DeckViewer for Generated Presentations

**Files:**
- Modify: `src/components/DeckViewer.tsx`
- Modify: `src/lib/deck-data.ts` — update or remove static deck data

**Step 1: Update DeckViewer**

The viewer renders generated HTML in an iframe. Update to:
- Load presentation from `/decks/[filename]` (served from public/ directory)
- Remove dependency on static `DECK_LIBRARY`
- Load presentations from database (Presentation model) via `/api/history`

**Step 2: Commit**

```bash
git add src/components/DeckViewer.tsx src/lib/deck-data.ts
git commit -m "feat: update DeckViewer to load generated presentations from database"
```

---

### Task 23: End-to-End Smoke Test

**Step 1: Start the app**

```bash
cd "/Users/jared.peck/Desktop/Prism Intelligent Deck Proto/protoprism"
npm run dev
```

**Step 2: Run a test query**

Open `http://localhost:3000`. Enter: "What is the strategic impact of biosimilar interchangeability on specialty pharmacy payers?"

**Step 3: Verify each phase**

- [ ] Phase 0 THINK: Blueprint appears with dimensions, complexity score, tier, agent roster
- [ ] HITL Gate 1: Blueprint approval panel shows (if guided/supervised)
- [ ] Phase 1 CONSTRUCT: Agent prompts built (visible in terminal logs)
- [ ] Phase 2 DEPLOY: Agents run in parallel, tool calls visible in UI (PubMed, CMS, etc.)
- [ ] CRITIC-FACTUAL: Runs after primary agents if depth >= 4
- [ ] Phase 3 SYNTHESIZE: Emergence detection, 5 synthesis layers produced
- [ ] Phase 3.5 VERIFY: Verification gate (if supervised)
- [ ] Phase 4 PRESENT: HTML5 presentation generated and displayed in DeckViewer
- [ ] Presentation matches reference brief quality: nav panel, finding cards, confidence badges, provenance table, animated reveals, PRISM | Intelligence branding

**Step 4: Verify presentation HTML**

Open the generated HTML file directly in browser. Check:
- [ ] Self-contained (no external deps, no broken resources)
- [ ] PRISM | Intelligence header
- [ ] Executive Dark theme with PRISM brand colors
- [ ] Scroll-snap navigation + keyboard arrows work
- [ ] Agent roster chips on title slide
- [ ] Finding cards with confidence badges
- [ ] Emergence cards with "Why Only Multi-Agent" boxes
- [ ] Provenance table with source tiers
- [ ] Animated reveals on scroll

**Step 5: Test Phase 5 REFINE**

After viewing the brief, enter a nudge: "What are the M&A targets in this space?" Verify:
- [ ] Nudge classified correctly (TARGET)
- [ ] Focused agents deployed (1-3)
- [ ] Strategic supplement generated

**Step 6: Commit final state**

```bash
git add -A
git commit -m "feat: PRISM pipeline rewrite complete — end-to-end verified"
```

---

## Task Dependency Graph

```
Task 1 (deps) ─────────────────────────────────────┐
Task 2 (schema) ────────────────────────────────────┤
Task 3 (types) ─────────────────────────────────────┤
Task 4 (AI client) ────────────────────────────────┤
Task 5 (MCP client) ───────────────────────────────┘
         │
         ├── Task 6 (THINK) ──────────────────────────┐
         ├── Task 7 (CONSTRUCT) ──────────────────────┤
         │         │                                   │
         │         └── Task 8 (DEPLOY) ───────────────┤
         │                    │                        │
         │                    └── Task 9 (SYNTHESIZE) ─┤
         │                               │             │
         │                    Task 10 (VERIFY) ────────┤
         │                    Task 11 (PRESENT) ───────┤
         │                    Task 12 (REFINE) ────────┘
         │                               │
         │                    Task 13 (EXECUTOR) ──────┐
         │                    Task 14 (INDEX) ─────────┤
         │                               │             │
         │                    Task 15 (SSE ROUTE) ─────┤
         │                    Task 16 (API ROUTES) ────┘
         │                               │
         ├── Task 17 (BRANDING) ──────────┤
         ├── Task 18 (STREAM HOOK) ───────┤
         ├── Task 19 (PHASE COMPONENTS) ──┤
         ├── Task 20 (ADMIN SETTINGS) ────┤
         ├── Task 21 (MAIN PAGE) ─────────┤
         ├── Task 22 (DECK VIEWER) ───────┘
         │              │
         └── Task 23 (E2E SMOKE TEST) ────── DONE
```

**Critical path:** Tasks 1-5 → 6-9 → 10-12 → 13-15 → 23

**Parallelizable:** Tasks 17-22 (frontend) can run in parallel with Tasks 13-16 (backend) once Phase 2 pipeline core is complete.

---

## Estimated Scope

| Phase | Tasks | Estimated Files | Key Risk |
|-------|-------|----------------|----------|
| 1. Foundation | 1-5 | 6 new/modified | MCP server package availability |
| 2. Pipeline Core | 6-9 | 4 rewritten | Tool_use loop complexity |
| 3. Extensions | 10-12 | 3 new | Presentation quality parity |
| 4. Executor/Routes | 13-16 | 6 rewritten | HITL gate async coordination |
| 5. Frontend | 17-22 | 10 modified | SSE event type alignment |
| 6. Verification | 23 | 0 | End-to-end integration |
