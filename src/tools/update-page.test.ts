import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerUpdatePage } from "./update-page.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

describe("update-page tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerUpdatePage(server);
  });

  it("registers with the name 'update-page'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("update-page");
  });

  it("sends PATCH request with patches on success", async () => {
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

    const patches = [
      { target: "body", action: "append", content: "<p>New content</p>" },
    ];

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ pageId: "pg-1", patches }, mockExtra);

    const callArgs = mockRequestEmpty.mock.calls[0]![0] as {
      path: string;
      method: string;
      body: unknown;
    };
    expect(callArgs.path).toBe("/me/onenote/pages/pg-1/content");
    expect(callArgs.method).toBe("PATCH");
    expect(callArgs.body).toEqual(patches);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("Page updated successfully.");
  });

  it("sends multiple patches", async () => {
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

    const patches = [
      { target: "title", action: "replace", content: "New Title" },
      { target: "#div1", action: "append", content: "<p>Added</p>" },
    ];

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ pageId: "pg-1", patches }, mockExtra);

    const callArgs = mockRequestEmpty.mock.calls[0]![0] as { body: unknown };
    expect(callArgs.body).toEqual(patches);

    expect(result.isError).toBeUndefined();
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

    const patches = [
      { target: "body", action: "append", content: "<p>Test</p>" },
    ];

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ pageId: "missing", patches }, mockExtra);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NOT_FOUND");
  });
});
