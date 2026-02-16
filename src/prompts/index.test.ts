import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "./index.js";

describe("registerPrompts", () => {
  it("does not register prompts in Stage 1 scaffold", () => {
    const mockRegisterPrompt = vi.fn();
    const server = {
      registerPrompt: mockRegisterPrompt,
    } as unknown as McpServer;

    registerPrompts(server);

    expect(mockRegisterPrompt).not.toHaveBeenCalled();
  });
});
