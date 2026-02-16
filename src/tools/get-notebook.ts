/**
 * get-notebook Tool
 *
 * Get detailed information about a specific OneNote notebook by its ID,
 * including its sections and section groups.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphNotebook } from "../onenote/graph-types.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult } from "./helpers.js";

export function registerGetNotebook(server: McpServer): void {
  server.registerTool(
    "get-notebook",
    {
      title: "Get Notebook",
      description:
        "Get detailed information about a specific OneNote notebook by its ID, including its sections and section groups. Use list-notebooks first to find the notebook ID.",
      inputSchema: {
        notebookId: z
          .string()
          .describe("The unique identifier of the notebook"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ notebookId }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.request<GraphNotebook>({
        path: `/me/onenote/notebooks/${sanitizeId(notebookId, "notebookId")}`,
        params: { $expand: "sections,sectionGroups" },
      });

      return handleApiResult(result);
    }
  );
}
