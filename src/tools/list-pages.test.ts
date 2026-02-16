import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerListPages } from "./list-pages.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

vi.mock("../onenote/pagination.js", () => ({
  fetchPage: vi.fn(),
  fetchAllPages: vi.fn(),
}));

import { fetchPage, fetchAllPages } from "../onenote/pagination.js";

describe("list-pages tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerListPages(server);
  });

  it("registers with the name 'list-pages'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("list-pages");
  });

  it("uses fetchPage when top is specified", async () => {
    const pages = [{ id: "pg-1", title: "Page 1" }];
    const mockClient = {
      request: vi.fn(),
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    };
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);
    vi.mocked(fetchPage).mockResolvedValue({
      success: true,
      data: { value: pages },
    });

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ sectionId: "sec-1", top: 10 }, mockExtra);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    const [client, path, params] = vi.mocked(fetchPage).mock.calls[0]!;
    expect(client).toBe(mockClient);
    expect(path).toBe("/me/onenote/sections/sec-1/pages");
    expect(params).toHaveProperty("$top", "10");
    expect(fetchAllPages).not.toHaveBeenCalled();

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(pages);
  });

  it("uses fetchAllPages when top is not specified", async () => {
    const pages = [
      { id: "pg-1", title: "Page 1" },
      { id: "pg-2", title: "Page 2" },
    ];
    const mockClient = {
      request: vi.fn(),
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    };
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);
    vi.mocked(fetchAllPages).mockResolvedValue({
      success: true,
      data: pages,
    });

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ sectionId: "sec-1" }, mockExtra);

    expect(fetchAllPages).toHaveBeenCalledTimes(1);
    const [client, path] = vi.mocked(fetchAllPages).mock.calls[0]!;
    expect(client).toBe(mockClient);
    expect(path).toBe("/me/onenote/sections/sec-1/pages");
    expect(fetchPage).not.toHaveBeenCalled();

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(pages);
  });

  it("returns error on fetchPage failure", async () => {
    const mockClient = {
      request: vi.fn(),
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    };
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);
    vi.mocked(fetchPage).mockResolvedValue({
      success: false,
      error: new OneNoteClientError("Not found", "NOT_FOUND", 404),
    });

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ sectionId: "sec-1", top: 5 }, mockExtra);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NOT_FOUND");
  });

  it("returns error on fetchAllPages failure", async () => {
    const mockClient = {
      request: vi.fn(),
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    };
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);
    vi.mocked(fetchAllPages).mockResolvedValue({
      success: false,
      error: new OneNoteClientError("Server error", "SERVER_ERROR", 500),
    });

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ sectionId: "sec-1" }, mockExtra);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("SERVER_ERROR");
  });
});
