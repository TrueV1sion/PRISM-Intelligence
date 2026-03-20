/**
 * Pipeline Checkpoint System
 *
 * Provides resume capability for pipelines that experience connection drops
 * or other transient failures during streaming execution.
 *
 * Note: Checkpoint progress is stored in-memory for now.
 * A manifest JSON column can be added to the Run model for persistence.
 */

import { prisma } from "@/lib/prisma";

export type CheckpointPhase =
  | "INITIALIZE"
  | "THINK"
  | "CONSTRUCT"
  | "DEPLOY"
  | "TRIAGE"
  | "SYNTHESIZE"
  | "QUALITY_ASSURANCE"
  | "VERIFY"
  | "PRESENT"
  | "COMPLETE"
  | "FAILED";

export interface PipelineCheckpoint {
  runId: string;
  phase: CheckpointPhase;
  resumable: boolean;
  progress: {
    blueprint?: unknown;
    agentResults?: unknown;
    synthesis?: unknown;
    presentation?: unknown;
  };
  timestamp: string;
}

// In-memory checkpoint store (until manifest column is added to Run model)
const checkpointStore = new Map<string, Record<string, unknown>>();

/**
 * Save a checkpoint for a pipeline run.
 * Updates the run status and stores progress in memory.
 */
export async function saveCheckpoint(checkpoint: PipelineCheckpoint): Promise<void> {
  const { runId, phase, progress } = checkpoint;

  // Store progress in memory
  checkpointStore.set(runId, progress as Record<string, unknown>);

  await prisma.run.update({
    where: { id: runId },
    data: {
      status: phase,
      updatedAt: new Date(),
    },
  });
}

/**
 * Load the last checkpoint for a run to resume execution.
 */
export async function loadCheckpoint(runId: string): Promise<PipelineCheckpoint | null> {
  const run = await prisma.run.findUnique({ where: { id: runId } });

  if (!run) return null;

  const resumablePhases: CheckpointPhase[] = [
    "TRIAGE",
    "SYNTHESIZE",
    "QUALITY_ASSURANCE",
    "VERIFY",
    "PRESENT",
  ];

  const stored = checkpointStore.get(runId) ?? {};

  return {
    runId: run.id,
    phase: run.status as CheckpointPhase,
    resumable: resumablePhases.includes(run.status as CheckpointPhase),
    progress: stored as {
      blueprint?: unknown;
      agentResults?: unknown;
      synthesis?: unknown;
      presentation?: unknown;
    },
    timestamp: run.updatedAt.toISOString(),
  };
}

/**
 * Check if a run can be resumed from its current checkpoint.
 */
export async function canResume(runId: string): Promise<boolean> {
  const checkpoint = await loadCheckpoint(runId);
  return checkpoint?.resumable ?? false;
}

/**
 * Clear checkpoint data after successful completion.
 */
export async function clearCheckpoint(runId: string): Promise<void> {
  checkpointStore.delete(runId);
}
