// src/lib/data-sources/research/dataset-intelligence.ts
/**
 * research_dataset_trends — Layer 3 Intelligence Tool
 *
 * Compound research tool that aggregates dataset delta analysis across
 * multiple government data sources into a single intelligence packet.
 * Combines delta counts by change type, top changing entities, recent
 * critical changes, and temporal trend analysis.
 */

import type { DataSourceTool, ToolResult, ToolCache, Citation } from "../types";
import { LAYER_3_CHAR_BUDGET } from "../types";
import {
  intelligenceHeader,
  markdownTable,
  formatCitations,
  formatNumber,
  truncateToCharBudget,
} from "../format";

// ─── Research Tool ────────────────────────────────────────────

export const datasetIntelligenceResearchTool: DataSourceTool = {
  name: "research_dataset_trends",
  description:
    "Comprehensive dataset change intelligence: aggregates change patterns across " +
    "government datasets (CMS, FDA, DEA). Returns delta counts by type, top changing " +
    "entities, critical ownership/rating changes, and temporal trends. Use this for " +
    "understanding macro-level shifts in healthcare provider data.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Focus area or entity to investigate (e.g., 'hospital ownership changes', " +
          "'star rating declines', 'provider enrollment shifts')",
      },
      timeframe: {
        type: "string",
        description: "How far back to analyze: '7d', '30d', '90d', '1y' (default '30d')",
      },
      focus: {
        type: "string",
        description:
          "Optional focus category: 'cms', 'fda', 'dea', or specific source name",
      },
    },
    required: ["query"],
  },
  layer: 3,
  sources: ["dataset-snapshots", "dataset-deltas"],
  routingTags: ["dataset", "government", "monitoring", "change-detection", "trends"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const { prisma } = await import("@/lib/prisma");

    const query = input.query as string;
    const timeframe = (input.timeframe as string) ?? "30d";
    const focus = input.focus as string | undefined;

    // Parse timeframe into date cutoff
    const dateCutoff = parseTimeframeCutoff(timeframe);

    // Build source filter
    const sourceFilter: Record<string, unknown> = {};
    if (focus) {
      sourceFilter.OR = [
        { category: { equals: focus, mode: "insensitive" } },
        { name: { contains: focus, mode: "insensitive" } },
      ];
    }

    // ─── Parallel data fetches ───────────────────────────────
    const [
      changeTypeCounts,
      topChangedEntities,
      recentCriticalChanges,
      snapshotSummaries,
      totalDeltaCount,
    ] = await Promise.all([
      // 1. Delta counts by changeType across recent snapshots
      prisma.datasetDelta.groupBy({
        by: ["changeType"],
        where: {
          detectedAt: { gte: dateCutoff },
          ...(focus
            ? {
                snapshot: {
                  source: sourceFilter,
                },
              }
            : {}),
        },
        _count: { id: true },
      }),

      // 2. Top changing entities (most deltas)
      prisma.datasetDelta.groupBy({
        by: ["entityKey"],
        where: {
          detectedAt: { gte: dateCutoff },
          ...(focus
            ? {
                snapshot: {
                  source: sourceFilter,
                },
              }
            : {}),
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 15,
      }),

      // 3. Recent critical changes (ownership changes, large value changes)
      prisma.datasetDelta.findMany({
        where: {
          detectedAt: { gte: dateCutoff },
          changeType: "modified",
          fieldName: {
            in: [
              // Ownership/control fields
              "GNRL_CNTL_TYPE_CD",
              "Organization legal name",
              // Rating fields
              "Overall Rating",
              "Hospital overall rating",
              "Star Rating",
              // Financial fields
              "Total Costs",
              "Total Revenue",
              "Net Income",
              "Monthly Premium",
              "Total_Amount_of_Payment_USDollars",
              // Status fields
              "Enrollment Status",
              "marketing_category",
            ],
          },
          ...(focus
            ? {
                snapshot: {
                  source: sourceFilter,
                },
              }
            : {}),
        },
        include: {
          snapshot: {
            include: {
              source: { select: { name: true, category: true } },
            },
          },
        },
        orderBy: { detectedAt: "desc" },
        take: 20,
      }),

      // 4. Snapshot summaries for context
      prisma.datasetSnapshot.findMany({
        where: {
          snapshotAt: { gte: dateCutoff },
          ...(focus
            ? { source: sourceFilter }
            : {}),
        },
        include: {
          source: { select: { name: true, category: true } },
          _count: { select: { deltas: true } },
        },
        orderBy: { snapshotAt: "desc" },
        take: 20,
      }),

      // 5. Total delta count for the period
      prisma.datasetDelta.count({
        where: {
          detectedAt: { gte: dateCutoff },
          ...(focus
            ? {
                snapshot: {
                  source: sourceFilter,
                },
              }
            : {}),
        },
      }),
    ]);

    // ─── Confidence scoring ──────────────────────────────────
    let sourcesReturned = 0;
    const sourcesQueried = 4;
    if (changeTypeCounts.length > 0) sourcesReturned++;
    if (topChangedEntities.length > 0) sourcesReturned++;
    if (recentCriticalChanges.length > 0) sourcesReturned++;
    if (snapshotSummaries.length > 0) sourcesReturned++;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      sourcesReturned >= 3 ? "HIGH" : sourcesReturned >= 2 ? "MEDIUM" : "LOW";

    // ─── Build intelligence packet ───────────────────────────
    const sections: string[] = [];

    // Header
    const latestDate = snapshotSummaries[0]?.snapshotAt.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    sections.push(
      intelligenceHeader({
        topic: "Dataset Trends",
        subject: query,
        confidence,
        sourcesQueried,
        sourcesReturned,
        vintage: latestDate,
      }),
    );

    // Key Intelligence bullets
    const bullets: string[] = [];
    bullets.push(`- **${formatNumber(totalDeltaCount)}** total changes detected in the last ${timeframe}`);

    const changesByType: Record<string, number> = {};
    for (const ct of changeTypeCounts) {
      changesByType[ct.changeType] = ct._count.id;
    }
    if (Object.keys(changesByType).length > 0) {
      const breakdown = Object.entries(changesByType)
        .map(([type, count]) => `${formatNumber(count)} ${type}`)
        .join(", ");
      bullets.push(`- Change breakdown: ${breakdown}`);
    }

    const uniqueSourceNames = new Set(snapshotSummaries.map((s: typeof snapshotSummaries[number]) => s.source.name));
    bullets.push(`- **${snapshotSummaries.length}** snapshots processed across ${uniqueSourceNames.size} sources`);

    if (recentCriticalChanges.length > 0) {
      bullets.push(`- **${recentCriticalChanges.length}** critical field changes detected (ownership, ratings, financials)`);
    }

    sections.push(`### Key Intelligence\n${bullets.join("\n")}`);

    // Top Changing Entities table
    if (topChangedEntities.length > 0) {
      const entityRows = topChangedEntities.slice(0, 10).map((e: typeof topChangedEntities[number]) => [
        e.entityKey,
        formatNumber(e._count.id),
      ]);
      sections.push(
        `### Most Active Entities\n${markdownTable(["Entity Key", "Changes"], entityRows, 10)}`,
      );
    }

    // Critical Changes table
    if (recentCriticalChanges.length > 0) {
      const criticalHeaders = ["Date", "Source", "Entity", "Field", "Old", "New"];
      const criticalRows = recentCriticalChanges.slice(0, 10).map((d: typeof recentCriticalChanges[number]) => [
        d.detectedAt.toISOString().slice(0, 10),
        d.snapshot.source.name.slice(0, 20),
        d.entityKey.slice(0, 15),
        (d.fieldName ?? "—").slice(0, 20),
        (d.oldValue ?? "\u2014").slice(0, 20),
        (d.newValue ?? "\u2014").slice(0, 20),
      ]);
      sections.push(
        `### Critical Changes\n${markdownTable(criticalHeaders, criticalRows, 10)}`,
      );
    }

    // Temporal Trends — snapshots by source
    if (snapshotSummaries.length > 0) {
      const bySource = new Map<string, { snapshots: number; totalDeltas: number; latestRecords: number }>();
      for (const snap of snapshotSummaries) {
        const existing = bySource.get(snap.source.name) ?? { snapshots: 0, totalDeltas: 0, latestRecords: 0 };
        existing.snapshots++;
        existing.totalDeltas += snap._count.deltas;
        if (existing.latestRecords === 0) existing.latestRecords = snap.recordCount;
        bySource.set(snap.source.name, existing);
      }

      const trendHeaders = ["Source", "Snapshots", "Total Changes", "Latest Records"];
      const trendRows = Array.from(bySource.entries())
        .sort((a, b) => b[1].totalDeltas - a[1].totalDeltas)
        .slice(0, 10)
        .map(([name, stats]) => [
          name.slice(0, 25),
          String(stats.snapshots),
          formatNumber(stats.totalDeltas),
          formatNumber(stats.latestRecords),
        ]);
      sections.push(
        `### Source Activity\n${markdownTable(trendHeaders, trendRows, 10)}`,
      );
    }

    // ─── Citations ───────────────────────────────────────────
    const citations: Citation[] = [
      {
        id: `[DS-TRENDS-${Date.now()}]`,
        source: "Protoprism Dataset Pipeline",
        query,
        dateRange: `${dateCutoff.toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)}`,
        resultCount: totalDeltaCount,
      },
    ];
    sections.push(formatCitations(citations));

    // Assemble and truncate
    const rawContent = sections.join("\n\n");
    const { content, truncated } = truncateToCharBudget(rawContent, LAYER_3_CHAR_BUDGET);

    return {
      content,
      citations,
      vintage: {
        queriedAt: new Date().toISOString(),
        dataThrough: latestDate,
        source: "Protoprism Dataset Pipeline",
      },
      confidence,
      truncated,
    };
  },
};

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Parse a timeframe string (e.g., '7d', '30d', '90d', '1y') into a Date cutoff.
 */
function parseTimeframeCutoff(timeframe: string): Date {
  const now = new Date();
  const match = timeframe.match(/^(\d+)([dmy])$/i);

  if (!match) {
    // Default to 30 days
    now.setDate(now.getDate() - 30);
    return now;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "d":
      now.setDate(now.getDate() - value);
      break;
    case "m":
      now.setMonth(now.getMonth() - value);
      break;
    case "y":
      now.setFullYear(now.getFullYear() - value);
      break;
    default:
      now.setDate(now.getDate() - 30);
  }

  return now;
}
