// src/lib/data-sources/tools/dataset-query.tools.ts
/**
 * Dataset Query Layer 2 Granular Tools
 *
 * Two tools for querying the dataset snapshot-and-diff pipeline:
 * - search_dataset_deltas: query DatasetDelta records by entity/changeType/date/source
 * - query_cms_data: query latest DatasetSnapshot metadata for a dataset source
 *
 * Both use lazy Prisma imports to avoid build-time database coupling.
 */

import type { DataSourceTool, ToolResult, ToolCache } from "../types";
import { MAX_TABLE_ROWS_LAYER_2 } from "../types";
import {
  markdownTable,
  formatCitations,
  formatNumber,
  formatDate,
} from "../format";

// ─── search_dataset_deltas ────────────────────────────────────

const searchDatasetDeltas: DataSourceTool = {
  name: "search_dataset_deltas",
  description:
    "Search detected changes (deltas) across government dataset snapshots. " +
    "Query by entity key, change type (added/removed/modified), dataset source, " +
    "or date range. Returns a markdown table of matching changes with old/new values.",
  inputSchema: {
    type: "object",
    properties: {
      entity_key: {
        type: "string",
        description: "Entity key to search for (e.g., NPI, Facility ID, Provider CCN)",
      },
      change_type: {
        type: "string",
        enum: ["added", "removed", "modified"],
        description: "Filter by change type",
      },
      source_name: {
        type: "string",
        description: "Dataset source name filter (partial match, e.g., 'Star Ratings', 'PECOS')",
      },
      field_name: {
        type: "string",
        description: "Specific field to filter changes by (e.g., 'Overall Rating', 'State')",
      },
      date_from: {
        type: "string",
        description: "Start date for changes (ISO format, e.g., '2024-01-01')",
      },
      date_to: {
        type: "string",
        description: "End date for changes (ISO format, e.g., '2024-12-31')",
      },
      limit: {
        type: "number",
        description: "Max results to return (default 20, max 100)",
      },
    },
  },
  layer: 2,
  sources: ["dataset-deltas"],
  routingTags: ["dataset", "government", "monitoring", "change-detection"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const { prisma } = await import("@/lib/prisma");

    const limit = Math.min((input.limit as number | undefined) ?? 20, 100);
    const entityKey = input.entity_key as string | undefined;
    const changeType = input.change_type as string | undefined;
    const sourceName = input.source_name as string | undefined;
    const fieldName = input.field_name as string | undefined;
    const dateFrom = input.date_from as string | undefined;
    const dateTo = input.date_to as string | undefined;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (entityKey) {
      where.entityKey = { contains: entityKey, mode: "insensitive" };
    }
    if (changeType) {
      where.changeType = changeType;
    }
    if (fieldName) {
      where.fieldName = { contains: fieldName, mode: "insensitive" };
    }

    // Date range filter
    if (dateFrom || dateTo) {
      const detectedAt: Record<string, Date> = {};
      if (dateFrom) detectedAt.gte = new Date(dateFrom);
      if (dateTo) detectedAt.lte = new Date(dateTo);
      where.detectedAt = detectedAt;
    }

    // Source name filter — requires joining through snapshot -> source
    if (sourceName) {
      where.snapshot = {
        source: {
          name: { contains: sourceName, mode: "insensitive" },
        },
      };
    }

    // Query with related data
    const [deltas, totalCount] = await Promise.all([
      prisma.datasetDelta.findMany({
        where,
        include: {
          snapshot: {
            include: {
              source: { select: { name: true, category: true, entityKeyField: true } },
            },
          },
        },
        orderBy: { detectedAt: "desc" },
        take: limit,
      }),
      prisma.datasetDelta.count({ where }),
    ]);

    if (deltas.length === 0) {
      const queryDesc = entityKey ?? sourceName ?? changeType ?? "all";
      return {
        content: `## Dataset Deltas: ${queryDesc}\n\nNo changes found matching the specified filters.`,
        citations: [],
        vintage: { queriedAt: new Date().toISOString(), source: "Protoprism Dataset Pipeline" },
        confidence: "LOW",
        truncated: false,
      };
    }

    // Format as markdown table
    const headers = ["Date", "Source", "Entity", "Change", "Field", "Old Value", "New Value"];
    const rows = deltas.map((d: typeof deltas[number]) => [
      formatDate(d.detectedAt.toISOString()),
      d.snapshot.source.name.slice(0, 25),
      d.entityKey.slice(0, 20),
      d.changeType,
      (d.fieldName ?? "—").slice(0, 25),
      (d.oldValue ?? "\u2014").slice(0, 30),
      (d.newValue ?? "\u2014").slice(0, 30),
    ]);

    const table = markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, totalCount);
    const queryDesc = entityKey ?? sourceName ?? changeType ?? "all";

    // Summary stats
    const addedCount = deltas.filter((d: typeof deltas[number]) => d.changeType === "added").length;
    const removedCount = deltas.filter((d: typeof deltas[number]) => d.changeType === "removed").length;
    const modifiedCount = deltas.filter((d: typeof deltas[number]) => d.changeType === "modified").length;

    const summaryLine =
      `**${formatNumber(totalCount)} total changes** ` +
      `(showing ${deltas.length}: ${addedCount} added, ${removedCount} removed, ${modifiedCount} modified)`;

    const citation = {
      id: `[DS-DELTA-${Date.now()}]`,
      source: "Protoprism Dataset Pipeline",
      query: queryDesc,
      resultCount: totalCount,
    };

    return {
      content: `## Dataset Deltas: ${queryDesc}\n\n${summaryLine}\n\n${table}\n\n${formatCitations([citation])}`,
      citations: [citation],
      vintage: {
        queriedAt: new Date().toISOString(),
        dataThrough: deltas[0]?.detectedAt.toISOString().slice(0, 10),
        source: "Protoprism Dataset Pipeline",
      },
      confidence: totalCount > 0 ? "HIGH" : "MEDIUM",
      truncated: deltas.length < totalCount,
    };
  },
};

