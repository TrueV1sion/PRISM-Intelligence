import { describe, it, expect } from "vitest";
import { compileCharts, compileChartFromDataset } from "../present/chart-compiler";
import type { DataPoint, DonutChartData, BarChartData, SparklineData, CounterData, HorizontalBarData, LineChartData, EnrichedDataset } from "../present/types";

describe("chart-compiler: donut charts", () => {
  const donutPoints: DataPoint[] = [
    { label: "Payer Analytics", value: 40, unit: "%", chartRole: "donut-segment" },
    { label: "Provider Solutions", value: 28, unit: "%", chartRole: "donut-segment" },
    { label: "Life Sciences", value: 20, unit: "%", chartRole: "donut-segment" },
    { label: "Government", value: 12, unit: "%", chartRole: "donut-segment" },
  ];

  it("produces a donut ChartData with correct segments", () => {
    const result = compileCharts(donutPoints);
    const donut = result.find((c) => c.type === "donut") as DonutChartData;
    expect(donut).toBeDefined();
    expect(donut.segments).toHaveLength(4);
    expect(donut.circumference).toBeCloseTo(502.65, 1);
  });

  it("generates ECharts div with data-echart config and legend", () => {
    const result = compileCharts(donutPoints);
    const donut = result.find((c) => c.type === "donut") as DonutChartData;
    expect(donut.svgFragment).toContain("data-echart=");
    expect(donut.svgFragment).toContain('class="chart-legend"');
    expect(donut.svgFragment).toContain('class="legend-item"');
    expect(donut.svgFragment).toContain('class="legend-dot"');
  });

  it("embeds pie type in ECharts config", () => {
    const result = compileCharts(donutPoints);
    const donut = result.find((c) => c.type === "donut") as DonutChartData;
    expect(donut.svgFragment).toContain('"pie"');
  });

  it("assigns hex colors to segments", () => {
    const result = compileCharts(donutPoints);
    const donut = result.find((c) => c.type === "donut") as DonutChartData;
    expect(donut.segments[0].color).toBe("#00d4ff");
    expect(donut.segments[1].color).toBe("#7c5cfc");
  });
});

describe("chart-compiler: bar charts", () => {
  const barPoints: DataPoint[] = [
    { label: "Claims", value: 92, unit: "%", chartRole: "bar-value" },
    { label: "Quality", value: 85, unit: "%", chartRole: "bar-value" },
    { label: "Risk Adj.", value: 78, unit: "%", chartRole: "bar-value" },
  ];

  it("produces a bar ChartData with correct bar count", () => {
    const result = compileCharts(barPoints);
    const bar = result.find((c) => c.type === "bar") as BarChartData;
    expect(bar).toBeDefined();
    expect(bar.bars).toHaveLength(3);
  });

  it("generates ECharts div with data-echart config", () => {
    const result = compileCharts(barPoints);
    const bar = result.find((c) => c.type === "bar") as BarChartData;
    expect(bar.svgFragment).toContain("data-echart=");
    expect(bar.svgFragment).toContain('class="chart-container"');
  });

  it("computes bar heights proportional to values", () => {
    const result = compileCharts(barPoints);
    const bar = result.find((c) => c.type === "bar") as BarChartData;
    expect(bar.bars[0].height).toBeGreaterThan(bar.bars[2].height);
  });
});

describe("chart-compiler: sparklines", () => {
  const sparkPoints: DataPoint[] = [
    { label: "Q1", value: 20, chartRole: "sparkline-point" },
    { label: "Q2", value: 16, chartRole: "sparkline-point" },
    { label: "Q3", value: 18, chartRole: "sparkline-point" },
    { label: "Q4", value: 12, chartRole: "sparkline-point" },
    { label: "Q5", value: 8, chartRole: "sparkline-point" },
  ];

  it("produces a sparkline ChartData", () => {
    const result = compileCharts(sparkPoints);
    const spark = result.find((c) => c.type === "sparkline") as SparklineData;
    expect(spark).toBeDefined();
    expect(spark.points).toContain(",");
  });

  it("generates ECharts div with sparkline-container", () => {
    const result = compileCharts(sparkPoints);
    const spark = result.find((c) => c.type === "sparkline") as SparklineData;
    expect(spark.svgFragment).toContain("data-echart=");
    expect(spark.svgFragment).toContain('class="sparkline-container"');
  });
});

describe("chart-compiler: counters", () => {
  const counterPoints: DataPoint[] = [
    { label: "Revenue", value: 2400, unit: "M", prefix: "$", chartRole: "counter-target" },
    { label: "Market Share", value: 34, unit: "%", chartRole: "counter-target" },
  ];

  it("produces counter ChartData entries", () => {
    const result = compileCharts(counterPoints);
    const counters = result.filter((c) => c.type === "counter") as CounterData[];
    expect(counters).toHaveLength(2);
  });

  it("generates HTML with data-target attribute", () => {
    const result = compileCharts(counterPoints);
    const counter = result.find((c) => c.type === "counter") as CounterData;
    expect(counter.htmlFragment).toContain('data-target=');
    expect(counter.htmlFragment).toContain('class="stat-number');
  });

  it("includes prefix and suffix", () => {
    const result = compileCharts(counterPoints);
    const counter = result.find((c) => c.type === "counter" && c.target === 2400) as CounterData;
    expect(counter.prefix).toBe("$");
    expect(counter.suffix).toBe("M");
  });
});

