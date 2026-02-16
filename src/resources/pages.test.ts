import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPageResources } from "./pages.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";

describe("registerPageResources", () => {
  let mockRegisterResource: ReturnType<typeof vi.fn>;
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterResource = vi.fn();
    server = { registerResource: mockRegisterResource } as unknown as McpServer;
  });

  it("registers 2 resources", () => {
    registerPageResources(server);
    expect(mockRegisterResource).toHaveBeenCalledTimes(2);
  });

  it("registers the section-pages resource", () => {
    registerPageResources(server);
    expect(mockRegisterResource.mock.calls[0]?.[0]).toBe("section-pages");
  });

  it("registers the page-content resource", () => {
    registerPageResources(server);
    expect(mockRegisterResource.mock.calls[1]?.[0]).toBe("page-content");
  });

  describe("section-pages callback", () => {
    it("returns pages as JSON on success", async () => {
      registerPageResources(server);
      const callback = mockRegisterResource.mock.calls[0]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: {
            value: [
              { id: "page1", title: "Page 1" },
              { id: "page2", title: "Page 2" },
            ],
          },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://sections/sec1/pages");
      const result = (await callback(uri, { sectionId: "sec1" }, {})) as {
        contents: { uri: string; mimeType: string; text: string }[];
      };

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]?.mimeType).toBe("application/json");
      const parsed = JSON.parse(result.contents[0]?.text ?? "") as unknown[];
      expect(parsed).toHaveLength(2);
    });

    it("calls the correct API endpoint with sectionId", async () => {
      registerPageResources(server);
      const callback = mockRegisterResource.mock.calls[0]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: { value: [] },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://sections/sec-abc/pages");
      await callback(uri, { sectionId: "sec-abc" }, {});

      expect(mockClient.request).toHaveBeenCalledWith({
        path: "/me/onenote/sections/sec-abc/pages",
        params: expect.objectContaining({
          $select: expect.any(String),
          pagelevel: "true",
        }) as Record<string, string>,
      });
    });

    it("throws on API error", async () => {
      registerPageResources(server);
      const callback = mockRegisterResource.mock.calls[0]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: false,
          error: { message: "Section not found" },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://sections/sec1/pages");
      await expect(callback(uri, { sectionId: "sec1" }, {})).rejects.toThrow(
        "Section not found"
      );
    });
  });

  describe("page-content callback", () => {
    it("returns page HTML content on success", async () => {
      registerPageResources(server);
      const callback = mockRegisterResource.mock.calls[1]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        requestRaw: vi.fn().mockResolvedValue({
          success: true,
          data: "<html><body><p>Hello</p></body></html>",
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://pages/page1");
      const result = (await callback(uri, { pageId: "page1" }, {})) as {
        contents: { uri: string; mimeType: string; text: string }[];
      };

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]?.mimeType).toBe("text/html");
      expect(result.contents[0]?.text).toContain("<p>Hello</p>");
    });

    it("calls the correct API endpoint with pageId", async () => {
      registerPageResources(server);
      const callback = mockRegisterResource.mock.calls[1]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        requestRaw: vi.fn().mockResolvedValue({
          success: true,
          data: "<html></html>",
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://pages/page-xyz");
      await callback(uri, { pageId: "page-xyz" }, {});

      expect(mockClient.requestRaw).toHaveBeenCalledWith({
        path: "/me/onenote/pages/page-xyz/content",
      });
    });

    it("throws on API error", async () => {
      registerPageResources(server);
      const callback = mockRegisterResource.mock.calls[1]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        requestRaw: vi.fn().mockResolvedValue({
          success: false,
          error: { message: "Page not found" },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://pages/page1");
      await expect(callback(uri, { pageId: "page1" }, {})).rejects.toThrow(
        "Page not found"
      );
    });
  });
});
