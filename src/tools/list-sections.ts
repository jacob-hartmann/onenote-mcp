/**
 * list-sections Tool
 *
 * List sections. Provide notebookId to list sections in a notebook,
 * sectionGroupId to list sections in a section group, or omit both
 * to list all sections across all notebooks.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphSection } from "../onenote/graph-types.js";
import { SECTION_SELECT_FIELDS } from "../constants.js";
import { fetchAllPages } from "../onenote/pagination.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult } from "./helpers.js";

export function registerListSections(server: McpServer): void {
  server.registerTool(
    "list-sections",
    {
      title: "List Sections",
      description:
        "List sections. Provide notebookId to list sections in a notebook, sectionGroupId to list sections in a section group, or omit both to list all sections across all notebooks.",
      inputSchema: {
        notebookId: z
          .string()
          .optional()
          .describe("Notebook ID to scope the listing"),
        sectionGroupId: z
          .string()
          .optional()
          .describe(
            "Section group ID to scope the listing. Takes precedence over notebookId if both are provided."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ notebookId, sectionGroupId }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      // sectionGroupId takes precedence over notebookId
      let path: string;
      if (sectionGroupId) {
        path = `/me/onenote/sectionGroups/${sanitizeId(sectionGroupId, "sectionGroupId")}/sections`;
      } else if (notebookId) {
        path = `/me/onenote/notebooks/${sanitizeId(notebookId, "notebookId")}/sections`;
      } else {
        path = "/me/onenote/sections";
      }

      const result = await fetchAllPages<GraphSection>(client, path, {
        $select: SECTION_SELECT_FIELDS,
      });

      return handleApiResult(result);
    }
  );
}
