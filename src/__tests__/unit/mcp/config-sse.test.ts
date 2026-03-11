import { describe, it, expect } from "vitest";

describe("MCP Server Config (SSE)", () => {
  it("all servers have transport type defined", async () => {
    const { MCP_SERVERS } = await import("@/lib/mcp/config");
    for (const [name, config] of Object.entries(MCP_SERVERS)) {
      expect(config.transport, `${name} missing transport`).toBeDefined();
      expect(["sse", "stdio"]).toContain(config.transport);
    }
  });

  it("SSE servers have envUrlKey defined", async () => {
    const { MCP_SERVERS } = await import("@/lib/mcp/config");
    for (const [name, config] of Object.entries(MCP_SERVERS)) {
      if (config.transport === "sse") {
        expect(config.envUrlKey, `${name} missing envUrlKey`).toBeTruthy();
      }
    }
  });

  it("all servers are available by default", async () => {
    const { MCP_SERVERS } = await import("@/lib/mcp/config");
    for (const [name, config] of Object.entries(MCP_SERVERS)) {
      expect(config.available, `${name} should be available`).toBe(true);
    }
  });
});
