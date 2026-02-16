/**
 * get-page-preview Tool
 *
 * Get a text preview of a OneNote page (up to 300 characters).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphPagePreview } from "../onenote/graph-types.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult } from "./helpers.js";

export function registerGetPagePreview(server: McpServer): void {
  server.registerTool(
    "get-page-preview",
    {
      title: "Get Page Preview",
      description:
        "Get a text preview of a OneNote page (up to 300 characters). Useful for quickly scanning page content without fetching the full HTML.",
      inputSchema: {
        pageId: z.string().describe("The unique identifier of the page"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ pageId }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.request<GraphPagePreview>({
        path: `/me/onenote/pages/${sanitizeId(pageId, "pageId")}/preview`,
      });

      return handleApiResult(result);
    }
  );
}
