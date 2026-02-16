import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerGetPage } from "./get-page.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

describe("get-page tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerGetPage(server);
  });

  it("registers with the name 'get-page'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("get-page");
  });

  it("returns page metadata on success", async () => {
    const page = { id: "pg-1", title: "My Page" };
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: page,
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ pageId: "pg-1" }, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as {
      path: string;
      params: Record<string, string>;
    };
    expect(callArgs.path).toBe("/me/onenote/pages/pg-1");
    expect(callArgs.params).toEqual({
      pagelevel: "true",
      $expand: "parentSection,parentNotebook",
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(page);
  });

  it("returns error on API failure", async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      success: false,
      error: new OneNoteClientError("Not found", "NOT_FOUND", 404),
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ pageId: "missing" }, mockExtra);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NOT_FOUND");
  });
});
