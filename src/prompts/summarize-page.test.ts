import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSummarizePage } from "./summarize-page.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";

describe("registerSummarizePage", () => {
  let mockRegisterPrompt: ReturnType<typeof vi.fn>;
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterPrompt = vi.fn();
    server = { registerPrompt: mockRegisterPrompt } as unknown as McpServer;
  });

  it("registers the summarize-page prompt", () => {
    registerSummarizePage(server);
    expect(mockRegisterPrompt).toHaveBeenCalledTimes(1);
    expect(mockRegisterPrompt.mock.calls[0]?.[0]).toBe("summarize-page");
  });

  describe("callback", () => {
    it("returns structured summary prompt on success", async () => {
      registerSummarizePage(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (
        args: { pageId: string },
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: {
            title: "Meeting Notes",
            parentSection: { displayName: "Work" },
            lastModifiedDateTime: "2025-01-15T10:00:00Z",
          },
        }),
        requestRaw: vi.fn().mockResolvedValue({
          success: true,
          data: "<html><body><p>Meeting about project X</p></body></html>",
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const result = (await callback({ pageId: "p1" }, {})) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.role).toBe("user");
      expect(result.messages[0]?.content.text).toContain("Meeting Notes");
      expect(result.messages[0]?.content.text).toContain("Work");
      expect(result.messages[0]?.content.text).toContain(
        "2025-01-15T10:00:00Z"
      );
      expect(result.messages[0]?.content.text).toContain(
        "Meeting about project X"
      );
    });

    it("calls the correct API endpoints", async () => {
      registerSummarizePage(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (
        args: { pageId: string },
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: {
            title: "Test",
            parentSection: { displayName: "Section" },
            lastModifiedDateTime: "2025-01-01T00:00:00Z",
          },
        }),
        requestRaw: vi.fn().mockResolvedValue({
          success: true,
          data: "<html></html>",
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      await callback({ pageId: "page-123" }, {});

      expect(mockClient.request).toHaveBeenCalledWith({
        path: "/me/onenote/pages/page-123",
        params: { $expand: "parentSection" },
      });
      expect(mockClient.requestRaw).toHaveBeenCalledWith({
        path: "/me/onenote/pages/page-123/content",
      });
    });

    it("returns error message when metadata fetch fails", async () => {
      registerSummarizePage(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (
        args: { pageId: string },
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: false,
          error: { message: "Not found" },
        }),
        requestRaw: vi.fn().mockResolvedValue({
          success: true,
          data: "<html></html>",
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const result = (await callback({ pageId: "bad-id" }, {})) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content.text).toContain("Error");
      expect(result.messages[0]?.content.text).toContain("bad-id");
    });

    it("returns error message when content fetch fails", async () => {
      registerSummarizePage(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (
        args: { pageId: string },
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: {
            title: "Test",
            parentSection: { displayName: "Section" },
            lastModifiedDateTime: "2025-01-01T00:00:00Z",
          },
        }),
        requestRaw: vi.fn().mockResolvedValue({
          success: false,
          error: { message: "Content unavailable" },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const result = (await callback({ pageId: "p1" }, {})) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content.text).toContain("Error");
    });

    it("returns auth error message when client creation fails", async () => {
      registerSummarizePage(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (
        args: { pageId: string },
        extra: unknown
      ) => Promise<unknown>;

      vi.mocked(getOneNoteClientOrThrow).mockRejectedValue(
        new Error("Auth failed")
      );

      const result = (await callback({ pageId: "p1" }, {})) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content.text).toContain(
        "Unable to authenticate"
      );
    });

    it("returns error when both metadata and content fail", async () => {
      registerSummarizePage(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (
        args: { pageId: string },
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: false,
          error: { message: "Metadata not found" },
        }),
        requestRaw: vi.fn().mockResolvedValue({
          success: false,
          error: { message: "Content not found" },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const result = (await callback({ pageId: "bad-id" }, {})) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content.text).toContain("Error");
      // When metadata fails, the failedPart should mention metadata
      expect(result.messages[0]?.content.text).toContain("metadata");
    });

    it("handles missing parentSection gracefully", async () => {
      registerSummarizePage(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (
        args: { pageId: string },
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: {
            title: "Orphan Page",
            lastModifiedDateTime: "2025-01-01T00:00:00Z",
          },
        }),
        requestRaw: vi.fn().mockResolvedValue({
          success: true,
          data: "<html><body></body></html>",
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const result = (await callback({ pageId: "p1" }, {})) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages[0]?.content.text).toContain("Unknown section");
    });
  });
});
