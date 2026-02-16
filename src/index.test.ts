import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  return {
    McpServer: class MockMcpServer {
      config: { name: string; version: string };
      connect = vi.fn().mockResolvedValue(undefined);

      constructor(config: { name: string; version: string }) {
        this.config = config;
      }
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => {
  return {
    StdioServerTransport: class MockStdioServerTransport {
      readonly kind = "stdio";
    },
  };
});

vi.mock("./tools/index.js", () => ({
  registerTools: vi.fn(),
}));

vi.mock("./resources/index.js", () => ({
  registerResources: vi.fn(),
}));

vi.mock("./prompts/index.js", () => ({
  registerPrompts: vi.fn(),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

describe("OneNote MCP Server Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("creates McpServer with expected name", () => {
    const server = new McpServer({
      name: "onenote-mcp",
      version: "0.1.0",
    }) as unknown as { config: { name: string; version: string } };

    expect(server.config.name).toBe("onenote-mcp");
    expect(server.config.version).toBe("0.1.0");
  });

  it("registers tools, resources, and prompts", () => {
    const server = new McpServer({
      name: "onenote-mcp",
      version: "0.1.0",
    });

    registerTools(server);
    registerResources(server);
    registerPrompts(server);

    expect(registerTools).toHaveBeenCalledWith(server);
    expect(registerResources).toHaveBeenCalledWith(server);
    expect(registerPrompts).toHaveBeenCalledWith(server);
  });

  it("connects server to stdio transport", async () => {
    const server = new McpServer({
      name: "onenote-mcp",
      version: "0.1.0",
    }) as unknown as { connect: (transport: unknown) => Promise<void> };
    const transport = new StdioServerTransport();

    await server.connect(transport);

    expect(vi.mocked(server.connect)).toHaveBeenCalledWith(transport);
  });
});
