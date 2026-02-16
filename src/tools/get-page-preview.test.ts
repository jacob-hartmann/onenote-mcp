import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerGetPagePreview } from "./get-page-preview.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

describe("get-page-preview tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerGetPagePreview(server);
  });

  it("registers with the name 'get-page-preview'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("get-page-preview");
  });

  it("returns page preview on success", async () => {
    const preview = { previewText: "This is a preview..." };
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: preview,
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ pageId: "pg-1" }, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as { path: string };
    expect(callArgs.path).toBe("/me/onenote/pages/pg-1/preview");

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(preview);
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
