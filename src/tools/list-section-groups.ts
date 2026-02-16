/**
 * list-section-groups Tool
 *
 * List section groups. When notebookId is provided, lists section groups
 * in that notebook. Otherwise lists all section groups across all notebooks.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphSectionGroup } from "../onenote/graph-types.js";
import { SECTION_GROUP_SELECT_FIELDS } from "../constants.js";
import { fetchAllPages } from "../onenote/pagination.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult } from "./helpers.js";

export function registerListSectionGroups(server: McpServer): void {
  server.registerTool(
    "list-section-groups",
    {
      title: "List Section Groups",
      description:
        "List section groups. When notebookId is provided, lists section groups in that notebook. Otherwise lists all section groups across all notebooks.",
      inputSchema: {
        notebookId: z
          .string()
          .optional()
          .describe(
            "Optional notebook ID to scope the listing. Omit to list all section groups."
          ),
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

      const path = notebookId
        ? `/me/onenote/notebooks/${sanitizeId(notebookId, "notebookId")}/sectionGroups`
        : "/me/onenote/sectionGroups";

      const result = await fetchAllPages<GraphSectionGroup>(client, path, {
        $select: SECTION_GROUP_SELECT_FIELDS,
      });

      return handleApiResult(result);
    }
  );
}
