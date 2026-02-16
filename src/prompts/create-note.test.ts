import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateNote } from "./create-note.js";

describe("registerCreateNote", () => {
  let mockRegisterPrompt: ReturnType<typeof vi.fn>;
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterPrompt = vi.fn();
    server = { registerPrompt: mockRegisterPrompt } as unknown as McpServer;
  });

  it("registers the create-note prompt", () => {
    registerCreateNote(server);
    expect(mockRegisterPrompt).toHaveBeenCalledTimes(1);
    expect(mockRegisterPrompt.mock.calls[0]?.[0]).toBe("create-note");
  });

  describe("callback", () => {
    it("constructs a create message with the topic", () => {
      registerCreateNote(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (args: {
        topic: string;
        content?: string;
      }) => unknown;

      const result = callback({ topic: "Weekly Standup" }) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.role).toBe("user");
      expect(result.messages[0]?.content.text).toContain("Weekly Standup");
    });

    it("includes optional content when provided", () => {
      registerCreateNote(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (args: {
        topic: string;
        content?: string;
      }) => unknown;

      const result = callback({
        topic: "Project Plan",
        content: "Phase 1: Research\nPhase 2: Implementation",
      }) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages[0]?.content.text).toContain("Phase 1: Research");
      expect(result.messages[0]?.content.text).toContain(
        "Phase 2: Implementation"
      );
      expect(result.messages[0]?.content.text).toContain("content I provided");
    });

    it("omits content section when not provided", () => {
      registerCreateNote(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (args: {
        topic: string;
        content?: string;
      }) => unknown;

      const result = callback({ topic: "Quick Note" }) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages[0]?.content.text).not.toContain(
        "Here's what I want"
      );
      expect(result.messages[0]?.content.text).not.toContain(
        "content I provided"
      );
    });

    it("includes workflow instructions", () => {
      registerCreateNote(server);
      const callback = mockRegisterPrompt.mock.calls[0]?.[2] as (args: {
        topic: string;
        content?: string;
      }) => unknown;

      const result = callback({ topic: "Ideas" }) as {
        messages: { role: string; content: { type: string; text: string } }[];
      };

      expect(result.messages[0]?.content.text).toContain("list-notebooks");
      expect(result.messages[0]?.content.text).toContain("list-sections");
      expect(result.messages[0]?.content.text).toContain("create-page");
    });
  });
});
