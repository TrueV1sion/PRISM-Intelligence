/**
 * PRISM Shared UI Types
 * 
 * Canonical type definitions for UI layer.
 * Re-exports from mock-data.ts for backwards compatibility,
 * plus adds shared phase and stream-related types.
 */

// Re-export domain types from mock-data (keeps existing imports working)
export type {
    AgentStatus,
    SwarmTier,
    ConfidenceLevel,
    FindingAction,
    Autonomy,
    Dimension,
    AgentConfig,
    AgentRunState,
    LogEntry,
    Finding,
    BlueprintData,
    SynthesisLayer,
} from "./mock-data";

// ─── App Phases ─────────────────────────────────────────────

export type Phase =
    | "input"
    | "blueprint"
    | "executing"
    | "triage"
    | "synthesis"
    | "complete"
    | "library"
    | "viewer"
    | "settings";
