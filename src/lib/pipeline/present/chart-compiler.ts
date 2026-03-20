import type {
  DataPoint,
  ChartData,
  ChartRole,
  DonutChartData,
  DonutSegment,
  BarChartData,
  SparklineData,
  CounterData,
  HorizontalBarData,
  LineChartData,
  EnrichedDataset,
} from "./types";

/**
 * PRISM Design-System Chart Colors — hex values that match CSS design tokens.
 * Used directly in ECharts configs (ECharts accepts hex natively).
 */
const CHART_HEX = [
  "#00d4ff", // --chart-1  cyan
  "#7c5cfc", // --chart-2  purple
  "#00e68a", // --chart-3  green
  "#ff6b6b", // --chart-4  red
  "#ffbe0b", // --chart-5  yellow
  "#ff7eb3", // --chart-6  pink
  "#4ecdc4", // --chart-7  teal
  "#a78bfa", // --chart-8  lavender
];

/** PRISM dark theme constants for ECharts configs */
const THEME = {
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  textPrimary: "hsl(210, 30%, 88%)",
  textSecondary: "hsl(210, 20%, 62%)",
  textMuted: "hsl(210, 15%, 45%)",
  gridColor: "rgba(78, 132, 196, 0.12)",
  splitLineColor: "rgba(78, 132, 196, 0.08)",
  bgTransparent: "transparent",
};

let chartIdCounter = 0;

function nextChartId(): string {
  return `prism-echart-${++chartIdCounter}`;
}

/**
 * Escape a JSON config string for safe embedding in an HTML data attribute.
 */
function toDataAttr(config: Record<string, unknown>): string {
  return JSON.stringify(config)
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function compileCharts(dataPoints: DataPoint[]): ChartData[] {
  const results: ChartData[] = [];

  const groups = new Map<string, DataPoint[]>();
  for (const pt of dataPoints) {
    const existing = groups.get(pt.chartRole) ?? [];
    existing.push(pt);
    groups.set(pt.chartRole, existing);
  }

  const donutPoints = groups.get("donut-segment");
  if (donutPoints?.length) results.push(compileDonut(donutPoints));

  const barPoints = groups.get("bar-value");
  if (barPoints?.length) results.push(compileBar(barPoints));

  const sparkPoints = groups.get("sparkline-point");
  if (sparkPoints?.length) results.push(compileSparkline(sparkPoints));

  const counterPoints = groups.get("counter-target");
  if (counterPoints?.length) {
    for (const pt of counterPoints) results.push(compileCounter(pt));
  }

  const linePoints = groups.get("line-point");
  if (linePoints?.length) results.push(compileLine(linePoints));

  const hbarPoints = groups.get("bar-fill-percent");
  if (hbarPoints?.length) results.push(compileHorizontalBar(hbarPoints));

  return results;
}

export function compileChartFromDataset(
  dataset: EnrichedDataset,
  chartType: string,
): ChartData {
  const dataPoints: DataPoint[] = dataset.values.map(v => ({
    label: v.period,
    value: v.value,
    chartRole: mapChartTypeToRole(chartType),
  }));

  const compiled = compileCharts(dataPoints);
  if (compiled.length === 0) {
    throw new Error(`Failed to compile ${chartType} chart from dataset ${dataset.id}`);
  }
  return compiled[0];
}

function mapChartTypeToRole(chartType: string): ChartRole {
  switch (chartType) {
    case "line": return "line-point";
    case "donut": return "donut-segment";
    case "bar": return "bar-value";
    case "sparkline": return "sparkline-point";
    case "counter": return "counter-target";
    case "horizontal-bar": return "bar-fill-percent";
    default: return "bar-value";
  }
}

// ─── ECharts Config Generators ───────────────────────────────────────────────

function compileDonut(points: DataPoint[]): DonutChartData {
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const chartId = nextChartId();

  const segments: DonutSegment[] = points.map((pt, i) => ({
    label: pt.label,
    percentage: +(pt.value / total * 100).toFixed(1),
    dashArray: "",  // legacy — not used with ECharts
    dashOffset: "",
    color: CHART_HEX[i % CHART_HEX.length],
  }));

  const option = {
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(10, 18, 30, 0.95)",
      borderColor: "rgba(78, 132, 196, 0.3)",
      borderWidth: 1,
      textStyle: {
        color: THEME.textPrimary,
        fontFamily: THEME.fontFamily,
        fontSize: 13,
      },
      formatter: "{b}: {c} ({d}%)",
    },
    series: [{
      type: "pie",
      radius: ["55%", "80%"],
      center: ["50%", "50%"],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 6,
        borderColor: "rgba(10, 18, 30, 0.8)",
        borderWidth: 3,
      },
      label: { show: false },
      emphasis: {
        scale: true,
        scaleSize: 8,
        itemStyle: {
          shadowBlur: 20,
          shadowColor: "rgba(0, 212, 255, 0.3)",
        },
      },
      animationType: "scale",
      animationEasing: "elasticOut",
      animationDuration: 1400,
      animationDelay: 200,
      data: points.map((pt, i) => ({
        name: pt.label,
        value: pt.value,
        itemStyle: { color: CHART_HEX[i % CHART_HEX.length] },
      })),
    }],
  };

  const legendItems = segments.map(s =>
    `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span> ${s.label} (${s.percentage}%)</div>`
  ).join("\n      ");

  const svgFragment = `<div class="chart-with-legend" style="display:flex;align-items:center;gap:2rem">
  <div data-echart='${toDataAttr(option)}' id="${chartId}" style="width:220px;height:220px;flex-shrink:0"></div>
  <div class="chart-legend">
      ${legendItems}
  </div>
</div>`;

  return {
    type: "donut",
    segments,
    circumference: 2 * Math.PI * 80,
    svgFragment,
  };
}

