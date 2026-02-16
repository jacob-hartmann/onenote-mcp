/**
 * search-notes Prompt
 *
 * Help the user search across their OneNote notes.
 * Guides through a search workflow using available tools.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerSearchNotes(server: McpServer): void {
  server.registerPrompt(
    "search-notes",
    {
      title: "Search Notes",
      description:
        "Help the user search across their OneNote notes. Guides through a search workflow using available tools.",
      argsSchema: {
        query: z
          .string()
          .describe("What the user is looking for in their notes"),
        scope: z
          .string()
          .optional()
          .describe(
            "Optional: 'all' to search everywhere, or a notebook name to narrow scope"
          ),
      },
    },
    ({ query, scope }) => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I want to search my OneNote notes for: "${query}"
${scope ? `Scope: ${scope}` : "Search across all my notebooks."}

Please help me find relevant notes by:
1. First, use the search-pages tool to search for "${query}"${scope && scope !== "all" ? ` (you may need to use list-notebooks and list-sections first to find the right section ID for the "${scope}" notebook)` : ""}
2. For each relevant result, use get-page-preview to show me a preview of the content
3. Summarize what you found and ask if I want to see the full content of any specific page`,
            },
          },
        ],
      };
    }
  );
}
