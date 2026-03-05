"use client";

import { Activity, Hexagon } from "lucide-react";
import AgentCard from "@/components/AgentCard";
import LiveTerminal from "@/components/LiveTerminal";
import type { AgentRunState, LogEntry } from "@/lib/types";

interface ExecutingPhaseProps {
    agents: AgentRunState[];
    logs: LogEntry[];
    phaseLabel: string;
    phaseMessage: string;
    isLiveMode: boolean;
}

export default function ExecutingPhase({
    agents,
    logs,
    phaseLabel,
    phaseMessage,
    isLiveMode,
}: ExecutingPhaseProps) {
    const completeCount = agents.filter(a => a.status === "complete").length;

    return (
        <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
            {/* Top bar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-prism-sky/10 text-prism-sky border border-prism-sky/20">
                        <Activity className="w-3.5 h-3.5 animate-pulse" />
                        {phaseLabel}
                    </div>
                    {agents.length > 0 && (
                        <span className="text-xs text-prism-muted">
                            {completeCount}/{agents.length} complete
                        </span>
                    )}
                </div>
                {isLiveMode && phaseMessage && (
                    <span className="text-xs text-prism-muted font-mono">{phaseMessage}</span>
                )}
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Agent Cards Grid */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start overflow-y-auto pr-2">
                    {agents.length > 0 ? (
                        agents.map((agent, i) => (
                            <AgentCard key={agent.id} agent={agent} index={i} />
                        ))
                    ) : (
                        // Pulsing placeholder while agents are being constructed
                        <div className="col-span-full flex flex-col items-center justify-center py-20 gap-4">
                            <div className="relative w-20 h-20">
                                <div className="absolute inset-0 rounded-full border-2 border-prism-sky/30 animate-ping" />
                                <div className="absolute inset-4 rounded-full bg-prism-sky/10 flex items-center justify-center">
                                    <Hexagon className="w-8 h-8 text-prism-sky animate-pulse" strokeWidth={1.5} />
                                </div>
                            </div>
                            <p className="text-sm text-prism-muted font-mono">
                                {phaseMessage || "Initializing pipeline..."}
                            </p>
                        </div>
                    )}
                </div>

                {/* Terminal Panel */}
                <div className="w-[420px] hidden lg:flex flex-col">
                    <LiveTerminal logs={logs} />
                </div>
            </div>
        </div>
    );
}
