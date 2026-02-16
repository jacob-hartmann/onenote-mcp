import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerGetPageContent } from "./get-page-content.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

describe("get-page-content tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerGetPageContent(server);
  });

  it("registers with the name 'get-page-content'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("get-page-content");
  });

  it("returns HTML content on success without includeIds", async () => {
    const html = "<html><body><p>Hello</p></body></html>";
    const mockRequestRaw = vi.fn().mockResolvedValue({
      success: true,
      data: html,
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: vi.fn(),
      requestRaw: mockRequestRaw,
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { pageId: "pg-1", includeIds: false },
      mockExtra
    );

    const callArgs = mockRequestRaw.mock.calls[0]![0] as {
      path: string;
      params?: Record<string, string>;
    };
    expect(callArgs.path).toBe("/me/onenote/pages/pg-1/content");
    expect(callArgs.params).toBeUndefined();

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(html);
  });

  it("includes IDs parameter when includeIds is true", async () => {
    const html = "<html><body><p data-id='abc'>Hello</p></body></html>";
    const mockRequestRaw = vi.fn().mockResolvedValue({
      success: true,
      data: html,
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: vi.fn(),
      requestRaw: mockRequestRaw,
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { pageId: "pg-1", includeIds: true },
      mockExtra
    );

    const callArgs = mockRequestRaw.mock.calls[0]![0] as {
      path: string;
      params?: Record<string, string>;
    };
    expect(callArgs.path).toBe("/me/onenote/pages/pg-1/content");
    expect(callArgs.params).toEqual({ includeIDs: "true" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(html);
  });

  it("returns error on API failure", async () => {
    const mockRequestRaw = vi.fn().mockResolvedValue({
      success: false,
      error: new OneNoteClientError("Not found", "NOT_FOUND", 404),
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: vi.fn(),
      requestRaw: mockRequestRaw,
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { pageId: "missing", includeIds: false },
      mockExtra
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NOT_FOUND");
  });
});
