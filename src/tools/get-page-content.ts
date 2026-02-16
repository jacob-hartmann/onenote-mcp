/**
 * get-page-content Tool
 *
 * Get the full HTML content of a OneNote page. Uses requestRaw() to
 * retrieve the HTML response as a string.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult, toolTextSuccess } from "./helpers.js";

export function registerGetPageContent(server: McpServer): void {
  server.registerTool(
    "get-page-content",
    {
      title: "Get Page Content",
      description:
        "Get the full HTML content of a OneNote page. The content is returned as HTML which represents the page's text, images, tables, and formatting. Use includeIds=true if you plan to update the page afterward.",
      inputSchema: {
        pageId: z.string().describe("The unique identifier of the page"),
        includeIds: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, includes generated element IDs needed for PATCH update operations"
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ pageId, includeIds }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const options: Parameters<typeof client.requestRaw>[0] = {
        path: `/me/onenote/pages/${sanitizeId(pageId, "pageId")}/content`,
      };

      if (includeIds) {
        options.params = { includeIDs: "true" };
      }

      const result = await client.requestRaw(options);

      return handleApiResult(result, (html) => toolTextSuccess(html));
    }
  );
}