// ─── query_cms_data ───────────────────────────────────────────

const queryCmsData: DataSourceTool = {
  name: "query_cms_data",
  description:
    "Query the latest snapshot metadata for a government dataset source. " +
    "Returns record counts, snapshot dates, recent change summaries, and " +
    "source configuration details. Use this to understand what data is " +
    "available and when it was last updated.",
  inputSchema: {
    type: "object",
    properties: {
      source_name: {
        type: "string",
        description: "Dataset source name (partial match, e.g., 'Star Ratings', 'CHOW', 'NDC')",
      },
      category: {
        type: "string",
        description: "Dataset category filter (e.g., 'cms', 'fda', 'dea')",
      },
      include_deltas: {
        type: "boolean",
        description: "Include recent change summary in response (default true)",
      },
    },
  },
  layer: 2,
  sources: ["dataset-snapshots"],
  routingTags: ["cms", "government", "payer", "provider", "dataset"],

  handler: async (input: Record<string, unknown>, _cache: ToolCache): Promise<ToolResult> => {
    const { prisma } = await import("@/lib/prisma");

    const sourceName = input.source_name as string | undefined;
    const category = input.category as string | undefined;
    const includeDeltas = (input.include_deltas as boolean | undefined) ?? true;

    // Build where clause
    const where: Record<string, unknown> = { enabled: true };
    if (sourceName) {
      where.name = { contains: sourceName, mode: "insensitive" };
    }
    if (category) {
      where.category = { equals: category, mode: "insensitive" };
    }

    // Query sources with their latest snapshot
    const sources = await prisma.datasetSource.findMany({
      where,
      include: {
        snapshots: {
          orderBy: { snapshotAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
      take: 20,
    });

    if (sources.length === 0) {
      const queryDesc = sourceName ?? category ?? "all";
      return {
        content: `## Dataset Sources: ${queryDesc}\n\nNo dataset sources found matching the specified filters.`,
        citations: [],
        vintage: { queriedAt: new Date().toISOString(), source: "Protoprism Dataset Pipeline" },
        confidence: "LOW",
        truncated: false,
      };
    }

    const sections: string[] = [];
    const queryDesc = sourceName ?? category ?? "all";
    sections.push(`## Dataset Sources: ${queryDesc}\n\n**${sources.length} sources found**`);

    // Source summary table
    const headers = ["Source", "Category", "Format", "Records", "Last Snapshot", "Schedule"];
    const rows = sources.map((s: typeof sources[number]) => {
      const latest = s.snapshots[0];
      return [
        s.name.slice(0, 30),
        s.category,
        s.format,
        latest ? formatNumber(latest.recordCount) : "\u2014",
        latest ? formatDate(latest.snapshotAt.toISOString()) : "Never",
        s.pollSchedule,
      ];
    });
    sections.push(markdownTable(headers, rows, MAX_TABLE_ROWS_LAYER_2, sources.length));

    // Per-source detail with recent deltas
    if (includeDeltas) {
      for (const source of sources.slice(0, 5)) {
        const latest = source.snapshots[0];
        if (!latest) continue;

        const recentDeltas = await prisma.datasetDelta.groupBy({
          by: ["changeType"],
          where: { snapshotId: latest.id },
          _count: { id: true },
        });

        if (recentDeltas.length > 0) {
          const deltaSummary = recentDeltas
            .map((d: typeof recentDeltas[number]) => `${d._count.id} ${d.changeType}`)
            .join(", ");
          sections.push(
            `### ${source.name}\n` +
            `- **Entity Key**: ${source.entityKeyField}\n` +
            `- **Tracked Fields**: ${source.compareFields.join(", ")}\n` +
            `- **Latest Snapshot**: ${formatNumber(latest.recordCount)} records ` +
            `(${formatDate(latest.snapshotAt.toISOString())})\n` +
            `- **Recent Changes**: ${deltaSummary}`,
          );
        }
      }
    }

    const citation = {
      id: `[DS-META-${Date.now()}]`,
      source: "Protoprism Dataset Pipeline",
      query: queryDesc,
      resultCount: sources.length,
    };
    sections.push(formatCitations([citation]));

    return {
      content: sections.join("\n\n"),
      citations: [citation],
      vintage: {
        queriedAt: new Date().toISOString(),
        source: "Protoprism Dataset Pipeline",
      },
      confidence: sources.length > 0 ? "HIGH" : "MEDIUM",
      truncated: false,
    };
  },
};

// ─── Export ───────────────────────────────────────────────────

export const datasetQueryTools: DataSourceTool[] = [searchDatasetDeltas, queryCmsData];
