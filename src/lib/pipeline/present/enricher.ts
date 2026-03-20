import type { CapturedToolCall } from "./data-capture";
import type {
  DatasetRegistry,
  EnrichedDataset,
  ComputedMetrics,
  DensityTier,
  DataRegistryPoint,
} from "./types";
import { getExtractor } from "./enricher-extractors";

const PRIMARY_SOURCES = ["SEC", "CMS", "BLS", "FDA", "Census", "ClinicalTrials.gov"];

export function enrichToolCalls(
  runId: string,
  capturedCalls: CapturedToolCall[],
): DatasetRegistry {
  const datasets: EnrichedDataset[] = [];
  let idCounter = 0;

  for (const call of capturedCalls) {
    const parsed = parseCapturedResponse(call);
    if (!parsed) {
      continue;
    }

    const extractor = getExtractor(call.mcpServer, call.toolName);
    const metrics = extractor(call.toolName, call.toolParams, parsed);

    for (const metric of metrics) {
      const computed = computeMetrics(metric.values);
      const densityTier = getDensityTier(metric.values.length);
      const dataset: EnrichedDataset = {
        id: `enriched_${runId}_${++idCounter}`,
        // NOTE: In-memory enrichment uses a synthetic ID. When persisting to Postgres
        // in Task 11, replace with the actual ToolCallLog.id (cuid) from the DB insert.
        sourceCallId: `${call.mcpServer}:${call.toolName}:${call.capturedAt.toISOString()}`,
        metricName: metric.metricName,
        dataShape: metric.dataShape,
        densityTier,
        values: metric.values,
        computed,
        sourceLabel: metric.sourceLabel,
        chartWorthiness: scoreChartWorthiness({
          values: metric.values,
          computed,
          dataShape: metric.dataShape,
          sourceLabel: metric.sourceLabel,
        }),
      };
      datasets.push(dataset);
    }
  }

  // NOTE: Entity resolution is not yet implemented. The entities array
  // will be populated in a future iteration when EntityRegistry lookup is added.
  return { runId, datasets, entities: [] };
}

function parseCapturedResponse(call: CapturedToolCall): unknown {
  if (call.structuredData !== undefined) {
    return normalizeParsedResponse(call.structuredData);
  }

  try {
    return normalizeParsedResponse(JSON.parse(call.rawResponse));
  } catch {
    return parseMarkdownTables(call.rawResponse);
  }
}

function normalizeParsedResponse(parsed: unknown): unknown {
  if (Array.isArray(parsed)) {
    return { results: parsed };
  }
  return parsed;
}

function parseMarkdownTables(raw: string): Record<string, Array<Record<string, unknown>>> | null {
  if (typeof raw !== "string" || !raw.includes("|")) return null;

  const lines = raw.split(/\r?\n/);
  const tables: Record<string, Array<Record<string, unknown>>> = {};
  let tableIndex = 0;

  for (let i = 0; i < lines.length - 1; i++) {
    const headerLine = lines[i]?.trim();
    const separatorLine = lines[i + 1]?.trim();
    if (!headerLine || !separatorLine) continue;
    if (!headerLine.includes("|")) continue;
    if (!/^\|?[\s:-]+\|[\s|:-]*$/.test(separatorLine)) continue;

    const headers = splitMarkdownRow(headerLine).map(normalizeHeader);
    if (headers.length < 2) continue;

    const labelIndex = headers.findIndex(isLabelHeader);
    const rawRows: string[][] = [];
    let rowCursor = i + 2;

    while (rowCursor < lines.length && lines[rowCursor]?.includes("|")) {
      const cells = splitMarkdownRow(lines[rowCursor] ?? "");
      if (cells.length === 0) break;
      if (cells.length !== headers.length) {
        rowCursor++;
        continue;
      }
      rawRows.push(cells);
      rowCursor++;
    }

    const valueIndex = selectValueColumn(headers, rawRows);
    if (valueIndex === -1) {
      i = rowCursor - 1;
      continue;
    }

    const rows = rawRows.reduce<Array<Record<string, unknown>>>((acc, cells, rowIndex) => {
        const value = parseNumeric(cells[valueIndex]);
        if (value === null) return acc;
        const labelCell =
          labelIndex >= 0 ? cells[labelIndex] : cells.find((_cell, idx) => idx !== valueIndex);
        acc.push({
          label: labelCell || `Row ${rowIndex + 1}`,
          period: labelCell || `Row ${rowIndex + 1}`,
          value,
        });
        return acc;
      }, []);

    if (rows.length >= 2) {
      tables[`table_${tableIndex++}`] = rows;
    }

    i = rowCursor - 1;
  }

  return Object.keys(tables).length > 0 ? tables : null;
}

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cell => cell.trim());
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function isNumericHeader(header: string): boolean {
  return ["value", "count", "amount", "total", "pct", "percent", "percentage"].some(
    token => header.includes(token),
  );
}

