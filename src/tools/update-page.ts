/**
 * update-page Tool
 *
 * Update the content of an existing OneNote page using JSON patch commands.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult, toolTextSuccess } from "./helpers.js";

export function registerUpdatePage(server: McpServer): void {
  server.registerTool(
    "update-page",
    {
      title: "Update Page",
      description:
        "Update the content of an existing OneNote page using JSON patch commands. Each patch specifies a target element, an action (append, insert, replace), and content. Before updating, use get-page-content with includeIds=true to get element IDs for targeting.",
      inputSchema: {
        pageId: z
          .string()
          .describe("The unique identifier of the page to update"),
        patches: z
          .array(
            z.object({
              target: z
                .string()
                .describe(
                  "Target element. Use '#' prefix with data-id values (e.g., '#my-element') or generated IDs (e.g., '#div:{id}'). Use 'body' for the page body or 'title' for the page title."
                ),
              action: z
                .enum(["append", "prepend", "insert", "replace"])
                .describe("The update action to perform"),
              position: z
                .enum(["before", "after"])
                .optional()
                .describe(
                  "Position relative to target. For append: 'before' = first child, 'after' = last child (default). For insert: 'before' or 'after' (default) the target."
                ),
              content: z
                .string()
                .describe(
                  "HTML content string or plain text (for title replace)"
                ),
            })
          )
          .min(1)
          .describe("Array of patch operations to apply to the page"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ pageId, patches }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      // The Graph API expects the patches array as the JSON body
      const result = await client.request<undefined>({
        path: `/me/onenote/pages/${sanitizeId(pageId, "pageId")}/content`,
        method: "PATCH",
        body: patches,
      });

      return handleApiResult(result, () =>
        toolTextSuccess("Page updated successfully.")
      );
    }
  );
}
