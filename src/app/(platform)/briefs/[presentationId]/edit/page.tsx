"use client";

import { useState, useEffect, useCallback, use } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Eye,
  Loader2,
  GitBranch,
  Download,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import SlideList from "@/components/editor/SlideList";
import SlideCanvas from "@/components/editor/SlideCanvas";
import InspectorPanel from "@/components/editor/InspectorPanel";

// ─── Types ───────────────────────────────────────────────────

interface SlideContent {
  [key: string]: unknown;
  headline?: string;
  body?: string;
  stats?: Array<{ label: string; value: string; prefix?: string; suffix?: string }>;
  chartData?: Array<{ type: string; label: string; value: number; unit?: string }>;
  findings?: Array<{ id: string; statement: string; confidence: string; sourceTier: string }>;
  sources?: string[];
}

interface SlideData {
  id: string;
  slideNumber: number;
  templateId: string | null;
  backgroundVariant: string;
  animationType: string;
  content: SlideContent;
  sourceAgentIds: string[];
  sourceFindingIds: string[];
}

interface VersionData {
  id: string;
  versionNumber: number;
  status: string;
  label: string | null;
  slides: SlideData[];
}

interface PresentationData {
  id: string;
  title: string;
  subtitle: string;
  htmlPath: string;
  slideCount: number;
  runId: string;
  query?: string;
  currentVersion: VersionData | null;
}

// ─── Main Page ───────────────────────────────────────────────

