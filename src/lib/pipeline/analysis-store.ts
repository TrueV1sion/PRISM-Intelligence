/**
 * PRISM Analysis Store
 * 
 * Persistent storage for analysis lifecycle:
 * - Blueprints (THINK phase output)
 * - Execution state (live status tracking)
 * - Results (completed analysis manifests)
 * 
 * Uses Prisma as the backing store, with in-memory caching for
 * active executions and recent blueprints.
 * 
 * Based on prism-dev-package/skills/prism-sdk/src/storage/store.ts
 */

import type { Blueprint, IntelligenceManifest, SwarmTier } from "./types";

// ─── Decomposition Patterns ─────────────────────────────────

export type DecompositionPattern =
    | "dimensional_split"   // Split by orthogonal dimensions (default)
    | "dialectical_trio"    // Thesis → Antithesis → Synthesis
    | "expertise_fan"       // Multiple domain specialists
    | "zoom_levels"         // Same topic at different abstraction levels
    | "pipeline";           // Sequential refinement chain

/**
 * Map decomposition patterns to recommended archetype compositions.
 */
export const DECOMPOSITION_ARCHETYPE_MAP: Record<DecompositionPattern, {
    description: string;
    recommendedArchetypes: string[];
    minAgents: number;
    maxAgents: number;
    synthesisApproach: string;
}> = {
    dimensional_split: {
        description: "Split topic into orthogonal dimensions, each covered by the best-matched archetype",
        recommendedArchetypes: ["RESEARCHER-WEB", "ANALYST-FINANCIAL", "ANALYST-STRATEGIC", "ANALYST-TECHNICAL"],
        minAgents: 2,
        maxAgents: 15,
        synthesisApproach: "Cross-dimension emergence detection",
    },
    dialectical_trio: {
        description: "Three agents: thesis (advocate), antithesis (devil's advocate), synthesis (arbiter)",
        recommendedArchetypes: ["ANALYST-STRATEGIC", "DEVILS_ADVOCATE", "ARBITER"],
        minAgents: 3,
        maxAgents: 3,
        synthesisApproach: "Dialectical integration — find position that survives adversarial review",
    },
    expertise_fan: {
        description: "Multiple domain specialists, each deep in their field",
        recommendedArchetypes: ["RESEARCHER-DOMAIN", "ANALYST-FINANCIAL", "ANALYST-QUALITY", "REGULATORY-RADAR"],
        minAgents: 3,
        maxAgents: 8,
        synthesisApproach: "Expert panel integration — cross-pollinate domain insights",
    },
    zoom_levels: {
        description: "Same topic analyzed at macro, meso, and micro levels",
        recommendedArchetypes: ["MACRO-CONTEXT", "ANALYST-STRATEGIC", "ANALYST-TECHNICAL"],
        minAgents: 2,
        maxAgents: 4,
        synthesisApproach: "Zoom synthesis — connect macro trends to micro implications",
    },
    pipeline: {
        description: "Sequential refinement: research → analysis → creation → critique → polish",
        recommendedArchetypes: ["RESEARCHER-WEB", "ANALYST-STRATEGIC", "CREATOR-WRITER", "CRITIC-FACTUAL"],
        minAgents: 3,
        maxAgents: 5,
        synthesisApproach: "Pipeline — each stage refines the previous stage's output",
    },
};


// ─── Execution State ────────────────────────────────────────

export type ExecutionPhase = "THINK" | "CONSTRUCT" | "DEPLOY" | "SYNTHESIZE" | "CRITIC" | "DELIVER" | "COMPLETE" | "FAILED";
export type ExecutionStatus = "pending" | "spawning" | "running" | "synthesizing" | "complete" | "failed";

export interface ExecutionState {
    executionId: string;
    runId: string;
    status: ExecutionStatus;
    phase: ExecutionPhase;
    blueprint: Blueprint | null;
    agentsTotal: number;
    agentsCompleted: number;
    agentsFailed: number;
    findingsCount: number;
    emergenceCount: number;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
    decompositionPattern: DecompositionPattern;
    synthesisStrategy: string;
}


// ─── Analysis Store ─────────────────────────────────────────