function compileBar(points: DataPoint[]): BarChartData {
  const chartId = nextChartId();
  const maxValue = Math.max(...points.map(p => p.value));

  const option = {
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(10, 18, 30, 0.95)",
      borderColor: "rgba(78, 132, 196, 0.3)",
      borderWidth: 1,
      textStyle: {
        color: THEME.textPrimary,
        fontFamily: THEME.fontFamily,
        fontSize: 13,
      },
      axisPointer: {
        type: "shadow",
        shadowStyle: { color: "rgba(0, 212, 255, 0.05)" },
      },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "8%",
      top: "12%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: points.map(p => p.label),
      axisLine: { lineStyle: { color: THEME.gridColor } },
      axisTick: { show: false },
      axisLabel: {
        color: THEME.textSecondary,
        fontFamily: THEME.fontFamily,
        fontSize: 11,
        rotate: points.some(p => p.label.length > 12) ? 30 : 0,
      },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: THEME.splitLineColor, type: "dashed" } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: THEME.textMuted,
        fontFamily: THEME.fontFamily,
        fontSize: 11,
      },
    },
    series: [{
      type: "bar",
      barMaxWidth: 40,
      itemStyle: {
        borderRadius: [6, 6, 0, 0],
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 12,
          shadowColor: "rgba(0, 212, 255, 0.25)",
        },
      },
      animationDuration: 1200,
      animationEasing: "cubicOut",
      animationDelay: (idx: number) => idx * 100,
      data: points.map((pt, i) => ({
        value: pt.value,
        itemStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: CHART_HEX[i % CHART_HEX.length] },
              { offset: 1, color: CHART_HEX[i % CHART_HEX.length] + "88" },
            ],
          },
        },
      })),
    }],
  };

  const bars = points.map((pt, i) => {
    const heightRatio = maxValue > 0 ? pt.value / maxValue : 0;
    return {
      label: pt.label,
      value: pt.value,
      height: +(heightRatio * 150).toFixed(2),
      y: +(160 - heightRatio * 150).toFixed(2),
      color: CHART_HEX[i % CHART_HEX.length],
    };
  });

  const svgFragment = `<div class="chart-container" style="max-width:500px;margin:0 auto">
  <div data-echart='${toDataAttr(option)}' id="${chartId}" style="width:100%;height:280px"></div>
</div>`;

  return { type: "bar", bars, svgFragment };
}

function compileSparkline(points: DataPoint[]): SparklineData {
  const chartId = nextChartId();

  const option = {
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: "category", show: false, data: points.map(p => p.label) },
    yAxis: { type: "value", show: false },
    series: [{
      type: "line",
      data: points.map(p => p.value),
      smooth: 0.4,
      symbol: "none",
      lineStyle: { width: 2, color: "#00d4ff" },
      areaStyle: {
        color: {
          type: "linear",
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: "rgba(0, 212, 255, 0.15)" },
            { offset: 1, color: "rgba(0, 212, 255, 0)" },
          ],
        },
      },
      animationDuration: 1000,
      animationEasing: "cubicOut",
    }],
    tooltip: { show: false },
  };

  const svgFragment = `<div class="sparkline-container" style="max-width:120px">
  <div data-echart='${toDataAttr(option)}' id="${chartId}" style="width:120px;height:36px"></div>
</div>`;

  // Legacy coordinate string for type compatibility
  const values = points.map(p => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const coordPairs = points.map((pt, i) => {
    const x = +(4 + (i / (points.length - 1)) * 72).toFixed(2);
    const y = +(3 + (1 - (pt.value - minVal) / range) * 18).toFixed(2);
    return `${x},${y}`;
  });

  return {
    type: "sparkline",
    points: coordPairs.join(" "),
    endX: 76,
    endY: 3,
    svgFragment,
  };
}

function compileCounter(pt: DataPoint): CounterData {
  const colorClass = "cyan";
  const prefix = pt.prefix ?? "";
  const suffix = pt.unit ?? "";

  const dataPrefixAttr = prefix ? ` data-prefix="${prefix}"` : "";
  const dataSuffixAttr = suffix ? ` data-suffix="${suffix}"` : "";

  const htmlFragment = `<span class="stat-number ${colorClass}" data-target="${pt.value}"${dataPrefixAttr}${dataSuffixAttr}>${prefix}${pt.value}${suffix}</span>`;

  return {
    type: "counter",
    target: pt.value,
    prefix: prefix || undefined,
    suffix: suffix || undefined,
    colorClass,
    htmlFragment,
  };
}

