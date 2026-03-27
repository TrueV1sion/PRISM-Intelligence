# PRISM ENGRAM

Multi-agent strategic intelligence platform for healthcare. Decomposes complex research queries into parallel agent swarms, synthesizes emergent cross-agent insights, and delivers cinematic HTML5 executive briefings — all backed by 20 government data APIs and 15 local MCP servers.

## How It Works

```
QUERY → THINK → DEPLOY → SYNTHESIZE → PRESENT
```

1. **THINK** — Analyzes query complexity (breadth/depth/interconnection), selects a swarm tier (Micro → Campaign), and assembles an agent roster from 57 archetypes.
2. **DEPLOY** — Runs 2–15 specialized agents in parallel. Each agent has a unique analytical lens, access to curated tools, and writes findings with provenance chains.
3. **SYNTHESIZE** — Detects emergent insights no single agent would find, using 4 algorithms: Cross-Agent Theme Mining, Tension Point Mapping, Gap Triangulation, and Structural Pattern Recognition. Opus-class model with extended thinking handles deep reasoning.
4. **PRESENT** — Generates a self-contained HTML5 presentation with charts, animations, slide-level annotations, and full source attribution. Quality pipeline scores and remediates output automatically.

## Engines

Beyond the general-purpose Command Center, PRISM provides 5 domain-specific engines with pre-configured archetype rosters and data source routing:

| Engine | Focus |
|--------|-------|
| **M&A** | Deal flow, valuation signals, due diligence, ownership changes |
| **Finance** | Financial modeling, payer financial health, market sizing |
| **Regulatory** | CMS/HHS rule tracking, legislative pipeline, compliance impact |
| **Sales** | Competitive battlecards, territory intelligence, prospect research |
| **Product** | Market fit, feature benchmarking, ecosystem mapping |

## Data Sources

**20 Government API Clients** — OpenFDA, SEC EDGAR, CMS Open Payments, Federal Register, Congress.gov, USPTO Patents, Hospital Compare, Grants.gov, SAM.gov, Census Bureau, BLS, CBO, AHRQ HCUP, OECD Health, WHO GHO, FDA Orange Book, GPO GovInfo, OpenSecrets, Leapfrog, SBIR.gov

**15 Local MCP Sidecar Servers** — Each major API has a dedicated MCP server in `mcp-servers/` exposing structured tool interfaces for agent consumption.

**19 Research Modules** — Higher-level research orchestrators (clinical evidence, patent landscape, regulatory landscape, competitive intel, market dynamics, coverage policy, etc.) that compose multiple API clients into domain-specific research workflows.

**Continuous Intelligence** — RSS/Atom feed ingestion (4-hour polling), government dataset diffing (weekly snapshots with delta detection), and a SENTINEL correlation engine that detects cross-source signals with Bayesian confidence scoring.

## Architecture

