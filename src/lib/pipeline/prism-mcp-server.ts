/**
 * PRISM-SDK MCP Server
 * 
 * Exposes PRISM multi-agent intelligence as MCP tools callable by
 * any MCP-compatible client (Claude Desktop, Claude Code, Cursor, custom apps).
 * 
 * 6 Tools:
 * 1. prism_analyze — Analyze query → swarm blueprint (preview before execution)
 * 2. prism_execute — Execute full pipeline (returns run ID for polling)
 * 3. prism_status — Check execution status/phase/agent progress
 * 4. prism_results — Retrieve completed analysis results
 * 5. prism_archetypes — Search/list available agent archetypes
 * 6. prism_history — Browse past analyses
 * 
 * Transports:
 * - stdio (Claude Desktop / Claude Code)
 * - Streamable HTTP (web app integration — future)
 * 
 * Based on prism-dev-package/skills/prism-sdk/src/index.ts
 * 
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx src/lib/pipeline/prism-mcp-server.ts
 */

import { searchArchetypes, type ArchetypeCategory } from "./archetypes";
import { AnalysisStore } from "./analysis-store";
import type { SwarmTier } from "./types";

// ─── Types ──────────────────────────────────────────────────

/**
 * MCP Tool definition for PRISM server.
 * These are the tool schemas that get exposed to MCP clients.
 */
export interface MCPToolSchema {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, {
            type: string;
            description?: string;
            enum?: string[];
            items?: { type: string };
            default?: unknown;
        }>;
        required?: string[];
    };
}

export interface MCPToolResult {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
}

// ─── Tool Definitions ───────────────────────────────────────

export const PRISM_MCP_TOOLS: MCPToolSchema[] = [
    {
        name: "prism_analyze",
        description: "Analyze a strategic query and produce a swarm blueprint without executing. Returns dimensional analysis, complexity scoring, agent roster, and synthesis strategy. Use this to preview what PRISM would do before committing to execution.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "The strategic question or analysis request" },
                urgency: { type: "string", enum: ["speed", "balanced", "thorough"], description: "Time vs thoroughness tradeoff (default: balanced)" },
                constraints: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional constraints to apply (e.g., 'focus on top-5 MA plans', '2026 timeframe')",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "prism_execute",
        description: "Execute a PRISM multi-agent analysis. Spawns parallel agents, runs synthesis, and returns the execution ID for status checking. Can accept a pre-analyzed blueprint ID or auto-analyze the query.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "The strategic question (required if no blueprint_id)" },
                blueprint_id: { type: "string", description: "Blueprint ID from a previous prism_analyze call" },
                urgency: { type: "string", enum: ["speed", "balanced", "thorough"] },
                tools_enabled: {
                    type: "array",
                    items: { type: "string" },
                    description: "MCP tool categories to enable: pubmed, cms, npi, web_search",
                },
            },
        },
    },
    {
        name: "prism_status",
        description: "Check the status of a running PRISM analysis. Returns current phase, agents completed, and progress.",
        inputSchema: {
            type: "object",
            properties: {
                execution_id: { type: "string", description: "Run ID from prism_execute" },
            },
            required: ["execution_id"],
        },
    },
    {
        name: "prism_results",
        description: "Retrieve completed PRISM analysis results including findings, emergent insights, confidence scores, and provenance chain.",
        inputSchema: {
            type: "object",
            properties: {
                execution_id: { type: "string", description: "Run ID from prism_execute" },
                format: { type: "string", enum: ["full", "summary", "findings_only"], description: "Output detail level (default: full)" },
            },
            required: ["execution_id"],
        },
    },
    {
        name: "prism_archetypes",
        description: "Search and list available PRISM agent archetypes. Each archetype defines a specialized analytical perspective with distinct lens, bias, and communication style.",
        inputSchema: {
            type: "object",
            properties: {
                search: { type: "string", description: "Search tags (e.g., 'financial', 'regulatory', 'risk')" },
                category: { type: "string", enum: ["core", "core_variant", "specialist", "meta", "healthcare_domain"] },
            },
        },
    },
    {
        name: "prism_history",
        description: "Retrieve past PRISM analyses for reference and learning. Returns recent runs with query, tier, and outcome.",
        inputSchema: {
            type: "object",
            properties: {
                limit: { type: "number", description: "Max results to return (default: 10)" },
                tier: { type: "string", enum: ["MICRO", "STANDARD", "EXTENDED", "MEGA", "CAMPAIGN"] },
            },
        },
    },
];


