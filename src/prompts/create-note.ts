/**
 * create-note Prompt
 *
 * Guide the user through creating a new OneNote page.
 * Helps select the target notebook and section, then creates the page.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCreateNote(server: McpServer): void {
  server.registerPrompt(
    "create-note",
    {
      title: "Create Note",
      description:
        "Guide the user through creating a new OneNote page. Helps select the target notebook and section, then creates the page.",
      argsSchema: {
        topic: z.string().describe("The topic or subject for the new note"),
        content: z
          .string()
          .optional()
          .describe("Optional initial content or outline for the note"),
      },
    },
    ({ topic, content }) => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I want to create a new OneNote page about: "${topic}"
${content ? `\nHere's what I want in the note:\n${content}` : ""}

Please help me create this note by:
1. Use list-notebooks to show me my available notebooks
2. Ask me which notebook to use (or suggest the most appropriate one)
3. Use list-sections to show me the sections in the chosen notebook
4. Ask me which section to use (or suggest creating a new one)
5. Create the page using create-page with well-formatted HTML content based on the topic${content ? " and the content I provided" : ""}
6. Confirm the page was created and provide the page link`,
            },
          },
        ],
      };
    }
  );
}
