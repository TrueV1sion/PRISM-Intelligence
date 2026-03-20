/**
 * Dataset Snapshot Downloader
 *
 * Orchestrates the snapshot-and-diff pipeline:
 * 1. Seed/sync DatasetSource records from DATASET_REGISTRY
 * 2. Download dataset files from government APIs
 * 3. Upload raw data to Vercel Blob via storage wrapper
 * 4. Create DatasetSnapshot records in Prisma
 * 5. Diff against previous snapshot to create DatasetDelta records
 */

import { uploadDatasetSnapshot } from "@/lib/storage/blob";
import { DATASET_REGISTRY, type DatasetSourceConfig } from "./registry";
import { indexSnapshot, parseCSV, parseJSON } from "./indexer";
import { diffSnapshots, summarizeDeltas } from "./differ";

// ─── Lazy Prisma Import ───────────────────────────────────────

// Lazy-load to avoid importing Prisma at module evaluation time
// (breaks in environments where the DB isn't available, e.g. build)
async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

// ─── Types ────────────────────────────────────────────────────

interface SnapshotResult {
  snapshotId: string;
  recordCount: number;
  deltaCount: number;
}

interface BatchResult {
  processed: number;
  snapshots: number;
  errors: string[];
}

// ─── Seed / Sync Sources ──────────────────────────────────────

/**
 * Ensure all DATASET_REGISTRY entries exist as DatasetSource records.
 * Uses upsert to be idempotent — safe to call on every cron run.
 */
async function seedSources(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
): Promise<Map<string, string>> {
  const urlToId = new Map<string, string>();

  for (const config of DATASET_REGISTRY) {
    const source = await prisma.datasetSource.upsert({
      where: { url: config.url },
      create: {
        url: config.url,
        name: config.name,
        format: config.format,
        category: config.category,
        entityKeyField: config.entityKeyField,
        compareFields: config.compareFields,
        pollSchedule: config.pollSchedule,
        enabled: true,
      },
      update: {
        name: config.name,
        format: config.format,
        category: config.category,
        entityKeyField: config.entityKeyField,
        compareFields: config.compareFields,
        pollSchedule: config.pollSchedule,
      },
    });
    urlToId.set(config.url, source.id);
  }

  return urlToId;
}

// ─── Download Helper ──────────────────────────────────────────

/**
 * Download a dataset file from a URL. Returns the raw buffer.
 * Applies a generous timeout since government APIs can be slow.
 */
async function downloadFile(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Protoprism-DataPipeline/1.0 (government-dataset-monitor)",
        Accept: "text/csv, application/json, application/octet-stream",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Parse Records ────────────────────────────────────────────

/**
 * Parse a downloaded buffer into records based on the source format.
 */
function parseRecords(
  buffer: Buffer,
  config: DatasetSourceConfig,
): Record<string, unknown>[] {
  const content = buffer.toString("utf-8");

  switch (config.format) {
    case "csv":
      return parseCSV(content);
    case "json":
      return parseJSON(content);
    case "xlsx":
      // XLSX parsing requires a library (e.g., xlsx or exceljs).
      // For now, log a warning and return empty — XLSX sources
      // will be enabled when the dependency is added.
      console.warn(`[datasets] XLSX parsing not yet implemented for ${config.name}`);
      return [];
    default:
      throw new Error(`Unsupported format: ${config.format}`);
  }
}

// ─── Single Dataset Snapshot ──────────────────────────────────

/**
 * Download, snapshot, and diff a single dataset source.
 * Creates a DatasetSnapshot record and, if a previous snapshot exists,
 * generates DatasetDelta records for all detected changes.
 */
export async function downloadAndSnapshot(sourceId: string): Promise<SnapshotResult> {
  const prisma = await getPrisma();

  // Load the source
  const source = await prisma.datasetSource.findUniqueOrThrow({
    where: { id: sourceId },
    include: {
      snapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 1,
      },
    },
  });

  // Find matching config for format/parse info
  const config = DATASET_REGISTRY.find((c) => c.url === source.url);
  if (!config) {
    throw new Error(`No registry config found for source ${source.name} (${source.url})`);
  }

  // Download
  const buffer = await downloadFile(source.url);
  const records = parseRecords(buffer, config);
  const snapshotAt = new Date();

  // Upload to blob storage
  const uploadResult = await uploadDatasetSnapshot(sourceId, buffer, {
    sourceName: source.name,
    format: source.format,
    recordCount: records.length,
    snapshotAt: snapshotAt.toISOString(),
  });

  // Create snapshot record
  const snapshot = await prisma.datasetSnapshot.create({
    data: {
      sourceId,
      blobUrl: uploadResult.blobUrl,
      recordCount: records.length,
      sizeBytes: uploadResult.sizeBytes,
      snapshotAt,
    },
  });

  // Update source polling timestamp
  await prisma.datasetSource.update({
    where: { id: sourceId },
    data: { lastPolledAt: snapshotAt, lastError: null },
  });

  // Diff against previous snapshot if one exists
  let deltaCount = 0;
  const previousSnapshot = source.snapshots[0];

  if (previousSnapshot) {
    deltaCount = await diffAgainstPrevious(
      prisma,
      snapshot.id,
      previousSnapshot.blobUrl,
      buffer,
      config,
      source.entityKeyField,
      source.compareFields,
    );
  }

  return {
    snapshotId: snapshot.id,
    recordCount: records.length,
    deltaCount,
  };
}