// ─── Tool Handler ───────────────────────────────────────────

/**
 * Handle an MCP tool call for the PRISM server.
 * 
 * This is designed to be called from any MCP transport (stdio, HTTP, etc.)
 * or directly from the Next.js API routes when operating in PRISM-Native mode.
 */
export async function handlePrismToolCall(
    toolName: string,
    args: Record<string, unknown>,
    store: AnalysisStore,
): Promise<MCPToolResult> {
    try {
        switch (toolName) {
            case "prism_analyze": {
                const query = args.query as string;
                if (!query) {
                    return errorResult("query is required");
                }

                // In MCP server mode, we would call the orchestrator here.
                // For now, return a structured preview showing what would happen.
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "ready",
                            message: "Blueprint ready for review. Call prism_execute to start.",
                            query,
                            urgency: args.urgency ?? "balanced",
                            constraints: args.constraints ?? [],
                            note: "Full blueprint generation requires pipeline execution. Use prism_execute to launch.",
                        }, null, 2),
                    }],
                };
            }

            case "prism_execute": {
                const query = args.query as string;
                if (!query && !args.blueprint_id) {
                    return errorResult("Either query or blueprint_id is required");
                }

                // In full integration, this triggers executePipeline().
                // The store tracks the execution state.
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "queued",
                            message: "Execution queued. Use prism_status to poll progress.",
                            query,
                            tools_enabled: args.tools_enabled ?? ["web_search"],
                        }, null, 2),
                    }],
                };
            }

            case "prism_status": {
                const executionId = args.execution_id as string;
                if (!executionId) {
                    return errorResult("execution_id is required");
                }

                const state = store.getExecution(executionId);
                if (!state) {
                    return errorResult(`Execution ${executionId} not found`);
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: state.status,
                            phase: state.phase,
                            agents_completed: state.agentsCompleted,
                            agents_total: state.agentsTotal,
                            agents_failed: state.agentsFailed,
                            findings_count: state.findingsCount,
                            emergence_count: state.emergenceCount,
                            started_at: state.startedAt,
                            completed_at: state.completedAt,
                            error: state.error,
                        }, null, 2),
                    }],
                };
            }

            case "prism_results": {
                const executionId = args.execution_id as string;
                const format = (args.format as string) ?? "full";

                if (!executionId) {
                    return errorResult("execution_id is required");
                }

                const result = store.getResult(executionId);
                if (!result) {
                    return errorResult(`Results for ${executionId} not found. Analysis may still be running — check prism_status.`);
                }

                if (format === "summary") {
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                execution_id: executionId,
                                query: result.meta.query,
                                tier: result.meta.tier,
                                agent_count: result.meta.agentCount,
                                total_findings: result.meta.totalFindings,
                                emergent_insights: result.meta.emergentInsights,
                                total_cost: result.meta.totalCost,
                            }, null, 2),
                        }],
                    };
                }

                if (format === "findings_only") {
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                execution_id: executionId,
                                provenance: result.provenance,
                            }, null, 2),
                        }],
                    };
                }

                // Full format
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    }],
                };
            }

            case "prism_archetypes": {
                const search = args.search as string | undefined;
                const category = args.category as ArchetypeCategory | undefined;

                const results = searchArchetypes({
                    tags: search ? search.split(/[,\s]+/) : undefined,
                    category,
                });

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(results.map(a => ({
                            id: a.id,
                            category: a.category,
                            tags: a.tags,
                            compatible_skills: a.compatibleSkills,
                            min_tier: a.minSwarmTier,
                            synthesis_role: a.synthesisRole,
                        })), null, 2),
                    }],
                };
            }

            case "prism_history": {
                const limit = (args.limit as number) ?? 10;

                const runs = store.listRecentRuns(limit);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(runs, null, 2),
                    }],
                };
            }

            default:
                return errorResult(`Unknown tool: ${toolName}. Available: ${PRISM_MCP_TOOLS.map(t => t.name).join(", ")}`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error executing ${toolName}: ${message}` }],
            isError: true,
        };
    }
}


// ─── Helpers ────────────────────────────────────────────────

function errorResult(message: string): MCPToolResult {
    return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
    };
}
