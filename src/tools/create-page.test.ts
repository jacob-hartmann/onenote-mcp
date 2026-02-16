import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerCreatePage } from "./create-page.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

vi.mock("../utils/html.js", () => ({
  buildPageHtml: vi.fn(
    (title: string, content?: string) =>
      `<html><head><title>${title}</title></head><body>${content ?? ""}</body></html>`
  ),
}));

import { buildPageHtml } from "../utils/html.js";

describe("create-page tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerCreatePage(server);
  });

  it("registers with the name 'create-page'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("create-page");
  });

  it("creates a page with title and content", async () => {
    const page = { id: "pg-new", title: "New Page" };
    const mockRequestHtmlBody = vi.fn().mockResolvedValue({
      success: true,
      data: page,
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: vi.fn(),
      requestRaw: vi.fn(),
      requestHtmlBody: mockRequestHtmlBody,
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { sectionId: "sec-1", title: "New Page", content: "<p>Hello</p>" },
      mockExtra
    );

    expect(buildPageHtml).toHaveBeenCalledWith("New Page", "<p>Hello</p>");

    const callArgs = mockRequestHtmlBody.mock.calls[0]![0] as {
      path: string;
      method: string;
      body: string;
    };
    expect(callArgs.path).toBe("/me/onenote/sections/sec-1/pages");
    expect(callArgs.method).toBe("POST");
    expect(callArgs.body).toContain("New Page");

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(page);
  });

  it("creates a page with title only (no content)", async () => {
    const page = { id: "pg-new", title: "Title Only" };
    const mockRequestHtmlBody = vi.fn().mockResolvedValue({
      success: true,
      data: page,
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: vi.fn(),
      requestRaw: vi.fn(),
      requestHtmlBody: mockRequestHtmlBody,
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { sectionId: "sec-1", title: "Title Only" },
      mockExtra
    );

    expect(buildPageHtml).toHaveBeenCalledWith("Title Only", undefined);

    expect(result.isError).toBeUndefined();
  });

  it("returns error on API failure", async () => {
    const mockRequestHtmlBody = vi.fn().mockResolvedValue({
      success: false,
      error: new OneNoteClientError("Forbidden", "FORBIDDEN", 403),
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: vi.fn(),
      requestRaw: vi.fn(),
      requestHtmlBody: mockRequestHtmlBody,
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback(
      { sectionId: "sec-1", title: "Test" },
      mockExtra
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("FORBIDDEN");
  });
});
