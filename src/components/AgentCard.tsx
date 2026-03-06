"use client";

import { motion } from "framer-motion";
import type { AgentRunState } from "@/lib/types";
import { Bot, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

const statusConfig = {
    idle: { icon: Bot, color: "text-prism-muted", bg: "bg-white/5", label: "Standby" },
    active: { icon: Loader2, color: "text-prism-sky", bg: "bg-prism-sky/5", label: "Analyzing" },
    complete: { icon: CheckCircle2, color: "text-prism-jade", bg: "bg-prism-jade/5", label: "Complete" },
    failed: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-400/5", label: "Failed" },
};

export default function AgentCard({ agent, index }: { agent: AgentRunState; index: number }) {
    const config = statusConfig[agent.status];
    const StatusIcon = config.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.1, duration: 0.4, ease: "easeOut" }}
            className={`glass-panel rounded-xl p-5 relative overflow-hidden group transition-all duration-300 hover:border-white/10`}
        >
            {/* Glow bar at top — color-coded by agent */}
            <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)` }}
            />

            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${agent.color}15`, border: `1px solid ${agent.color}30` }}
                    >
                        <Bot className="w-5 h-5" style={{ color: agent.color }} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-white">{agent.name}</h3>
                        <p className="text-xs font-mono text-prism-muted">{agent.archetype}</p>
                    </div>
                </div>

                <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${config.bg}`}>
                    <StatusIcon className={`w-3.5 h-3.5 ${config.color} ${agent.status === "active" ? "animate-spin" : ""}`} />
                    <span className={config.color}>{config.label}</span>
                </div>
            </div>

            {/* Mandate */}
            <p className="text-xs text-prism-muted/80 leading-relaxed mb-3 line-clamp-2">
                {agent.mandate}
            </p>

            {/* Tools */}
            <div className="flex flex-wrap gap-1.5 mb-4">
                {agent.tools.map((tool) => (
                    <span
                        key={tool}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-prism-muted border border-white/5"
                    >
                        {tool}
                    </span>
                ))}
            </div>

            {/* Progress bar */}
            {agent.status === "active" && (
                <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: agent.color }}
                        initial={{ width: "0%" }}
                        animate={{ width: `${agent.progress}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                </div>
            )}

            {/* Findings count */}
            {agent.findings.length > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className="text-prism-jade font-medium">{agent.findings.length} findings</span>
                    <span className="text-prism-muted">•</span>
                    <span className="text-prism-muted">
                        {agent.findings.filter((f) => f.confidence === "HIGH").length} high confidence
                    </span>
                </div>
            )}
        </motion.div>
    );
}
