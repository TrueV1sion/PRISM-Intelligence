"use client";

import { motion } from "framer-motion";
import type { Finding, FindingAction } from "@/lib/types";
import { ThumbsUp, ThumbsDown, ArrowUp, Flag, Shield, FileText, Bot } from "lucide-react";

const confidenceStyles: Record<string, string> = {
    HIGH: "bg-prism-jade/15 text-prism-jade border-prism-jade/30",
    MEDIUM: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    LOW: "bg-red-400/15 text-red-400 border-red-400/30",
};

const actionButtons: { action: FindingAction; icon: typeof ThumbsUp; label: string; activeClass: string }[] = [
    { action: "keep", icon: ThumbsUp, label: "Keep", activeClass: "bg-prism-jade/20 text-prism-jade border-prism-jade/40" },
    { action: "boost", icon: ArrowUp, label: "Boost", activeClass: "bg-prism-sky/20 text-prism-sky border-prism-sky/40" },
    { action: "flag", icon: Flag, label: "Flag", activeClass: "bg-amber-400/20 text-amber-400 border-amber-400/40" },
    { action: "dismiss", icon: ThumbsDown, label: "Dismiss", activeClass: "bg-red-400/20 text-red-400 border-red-400/40" },
];

export default function FindingCard({
    finding,
    index,
    onAction,
}: {
    finding: Finding;
    index: number;
    onAction: (id: string, action: FindingAction) => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.3 }}
            className={`glass-panel rounded-xl p-5 transition-all duration-200 ${finding.action === "dismiss" ? "opacity-40" : ""
                }`}
        >
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-prism-cerulean" />
                    <span className="text-xs font-mono text-prism-cerulean">{finding.agentName}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${confidenceStyles[finding.confidence]}`}>
                    {finding.confidence}
                </span>
            </div>

            {/* Statement */}
            <p className="text-sm text-white font-medium leading-relaxed mb-3">
                {finding.statement}
            </p>

            {/* Evidence */}
            <div className="flex items-start gap-2 mb-2">
                <Shield className="w-3.5 h-3.5 text-prism-muted/50 mt-0.5 shrink-0" />
                <p className="text-xs text-prism-muted leading-relaxed">{finding.evidence}</p>
            </div>

            {/* Source */}
            <div className="flex items-start gap-2 mb-4">
                <FileText className="w-3.5 h-3.5 text-prism-muted/50 mt-0.5 shrink-0" />
                <p className="text-xs text-prism-muted/60 font-mono">{finding.source}</p>
            </div>

            {/* Implication */}
            <div className="bg-white/[0.02] rounded-lg px-3 py-2 mb-4 border-l-2 border-prism-sky/30">
                <p className="text-xs text-prism-muted leading-relaxed">
                    <span className="text-prism-sky font-medium">Implication: </span>
                    {finding.implication}
                </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
                {actionButtons.map(({ action, icon: Icon, label, activeClass }) => (
                    <button
                        key={action}
                        onClick={() => onAction(finding.id, action)}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 ${finding.action === action ? activeClass : "border-white/5 text-prism-muted hover:border-white/15 hover:text-white"
                            }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>
        </motion.div>
    );
}