function isLabelHeader(header: string): boolean {
  return ["year", "period", "date", "quarter", "month", "label", "name", "term", "category"].some(
    token => header.includes(token),
  );
}

function parseNumeric(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[$,%\s]/g, "").replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function selectValueColumn(headers: string[], rows: string[][]): number {
  let bestIndex = -1;
  let bestScore = -1;

  for (let col = 0; col < headers.length; col++) {
    const numericMatches = rows.reduce((count, row) => {
      return count + (parseNumeric(row[col]) !== null ? 1 : 0);
    }, 0);

    if (numericMatches < 2) continue;

    const score = numericMatches + (isNumericHeader(headers[col] ?? "") ? 2 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = col;
    }
  }

  return bestIndex;
}

function computeMetrics(values: DataRegistryPoint[]): ComputedMetrics {
  const nums = values.map(v => v.value);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;

  const result: ComputedMetrics = { min, max, mean };

  // Trend detection
  if (nums.length >= 3) {
    const firstHalf = nums.slice(0, Math.floor(nums.length / 2));
    const secondHalf = nums.slice(Math.floor(nums.length / 2));
    const firstAvg = firstHalf.reduce((s, n) => s + n, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, n) => s + n, 0) / secondHalf.length;
    const delta = (secondAvg - firstAvg) / Math.abs(firstAvg || 1);
    result.trend = delta > 0.02 ? "up" : delta < -0.02 ? "down" : "flat";
  }

  // CAGR (compound annual growth rate)
  if (nums.length >= 2 && nums[0] > 0 && nums[nums.length - 1] > 0) {
    const years = nums.length - 1;
    result.cagr = Math.pow(nums[nums.length - 1] / nums[0], 1 / years) - 1;
  }

  // YoY growth (last two values)
  if (nums.length >= 2 && nums[nums.length - 2] > 0) {
    result.yoyGrowth = (nums[nums.length - 1] - nums[nums.length - 2]) / nums[nums.length - 2];
  }

  return result;
}

function getDensityTier(pointCount: number): DensityTier {
  if (pointCount <= 3) return "sparse";
  if (pointCount <= 7) return "medium";
  return "dense";
}

function scoreChartWorthiness(dataset: {
  values: DataRegistryPoint[];
  computed: ComputedMetrics;
  dataShape: string;
  sourceLabel: string;
}): number {
  let score = 0;

  // Data richness: more points = richer visualization (max 30)
  score += Math.min(dataset.values.length * 5, 30);

  // Clear trend = more compelling
  if (dataset.computed.trend === "up" || dataset.computed.trend === "down") {
    score += 20;
  }

  // Large magnitudes are impressive
  const maxValue = Math.max(...dataset.values.map(v => v.value));
  if (maxValue > 1_000_000) score += 10;

  // Computed metrics available = richer callouts
  score += Object.keys(dataset.computed).filter(k =>
    dataset.computed[k as keyof ComputedMetrics] !== undefined
  ).length * 3;

  // Ideal donut: 4-8 segments in a composition
  if (dataset.dataShape === "composition" &&
      dataset.values.length >= 4 && dataset.values.length <= 8) {
    score += 15;
  }

  // Primary source data scores higher
  const isPrimarySource = PRIMARY_SOURCES.some(s => dataset.sourceLabel.includes(s));
  if (isPrimarySource) score += 10;

  return score;
}
