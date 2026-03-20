// src/lib/signals/emitter.ts
/**
 * SignalEmitter — Signal & Alert Creation
 *
 * Persists correlation candidates as Signal records and optionally
 * creates Alert records for high/critical severity signals.
 * Deduplicates by checking for existing signals with the same
 * pattern + overlapping entities within the recent window.
 */

import { prisma } from "@/lib/prisma";
import type { CorrelationCandidate } from "./correlator";

export interface EmitResult {
  signalsCreated: number;
  alertsCreated: number;
  duplicatesSkipped: number;
}

export class SignalEmitter {
  /**
   * Emit signals and alerts for correlation candidates.
   * Deduplicates by checking for existing signals with the same pattern + entity
   * within a recent window (avoids duplicate alerts for the same event).
   */
  async emit(candidates: CorrelationCandidate[]): Promise<EmitResult> {
    let signalsCreated = 0;
    let alertsCreated = 0;
    let duplicatesSkipped = 0;

    for (const candidate of candidates) {
      // Check for existing recent signal with same pattern + overlapping entities
      const recentDuplicate = await prisma.signal.findFirst({
        where: {
          patternId: candidate.pattern.id,
          detectedAt: {
            gte: new Date(
              Date.now() - candidate.pattern.windowHours * 60 * 60 * 1000,
            ),
          },
          ...(candidate.entityRefs.length > 0
            ? { entityRefs: { hasSome: candidate.entityRefs } }
            : {}),
        },
      });

      if (recentDuplicate) {
        duplicatesSkipped++;
        continue;
      }

      // Create Signal
      const signal = await prisma.signal.create({
        data: {
          signalType: candidate.pattern.signalType,
          title: `${candidate.pattern.name}: ${candidate.entityRefs.slice(0, 3).join(", ") || "Multiple sources"}`,
          description: candidate.pattern.description,
          sources: candidate.matchedSources.map((s) => `${s.type}:${s.id}`),
          entityRefs: candidate.entityRefs,
          confidence: candidate.confidence,
          severity: candidate.pattern.severity,
          patternId: candidate.pattern.id,
          metadata: {
            sourceCount: candidate.matchedSources.length,
            maxTimeDeltaHours: candidate.maxTimeDeltaHours,
            sourceTypes: [
              ...new Set(candidate.matchedSources.map((s) => s.type)),
            ],
          },
        },
      });
      signalsCreated++;

      // Create Alert for high/critical severity signals
      if (
        candidate.pattern.severity === "high" ||
        candidate.pattern.severity === "critical"
      ) {
        await prisma.alert.create({
          data: {
            signalId: signal.id,
            alertType: "signal",
            title: signal.title,
            message:
              `${candidate.pattern.description}\n\n` +
              `Confidence: ${(candidate.confidence * 100).toFixed(1)}%\n` +
              `Sources: ${candidate.matchedSources.length}\n` +
              `Entities: ${candidate.entityRefs.join(", ")}`,
            severity: candidate.pattern.severity,
          },
        });
        alertsCreated++;
      }
    }

    return { signalsCreated, alertsCreated, duplicatesSkipped };
  }
}
