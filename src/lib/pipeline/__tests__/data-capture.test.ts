import { describe, it, expect, vi } from "vitest";
import { createToolCallCapture, type CapturedToolCall } from "../present/data-capture";

describe("MCP Data Capture", () => {
  it("captures tool call metadata and response", async () => {
    const captured: CapturedToolCall[] = [];
    const capture = createToolCallCapture("run-1", "agent-1", (call) => {
      captured.push(call);
    });

    const mockExecute = vi.fn().mockResolvedValue('{"revenue": 872.3}');
    const wrappedExecute = capture.wrap("sec-edgar", "get_filing", mockExecute);

    const result = await wrappedExecute({ ticker: "INVA" });

    expect(result).toBe('{"revenue": 872.3}');
    expect(mockExecute).toHaveBeenCalledWith({ ticker: "INVA" });
    expect(captured).toHaveLength(1);
    expect(captured[0].mcpServer).toBe("sec-edgar");
    expect(captured[0].toolName).toBe("get_filing");
    expect(captured[0].toolParams).toEqual({ ticker: "INVA" });
    expect(captured[0].rawResponse).toBe('{"revenue": 872.3}');
    expect(captured[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(captured[0].responseBytes).toBe(18);
  });

  it("captures errors without blocking the tool call", async () => {
    const captured: CapturedToolCall[] = [];
    const capture = createToolCallCapture("run-1", "agent-1", (call) => {
      captured.push(call);
    });

    const mockExecute = vi.fn().mockRejectedValue(new Error("MCP timeout"));
    const wrappedExecute = capture.wrap("sec-edgar", "get_filing", mockExecute);

    await expect(wrappedExecute({ ticker: "INVA" })).rejects.toThrow("MCP timeout");
    expect(captured).toHaveLength(1);
    expect(captured[0].rawResponse).toContain("ERROR:");
  });

  it("does not slow down tool execution", async () => {
    const slowCapture = vi.fn().mockImplementation(() => {
      return new Promise(resolve => setTimeout(resolve, 1000));
    });
    const captureWithSlow = createToolCallCapture("run-1", "agent-1", slowCapture);

    const mockExecute = vi.fn().mockResolvedValue("fast");
    const wrapped = captureWithSlow.wrap("test", "tool", mockExecute);

    const start = Date.now();
    await wrapped({});
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500); // generous threshold for CI environments
  });

  it("captures structured data alongside the formatted response", async () => {
    const captured: CapturedToolCall[] = [];
    const capture = createToolCallCapture("run-1", "agent-1", (call) => {
      captured.push(call);
    });

    const wrappedExecute = capture.wrapWithData("data-sources", "search_bls_series", async () => ({
      rawResponse: "## BLS Time Series",
      structuredData: {
        revenue: [
          { year: "2023", value: 100 },
          { year: "2024", value: 120 },
        ],
      },
    }));

    const result = await wrappedExecute({ series_ids: ["CUUR0000SAM"] });

    expect(result).toBe("## BLS Time Series");
    expect(captured).toHaveLength(1);
    expect(captured[0].structuredData).toEqual({
      revenue: [
        { year: "2023", value: 100 },
        { year: "2024", value: 120 },
      ],
    });
  });
});
