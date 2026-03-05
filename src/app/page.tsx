"use client";

import { useState, useCallback, useEffect } from "react";
import {
  MOCK_BLUEPRINT,
  MOCK_SYNTHESIS,
  MOCK_LOGS,
  MOCK_FINDINGS,
  AgentRunState,
  LogEntry,
  Finding,
  FindingAction,
} from "@/lib/mock-data";
import { DeckMeta, DECK_LIBRARY } from "@/lib/deck-data";
import { useResearchStream, type StreamPhase, type StreamFinding } from "@/hooks/use-research-stream";
import { AGENT_COLORS } from "@/lib/constants";
import type { Phase } from "@/lib/types";

import InputPhase from "@/components/phases/InputPhase";
import ExecutingPhase from "@/components/phases/ExecutingPhase";
import TriagePhase from "@/components/phases/TriagePhase";
import SynthesisPhase from "@/components/phases/SynthesisPhase";
import CompletePhase from "@/components/phases/CompletePhase";
import BlueprintApproval from "@/components/BlueprintApproval";
import DeckLibrary from "@/components/DeckLibrary";
import DeckViewer from "@/components/DeckViewer";
import AdminSettings from "@/components/AdminSettings";

export default function Home() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [selectedDeck, setSelectedDeck] = useState<DeckMeta | null>(null);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [blueprintApproved, setBlueprintApproved] = useState(false);
  const [liveAgents, setLiveAgents] = useState<AgentRunState[]>([]);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [liveFindings, setLiveFindings] = useState<Finding[]>([]);

  const stream = useResearchStream();

  // ─── Start live analysis ──────────────────────────
  const handleSubmitLive = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const runId = `run-${Date.now()}`;
    setIsLiveMode(true);
    setBlueprintApproved(false);
    setLiveLogs([]);
    setLiveFindings([]);
    // Don't set phase here — let the stream drive it
    stream.startStream(query, runId);
  }, [query, stream]);

  // ─── Start demo mode (existing mock behavior) ─────
  const handleSubmitDemo = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsLiveMode(false);
    setPhase("blueprint");
  }, [query]);

  const handleFindingAction = useCallback((id: string, action: FindingAction) => {
    if (isLiveMode) {
      const streamAction = action === "keep" ? "approve" as const :
        action === "dismiss" ? "reject" as const :
          action === "boost" ? "approve" as const :
            "flag" as const;
      stream.setFindingAction(id, streamAction);
      setLiveFindings(prev => prev.map(f => f.id === id ? { ...f, action } : f));
    } else {
      setLiveFindings(prev => prev.map(f => f.id === id ? { ...f, action } : f));
    }
  }, [isLiveMode, stream]);

  // ─── Demo Mode Simulation ─────────────────────────────────
  // Simulates the pipeline execution when not in live mode
  useEffect(() => {
    if (phase !== "executing" || isLiveMode) return;

    setLiveAgents(MOCK_BLUEPRINT.agents.map(a => ({
      ...a,
      status: "idle",
      progress: 0,
      logs: [],
      findings: []
    })));
    setLiveLogs([]);
    setLiveFindings([]);

    let progress = 0;
    let logIndex = 0;

    const interval = setInterval(() => {
      progress += 5; // Takes ~10s to complete

      setLiveAgents(agents => agents.map(a => {
        if (progress < 15) return { ...a, status: "idle", progress: 0 };
        if (progress < 100) return { ...a, status: "active", progress };
        return { ...a, status: "complete", progress: 100 };
      }));

      // Trickle in mock logs
      if (progress > 15 && logIndex < MOCK_LOGS.length) {
        setLiveLogs(prev => [MOCK_LOGS[logIndex], ...prev]);
        logIndex++;
      }

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setLiveFindings(MOCK_FINDINGS.map(f => ({ ...f, action: "keep" })));
          setPhase("triage");
        }, 1200);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [phase, isLiveMode]);

  // ─── Demo Mode: Synthesis → Complete auto-transition ──────
  useEffect(() => {
    if (phase !== "synthesis" || isLiveMode) return;

    const timer = setTimeout(() => {
      setPhase("complete");
    }, 4000); // 4s simulated synthesis

    return () => clearTimeout(timer);
  }, [phase, isLiveMode]);

  // ─── Map stream state to component-compatible data ─
  const streamAgents: AgentRunState[] = stream.agents.map((a, i) => ({
    id: a.id,
    name: a.name,
    archetype: a.archetype,
    mandate: `${a.dimension} analysis agent`,
    tools: [],
    dimension: a.dimension,
    color: AGENT_COLORS[i % AGENT_COLORS.length],
    status: a.status === "pending" ? "idle" as const : a.status as AgentRunState["status"],
    progress: a.progress,
    logs: [],
    findings: stream.findings
      .filter(f => f.agentId === a.id)
      .map(f => ({
        id: f.id,
        agentId: f.agentId,
        agentName: a.name,
        statement: f.statement,
        evidence: f.evidence,
        confidence: f.confidence,
        source: f.source,
        implication: f.implication,
        action: "keep" as FindingAction,
      })),
  }));

  const streamFindings: Finding[] = stream.findings.map(f => {
    const agent = stream.agents.find(a => a.id === f.agentId);
    const existing = liveFindings.find(lf => lf.id === f.id);
    return {
      id: f.id,
      agentId: f.agentId,
      agentName: agent?.name ?? "Agent",
      statement: f.statement,
      evidence: f.evidence,
      confidence: f.confidence,
      source: f.source,
      implication: f.implication,
      action: existing?.action ?? "keep" as FindingAction,
    };
  });

  // Use real-time logs accumulated by the hook
  const streamLogs: LogEntry[] = stream.logs;

  // Auto-transition based on stream phase
  const effectivePhase: Phase = isLiveMode ? (
    stream.phase === "idle" || stream.phase === "think" ? "executing" :
      stream.phase === "blueprint" && !blueprintApproved ? "blueprint" :
        stream.phase === "construct" || (stream.phase === "blueprint" && blueprintApproved) ? "executing" :
          stream.phase === "deploy" ? "executing" :
            stream.phase === "triage" ? "triage" :
              stream.phase === "synthesize" || stream.phase === "qa" ? "synthesis" :
                stream.phase === "complete" ? "complete" :
                  stream.phase === "error" ? "complete" :
                    phase
  ) : phase;

  // ─── Phase Routing ─────────────────────────────────
  if (effectivePhase === "input") {
    return (
      <InputPhase
        query={query}
        setQuery={setQuery}
        onSubmitLive={handleSubmitLive}
        onSubmitDemo={handleSubmitDemo}
        onOpenSettings={() => setPhase("settings")}
      />
    );
  }

  if (effectivePhase === "blueprint") {
    // Convert stream blueprint to BlueprintData format for the approval component
    const blueprintData = isLiveMode && stream.blueprint ? {
      query: stream.blueprint.query,
      tier: stream.blueprint.tier as "MICRO" | "STANDARD" | "EXTENDED" | "MEGA",
      estimatedTime: stream.blueprint.estimatedTime,
      complexity: stream.blueprint.complexity,
      dimensions: stream.blueprint.dimensions.map((d, i) => ({ id: `dim-${i}`, ...d })),
      agents: stream.blueprint.agents.map((a, i) => ({
        id: `agent-${i}`,
        name: a.name,
        archetype: a.archetype,
        mandate: a.mandate,
        tools: a.tools,
        dimension: a.dimension,
        color: AGENT_COLORS[i % AGENT_COLORS.length],
      })),
    } : { ...MOCK_BLUEPRINT, query };

    return (
      <BlueprintApproval
        blueprint={blueprintData}
        onApprove={() => {
          if (isLiveMode) {
            setBlueprintApproved(true);
          } else {
            setPhase("executing");
          }
        }}
      />
    );
  }

  if (effectivePhase === "executing") {
    const activeAgents = isLiveMode ? streamAgents : liveAgents;
    const activeLogs = isLiveMode ? streamLogs : liveLogs;
    const phaseLabel = isLiveMode
      ? stream.phase === "idle" || stream.phase === "think" ? "THINKING — DECOMPOSING QUERY"
        : stream.phase === "construct" ? "CONSTRUCTING AGENT PROMPTS"
          : "DEPLOYING AGENTS"
      : liveAgents.some(a => a.status === "active" || a.status === "complete")
        ? "DEPLOYING AGENTS" : "CONSTRUCTING AGENT PROMPTS";

    return (
      <ExecutingPhase
        agents={activeAgents}
        logs={activeLogs}
        phaseLabel={phaseLabel}
        phaseMessage={isLiveMode ? stream.phaseMessage : "Deploying simulated agent swarm..."}
        isLiveMode={isLiveMode}
      />
    );
  }

  if (effectivePhase === "triage") {
    const activeFindings = isLiveMode ? streamFindings : liveFindings;
    const agentCount = isLiveMode ? stream.agents.length : MOCK_BLUEPRINT.agents.length;

    return (
      <TriagePhase
        findings={activeFindings}
        agentCount={agentCount}
        onAction={handleFindingAction}
        onApproveAndSynthesize={() => setPhase("synthesis")}
      />
    );
  }

  if (effectivePhase === "synthesis") {
    return (
      <SynthesisPhase
        synthesisLayers={isLiveMode ? stream.synthesisLayers : MOCK_SYNTHESIS}
        emergences={stream.emergences}
        phaseMessage={stream.phaseMessage}
        isLiveMode={isLiveMode}
      />
    );
  }

  if (effectivePhase === "complete") {
    const synthesisLayers = isLiveMode ? stream.synthesisLayers : MOCK_SYNTHESIS;
    const findingCount = isLiveMode ? stream.findings.length : 6;
    const hasError = isLiveMode && stream.phase === "error";

    return (
      <CompletePhase
        synthesisLayers={synthesisLayers}
        findingCount={findingCount}
        hasError={hasError}
        errorMessage={stream.error}
        isLiveMode={isLiveMode}
        quality={stream.quality}
        completionData={stream.completionData}
        emergences={stream.emergences}
        onNewAnalysis={() => {
          stream.reset();
          setPhase("input");
          setQuery("");
          setIsLiveMode(false);
        }}
        onViewBrief={() => {
          if (isLiveMode && stream.completionData?.presentationPath) {
            window.open(stream.completionData.presentationPath, "_blank");
          } else {
            setSelectedDeck(DECK_LIBRARY[0]);
            setPhase("viewer");
          }
        }}
        onBrowseLibrary={() => setPhase("library")}
      />
    );
  }

  if (effectivePhase === "library") {
    return (
      <DeckLibrary
        onSelectDeck={(deck) => {
          setSelectedDeck(deck);
          setPhase("viewer");
        }}
        onBack={() => setPhase("complete")}
      />
    );
  }

  if (effectivePhase === "viewer" && selectedDeck) {
    return (
      <DeckViewer
        deck={selectedDeck}
        onClose={() => setPhase("library")}
      />
    );
  }

  if (effectivePhase === "settings") {
    return (
      <AdminSettings onBack={() => setPhase("input")} />
    );
  }

  return null;
}
