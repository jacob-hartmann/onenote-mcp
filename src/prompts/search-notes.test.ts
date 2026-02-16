import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchNotes } from "./search-notes.js";

describe("registerSearchNotes", () => {
  let mockRegisterPrompt: ReturnType<typeof vi.fn>;
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterPrompt = vi.fn();
    server = { registerPrompt: mockRegisterPrompt } as unknown as McpServer;
  });

  it("registers the search-notes prompt", () => {
    registerSearchNotes(server);
    expect(mockRegisterPrompt).toHaveBeenCalledTimes(1);
    expect(mockRegisterPrompt.mock.calls[0]?.[0]).toBe("search-notes");
  });

  describe("callback", () => {
    it("constructs a search message with the query", () => {
      registerSearchNotes(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (args: {
        query: string;
        scope?: string;
      }) => unknown;

      const result = callback({ query: "project plan" }) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.role).toBe("user");
      expect(result.messages[0]?.content.text).toContain("project plan");
      expect(result.messages[0]?.content.text).toContain(
        "Search across all my notebooks"
      );
    });

    it("includes scope when provided", () => {
      registerSearchNotes(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (args: {
        query: string;
        scope?: string;
      }) => unknown;

      const result = callback({
        query: "meeting notes",
        scope: "Work Notebook",
      }) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages[0]?.content.text).toContain("Work Notebook");
      expect(result.messages[0]?.content.text).not.toContain(
        "Search across all my notebooks"
      );
    });

    it("handles 'all' scope without notebook-specific instructions", () => {
      registerSearchNotes(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (args: {
        query: string;
        scope?: string;
      }) => unknown;

      const result = callback({
        query: "budget",
        scope: "all",
      }) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages[0]?.content.text).toContain("all");
      expect(result.messages[0]?.content.text).not.toContain(
        "find the right section ID"
      );
    });

    it("includes instructions to use search-pages tool", () => {
      registerSearchNotes(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (args: {
        query: string;
        scope?: string;
      }) => unknown;

      const result = callback({ query: "test" }) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages[0]?.content.text).toContain("search-pages");
      expect(result.messages[0]?.content.text).toContain("get-page-preview");
    });
  });
});