describe("chart-compiler: horizontal bars", () => {
  const hbarPoints: DataPoint[] = [
    { label: "Adoption Rate", value: 85, unit: "%", chartRole: "bar-fill-percent" },
    { label: "Satisfaction", value: 72, unit: "%", chartRole: "bar-fill-percent" },
  ];

  it("produces horizontal-bar ChartData", () => {
    const result = compileCharts(hbarPoints);
    const hbar = result.find((c) => c.type === "horizontal-bar") as HorizontalBarData;
    expect(hbar).toBeDefined();
    expect(hbar.rows).toHaveLength(2);
  });

  it("generates ECharts div with data-echart config", () => {
    const result = compileCharts(hbarPoints);
    const hbar = result.find((c) => c.type === "horizontal-bar") as HorizontalBarData;
    expect(hbar.htmlFragment).toContain("data-echart=");
    expect(hbar.htmlFragment).toContain('class="chart-container"');
  });
});

describe("chart-compiler: line charts", () => {
  const linePoints: DataPoint[] = [
    { label: "Q1", value: 20, chartRole: "line-point" },
    { label: "Q2", value: 35, chartRole: "line-point" },
    { label: "Q3", value: 28, chartRole: "line-point" },
    { label: "Q4", value: 45, chartRole: "line-point" },
  ];

  it("produces a line ChartData", () => {
    const result = compileCharts(linePoints);
    const line = result.find((c) => c.type === "line") as LineChartData;
    expect(line).toBeDefined();
    expect(line.points).toContain(",");
  });

  it("generates ECharts div with chart-container", () => {
    const result = compileCharts(linePoints);
    const line = result.find((c) => c.type === "line") as LineChartData;
    expect(line.svgFragment).toContain("data-echart=");
    expect(line.svgFragment).toContain('class="chart-container"');
  });
});

describe("chart-compiler: value sanitization", () => {
  it("strips currency prefix and suffix from values", () => {
    const points: DataPoint[] = [
      { label: "Revenue", value: 2400, unit: "M", prefix: "$", chartRole: "counter-target" },
    ];
    const result = compileCharts(points);
    const counter = result.find((c) => c.type === "counter") as CounterData;
    expect(counter.target).toBe(2400);
  });

  it("handles mixed chart roles in single call", () => {
    const mixed: DataPoint[] = [
      { label: "Share A", value: 60, unit: "%", chartRole: "donut-segment" },
      { label: "Share B", value: 40, unit: "%", chartRole: "donut-segment" },
      { label: "Score", value: 85, unit: "%", chartRole: "bar-value" },
      { label: "Trend", value: 42, chartRole: "counter-target" },
    ];
    const result = compileCharts(mixed);
    expect(result.some(c => c.type === "donut")).toBe(true);
    expect(result.some(c => c.type === "bar")).toBe(true);
    expect(result.some(c => c.type === "counter")).toBe(true);
  });
});

describe("Chart Compiler — DatasetRegistry", () => {
  it("compiles line chart from time_series dataset", () => {
    const dataset: EnrichedDataset = {
      id: "d1",
      sourceCallId: "c1",
      metricName: "revenue",
      dataShape: "time_series",
      densityTier: "medium",
      values: [
        { period: "FY2022", value: 743 },
        { period: "FY2023", value: 812 },
        { period: "FY2024", value: 872 },
      ],
      computed: { min: 743, max: 872, mean: 809, trend: "up" },
      sourceLabel: "SEC EDGAR",
      chartWorthiness: 50,
    };

    const chart = compileChartFromDataset(dataset, "line");
    expect(chart.type).toBe("line");
    expect((chart as LineChartData).svgFragment).toContain("data-echart=");
  });

  it("compiles donut chart from composition dataset", () => {
    const dataset: EnrichedDataset = {
      id: "d2",
      sourceCallId: "c2",
      metricName: "segment_revenue",
      dataShape: "composition",
      densityTier: "medium",
      values: [
        { period: "Payer", value: 45 },
        { period: "Provider", value: 30 },
        { period: "LifeSci", value: 15 },
        { period: "Gov", value: 10 },
      ],
      computed: { min: 10, max: 45, mean: 25 },
      sourceLabel: "10-K",
      chartWorthiness: 60,
    };

    const chart = compileChartFromDataset(dataset, "donut");
    expect(chart.type).toBe("donut");
    expect((chart as DonutChartData).svgFragment).toContain("data-echart=");
  });
});
