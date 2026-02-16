import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerCreateSection } from "./create-section.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

describe("create-section tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerCreateSection(server);
  });

  it("registers with the name 'create-section'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("create-section");
  });

  it("creates section in a notebook when notebookId provided", async () => {
    const section = { id: "sec-new", displayName: "New Section" };
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: section,
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { displayName: "New Section", notebookId: "nb-1" },
      mockExtra
    );

    const callArgs = mockRequest.mock.calls[0]![0] as {
      path: string;
      method: string;
      body: unknown;
    };
    expect(callArgs.path).toBe("/me/onenote/notebooks/nb-1/sections");
    expect(callArgs.method).toBe("POST");
    expect(callArgs.body).toEqual({ displayName: "New Section" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(section);
  });

  it("creates section in a section group when sectionGroupId provided", async () => {
    const section = { id: "sec-new", displayName: "New Section" };
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: section,
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { displayName: "New Section", sectionGroupId: "sg-1" },
      mockExtra
    );

    const callArgs = mockRequest.mock.calls[0]![0] as { path: string };
    expect(callArgs.path).toBe("/me/onenote/sectionGroups/sg-1/sections");

    expect(result.isError).toBeUndefined();
  });

  it("returns error when neither notebookId nor sectionGroupId provided", async () => {
    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ displayName: "Test" }, mockExtra);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Neither was specified");
  });

  it("returns error when both notebookId and sectionGroupId provided", async () => {
    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { displayName: "Test", notebookId: "nb-1", sectionGroupId: "sg-1" },
      mockExtra
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Both were specified");
  });

  it("returns error on API failure", async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      success: false,
      error: new OneNoteClientError("Forbidden", "FORBIDDEN", 403),
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { displayName: "Test", notebookId: "nb-1" },
      mockExtra
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("FORBIDDEN");
  });
});
