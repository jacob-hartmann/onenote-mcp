/**
 * delete-page Tool
 *
 * Permanently delete a OneNote page.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult, toolTextSuccess } from "./helpers.js";

export function registerDeletePage(server: McpServer): void {
  server.registerTool(
    "delete-page",
    {
      title: "Delete Page",
      description:
        "Permanently delete a OneNote page. This action cannot be undone. The page is immediately and permanently removed.",
      inputSchema: {
        pageId: z
          .string()
          .describe("The unique identifier of the page to delete"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ pageId }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.request<undefined>({
        path: `/me/onenote/pages/${sanitizeId(pageId, "pageId")}`,
        method: "DELETE",
      });

      return handleApiResult(result, () =>
        toolTextSuccess("Page deleted successfully.")
      );
    }
  );
}
