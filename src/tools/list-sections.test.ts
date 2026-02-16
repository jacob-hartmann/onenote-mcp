import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerListSections } from "./list-sections.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

describe("list-sections tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerListSections(server);
  });

  it("registers with the name 'list-sections'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("list-sections");
  });

  it("lists all sections when neither notebookId nor sectionGroupId provided", async () => {
    const sections = [{ id: "sec-1", displayName: "Section 1" }];
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { value: sections },
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({}, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as { path: string };
    expect(callArgs.path).toBe("/me/onenote/sections");

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(sections);
  });

  it("lists sections in a notebook when notebookId provided", async () => {
    const sections = [{ id: "sec-2", displayName: "Section 2" }];
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { value: sections },
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ notebookId: "nb-1" }, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as { path: string };
    expect(callArgs.path).toBe("/me/onenote/notebooks/nb-1/sections");

    expect(result.isError).toBeUndefined();
  });

  it("lists sections in a section group when sectionGroupId provided", async () => {
    const sections = [{ id: "sec-3", displayName: "Section 3" }];
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { value: sections },
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ sectionGroupId: "sg-1" }, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as { path: string };
    expect(callArgs.path).toBe("/me/onenote/sectionGroups/sg-1/sections");

    expect(result.isError).toBeUndefined();
  });

  it("prefers sectionGroupId over notebookId when both provided", async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { value: [] },
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    await callback({ notebookId: "nb-1", sectionGroupId: "sg-1" }, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as { path: string };
    expect(callArgs.path).toBe("/me/onenote/sectionGroups/sg-1/sections");
  });

  it("returns error on API failure", async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      success: false,
      error: new OneNoteClientError("Server error", "SERVER_ERROR", 500),
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({}, mockExtra);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("SERVER_ERROR");
  });
});
