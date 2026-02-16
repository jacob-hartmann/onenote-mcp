import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./index.js";

describe("registerTools", () => {
  const mockRegisterTool = vi.fn();
  const server = {
    registerTool: mockRegisterTool,
  } as unknown as McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers all 16 tools", () => {
    registerTools(server);
    expect(mockRegisterTool).toHaveBeenCalledTimes(16);
  });

  it("registers each tool with the correct name", () => {
    registerTools(server);

    const registeredNames = mockRegisterTool.mock.calls.map(
      (call: unknown[]) => call[0] as string
    );

    expect(registeredNames).toContain("list-notebooks");
    expect(registeredNames).toContain("get-notebook");
    expect(registeredNames).toContain("list-section-groups");
    expect(registeredNames).toContain("get-section-group");
    expect(registeredNames).toContain("list-sections");
    expect(registeredNames).toContain("get-section");
    expect(registeredNames).toContain("create-section");
    expect(registeredNames).toContain("list-pages");
    expect(registeredNames).toContain("get-page");
    expect(registeredNames).toContain("get-page-content");
    expect(registeredNames).toContain("get-page-preview");
    expect(registeredNames).toContain("create-page");
    expect(registeredNames).toContain("update-page");
    expect(registeredNames).toContain("delete-page");
    expect(registeredNames).toContain("search-pages");
    expect(registeredNames).toContain("get-notebook-hierarchy");
  });

  it("registers each tool name exactly once", () => {
    registerTools(server);

    const registeredNames = mockRegisterTool.mock.calls.map(
      (call: unknown[]) => call[0] as string
    );

    const unique = new Set(registeredNames);
    expect(unique.size).toBe(registeredNames.length);
  });
});