// ─── Diff Against Previous ────────────────────────────────────

/**
 * Download the previous snapshot from blob storage, index both snapshots,
 * run the diff engine, and persist delta records.
 */
async function diffAgainstPrevious(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  snapshotId: string,
  previousBlobUrl: string,
  currentBuffer: Buffer,
  config: DatasetSourceConfig,
  entityKeyField: string,
  compareFields: string[],
): Promise<number> {
  // Download previous snapshot from blob
  let previousBuffer: Buffer;
  try {
    const response = await fetch(previousBlobUrl);
    if (!response.ok) {
      console.warn(`[datasets] Could not fetch previous snapshot: ${response.status}`);
      return 0;
    }
    const arrayBuffer = await response.arrayBuffer();
    previousBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    console.warn(`[datasets] Error fetching previous snapshot: ${err}`);
    return 0;
  }

  // Parse and index both snapshots
  const previousRecords = parseRecords(previousBuffer, config);
  const currentRecords = parseRecords(currentBuffer, config);

  const previousIndex = indexSnapshot(previousRecords, entityKeyField, compareFields);
  const currentIndex = indexSnapshot(currentRecords, entityKeyField, compareFields);

  // Run diff
  const deltas = diffSnapshots(previousIndex.index, currentIndex.index, compareFields);

  if (deltas.length === 0) return 0;

  // Log summary
  const summary = summarizeDeltas(deltas);
  console.log(
    `[datasets] ${config.name}: ${summary.added} added, ${summary.removed} removed, ` +
    `${summary.modified} modified across ${summary.uniqueEntities} entities`,
  );

  // Persist deltas in batches to avoid hitting Prisma's query parameter limit
  const DELTA_BATCH_SIZE = 500;
  const now = new Date();

  for (let i = 0; i < deltas.length; i += DELTA_BATCH_SIZE) {
    const batch = deltas.slice(i, i + DELTA_BATCH_SIZE);
    await prisma.datasetDelta.createMany({
      data: batch.map((d) => ({
        snapshotId,
        changeType: d.changeType,
        entityKey: d.entityKey,
        fieldName: d.fieldName,
        oldValue: d.oldValue,
        newValue: d.newValue,
        detectedAt: now,
      })),
    });
  }

  return deltas.length;
}

// ─── Batch Snapshot All Datasets ──────────────────────────────

/**
 * Snapshot all enabled datasets. Intended to be called from a cron job.
 * Seeds/syncs DatasetSource records, then processes each enabled source
 * sequentially (to avoid overwhelming government APIs).
 *
 * Returns processing statistics for observability.
 */
export async function snapshotAllDatasets(): Promise<BatchResult> {
  const prisma = await getPrisma();
  const result: BatchResult = { processed: 0, snapshots: 0, errors: [] };

  // Seed/sync sources from registry
  await seedSources(prisma);

  // Get all enabled sources
  const sources = await prisma.datasetSource.findMany({
    where: { enabled: true },
    orderBy: { lastPolledAt: "asc" }, // Process least-recently-polled first
  });

  for (const source of sources) {
    result.processed++;

    // Check if this source is due for polling based on schedule
    if (source.lastPolledAt && !isDueForPoll(source.lastPolledAt, source.pollSchedule)) {
      continue;
    }

    try {
      const snapshotResult = await downloadAndSnapshot(source.id);
      result.snapshots++;
      console.log(
        `[datasets] Snapshot complete: ${source.name} — ` +
        `${snapshotResult.recordCount} records, ${snapshotResult.deltaCount} deltas`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${source.name}: ${message}`);
      console.error(`[datasets] Error processing ${source.name}:`, message);

      // Record error on the source for observability
      await prisma.datasetSource.update({
        where: { id: source.id },
        data: { lastError: message.slice(0, 500) },
      }).catch(() => {
        // Ignore error update failures — don't cascade
      });
    }
  }

  return result;
}

// ─── Schedule Helpers ─────────────────────────────────────────

/**
 * Check if a source is due for polling based on its schedule and last poll time.
 */
function isDueForPoll(lastPolledAt: Date, schedule: string): boolean {
  const now = Date.now();
  const elapsed = now - lastPolledAt.getTime();
  const ONE_HOUR = 60 * 60 * 1000;

  switch (schedule) {
    case "daily":
      return elapsed >= 23 * ONE_HOUR; // 23h to allow for clock drift
    case "weekly":
      return elapsed >= 6.5 * 24 * ONE_HOUR; // 6.5 days
    case "monthly":
      return elapsed >= 28 * 24 * ONE_HOUR; // 28 days
    case "quarterly":
      return elapsed >= 85 * 24 * ONE_HOUR; // ~3 months
    default:
      return elapsed >= 7 * 24 * ONE_HOUR; // Default weekly
  }
}
