"use client";

import { useState, useCallback, useEffect } from "react";
import type { AgentRunState, LogEntry, Finding, FindingAction, BlueprintData } from "@/lib/types";
import { DeckMeta, DECK_LIBRARY } from "@/lib/deck-data";

// Inline demo data (previously from mock-data.ts — removed)
const MOCK_BLUEPRINT: BlueprintData = {
  query: "",
  tier: "STANDARD",
  estimatedTime: "3-5 minutes",
  agentCount: 5,
  complexity: { breadth: 4, depth: 4, interconnection: 5, total: 13, reasoning: "Demo blueprint" },
  dimensions: [
    { name: "Clinical Landscape", description: "Clinical efficacy data and pipeline compounds" },
    { name: "Financial Impact", description: "Payer cost modeling and MLR impact" },
    { name: "Regulatory Environment", description: "CMS coverage policies and legislative signals" },
    { name: "Quality & Star Ratings", description: "HEDIS measure impact and quality gaps" },
    { name: "Competitive Dynamics", description: "Payer positioning and formulary strategies" },
  ],
  agents: [
    { id: "a1", name: "Clinical Researcher", archetype: "RESEARCHER-DATA", dimension: "Clinical Landscape", mandate: "Clinical evidence gathering", tools: ["PubMed", "Clinical Trials"], color: "#59DDFD" },
    { id: "a2", name: "Financial Analyst", archetype: "ANALYST-FINANCIAL", dimension: "Financial Impact", mandate: "Financial impact modeling", tools: ["CMS Data", "Web Search"], color: "#00E49F" },
    { id: "a3", name: "Regulatory Specialist", archetype: "REGULATORY-RADAR", dimension: "Regulatory Environment", mandate: "Coverage policy tracking", tools: ["Medicare Coverage", "Web Search"], color: "#4E84C4" },
    { id: "a4", name: "Quality Analytics Lead", archetype: "ANALYST-QUALITY", dimension: "Quality & Star Ratings", mandate: "Quality metric assessment", tools: ["HEDIS Data", "NPI Registry"], color: "#F59E0B" },
    { id: "a5", name: "Competitive Intelligence", archetype: "ANALYST-STRATEGIC", dimension: "Competitive Dynamics", mandate: "Competitive positioning analysis", tools: ["Web Search", "NPI Registry"], color: "#EC4899" },
  ],
};
const MOCK_SYNTHESIS: { name: "foundation" | "convergence" | "tension" | "emergence" | "gap"; description: string; insights: string[] }[] = [
  { name: "foundation", description: "Uncontested ground", insights: ["Demo insight 1"] },
  { name: "convergence", description: "Converging conclusions", insights: ["Demo insight 2"] },
  { name: "tension", description: "Productive tensions", insights: ["Demo insight 3"] },
  { name: "emergence", description: "Multi-agent insights", insights: ["Demo insight 4"] },
  { name: "gap", description: "Knowledge gaps", insights: ["Demo gap 1"] },
];
const MOCK_LOGS: LogEntry[] = [
  { timestamp: "00:00:01", agent: "Orchestrator", message: "Initializing pipeline...", type: "info" },
  { timestamp: "00:00:02", agent: "Clinical Researcher", message: "Searching PubMed...", type: "search" },
  { timestamp: "00:00:03", agent: "Financial Analyst", message: "Finding: Demo financial finding", type: "finding" },
];
const MOCK_FINDINGS: Finding[] = [
  { id: "f1", agentName: "Clinical Researcher", statement: "Demo clinical finding", confidence: "HIGH", evidence: "Demo evidence", source: "PubMed", implication: "Strategic implication", action: "keep" },
  { id: "f2", agentName: "Financial Analyst", statement: "Demo financial finding", confidence: "MEDIUM", evidence: "Modeled data", source: "CMS PUF", implication: "Financial impact", action: "keep" },
];
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
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import CoachMarkProvider, { useCoachMarkPhase } from "@/components/onboarding/CoachMarkProvider";

