"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LogEntry } from "@/lib/types";
import { Terminal } from "lucide-react";

const typeColors: Record<LogEntry["type"], string> = {
    info: "text-prism-muted",
    search: "text-prism-cerulean",
    finding: "text-prism-jade",
    error: "text-red-400",
};

const typeBadge: Record<LogEntry["type"], string> = {
    info: "INFO",
    search: "SRCH",
    finding: "FIND",
    error: "ERR!",
};

export default function LiveTerminal({ logs }: { logs: LogEntry[] }) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="glass-panel rounded-xl overflow-hidden flex flex-col h-full">
            {/* Terminal Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
                <Terminal className="w-4 h-4 text-prism-sky" />
                <span className="text-xs font-mono text-prism-muted">PRISM Activity Monitor</span>
                <div className="flex-1" />
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-prism-jade animate-pulse" />
                    <span className="text-[10px] font-mono text-prism-muted">LIVE</span>
                </div>
            </div>

            {/* Log Output */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs">
                <AnimatePresence initial={false}>
                    {logs.filter(Boolean).map((log, i) => (
                        <motion.div
                            key={`${log.timestamp}-${log.agent}-${i}`}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-start gap-3 py-0.5"
                        >
                            <span className="text-white/20 shrink-0 w-[60px]">{log.timestamp}</span>
                            <span className={`shrink-0 w-[30px] text-center text-[9px] font-bold rounded px-1 py-px ${log.type === "finding" ? "bg-prism-jade/15 text-prism-jade" :
                                log.type === "search" ? "bg-prism-cerulean/15 text-prism-cerulean" :
                                    log.type === "error" ? "bg-red-400/15 text-red-400" :
                                        "bg-white/5 text-prism-muted"
                                }`}>
                                {typeBadge[log.type]}
                            </span>
                            <span className="text-prism-sky/70 shrink-0 w-[170px] truncate">{log.agent}</span>
                            <span className={typeColors[log.type]}>{log.message}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Blinking cursor */}
                <div className="flex items-center gap-2 py-0.5">
                    <span className="text-white/20 w-[60px]" />
                    <span className="w-1.5 h-3.5 bg-prism-sky animate-[pulse_1s_ease-in-out_infinite]" />
                </div>
            </div>
        </div>
    );
}
