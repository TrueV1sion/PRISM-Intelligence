/**
 * Research Store — Library of Published Intelligence Briefs
 * 
 * Manages the lifecycle of intelligence briefs:
 * - Draft → Published → Archived
 * - Version history
 * - Search and filtering
 * - Quality metadata
 */

import type { IntelligenceManifest } from "./pipeline/types";
import type { QualityAssuranceReport } from "./pipeline/quality-assurance";

// ─── Types ──────────────────────────────────────────────────

export type BriefStatus = "draft" | "published" | "archived";

export interface ResearchBrief {
    id: string;
    runId: string;
    title: string;
    query: string;
    status: BriefStatus;
    createdAt: string;
    updatedAt: string;
    publishedAt?: string;

    // Manifest summary (not the full manifest, which would be huge)
    summary: {
        tier: string;
        agentCount: number;
        totalFindings: number;
        emergentInsights: number;
        totalCost: number;
        durationMs: number;
    };

    // Quality metadata
    quality: {
        overallScore: number;
        grade: string;
        provenanceCompleteness: number;
        warningCount: number;
        criticalWarnings: number;
    };

    // Tags for filtering
    tags: string[];

    // Version history
    version: number;
    parentVersion?: string;
}

export interface BriefSearchOptions {
    status?: BriefStatus;
    query?: string;
    tags?: string[];
    minQualityScore?: number;
    sortBy?: "createdAt" | "updatedAt" | "qualityScore" | "title";
    sortOrder?: "asc" | "desc";
    limit?: number;
    offset?: number;
}

// ─── In-Memory Research Store ───────────────────────────────

export class ResearchStore {
    private briefs: Map<string, ResearchBrief> = new Map();
    private manifests: Map<string, IntelligenceManifest> = new Map();
    private qaReports: Map<string, QualityAssuranceReport> = new Map();