export default function BriefEditorPage({
  params,
}: {
  params: Promise<{ presentationId: string }>;
}) {
  const { presentationId } = use(params);
  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // ─── Data Loading ──────────────────────────────────────────

  const loadPresentation = useCallback(async () => {
    try {
      // Try direct presentation ID first
      let res = await fetch(`/api/presentations/${presentationId}`);
      if (!res.ok) {
        // Fall back to looking up by run ID
        res = await fetch(`/api/presentations/${presentationId}?byRunId=true`);
      }
      if (!res.ok) return;
      const data: PresentationData = await res.json();
      setPresentation(data);
    } catch (err) {
      console.error("Failed to load presentation:", err);
    }
  }, [presentationId]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadPresentation();
      setIsLoading(false);
    };
    init();
  }, [loadPresentation]);

  // ─── Slide Operations ──────────────────────────────────────

  const slides = presentation?.currentVersion?.slides ?? [];
  const activeSlide = slides[activeSlideIndex] ?? null;

  const updateSlideContent = async (slideId: string, content: SlideContent) => {
    if (!presentation?.currentVersion) return;

    // Optimistic update
    setPresentation((prev) => {
      if (!prev?.currentVersion) return prev;
      return {
        ...prev,
        currentVersion: {
          ...prev.currentVersion,
          slides: prev.currentVersion.slides.map((s) =>
            s.id === slideId ? { ...s, content } : s,
          ),
        },
      };
    });
    setHasUnsavedChanges(true);

    // Persist
    try {
      await fetch(`/api/presentations/${presentationId}/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideId, content }),
      });
    } catch (err) {
      console.error("Failed to save slide:", err);
    }
  };

  const updateSlideBackground = async (bg: string) => {
    if (!activeSlide) return;
    setPresentation((prev) => {
      if (!prev?.currentVersion) return prev;
      return {
        ...prev,
        currentVersion: {
          ...prev.currentVersion,
          slides: prev.currentVersion.slides.map((s) =>
            s.id === activeSlide.id ? { ...s, backgroundVariant: bg } : s,
          ),
        },
      };
    });
    setHasUnsavedChanges(true);
    try {
      await fetch(`/api/presentations/${presentationId}/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideId: activeSlide.id, backgroundVariant: bg }),
      });
    } catch {}
  };

  const updateSlideAnimation = async (anim: string) => {
    if (!activeSlide) return;
    setPresentation((prev) => {
      if (!prev?.currentVersion) return prev;
      return {
        ...prev,
        currentVersion: {
          ...prev.currentVersion,
          slides: prev.currentVersion.slides.map((s) =>
            s.id === activeSlide.id ? { ...s, animationType: anim } : s,
          ),
        },
      };
    });
    setHasUnsavedChanges(true);
    try {
      await fetch(`/api/presentations/${presentationId}/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideId: activeSlide.id, animationType: anim }),
      });
    } catch {}
  };

  // ─── Create Draft Version ──────────────────────────────────

  const createDraftVersion = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/presentations/${presentationId}/versions`, {
        method: "POST",
      });
      if (res.ok) {
        await loadPresentation();
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error("Failed to create draft:", err);
    }
    setIsSaving(false);
  };

  // ─── Render ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-prism-sky animate-spin" />
      </div>
    );
  }

  if (!presentation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-prism-muted">Presentation not found</p>
          <Link href="/history" className="text-xs text-prism-sky mt-2 inline-block">
            ← Back to History
          </Link>
        </div>
      </div>
    );
  }

  if (!presentation.currentVersion || slides.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-7 h-7 text-prism-muted" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            No Structured Data
          </h3>
          <p className="text-sm text-prism-muted leading-relaxed mb-4">
            This presentation was generated before structured editing was enabled.
            Create an initial version to start editing, or view the HTML brief directly.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/presentations/${presentationId}/versions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ label: "Initial version" }),
                  });
                  if (res.ok) {
                    loadPresentation();
                  }
                } catch (err) {
                  console.error("Failed to create version:", err);
                }
              }}
              className="px-4 py-2 rounded-xl bg-prism-sky/20 border border-prism-sky/20 text-prism-sky text-sm font-medium hover:bg-prism-sky/30 transition-all"
            >
              Create Initial Version
            </button>
            <Link
              href={`/${presentation.htmlPath.replace("public/", "")}`}
              className="px-4 py-2 rounded-xl border border-white/10 text-prism-muted text-sm hover:text-white hover:bg-white/5 transition-all"
            >
              View HTML Brief →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/8 bg-[#0a0f1e]/50">
        <div className="flex items-center gap-3">
          <Link
            href="/history"
            className="p-1.5 rounded-lg hover:bg-white/5 text-prism-muted hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-white truncate max-w-md">
              {presentation.title}
            </h1>
            <div className="flex items-center gap-2 text-[10px] text-prism-muted">
              <span>v{presentation.currentVersion.versionNumber}</span>
              <span className="text-white/20">·</span>
              <span
                className={`${
                  presentation.currentVersion.status === "published"
                    ? "text-emerald-400"
                    : presentation.currentVersion.status === "draft"
                      ? "text-amber-400"
                      : "text-prism-muted"
                }`}
              >
                {presentation.currentVersion.status}
              </span>
              {presentation.currentVersion.label && (
                <>
                  <span className="text-white/20">·</span>
                  <span>{presentation.currentVersion.label}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <span className="text-[10px] text-amber-400 font-mono">
              Unsaved changes
            </span>
          )}
          {presentation.currentVersion.status === "published" && (
            <button
              onClick={createDraftVersion}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-prism-sky/20 text-prism-sky hover:bg-prism-sky/30 border border-prism-sky/20 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <GitBranch className="w-3 h-3" />
              )}
              Create Draft
            </button>
          )}
          <Link
            href={`/${presentation.htmlPath.replace("public/", "")}`}
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-prism-muted hover:text-white hover:bg-white/5 transition-all"
          >
            <Eye className="w-3 h-3" />
            Preview
          </Link>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Slide List */}
        <SlideList
          slides={slides}
          activeSlide={activeSlideIndex}
          onSelect={setActiveSlideIndex}
          onAdd={() => {/* TODO: implement add slide */}}
        />

        {/* Center: Slide Canvas */}
        {activeSlide && (
          <SlideCanvas
            slide={activeSlide}
            onUpdate={(content) => {
              if (activeSlide) updateSlideContent(activeSlide.id, content as SlideContent);
            }}
          />
        )}

        {/* Right: Inspector Panel */}
        {activeSlide && (
          <InspectorPanel
            slide={activeSlide}
            annotations={[]}
            onUpdateProperties={(props) => {
              if (props.backgroundVariant) updateSlideBackground(props.backgroundVariant);
              if (props.animationType) updateSlideAnimation(props.animationType);
            }}
            onAddAnnotation={(content) => console.log("Add annotation:", content)}
            onResolveAnnotation={(id) => console.log("Resolve annotation:", id)}
          />
        )}
      </div>
    </div>
  );
}