```
src/
├── app/                          # Next.js App Router
│   ├── (platform)/               # Authenticated platform shell
│   │   ├── page.tsx              # Command Center
│   │   ├── engines/[engineId]/   # Domain engine views
│   │   ├── history/              # Run history
│   │   ├── scenarios/[runId]/    # What-if scenario explorer
│   │   └── briefs/[id]/edit/     # Presentation editor
│   ├── api/
│   │   ├── pipeline/             # stream, triage, approve, refine, execute
│   │   ├── scenarios/            # CRUD, compute, forecast, stress-test, diff
│   │   ├── presentations/        # Versions, slides, annotations, publish
│   │   ├── cron/                 # feeds, datasets, health, sentinel
│   │   ├── deploy/               # Deck packaging & download
│   │   └── ...
│   └── auth/                     # NextAuth sign-in/error pages
│
├── lib/
│   ├── pipeline/                 # Core 4-phase pipeline
│   │   ├── think.ts              # Query decomposition & agent roster
│   │   ├── deploy.ts             # Parallel agent execution
│   │   ├── synthesize.ts         # 4 emergence detection algorithms
│   │   ├── present.ts            # HTML5 brief generation
│   │   ├── archetypes.ts         # 57 agent archetype definitions
│   │   ├── memory-bus.ts         # Cross-agent shared memory
│   │   ├── ir-types.ts           # Intermediate Representation graph
│   │   └── quality-assurance.ts  # Automated brief scoring
│   ├── engines/                  # Domain engine registry
│   ├── scenarios/                # What-if scenario engine (fork, lever, forecast, stress-test, diff)
│   ├── data-sources/
│   │   ├── clients/              # 20 API clients
│   │   ├── tools/                # 23 MCP tool definitions
│   │   ├── research/             # 19 research orchestrators
│   │   ├── registry.ts           # Data source routing
│   │   ├── cache.ts              # Response caching
│   │   └── rate-limit.ts         # Per-source rate limiting
│   ├── signals/                  # SENTINEL: correlation, scoring, alerts
│   ├── feeds/                    # RSS/Atom ingestion & entity extraction
│   ├── datasets/                 # Government dataset diffing
│   ├── collaboration/            # Yjs real-time collaboration
│   ├── renderers/                # Export formats (HTML, PDF, data room, executive memo)
│   ├── cache/                    # Redis + cross-run caching
│   ├── storage/                  # Vercel Blob integration
│   ├── ai/                       # Anthropic SDK client config
│   └── auth.ts                   # NextAuth.js v5 configuration
│
├── components/
│   ├── platform/                 # Shell: header, sidebar, engine shell
│   ├── engines/                  # 6 engine dashboard components
│   └── ...                       # AgentCard, FindingCard, LiveTerminal, DeckLibrary, etc.
│
└── generated/prisma/             # Generated Prisma client

mcp-servers/                      # 15 local MCP sidecar servers
prisma/schema.prisma              # 30+ models (runs, agents, findings, synthesis, scenarios, signals, auth...)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) + React 19 |
| AI | Anthropic SDK — Claude Opus (reasoning/synthesis) + Claude Sonnet (execution) |
| Database | PostgreSQL via Prisma 7 |
| Caching | Upstash Redis (cross-run cache, rate limiting) |
| Storage | Vercel Blob (dataset snapshots, exports) |
| Auth | NextAuth.js v5 with team-based RBAC (owner/admin/analyst/viewer) |
| Collaboration | Yjs + y-websocket for real-time co-editing |
| Styling | Tailwind CSS v4 + OKLCH design tokens |
| Validation | Zod schemas at every pipeline boundary |
| Testing | Vitest (92 test files) |
| Tooling | 15 local MCP servers + 23 tool definitions |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Required: ANTHROPIC_API_KEY, DATABASE_URL
# Optional: UPSTASH_REDIS_REST_URL, BLOB_READ_WRITE_TOKEN, AUTH_SECRET

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the platform.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (auto-compiles design spec) |
| `npm run build` | Production build |
| `npm test` | Run test suite (92 files) |
| `npm run test:coverage` | Test coverage report |
| `npm run type-check` | TypeScript validation |
| `npm run ci` | Full CI pipeline (lint + typecheck + test + build) |
| `npm run mcp:start` | Start local MCP sidecar servers |
| `npm run mcp:stop` | Stop MCP servers |
| `npm run mcp:status` | Check MCP server status |

## Cron Jobs

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| Every hour | `/api/cron/health` | Source health monitoring |
| Every 4 hours | `/api/cron/feeds` | RSS/Atom feed ingestion |
| Every 6 hours | `/api/cron/sentinel` | Cross-source signal correlation |
| Weekly (Sun 3am) | `/api/cron/datasets` | Government dataset snapshot & diff |

## Scenarios

Completed runs can be forked into "what-if" scenarios. Adjust levers (flip tensions, resolve gaps, tweak metrics, suppress/amplify findings), re-run synthesis, and compare divergent outcomes with sensitivity analysis, forecasting, stress testing, and side-by-side diffs.

## License

Private.
