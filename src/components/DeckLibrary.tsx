"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
    FileText,
    Users,
    Layers,
    Clock,
    ChevronRight,
    Library,
    Search,
    Hexagon,
} from "lucide-react";
import { DeckMeta, DECK_LIBRARY } from "@/lib/deck-data";

interface DeckLibraryProps {
    onSelectDeck: (deck: DeckMeta) => void;
    onBack: () => void;
}

export default function DeckLibrary({ onSelectDeck, onBack }: DeckLibraryProps) {
    const [search, setSearch] = useState("");

    const filtered = DECK_LIBRARY.filter(
        (d) =>
            d.title.toLowerCase().includes(search.toLowerCase()) ||
            d.subtitle.toLowerCase().includes(search.toLowerCase()) ||
            d.dimensions.some((dim) =>
                dim.toLowerCase().includes(search.toLowerCase())
            )
    );

    const tierColors: Record<string, string> = {
        MICRO: "bg-prism-jade/10 text-prism-jade border-prism-jade/20",
        STANDARD: "bg-prism-sky/10 text-prism-sky border-prism-sky/20",
        EXTENDED: "bg-violet-400/10 text-violet-400 border-violet-400/20",
        MEGA: "bg-amber-400/10 text-amber-400 border-amber-400/20",
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 md:px-10 pt-6 md:pt-10 pb-6 space-y-6">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="text-xs text-prism-muted hover:text-white transition-colors flex items-center gap-1"
                        >
                            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                            Command Center
                        </button>
                        <div className="w-px h-5 bg-white/10" />
                        <div className="flex items-center gap-2">
                            <Library className="w-5 h-5 text-prism-sky" />
                            <h1 className="text-xl font-bold text-white">Intelligence Library</h1>
                        </div>
                    </div>
                    <div className="text-xs font-mono text-prism-muted">
                        {DECK_LIBRARY.length} briefs
                    </div>
                </motion.div>

                {/* Search */}
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="relative max-w-md"
                >
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prism-muted/50" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search briefs by title, topic, or dimension..."
                        className="w-full bg-white/[0.03] border border-white/5 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-prism-muted/40 outline-none focus:border-prism-sky/30 transition-colors"
                    />
                </motion.div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-10">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filtered.map((deck, i) => (
                        <motion.button
                            key={deck.id}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08 }}
                            onClick={() => onSelectDeck(deck)}
                            className="group text-left glass-panel rounded-xl p-5 border border-white/5 hover:border-prism-sky/20 transition-all duration-300 hover:shadow-[0_0_30px_rgba(89,221,253,0.04)]"
                        >
                            {/* Top row: title + tier */}
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-base font-semibold text-white group-hover:text-prism-sky transition-colors truncate">
                                        {deck.title}
                                    </h3>
                                    <p className="text-xs text-prism-muted mt-0.5 truncate">
                                        {deck.subtitle}
                                    </p>
                                </div>
                                <span
                                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex-shrink-0 ${tierColors[deck.tier]}`}
                                >
                                    {deck.tier}
                                </span>
                            </div>

                            {/* Metrics row */}
                            <div className="flex items-center gap-4 text-xs text-prism-muted mb-4">
                                <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {deck.agentCount} agents
                                </span>
                                <span className="flex items-center gap-1">
                                    <Layers className="w-3 h-3" />
                                    {deck.slideCount} slides
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {new Date(deck.date).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </span>
                            </div>

                            {/* Agent chips */}
                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {deck.agents.slice(0, 4).map((agent) => (
                                    <span
                                        key={agent.name}
                                        className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/5"
                                        style={{ color: agent.color }}
                                    >
                                        <span
                                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: agent.color }}
                                        />
                                        {agent.name}
                                    </span>
                                ))}
                                {deck.agents.length > 4 && (
                                    <span className="text-[10px] text-prism-muted px-2 py-0.5">
                                        +{deck.agents.length - 4} more
                                    </span>
                                )}
                            </div>

                            {/* Confidence bar */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-prism-muted uppercase tracking-wider">Confidence</span>
                                    <span
                                        className={`font-mono font-semibold ${deck.confidence >= 0.9
                                                ? "text-prism-jade"
                                                : deck.confidence >= 0.8
                                                    ? "text-prism-sky"
                                                    : "text-amber-400"
                                            }`}
                                    >
                                        {Math.round(deck.confidence * 100)}%
                                    </span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{
                                            width: `${deck.confidence * 100}%`,
                                            background:
                                                deck.confidence >= 0.9
                                                    ? "linear-gradient(90deg, #00E49F, #59DDFD)"
                                                    : deck.confidence >= 0.8
                                                        ? "linear-gradient(90deg, #4E84C4, #59DDFD)"
                                                        : "linear-gradient(90deg, #F59E0B, #F5E6BB)",
                                        }}
                                    />
                                </div>
                            </div>

                            {/* View arrow */}
                            <div className="flex items-center justify-end mt-4 text-xs text-prism-muted group-hover:text-prism-sky transition-colors">
                                View Brief
                                <ChevronRight className="w-3.5 h-3.5 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </motion.button>
                    ))}
                </div>

                {/* Empty state */}
                {filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Hexagon className="w-12 h-12 text-prism-muted/30 mb-4" />
                        <h3 className="text-sm font-medium text-prism-muted mb-1">No briefs match your search</h3>
                        <p className="text-xs text-prism-muted/60">Try a different keyword or browse all available briefs</p>
                    </div>
                )}
            </div>
        </div>
    );
}