export class AnalysisStore {
    private executions: Map<string, ExecutionState> = new Map();
    private blueprintCache: Map<string, { blueprint: Blueprint; createdAt: string }> = new Map();
    private resultCache: Map<string, IntelligenceManifest> = new Map();

    // ─── Execution State Management ─────────────────────────

    /**
     * Create a new execution tracker.
     */
    createExecution(runId: string, decompositionPattern: DecompositionPattern = "dimensional_split"): ExecutionState {
        const state: ExecutionState = {
            executionId: `exec_${Date.now().toString(36)}`,
            runId,
            status: "pending",
            phase: "THINK",
            blueprint: null,
            agentsTotal: 0,
            agentsCompleted: 0,
            agentsFailed: 0,
            findingsCount: 0,
            emergenceCount: 0,
            startedAt: new Date().toISOString(),
            completedAt: null,
            error: null,
            decompositionPattern,
            synthesisStrategy: "direct",
        };

        this.executions.set(runId, state);
        return state;
    }

    /**
     * Update execution state (phase transition, progress, etc.)
     */
    updateExecution(runId: string, updates: Partial<ExecutionState>): ExecutionState | null {
        const state = this.executions.get(runId);
        if (!state) return null;

        const updated = { ...state, ...updates };
        this.executions.set(runId, updated);
        return updated;
    }

    /**
     * Get current execution state for status polling.
     */
    getExecution(runId: string): ExecutionState | null {
        return this.executions.get(runId) ?? null;
    }

    /**
     * Mark execution complete.
     */
    completeExecution(runId: string, manifest: IntelligenceManifest): void {
        this.updateExecution(runId, {
            status: "complete",
            phase: "COMPLETE",
            completedAt: new Date().toISOString(),
            findingsCount: manifest.meta.totalFindings,
            emergenceCount: manifest.meta.emergentInsights,
        });

        // Cache the result
        this.resultCache.set(runId, manifest);
    }

    /**
     * Mark execution failed.
     */
    failExecution(runId: string, error: string): void {
        this.updateExecution(runId, {
            status: "failed",
            phase: "FAILED",
            completedAt: new Date().toISOString(),
            error,
        });
    }

    // ─── Blueprint Storage ──────────────────────────────────

    /**
     * Save a blueprint (from THINK phase).
     */
    saveBlueprint(runId: string, blueprint: Blueprint): void {
        this.blueprintCache.set(runId, {
            blueprint,
            createdAt: new Date().toISOString(),
        });

        // Also update the execution state
        this.updateExecution(runId, {
            blueprint,
            agentsTotal: blueprint.agents.length,
            phase: "CONSTRUCT",
            status: "spawning",
        });
    }

    /**
     * Get a saved blueprint.
     */
    getBlueprint(runId: string): Blueprint | null {
        return this.blueprintCache.get(runId)?.blueprint ?? null;
    }

    // ─── Result Storage ─────────────────────────────────────

    /**
     * Get a completed analysis result.
     */
    getResult(runId: string): IntelligenceManifest | null {
        return this.resultCache.get(runId) ?? null;
    }

    /**
     * List recent analysis runs.
     */
    listRecentRuns(limit: number = 10): Array<{
        runId: string;
        query: string;
        tier: SwarmTier;
        status: ExecutionStatus;
        startedAt: string;
        completedAt: string | null;
    }> {
        return Array.from(this.executions.values())
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            .slice(0, limit)
            .map(e => ({
                runId: e.runId,
                query: e.blueprint?.query ?? "",
                tier: e.blueprint?.tier ?? "MICRO",
                status: e.status,
                startedAt: e.startedAt,
                completedAt: e.completedAt,
            }));
    }

    /**
     * Get store statistics.
     */
    getStats(): {
        totalRuns: number;
        completedRuns: number;
        failedRuns: number;
        activeRuns: number;
        cachedBlueprints: number;
        cachedResults: number;
    } {
        const executions = Array.from(this.executions.values());
        return {
            totalRuns: executions.length,
            completedRuns: executions.filter(e => e.status === "complete").length,
            failedRuns: executions.filter(e => e.status === "failed").length,
            activeRuns: executions.filter(e => !["complete", "failed"].includes(e.status)).length,
            cachedBlueprints: this.blueprintCache.size,
            cachedResults: this.resultCache.size,
        };
    }
}