function PhaseSync({ phase }: { phase: Phase }) {
  const { setCurrentPhase } = useCoachMarkPhase();
  useEffect(() => {
    setCurrentPhase(phase);
  }, [phase, setCurrentPhase]);
  return null;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [selectedDeck, setSelectedDeck] = useState<DeckMeta | null>(null);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [blueprintApproved, setBlueprintApproved] = useState(false);
  const [liveAgents, setLiveAgents] = useState<AgentRunState[]>([]);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [liveFindings, setLiveFindings] = useState<Finding[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  const stream = useResearchStream();

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then((r) => r.json())
      .then((data) => {
        setShowOnboarding(!data.onboardingDismissed);
        setOnboardingChecked(true);
      })
      .catch(() => setOnboardingChecked(true));
  }, []);

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

  // ─── Onboarding Gate ─────────────────────────────────
  if (!onboardingChecked) return null;

  if (showOnboarding) {
    return (
      <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
    );
  }

  // ─── Phase Routing ─────────────────────────────────

  // Convert stream blueprint to BlueprintData format for the approval component
  const blueprintData = isLiveMode && stream.blueprint ? {
    query: stream.blueprint.query,
    tier: stream.blueprint.tier as "MICRO" | "STANDARD" | "EXTENDED" | "MEGA",
    estimatedTime: stream.blueprint.estimatedTime,
    agentCount: stream.blueprint.agents.length,
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

  const activeAgents = isLiveMode ? streamAgents : liveAgents;
  const activeLogs = isLiveMode ? streamLogs : liveLogs;
  const executingPhaseLabel = isLiveMode
    ? stream.phase === "idle" || stream.phase === "think" ? "THINKING — DECOMPOSING QUERY"
      : stream.phase === "construct" ? "CONSTRUCTING AGENT PROMPTS"
        : "DEPLOYING AGENTS"
    : liveAgents.some(a => a.status === "active" || a.status === "complete")
      ? "DEPLOYING AGENTS" : "CONSTRUCTING AGENT PROMPTS";

  const activeFindings = isLiveMode ? streamFindings : liveFindings;
  const triageAgentCount = isLiveMode ? stream.agents.length : MOCK_BLUEPRINT.agents.length;

  const completeSynthesisLayers = isLiveMode ? stream.synthesisLayers as typeof MOCK_SYNTHESIS : MOCK_SYNTHESIS;
  const completeFindingCount = isLiveMode ? stream.findings.length : 6;
  const completeHasError = isLiveMode && stream.phase === "error";

  const phaseContent = effectivePhase === "input" ? (
    <InputPhase
      query={query}
      setQuery={setQuery}
      onSubmitLive={handleSubmitLive}
      onSubmitDemo={handleSubmitDemo}
      onOpenSettings={() => setPhase("settings")}
    />
  ) : effectivePhase === "blueprint" ? (
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
  ) : effectivePhase === "executing" ? (
    <ExecutingPhase
      agents={activeAgents}
      logs={activeLogs}
      phaseLabel={executingPhaseLabel}
      phaseMessage={isLiveMode ? stream.phaseMessage : "Deploying simulated agent swarm..."}
      isLiveMode={isLiveMode}
    />
  ) : effectivePhase === "triage" ? (
    <TriagePhase
      findings={activeFindings}
      agentCount={triageAgentCount}
      onAction={handleFindingAction}
      onApproveAndSynthesize={() => setPhase("synthesis")}
    />
  ) : effectivePhase === "synthesis" ? (
    <SynthesisPhase
      synthesisLayers={isLiveMode ? stream.synthesisLayers as typeof MOCK_SYNTHESIS : MOCK_SYNTHESIS}
      emergences={stream.emergences}
      phaseMessage={stream.phaseMessage}
      isLiveMode={isLiveMode}
    />
  ) : effectivePhase === "complete" ? (
    <CompletePhase
      synthesisLayers={completeSynthesisLayers}
      findingCount={completeFindingCount}
      hasError={completeHasError}
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
  ) : effectivePhase === "library" ? (
    <DeckLibrary
      onSelectDeck={(deck) => {
        setSelectedDeck(deck);
        setPhase("viewer");
      }}
      onBack={() => setPhase("complete")}
    />
  ) : effectivePhase === "viewer" && selectedDeck ? (
    <DeckViewer
      deck={selectedDeck}
      onClose={() => setPhase("library")}
    />
  ) : effectivePhase === "settings" ? (
    <AdminSettings onBack={() => setPhase("input")} />
  ) : null;

  return (
    <CoachMarkProvider>
      <PhaseSync phase={effectivePhase} />
      {phaseContent}
    </CoachMarkProvider>
  );
}
