/**
 * PRISM Shared UI Types
 *
 * Re-exports pipeline types for the UI layer plus app phase definitions
 * and UI-specific component props types.
 */

// Re-export from pipeline types
export type {
  SwarmTier,
  ConfidenceLevel,
  AutonomyMode,
  AgentFinding,
  Blueprint,
  SynthesisLayer,
  PipelineEvent,
} from "./pipeline/types";

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

// ─── UI Component Types ─────────────────────────────────────
// These mirror the stream state shapes from useResearchStream.

export type AgentStatus = "idle" | "active" | "complete" | "failed";

export interface AgentRunState {
  id: string;
  name: string;
  archetype: string;
  dimension: string;
  mandate: string;
  tools: string[];
  color: string;
  status: AgentStatus;
  progress: number;
  findings: { confidence: string }[];
}

export type FindingAction = "keep" | "dismiss" | "boost" | "flag";

export interface Finding {
  id: string;
  agentName: string;
  statement: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string;
  source: string;
  implication: string;
  action: FindingAction;
}

export interface LogEntry {
  timestamp: string;
  agent: string;
  message: string;
  type: "info" | "search" | "finding" | "error";
}

export interface BlueprintData {
  query: string;
  tier: string;
  estimatedTime: string;
  agentCount: number;
  complexity: { breadth: number; depth: number; interconnection: number; total: number; reasoning: string };
  dimensions: { name: string; description: string }[];
  agents: { id: string; name: string; archetype: string; dimension: string; mandate: string; tools: string[]; color: string }[];
}
