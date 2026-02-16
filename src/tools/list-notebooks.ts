/**
 * list-notebooks Tool
 *
 * List all OneNote notebooks accessible to the authenticated user.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphNotebook } from "../onenote/graph-types.js";
import { NOTEBOOK_SELECT_FIELDS } from "../constants.js";
import { fetchAllPages } from "../onenote/pagination.js";
import { handleApiResult } from "./helpers.js";

export function registerListNotebooks(server: McpServer): void {
  server.registerTool(
    "list-notebooks",
    {
      title: "List Notebooks",
      description:
        "List all OneNote notebooks accessible to the authenticated user. Returns notebook names, IDs, and metadata. Use this to discover available notebooks before accessing sections or pages.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const result = await fetchAllPages<GraphNotebook>(
        client,
        "/me/onenote/notebooks",
        { $select: NOTEBOOK_SELECT_FIELDS }
      );

      return handleApiResult(result);
    }
  );
}
