/**
 * create-page Tool
 *
 * Create a new page in a OneNote section.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphPage } from "../onenote/graph-types.js";
import { buildPageHtml } from "../utils/html.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult } from "./helpers.js";

export function registerCreatePage(server: McpServer): void {
  server.registerTool(
    "create-page",
    {
      title: "Create Page",
      description:
        "Create a new page in a OneNote section. The content should be provided as HTML. The HTML must be valid XHTML with a title in the <title> tag. At minimum, provide a title; the body can be empty for a blank page.",
      inputSchema: {
        sectionId: z.string().describe("The section ID to create the page in"),
        title: z.string().min(1).describe("The title for the new page"),
        content: z
          .string()
          .max(1_000_000)
          .optional()
          .describe(
            "HTML body content for the page. If omitted, creates a page with only the title. Do not include <html>, <head>, or <body> tags -- only the inner body content (e.g., '<p>Hello world</p>')."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ sectionId, title, content }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const html = buildPageHtml(title, content);

      const result = await client.requestHtmlBody<GraphPage>({
        path: `/me/onenote/sections/${sanitizeId(sectionId, "sectionId")}/pages`,
        method: "POST",
        body: html,
      });

      return handleApiResult(result);
    }
  );
}
