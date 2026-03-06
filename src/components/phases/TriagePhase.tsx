"use client";

import { Filter, ChevronRight } from "lucide-react";
import FindingCard from "@/components/FindingCard";
import type { Finding, FindingAction } from "@/lib/types";

interface TriagePhaseProps {
    findings: Finding[];
    agentCount: number;
    onAction: (id: string, action: FindingAction) => void;
    onApproveAndSynthesize: () => void;
}

export default function TriagePhase({
    findings,
    agentCount,
    onAction,
    onApproveAndSynthesize,
}: TriagePhaseProps) {
    const keptCount = findings.filter(f => f.action === "keep" || f.action === "boost").length;

    return (
        <div className="flex-1 flex flex-col p-6 md:p-10 overflow-y-auto">
            <div className="w-full max-w-4xl mx-auto space-y-8">
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20">
                        <Filter className="w-3.5 h-3.5" />
                        HITL GATE: FINDINGS TRIAGE
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold text-white">Review Agent Findings</h2>
                    <p className="text-sm text-prism-muted max-w-xl mx-auto">
                        {findings.length} findings from {agentCount} agents. Dismiss unreliable claims before synthesis.
                    </p>
                </div>

                <div className="glass-panel rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-6 text-xs font-mono">
                        <span className="text-prism-jade">{keptCount} kept</span>
                        <span className="text-prism-sky">{findings.filter(f => f.action === "boost").length} boosted</span>
                        <span className="text-amber-400">{findings.filter(f => f.action === "flag").length} flagged</span>
                        <span className="text-red-400">{findings.filter(f => f.action === "dismiss").length} dismissed</span>
                    </div>
                    <button
                        onClick={onApproveAndSynthesize}
                        className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium bg-prism-jade text-prism-bg shadow-[0_0_15px_rgba(0,228,159,0.2)] hover:bg-white transition-all duration-300"
                    >
                        Approve & Synthesize
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                <div data-tour-id="tour-finding-card" className="space-y-4">
                    {findings.map((finding, i) => (
                        <FindingCard key={finding.id} finding={finding} index={i} onAction={onAction} />
                    ))}
                </div>
            </div>
        </div>
    );
}
