import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./index.js";

describe("registerTools", () => {
  it("does not register tools in Stage 1 scaffold", () => {
    const mockRegisterTool = vi.fn();
    const server = {
      registerTool: mockRegisterTool,
    } as unknown as McpServer;

    registerTools(server);

    expect(mockRegisterTool).not.toHaveBeenCalled();
  });
});
