import { prisma } from "@/lib/prisma";
import { think } from "./think";
import { construct } from "./construct";
import { deploy } from "./deploy";
import type { AgentDeployResult } from "./deploy";
import { synthesize } from "./synthesize";
import { verify } from "./verify";
import { presentClean } from "./present-pipeline";
import {
  runQualityAssurance,
  getQualityGateSystem,
} from "./quality-assurance";
import { withRetry } from "./retry";
import { CostTracker } from "./cost";
import { waitForBlueprintApproval, waitForTriageApproval, cancelApproval } from "./approval";
import { getOrCreateBus, removeBus } from "./memory-bus-manager";
import type { MemoryBus } from "./memory-bus";
import type {
  Blueprint,
  PipelineEvent,
  IntelligenceManifest,
  AgentResult,
  SynthesisResult,
  QualityReport,
  AutonomyMode,
} from "./types";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createLogger } from "@/lib/logger";
import { postProcessLegacyHTML } from "./html-post-process";
import {
  enrichAfterDeploy,
  enrichAfterSynthesize,
  enrichAfterQA,
  finalizeIRMetadata,
} from "./ir-enricher";
import type { QAReportForIR } from "./ir-enricher";
import { validateIRGraph } from "./ir-validator";
import type { IRGraph } from "./ir-types";

export interface PipelineInput {
  query: string;
  runId: string;
  autonomyMode?: AutonomyMode;
  /** When set, THINK phase constrains archetype selection to this set (engine-scoped execution) */
  constrainToArchetypes?: string[];
  signal?: AbortSignal;
  onEvent?: (event: PipelineEvent) => void;
}

function buildQualityReport(
  agentResults: AgentResult[],
  synthesis: SynthesisResult,
): QualityReport {
  const allFindings = agentResults.flatMap((r) => r.findings);
  const totalFindings = allFindings.length;
  const sourcedFindings = allFindings.filter(
    (f) => f.source && f.source.trim().length > 0,
  ).length;

  const confDist = { high: 0, medium: 0, low: 0 };
  const tierDist = { primary: 0, secondary: 0, tertiary: 0 };
  for (const f of allFindings) {
    const conf = (f.confidence ?? "medium").toLowerCase() as keyof typeof confDist;
    if (conf in confDist) confDist[conf]++;
    const tier = (f.sourceTier ?? "secondary").toLowerCase() as keyof typeof tierDist;
    if (tier in tierDist) tierDist[tier]++;
  }

  const qualifiedEmergences = synthesis.emergentInsights.filter((e) => {
    const scores = e.qualityScores;
    return (
      [
        scores.novelty,
        scores.grounding,
        scores.actionability,
        scores.depth,
        scores.surprise,
      ].filter((s) => s >= 4).length >= 3
    );
  }).length;

  const gapCount = agentResults.reduce((sum, r) => sum + r.gaps.length, 0);

  return {
    totalFindings,
    sourcedFindings,
    sourceCoveragePercent:
      totalFindings > 0
        ? Math.round((sourcedFindings / totalFindings) * 100)
        : 0,
    confidenceDistribution: confDist,
    sourceTierDistribution: tierDist,
    emergenceYield: qualifiedEmergences,
    gapCount,
    provenanceComplete: sourcedFindings === totalFindings,
  };
}

