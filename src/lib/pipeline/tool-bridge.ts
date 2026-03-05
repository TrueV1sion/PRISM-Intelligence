/**
 * PRISM Tool Bridge
 * 
 * Converts internal ToolDefinition objects from mcp-tools.ts into
 * Vercel AI SDK tool definitions that can be passed to `generateText()`.
 * 
 * This is the critical link between the 19+ research tools (PubMed, CMS, EDGAR, etc.)
 * and the AI agent execution loop. Each bridged tool:
 * - Uses the existing Zod schema for parameter validation
 * - Routes execution through MCPToolProxy (caching + rate limiting)
 * - Emits pipeline events for real-time UI feedback
 * - Returns formatted results suitable for LLM consumption
 */

import { MCPToolProxy, TOOL_REGISTRY, type ToolResult } from "./mcp-tools";
import type { PipelineEvent } from "./types";
import type { z } from "zod";

// ─── Types ──────────────────────────────────────────────────

/**
 * AI SDK v6 Tool shape — we construct this directly rather than using the
 * `tool()` helper to avoid generic type inference issues with our
 * dynamically-typed ToolDefinition registry.
 */
interface AISDKTool {
    description: string;
    inputSchema: z.ZodType;
    execute: (params: Record<string, unknown>) => Promise<string>;
}

// ─── Singleton Proxy ────────────────────────────────────────

let _proxy: MCPToolProxy | null = null;

export function getToolProxy(): MCPToolProxy {
    if (!_proxy) {
        _proxy = new MCPToolProxy();
    }
    return _proxy;
}

// ─── Bridge Function ────────────────────────────────────────

/**
 * Build AI SDK tools for an agent based on their compatible skills.
 * 
 * Returns a record of tool name → AI SDK tool definition, ready to pass
 * to `generateText({ tools: ... })`.
 * 
 * Each tool call is routed through MCPToolProxy for caching and rate limiting,
 * and emits progress events so the UI terminal shows real-time tool activity.
 */
export function buildToolsForAgent(
    agentName: string,
    compatibleSkills: string[],
    onEvent?: (event: PipelineEvent) => void,
    agentId?: string,
): Record<string, AISDKTool> {
    const proxy = getToolProxy();
    const agentTools = proxy.getToolsForAgent(compatibleSkills);

    const bridged: Record<string, AISDKTool> = {};

    for (const toolDef of agentTools) {
        bridged[toolDef.name] = {
            description: toolDef.description,
            inputSchema: toolDef.inputSchema,
            execute: async (params: Record<string, unknown>): Promise<string> => {
                // Emit progress event — shows in the UI terminal
                onEvent?.({
                    type: "agent:progress",
                    data: {
                        agentId: agentId ?? agentName,
                        progress: -1, // indeterminate — tool call in progress
                        message: `[${toolDef.name}] Querying ${toolDef.category} data...`,
                    },
                });

                const result = await proxy.executeTool(
                    toolDef.name,
                    params,
                    agentName,
                );

                // Emit result event
                const statusMsg = result.success
                    ? `[${toolDef.name}] ✓ ${summarizeResult(result)}`
                    : `[${toolDef.name}] ✗ ${result.error ?? "Failed"}`;

                onEvent?.({
                    type: "agent:progress",
                    data: {
                        agentId: agentId ?? agentName,
                        progress: -1,
                        message: statusMsg,
                    },
                });

                // Return formatted string for the LLM context
                return formatToolResultForLLM(toolDef.name, result);
            },
        };
    }

    return bridged;
}

/**
 * Get all available tools (for agents without skill-based routing).
 * Falls back to the full registry.
 */
export function buildAllTools(
    agentName: string,
    onEvent?: (event: PipelineEvent) => void,
    agentId?: string,
): Record<string, AISDKTool> {
    const proxy = getToolProxy();
    const bridged: Record<string, AISDKTool> = {};

    for (const toolDef of TOOL_REGISTRY) {
        bridged[toolDef.name] = {
            description: toolDef.description,
            inputSchema: toolDef.inputSchema,
            execute: async (params: Record<string, unknown>): Promise<string> => {
                onEvent?.({
                    type: "agent:progress",
                    data: {
                        agentId: agentId ?? agentName,
                        progress: -1,
                        message: `[${toolDef.name}] Querying...`,
                    },
                });

                const result = await proxy.executeTool(
                    toolDef.name,
                    params,
                    agentName,
                );

                onEvent?.({
                    type: "agent:progress",
                    data: {
                        agentId: agentId ?? agentName,
                        progress: -1,
                        message: result.success
                            ? `[${toolDef.name}] ✓ ${summarizeResult(result)}`
                            : `[${toolDef.name}] ✗ ${result.error ?? "Failed"}`,
                    },
                });

                return formatToolResultForLLM(toolDef.name, result);
            },
        };
    }

    return bridged;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Format a ToolResult into a string that the LLM can reason about.
 * Includes source attribution and data summary.
 */
function formatToolResultForLLM(toolName: string, result: ToolResult): string {
    if (!result.success) {
        return `[TOOL ERROR: ${toolName}] ${result.error ?? "Unknown error"}. Source: ${result.source}. You may try a different query or tool.`;
    }

    const data = result.data;
    const dataStr = typeof data === "string"
        ? data
        : JSON.stringify(data, null, 2).slice(0, 8000); // Cap at 8K chars to avoid context overflow

    return `[TOOL RESULT: ${toolName}]
Source: ${result.source}
Timestamp: ${result.timestamp}
Cached: ${result.cached}
Query: ${result.query}

Data:
${dataStr}`;
}

/**
 * One-line summary of a tool result for UI display.
 */
function summarizeResult(result: ToolResult): string {
    if (!result.success) return result.error ?? "Failed";

    const data = result.data as Record<string, unknown> | null;
    if (!data) return "No data";

    // Try to extract count fields
    const countKeys = ["totalCount", "resultCount", "recordCount", "articleCount", "count", "featureCount"];
    for (const key of countKeys) {
        if (key in data && typeof data[key] === "number") {
            return `${data[key]} result(s) from ${result.source}`;
        }
    }

    // Check for arrays
    const arrayKeys = ["papers", "articles", "records", "results", "features", "studies"];
    for (const key of arrayKeys) {
        if (key in data && Array.isArray(data[key])) {
            return `${(data[key] as unknown[]).length} ${key} from ${result.source}`;
        }
    }

    return `Data retrieved from ${result.source}`;
}

/**
 * Get tool proxy stats (for pipeline completion metadata).
 */
export function getToolStats(): {
    totalCalls: number;
    cachedCalls: number;
    cacheHitRate: number;
    byTool: Record<string, number>;
    byAgent: Record<string, number>;
} {
    return getToolProxy().getStats();
}
