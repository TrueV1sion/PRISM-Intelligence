"use client";

import { motion } from "framer-motion";
import { Layers } from "lucide-react";
import type { SynthesisLayer } from "@/lib/types";
import type { StreamEmergence } from "@/hooks/use-research-stream";

interface SynthesisPhaseProps {
    synthesisLayers: SynthesisLayer[];
    emergences: StreamEmergence[];
    phaseMessage: string;
    isLiveMode: boolean;
}

export default function SynthesisPhase({
    synthesisLayers,
    emergences,
    phaseMessage,
    isLiveMode,
}: SynthesisPhaseProps) {
    const layerNames = isLiveMode
        ? synthesisLayers.map(l => l.name)
        : ["Foundation", "Convergence"];

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-8"
            >
                <div className="relative w-24 h-24 mx-auto">
                    <div className="absolute inset-0 rounded-full border-2 border-prism-sky/30 animate-ping" />
                    <div className="absolute inset-2 rounded-full border border-prism-jade/20 animate-[ping_2s_ease-in-out_infinite]" />
                    <div className="absolute inset-4 rounded-full bg-prism-sky/10 flex items-center justify-center">
                        <Layers className="w-10 h-10 text-prism-sky animate-pulse" />
                    </div>
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Emergence Detection Running</h2>
                    <p className="text-sm text-prism-muted max-w-md mx-auto">
                        {isLiveMode && phaseMessage
                            ? phaseMessage
                            : "Applying Cross-Agent Theme Mining, Tension Point Mapping, Gap Triangulation, and Structural Pattern Recognition..."}
                    </p>
                </div>
                <div data-tour-id="tour-synthesis-layers" className="flex items-center justify-center gap-3 text-xs font-mono text-prism-muted flex-wrap">
                    {layerNames.map((name, i) => (
                        <span key={`${name}-${i}`} className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${i === layerNames.length - 1 ? "bg-prism-sky animate-pulse" : "bg-prism-jade"}`} />
                            {name} {i < layerNames.length - 1 ? "complete" : "..."}
                        </span>
                    ))}
                </div>

                {/* Live emergences */}
                {isLiveMode && emergences.length > 0 && (
                    <div className="max-w-lg mx-auto space-y-3 mt-6">
                        {emergences.map((e, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-panel rounded-lg p-3 text-left"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-prism-sky/10 text-prism-sky">{e.type.toUpperCase()}</span>
                                </div>
                                <p className="text-xs text-prism-text">{e.insight}</p>
                            </motion.div>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