function compileLine(points: DataPoint[]): LineChartData {
  const chartId = nextChartId();

  const option = {
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(10, 18, 30, 0.95)",
      borderColor: "rgba(78, 132, 196, 0.3)",
      borderWidth: 1,
      textStyle: {
        color: THEME.textPrimary,
        fontFamily: THEME.fontFamily,
        fontSize: 13,
      },
      axisPointer: {
        type: "cross",
        crossStyle: { color: THEME.gridColor },
        lineStyle: { color: "#00d4ff", width: 1, type: "dashed" },
      },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "8%",
      top: "10%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: points.map(p => p.label),
      axisLine: { lineStyle: { color: THEME.gridColor } },
      axisTick: { show: false },
      axisLabel: {
        color: THEME.textSecondary,
        fontFamily: THEME.fontFamily,
        fontSize: 11,
      },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: THEME.splitLineColor, type: "dashed" } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: THEME.textMuted,
        fontFamily: THEME.fontFamily,
        fontSize: 11,
      },
    },
    series: [{
      type: "line",
      data: points.map(p => p.value),
      smooth: 0.35,
      symbol: "circle",
      symbolSize: 8,
      showSymbol: true,
      lineStyle: {
        width: 2.5,
        color: "#00d4ff",
        shadowColor: "rgba(0, 212, 255, 0.3)",
        shadowBlur: 8,
      },
      itemStyle: {
        color: "#00d4ff",
        borderColor: "#0a121e",
        borderWidth: 2,
      },
      emphasis: {
        itemStyle: {
          borderWidth: 3,
          shadowBlur: 12,
          shadowColor: "rgba(0, 212, 255, 0.5)",
        },
      },
      areaStyle: {
        color: {
          type: "linear",
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: "rgba(0, 212, 255, 0.12)" },
            { offset: 1, color: "rgba(0, 212, 255, 0)" },
          ],
        },
      },
      animationDuration: 1400,
      animationEasing: "cubicOut",
    }],
  };

  // Legacy coordinate string
  const values = points.map(p => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const coordPairs = points.map((pt, i) => {
    const x = +(20 + (i / (points.length - 1)) * 360).toFixed(0);
    const y = +(20 + (1 - (pt.value - minVal) / range) * 160).toFixed(0);
    return `${x},${y}`;
  });

  const svgFragment = `<div class="chart-container" style="max-width:500px;margin:0 auto">
  <div data-echart='${toDataAttr(option)}' id="${chartId}" style="width:100%;height:280px"></div>
</div>`;

  return { type: "line", points: coordPairs.join(" "), svgFragment };
}

function compileHorizontalBar(points: DataPoint[]): HorizontalBarData {
  const chartId = nextChartId();

  const rows = points.map((pt, i) => ({
    label: pt.label,
    value: pt.value,
    percentage: pt.value,
    color: CHART_HEX[i % CHART_HEX.length],
  }));

  const option = {
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(10, 18, 30, 0.95)",
      borderColor: "rgba(78, 132, 196, 0.3)",
      borderWidth: 1,
      textStyle: {
        color: THEME.textPrimary,
        fontFamily: THEME.fontFamily,
        fontSize: 13,
      },
      formatter: (params: Array<{ name: string; value: number }>) =>
        `${params[0].name}: ${params[0].value}%`,
      axisPointer: {
        type: "shadow",
        shadowStyle: { color: "rgba(0, 212, 255, 0.04)" },
      },
    },
    grid: {
      left: "3%",
      right: "8%",
      bottom: "5%",
      top: "5%",
      containLabel: true,
    },
    xAxis: {
      type: "value",
      max: 100,
      splitLine: { lineStyle: { color: THEME.splitLineColor, type: "dashed" } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: THEME.textMuted,
        fontFamily: THEME.fontFamily,
        fontSize: 11,
        formatter: "{value}%",
      },
    },
    yAxis: {
      type: "category",
      data: points.map(p => p.label).reverse(),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: THEME.textPrimary,
        fontFamily: THEME.fontFamily,
        fontSize: 12,
        fontWeight: 500,
      },
    },
    series: [{
      type: "bar",
      barMaxWidth: 24,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: "rgba(0, 212, 255, 0.2)",
        },
      },
      animationDuration: 1200,
      animationEasing: "cubicOut",
      animationDelay: (idx: number) => idx * 120,
      data: points.map((pt, i) => ({
        value: pt.value,
        itemStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: CHART_HEX[i % CHART_HEX.length] + "88" },
              { offset: 1, color: CHART_HEX[i % CHART_HEX.length] },
            ],
          },
        },
      })).reverse(),
    }],
  };

  const htmlFragment = `<div class="chart-container" style="max-width:500px;margin:0 auto">
  <div data-echart='${toDataAttr(option)}' id="${chartId}" style="width:100%;height:${Math.max(180, points.length * 48)}px"></div>
</div>`;

  return { type: "horizontal-bar", rows, htmlFragment };
}
