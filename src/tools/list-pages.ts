/**
 * list-pages Tool
 *
 * List pages in a specific section. Returns page titles, IDs, and metadata.
 * When top is provided, returns a single page of results. When omitted,
 * follows all pagination links to return the complete list.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphPage } from "../onenote/graph-types.js";
import { PAGE_SELECT_FIELDS } from "../constants.js";
import { fetchPage, fetchAllPages } from "../onenote/pagination.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult, toolJsonSuccess } from "./helpers.js";

export function registerListPages(server: McpServer): void {
  server.registerTool(
    "list-pages",
    {
      title: "List Pages",
      description:
        "List pages in a specific section. Returns page titles, IDs, and metadata. Always specify a sectionId to avoid errors on accounts with many sections.",
      inputSchema: {
        sectionId: z.string().describe("The section ID to list pages from"),
        top: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of pages to return (1-100, default 20)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sectionId, top }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const path = `/me/onenote/sections/${sanitizeId(sectionId, "sectionId")}/pages`;
      const params: Record<string, string> = {
        $select: PAGE_SELECT_FIELDS,
        pagelevel: "true",
      };

      if (top !== undefined) {
        // When top is specified, use a single-page fetch (no pagination)
        params["$top"] = String(top);
        const result = await fetchPage<GraphPage>(client, path, params);
        return handleApiResult(result, (data) => toolJsonSuccess(data.value));
      }

      // When top is omitted, fetch all pages following nextLink
      const result = await fetchAllPages<GraphPage>(client, path, params);
      return handleApiResult(result);
    }
  );
}
