# Protoprism

Multi-agent strategic intelligence platform that decomposes complex research questions into parallel agent streams, synthesizes emergent insights, and generates cinematic HTML5 executive briefings.

## What It Does

1. **THINK** -- Decomposes a query into analytical dimensions and assembles an agent roster
2. **DEPLOY** -- Runs 2-15 specialized agents in parallel, each with access to 30+ research tools (PubMed, SEC EDGAR, FDA, CMS, USPTO, etc.)
3. **SYNTHESIZE** -- Detects cross-agent emergent insights via 4 synthesis algorithms
4. **PRESENT** -- Generates a self-contained HTML5 presentation with charts, animations, and full provenance

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **AI**: Anthropic SDK (Claude Opus for reasoning, Claude Sonnet for execution)
- **Database**: PostgreSQL via Prisma 7
- **Styling**: Tailwind CSS v4 + OKLCH design tokens
- **Tools**: 15 API clients + 6 MCP remote servers + 15 local MCP sidecars
- **Validation**: Zod schemas at every pipeline boundary
- **Testing**: Vitest (59 test files)

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env  # Then fill in ANTHROPIC_API_KEY and DATABASE_URL

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the Command Center.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (auto-compiles design spec) |
| `npm run build` | Production build |
| `npm test` | Run test suite |
| `npm run test:coverage` | Test coverage report |
| `npm run type-check` | TypeScript validation |
| `npm run ci` | Full CI pipeline (lint + typecheck + test + build) |
| `npm run mcp:start` | Start local MCP sidecar servers |

## Architecture

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation, coding conventions, and pipeline phase descriptions.
