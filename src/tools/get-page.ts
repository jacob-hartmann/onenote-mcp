/**
 * get-page Tool
 *
 * Get metadata for a specific OneNote page by its ID. Returns title,
 * timestamps, and parent info but NOT the page content.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphPage } from "../onenote/graph-types.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult } from "./helpers.js";

export function registerGetPage(server: McpServer): void {
  server.registerTool(
    "get-page",
    {
      title: "Get Page",
      description:
        "Get metadata for a specific OneNote page by its ID. Returns title, timestamps, and parent info but NOT the page content. Use get-page-content to retrieve the actual HTML content.",
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

      const result = await client.request<GraphPage>({
        path: `/me/onenote/pages/${sanitizeId(pageId, "pageId")}`,
        params: {
          pagelevel: "true",
          $expand: "parentSection,parentNotebook",
        },
      });

      return handleApiResult(result);
    }
  );
}
