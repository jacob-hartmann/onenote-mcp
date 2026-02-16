import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResources } from "./index.js";

describe("registerResources", () => {
  it("does not register resources in Stage 1 scaffold", () => {
    const mockRegisterResource = vi.fn();
    const server = {
      registerResource: mockRegisterResource,
    } as unknown as McpServer;

    registerResources(server);

    expect(mockRegisterResource).not.toHaveBeenCalled();
  });
});
