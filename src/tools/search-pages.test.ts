import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerSearchPages } from "./search-pages.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

describe("search-pages tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerSearchPages(server);
  });

  it("registers with the name 'search-pages'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("search-pages");
  });

  it("searches all pages when no sectionId provided", async () => {
    const pages = [{ id: "pg-1", title: "Match Page" }];
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { value: pages },
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ query: "test" }, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as {
      path: string;
      params: Record<string, string>;
    };
    expect(callArgs.path).toBe("/me/onenote/pages");
    expect(callArgs.params).toHaveProperty("search", "test");
    expect(callArgs.params).toHaveProperty("$select");

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(pages);
  });

  it("scopes search to a section when sectionId provided", async () => {
    const pages = [{ id: "pg-2", title: "Section Match" }];
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { value: pages },
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { query: "test", sectionId: "sec-1" },
      mockExtra
    );

    const callArgs = mockRequest.mock.calls[0]![0] as {
      path: string;
      params: Record<string, string>;
    };
    expect(callArgs.path).toBe("/me/onenote/sections/sec-1/pages");
    expect(callArgs.params).toHaveProperty("search", "test");

    expect(result.isError).toBeUndefined();
  });

  it("includes $top when top is provided", async () => {
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
    await callback({ query: "test", top: 5 }, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as {
      params: Record<string, string>;
    };
    expect(callArgs.params).toHaveProperty("$top", "5");
  });

  it("does not include $top when top is not provided", async () => {
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
    await callback({ query: "test" }, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as {
      params: Record<string, string>;
    };
    expect(callArgs.params).not.toHaveProperty("$top");
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
    const result = await callback({ query: "test" }, mockExtra);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("SERVER_ERROR");
  });
});
