import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerDeletePage } from "./delete-page.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

describe("delete-page tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerDeletePage(server);
  });

  it("registers with the name 'delete-page'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("delete-page");
  });

  it("sends DELETE request and returns success message", async () => {
    const mockRequestEmpty = vi.fn().mockResolvedValue({
      success: true,
      data: undefined,
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: vi.fn(),
      requestEmpty: mockRequestEmpty,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ pageId: "pg-1" }, mockExtra);

    const callArgs = mockRequestEmpty.mock.calls[0]![0] as {
      path: string;
      method: string;
    };
    expect(callArgs.path).toBe("/me/onenote/pages/pg-1");
    expect(callArgs.method).toBe("DELETE");

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("Page deleted successfully.");
  });

  it("returns error on API failure", async () => {
    const mockRequestEmpty = vi.fn().mockResolvedValue({
      success: false,
      error: new OneNoteClientError("Not found", "NOT_FOUND", 404),
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: vi.fn(),
      requestEmpty: mockRequestEmpty,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ pageId: "missing" }, mockExtra);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NOT_FOUND");
  });
});
