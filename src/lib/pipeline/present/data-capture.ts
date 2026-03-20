export interface CapturedToolCall {
  runId: string;
  agentId: string;
  mcpServer: string;
  toolName: string;
  toolParams: unknown;
  rawResponse: string;
  structuredData?: unknown;
  responseBytes: number;
  latencyMs: number;
  capturedAt: Date;
}

type CaptureCallback = (call: CapturedToolCall) => void;
type ToolExecutor = (params: unknown) => Promise<string>;
type ToolExecutorWithData = (
  params: unknown,
) => Promise<{ rawResponse: string; structuredData?: unknown }>;

export function createToolCallCapture(
  runId: string,
  agentId: string,
  onCapture: CaptureCallback,
) {
  function emitCapturedCall(
    mcpServer: string,
    toolName: string,
    params: unknown,
    rawResponse: string,
    start: number,
    structuredData?: unknown,
  ): void {
    onCapture({
      runId,
      agentId,
      mcpServer,
      toolName,
      toolParams: params,
      rawResponse,
      structuredData,
      responseBytes: Buffer.byteLength(rawResponse, "utf-8"),
      latencyMs: Date.now() - start,
      capturedAt: new Date(),
    });
  }

  return {
    wrap(mcpServer: string, toolName: string, execute: ToolExecutor): ToolExecutor {
      return async (params: unknown): Promise<string> => {
        const start = Date.now();
        let rawResponse: string;

        try {
          rawResponse = await execute(params);
        } catch (err) {
          rawResponse = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
          emitCapturedCall(mcpServer, toolName, params, rawResponse, start);
          throw err;
        }

        emitCapturedCall(mcpServer, toolName, params, rawResponse, start);

        return rawResponse;
      };
    },
    wrapWithData(
      mcpServer: string,
      toolName: string,
      execute: ToolExecutorWithData,
    ): ToolExecutor {
      return async (params: unknown): Promise<string> => {
        const start = Date.now();

        try {
          const { rawResponse, structuredData } = await execute(params);
          emitCapturedCall(
            mcpServer,
            toolName,
            params,
            rawResponse,
            start,
            structuredData,
          );
          return rawResponse;
        } catch (err) {
          const rawResponse = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
          emitCapturedCall(mcpServer, toolName, params, rawResponse, start);
          throw err;
        }
      };
    },
  };
}