export async function executePipeline(
  input: PipelineInput,
): Promise<IntelligenceManifest> {
  const { query, runId, autonomyMode = "supervised", constrainToArchetypes, signal, onEvent } = input;
  const startTime = new Date().toISOString();
  let totalTokens = 0;
  const costTracker = new CostTracker();

  const log = createLogger(runId);

  const emitEvent = (event: PipelineEvent) => {
    onEvent?.(event);
  };

  function checkAbort() {
    if (signal?.aborted) {
      throw new DOMException("Pipeline aborted by client", "AbortError");
    }
  }

  let currentPhase = "THINK";

  try {
    currentPhase = "THINK";
    await updateRunStatus(runId, "THINK");
    emitEvent({ type: "phase_change", phase: "THINK", message: "Decomposing query into analytical dimensions..." });

    const blueprint = await withRetry(
      () => think({ query, constrainToArchetypes, onEvent: emitEvent }),
      { maxRetries: 2, baseDelayMs: 2000, signal, label: "THINK" },
    );

    await persistBlueprint(runId, blueprint);
    emitEvent({ type: "blueprint", blueprint });

    if (autonomyMode === "autonomous") {
      emitEvent({ type: "phase_change", phase: "BLUEPRINT", message: "Autonomous mode — auto-approving blueprint." });
    } else {
      emitEvent({ type: "phase_change", phase: "BLUEPRINT", message: "Awaiting blueprint approval..." });
      await waitForBlueprintApproval(runId);
    }
    checkAbort();

    // Create MemoryBus for cross-phase intelligence sharing
    const memoryBus = getOrCreateBus(runId, query);

    // Initialize IR graph on the MemoryBus
    memoryBus.initIR(runId);

    currentPhase = "CONSTRUCT";
    await updateRunStatus(runId, "CONSTRUCT");
    emitEvent({ type: "phase_change", phase: "CONSTRUCT", message: "Building agent prompts and tool configurations..." });

    const agents = construct({ blueprint });

    for (const agent of agents) {
      await prisma.agent.updateMany({
        where: { runId, name: agent.name },
        data: {
          status: "active",
          archetype: agent.archetype,
          mandate: agent.mandate,
          tools: JSON.stringify(agent.tools),
          color: agent.color,
        },
      });
    }

    checkAbort();

    currentPhase = "DEPLOY";
    await updateRunStatus(runId, "DEPLOY");
    emitEvent({ type: "phase_change", phase: "DEPLOY", message: `Deploying ${agents.length} agents in parallel...` });

    const deployResult = await withRetry(
      () => deploy({ agents, blueprint, emitEvent, signal, memoryBus }),
      { maxRetries: 2, baseDelayMs: 2000, signal, label: "DEPLOY" },
    );

    const { agentResults, criticResult, capturedCalls } = deployResult;

    for (const result of agentResults) {
      totalTokens += result.tokensUsed;
    }
    if (criticResult) {
      totalTokens += criticResult.tokensUsed;
    }

    const dbAgents = await prisma.agent.findMany({ where: { runId } });
    const agentIdMap = new Map(dbAgents.map((a) => [a.name, a.id]));

    const validSourceTiers = new Set(["PRIMARY", "SECONDARY", "TERTIARY"]);
    const validConfidence = new Set(["HIGH", "MEDIUM", "LOW"]);
    const findingsData = agentResults.flatMap((agentResult) => {
      const agentId = agentIdMap.get(agentResult.agentName);
      if (!agentId) return [];
      return agentResult.findings.map((finding) => ({
        statement: finding.statement,
        evidence: finding.evidence,
        confidence: validConfidence.has(finding.confidence) ? finding.confidence : "MEDIUM",
        evidenceType: finding.evidenceType,
        source: finding.source,
        sourceUrl: finding.sourceUrl,
        sourceTier: validSourceTiers.has(finding.sourceTier) ? finding.sourceTier : "SECONDARY",
        implication: finding.implication,
        action: "keep",
        tags: JSON.stringify(finding.tags),
        metrics: JSON.stringify(finding.metrics || []),
        agentId,
        runId,
      }));
    });

    await prisma.agent.updateMany({ where: { runId }, data: { status: "complete", progress: 100 } });
    await prisma.finding.createMany({ data: findingsData });

    // Persist MemoryBus snapshot after DEPLOY phase
    await persistSnapshot(runId, memoryBus, "DEPLOY", emitEvent);

    // IR enrichment: DEPLOY phase
    const irGraph = memoryBus.getIRGraph();
    if (irGraph) {
      enrichAfterDeploy(irGraph, agentResults, memoryBus.getState(), blueprint.tier);
      emitEvent({
        type: "ir_enrichment",
        phase: "DEPLOY",
        entity: "findings",
        count: irGraph.findings.length,
      });
    }

    if (agentResults.length < 2) {
      throw new Error(
        `Only ${agentResults.length} agents succeeded -- minimum 2 required for synthesis.`,
      );
    }

    currentPhase = "TRIAGE";
    if (autonomyMode !== "autonomous") {
      await updateRunStatus(runId, "TRIAGE");
      emitEvent({ type: "phase_change", phase: "TRIAGE", message: "Awaiting human-in-the-loop triage..." });
      await waitForTriageApproval(runId);
    }

    checkAbort();

    currentPhase = "SYNTHESIZE";
    await updateRunStatus(runId, "SYNTHESIZE");
    emitEvent({ type: "phase_change", phase: "SYNTHESIZE", message: "Running emergence detection and synthesis..." });

    const synthesis = await withRetry(
      () => synthesize({ agentResults, blueprint, criticResult, emitEvent, memoryBus }),
      { maxRetries: 2, baseDelayMs: 2000, signal, label: "SYNTHESIZE" },
    );

    await prisma.synthesis.createMany({
      data: synthesis.layers.map((layer, i) => ({
        layerName: layer.name,
        description: layer.description,
        insights: JSON.stringify(layer.insights),
        order: i,
        runId,
      })),
    });

    // Persist MemoryBus snapshot after SYNTHESIZE phase
    await persistSnapshot(runId, memoryBus, "SYNTHESIZE", emitEvent);

    // IR enrichment: SYNTHESIZE phase
    if (irGraph) {
      enrichAfterSynthesize(irGraph, synthesis, agentResults);
      emitEvent({
        type: "ir_enrichment",
        phase: "SYNTHESIZE",
        entity: "emergences",
        count: irGraph.emergences.length,
      });
    }

    const qualityReport = buildQualityReport(agentResults, synthesis);

    currentPhase = "QUALITY_ASSURANCE";
    emitEvent({ type: "phase_change", phase: "QUALITY_ASSURANCE", message: "Running provenance tracking and quality scoring..." });

    const deployResultsForQA: AgentDeployResult[] = agentResults.map((ar) => ({
      agentName: ar.agentName,
      dimension: ar.dimension,
      result: ar,
      warnings: [],
    }));

    const partialManifest: IntelligenceManifest = {
      blueprint,
      agentResults,
      synthesis,
      presentation: { html: "", title: "", subtitle: "", slideCount: 0 },
      qualityReport,
      metadata: {
        runId,
        startTime,
        endTime: new Date().toISOString(),
        totalTokens,
        totalCost: costTracker.totalCost,
      },
    };

    const gateSystem = getQualityGateSystem();
    const qaReport = await runQualityAssurance(
      partialManifest,
      deployResultsForQA,
      blueprint,
      gateSystem,
      undefined,
      emitEvent,
      memoryBus,
    );

    qualityReport.grade = qaReport.score.grade;
    qualityReport.overallScore = qaReport.score.overallScore;
    qualityReport.provenanceCompleteness = qaReport.provenance.chainCompleteness;
    qualityReport.warningCount = qaReport.warnings.length;
    qualityReport.criticalWarnings = qaReport.warnings
      .filter((w) => w.severity === "critical")
      .map((w) => w.message);
    qualityReport.dimensions = qaReport.score.dimensions.map((d) => ({
      name: d.name,
      score: d.score,
      details: d.details,
    }));

    emitEvent({ type: "quality_report", report: qualityReport });

    // IR enrichment: QA phase
    if (irGraph) {
      const qaForIR: QAReportForIR = {
        score: {
          overallScore: qaReport.score.overallScore,
          grade: qaReport.score.grade,
          dimensions: qaReport.score.dimensions,
        },
        provenance: qaReport.provenance,
        warnings: qaReport.warnings,
        passesAllGates: qaReport.passesAllGates,
      };
      enrichAfterQA(irGraph, qaForIR);
      emitEvent({
        type: "ir_enrichment",
        phase: "QUALITY_ASSURANCE",
        entity: "quality",
        count: 1,
      });
    }

    if (!qaReport.passesAllGates) {
      log.warn("QA", "QA gates did not all pass, continuing to VERIFY", {
        grade: qaReport.score.grade,
        score: qaReport.score.overallScore,
      });
    }

    // NOTE: No checkAbort() after synthesis — once findings and synthesis are
    // persisted, always finish through PRESENT so a client disconnect doesn't
    // throw away a 20+ minute run.

    currentPhase = "VERIFY";
    await updateRunStatus(runId, "VERIFY");
    emitEvent({ type: "phase_change", phase: "VERIFY", message: "Running verification gate..." });

    await verify({ synthesis, agentResults, autonomyMode, emitEvent, memoryBus });

    currentPhase = "PRESENT";
    await updateRunStatus(runId, "PRESENT");
    emitEvent({ type: "phase_change", phase: "PRESENT", message: "Generating HTML5 presentation..." });

    const presentation = await withRetry(
      () => presentClean({ runId, synthesis, agentResults, blueprint, emitEvent, memoryBus, capturedCalls }),
      { maxRetries: 1, baseDelayMs: 3000, label: "PRESENT" },
    );

    // If the orchestrator already finalized (htmlPath set), skip post-processing.
    // Otherwise (legacy fallback), do post-processing here.
    let htmlPath: string;
    let finalHtml: string;

    if (presentation.htmlPath) {
      // Agentic pipeline already handled: CSS/JS inlining, animation baking,
      // counter baking, truncation recovery, file write, and quality telemetry.
      htmlPath = presentation.htmlPath;
      finalHtml = presentation.html;
    } else {
      // Legacy fallback — apply post-processing
      const decksDir = join(process.cwd(), "public", "decks");
      await mkdir(decksDir, { recursive: true });
      htmlPath = `/decks/${runId}.html`;
      finalHtml = postProcessLegacyHTML(presentation.html);
      await writeFile(join(process.cwd(), "public", "decks", `${runId}.html`), finalHtml, "utf-8");
    }

    const presRecord = await prisma.presentation.create({
      data: {
        title: presentation.title,
        subtitle: presentation.subtitle,
        htmlPath,
        slideCount: presentation.slideCount,
        runId,
      },
    });

    // Persist structured slide data for editor (Phase 4a)
    // This must happen AFTER presentation.create() since persistSlideStructures
    // looks up the presentation by runId.
    if (presentation.slideStructures && presentation.slideStructures.length > 0) {
      try {
        const version = await prisma.presentationVersion.create({
          data: {
            presentationId: presRecord.id,
            versionNumber: 1,
            status: "published",
            label: "AI-generated",
            publishedAt: new Date(),
            slides: {
              create: presentation.slideStructures.map((s: Record<string, unknown>, i: number) => ({
                slideNumber: (s.slideNumber as number) ?? i + 1,
                templateId: (s.templateId as string) ?? null,
                backgroundVariant: (s.backgroundVariant as string) ?? "gradient-dark",
                animationType: (s.animationType as string) ?? "stagger",
                 
                content: (s.content ?? {}) as Record<string, unknown>,
                sourceAgentIds: (s.sourceAgentIds as string[]) ?? [],
                sourceFindingIds: (s.sourceFindingIds as string[]) ?? [],
              })),
            },
          },
        });
        await prisma.presentation.update({
          where: { id: presRecord.id },
          data: { currentVersionId: version.id, publishedVersionId: version.id },
        });
        log.info("COMPLETE", `Persisted ${presentation.slideStructures.length} slide structures as v1`);
      } catch (dbErr) {
        log.warn("COMPLETE", `Failed to persist slide structures: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }

    const endTime = new Date().toISOString();

    const manifest: IntelligenceManifest = {
      blueprint,
      agentResults,
      synthesis,
      presentation,
      qualityReport,
      metadata: {
        runId,
        startTime,
        endTime,
        totalTokens,
        totalCost: costTracker.totalCost,
      },
    };

    // Persist final MemoryBus snapshot
    await persistSnapshot(runId, memoryBus, "COMPLETE", emitEvent);

    // Finalize and persist IR graph
    if (irGraph) {
      finalizeIRMetadata(irGraph);

      // Validate
      const validation = validateIRGraph(irGraph);
      if (!validation.valid) {
        log.warn("IR", "IR validation errors", { errors: validation.errors });
      }
      if (validation.warnings.length > 0) {
        log.warn("IR", "IR validation warnings", { warnings: validation.warnings });
      }

      // Persist to DB
      try {
        await prisma.irGraph.upsert({
          where: { runId },
          create: {
            runId,
            tier: irGraph.metadata.investigationTier,
            graph: JSON.stringify(irGraph),
            findingCount: irGraph.findings.length,
            emergenceCount: irGraph.emergences.length,
            tensionCount: irGraph.tensions.length,
            gapCount: irGraph.gaps.length,
            qualityGrade: irGraph.quality?.grade,
            overallScore: irGraph.quality?.overallScore,
          },
          update: {
            tier: irGraph.metadata.investigationTier,
            graph: JSON.stringify(irGraph),
            findingCount: irGraph.findings.length,
            emergenceCount: irGraph.emergences.length,
            tensionCount: irGraph.tensions.length,
            gapCount: irGraph.gaps.length,
            qualityGrade: irGraph.quality?.grade,
            overallScore: irGraph.quality?.overallScore,
          },
        });
      } catch (err) {
        log.warn("IR", "Failed to persist IR graph", { error: String(err) });
      }

      // Export to file
      try {
        const irDir = join(process.cwd(), "public", "ir");
        await mkdir(irDir, { recursive: true });
        await writeFile(
          join(irDir, `${runId}.json`),
          JSON.stringify(irGraph, null, 2),
          "utf-8",
        );
      } catch (err) {
        log.warn("IR", "Failed to write IR file", { error: String(err) });
      }

      // Emit completion event
      emitEvent({
        type: "ir_complete",
        runId,
        findingCount: irGraph.findings.length,
        emergenceCount: irGraph.emergences.length,
        tensionCount: irGraph.tensions.length,
        gapCount: irGraph.gaps.length,
        qualityGrade: irGraph.quality?.grade,
      });
    }

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
      },
    });

    emitEvent({ type: "complete", manifest });
    return manifest;
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === "AbortError";
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.error(currentPhase, `Pipeline failed: ${errorMessage}`, error instanceof Error ? error : undefined);

    cancelApproval(runId);

    try {
      await prisma.run.update({ where: { id: runId }, data: { status: isAbort ? "CANCELLED" : "FAILED" } });
    } catch (dbErr) {
      log.error(currentPhase, "Failed to update run status", dbErr instanceof Error ? dbErr : undefined);
    }

    if (isAbort) {
      emitEvent({ type: "error", message: "Pipeline cancelled by user", phase: currentPhase });
    } else {
      emitEvent({ type: "error", message: errorMessage, phase: currentPhase });
    }

    throw error;
  } finally {
    // Always clean up the MemoryBus to prevent memory leaks
    removeBus(runId);
  }
}

async function updateRunStatus(runId: string, status: string) {
  await prisma.run.update({ where: { id: runId }, data: { status } });
}

async function persistSnapshot(
  runId: string,
  bus: MemoryBus,
  phase: string,
  emitEvent: (event: PipelineEvent) => void,
) {
  const log = createLogger(runId);
  const status = bus.getStatus();
  try {
    await prisma.memoryBusSnapshot.create({
      data: {
        runId,
        phase,
        snapshot: bus.export(),
        entryCount: status.entries,
        signalCount: status.signals,
        conflictCount: status.openConflicts + status.resolvedConflicts,
        openConflictCount: status.openConflicts,
      },
    });
  } catch (err) {
    log.warn("MEMORY_BUS", `Failed to persist snapshot (${phase})`, { error: String(err) });
  }
  emitEvent({
    type: "memory_snapshot",
    phase,
    entries: status.entries,
    signals: status.signals,
    openConflicts: status.openConflicts,
  });
}

async function persistBlueprint(runId: string, blueprint: Blueprint) {
  await prisma.run.update({
    where: { id: runId },
    data: {
      tier: blueprint.tier,
      complexityScore: Math.round(blueprint.complexityScore.total),
      breadth: blueprint.complexityScore.breadth,
      depth: blueprint.complexityScore.depth,
      interconnection: blueprint.complexityScore.interconnection,
      estimatedTime: blueprint.estimatedTime,
    },
  });

  await prisma.dimension.createMany({
    data: blueprint.dimensions.map((dim) => ({
      name: dim.name,
      description: dim.description,
      runId,
    })),
  });

  await prisma.agent.createMany({
    data: blueprint.agents.map((agent) => ({
      name: agent.name,
      archetype: agent.archetype,
      mandate: agent.mandate,
      tools: JSON.stringify(agent.tools),
      dimension: agent.dimension,
      runId,
    })),
  });
}