    /**
     * Publish a completed analysis as a research brief.
     */
    publish(
        manifest: IntelligenceManifest,
        qaReport: QualityAssuranceReport,
        options?: { title?: string; tags?: string[] },
    ): ResearchBrief {
        const id = `brief-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const now = new Date().toISOString();

        // Calculate duration from agent metadata
        const agentDurations = manifest.agentResults.map(r => r.meta.durationMs);
        const totalDuration = agentDurations.reduce((sum, d) => sum + d, 0);

        // Auto-generate title from query
        const title = options?.title ?? generateTitle(manifest.meta.query);

        const brief: ResearchBrief = {
            id,
            runId: manifest.meta.runId,
            title,
            query: manifest.meta.query,
            status: "published",
            createdAt: now,
            updatedAt: now,
            publishedAt: now,
            summary: {
                tier: manifest.meta.tier,
                agentCount: manifest.meta.agentCount,
                totalFindings: manifest.meta.totalFindings,
                emergentInsights: manifest.meta.emergentInsights,
                totalCost: manifest.meta.totalCost,
                durationMs: totalDuration,
            },
            quality: {
                overallScore: qaReport.score.overallScore,
                grade: qaReport.score.grade,
                provenanceCompleteness: qaReport.provenance.chainCompleteness,
                warningCount: qaReport.warnings.length,
                criticalWarnings: qaReport.warnings.filter(w => w.severity === "critical").length,
            },
            tags: options?.tags ?? autoTag(manifest),
            version: 1,
        };

        this.briefs.set(id, brief);
        this.manifests.set(id, manifest);
        this.qaReports.set(id, qaReport);

        return brief;
    }

    /**
     * Get a brief by ID.
     */
    getBrief(id: string): ResearchBrief | undefined {
        return this.briefs.get(id);
    }

    /**
     * Get the full manifest for a brief.
     */
    getManifest(briefId: string): IntelligenceManifest | undefined {
        return this.manifests.get(briefId);
    }

    /**
     * Get the QA report for a brief.
     */
    getQAReport(briefId: string): QualityAssuranceReport | undefined {
        return this.qaReports.get(briefId);
    }

    /**
     * Search and filter briefs.
     */
    search(options: BriefSearchOptions = {}): { briefs: ResearchBrief[]; total: number } {
        let results = Array.from(this.briefs.values());

        // Filter by status
        if (options.status) {
            results = results.filter(b => b.status === options.status);
        }

        // Filter by query (search title and query)
        if (options.query) {
            const q = options.query.toLowerCase();
            results = results.filter(b =>
                b.title.toLowerCase().includes(q) ||
                b.query.toLowerCase().includes(q) ||
                b.tags.some(t => t.toLowerCase().includes(q))
            );
        }

        // Filter by tags
        if (options.tags && options.tags.length > 0) {
            results = results.filter(b =>
                options.tags!.some(t => b.tags.includes(t))
            );
        }

        // Filter by quality score
        if (options.minQualityScore !== undefined) {
            results = results.filter(b => b.quality.overallScore >= options.minQualityScore!);
        }

        const total = results.length;

        // Sort
        const sortBy = options.sortBy ?? "createdAt";
        const sortOrder = options.sortOrder ?? "desc";
        results.sort((a, b) => {
            let compare: number;
            switch (sortBy) {
                case "qualityScore":
                    compare = a.quality.overallScore - b.quality.overallScore;
                    break;
                case "title":
                    compare = a.title.localeCompare(b.title);
                    break;
                case "updatedAt":
                    compare = a.updatedAt.localeCompare(b.updatedAt);
                    break;
                case "createdAt":
                default:
                    compare = a.createdAt.localeCompare(b.createdAt);
            }
            return sortOrder === "desc" ? -compare : compare;
        });

        // Paginate
        const offset = options.offset ?? 0;
        const limit = options.limit ?? 50;
        results = results.slice(offset, offset + limit);

        return { briefs: results, total };
    }

    /**
     * Update brief status.
     */
    updateStatus(id: string, status: BriefStatus): ResearchBrief | undefined {
        const brief = this.briefs.get(id);
        if (!brief) return undefined;

        brief.status = status;
        brief.updatedAt = new Date().toISOString();
        if (status === "published" && !brief.publishedAt) {
            brief.publishedAt = brief.updatedAt;
        }

        return brief;
    }

    /**
     * Add tags to a brief.
     */
    addTags(id: string, tags: string[]): ResearchBrief | undefined {
        const brief = this.briefs.get(id);
        if (!brief) return undefined;

        const newTags = new Set([...brief.tags, ...tags]);
        brief.tags = Array.from(newTags);
        brief.updatedAt = new Date().toISOString();

        return brief;
    }

    /**
     * Get summary statistics.
     */
    getStats(): {
        total: number;
        published: number;
        draft: number;
        archived: number;
        avgQualityScore: number;
    } {
        const all = Array.from(this.briefs.values());
        const scores = all.map(b => b.quality.overallScore);
        return {
            total: all.length,
            published: all.filter(b => b.status === "published").length,
            draft: all.filter(b => b.status === "draft").length,
            archived: all.filter(b => b.status === "archived").length,
            avgQualityScore: scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
        };
    }
}


// ─── Helpers ────────────────────────────────────────────────

function generateTitle(query: string): string {
    // Truncate to a reasonable title length
    const cleaned = query.trim();
    if (cleaned.length <= 60) return cleaned;
    return cleaned.substring(0, 57) + "...";
}

function autoTag(manifest: IntelligenceManifest): string[] {
    const tags: string[] = [];

    // Tag by tier
    tags.push(manifest.meta.tier.toLowerCase());

    // Tag by dimension names
    for (const dim of manifest.blueprint.dimensions) {
        const dimTag = dim.name.toLowerCase().replace(/\s+/g, "-");
        if (dimTag.length < 30) tags.push(dimTag);
    }

    // Tag by quality grade
    const qualityReport = manifest.synthesis.qualityReport;
    if (qualityReport.sourceCoveragePercent > 80) tags.push("well-sourced");
    if (qualityReport.emergenceYield > 1) tags.push("high-emergence");

    return tags.slice(0, 10); // Cap at 10 tags
}


// ─── Singleton ──────────────────────────────────────────────

let _store: ResearchStore | null = null;

export function getResearchStore(): ResearchStore {
    if (!_store) {
        _store = new ResearchStore();
    }
    return _store;
}
