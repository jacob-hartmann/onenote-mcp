/**
 * search-pages Tool
 *
 * Search for OneNote pages by keyword. Searches page titles and content
 * (including OCR text from images). Uses the OneNote-specific `search`
 * query parameter (not OData $search).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type {
  GraphODataCollection,
  GraphPage,
} from "../onenote/graph-types.js";
import { PAGE_SELECT_FIELDS } from "../constants.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult, toolJsonSuccess } from "./helpers.js";

export function registerSearchPages(server: McpServer): void {
  server.registerTool(
    "search-pages",
    {
      title: "Search Pages",
      description:
        "Search for OneNote pages by keyword. Searches page titles and content (including OCR text from images). Optionally scope the search to a specific section. Returns matching page metadata.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(1000)
          .describe("Search query string to find in page titles and content"),
        sectionId: z
          .string()
          .optional()
          .describe(
            "Optional section ID to scope the search to a specific section"
          ),
        top: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of results to return (1-100, default 20)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, sectionId, top }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const path = sectionId
        ? `/me/onenote/sections/${sanitizeId(sectionId, "sectionId")}/pages`
        : "/me/onenote/pages";

      const params: Record<string, string> = {
        $select: PAGE_SELECT_FIELDS,
        search: query,
      };

      if (top !== undefined) {
        params["$top"] = String(top);
      }

      const result = await client.request<GraphODataCollection<GraphPage>>({
        path,
        params,
      });

      return handleApiResult(result, (data) => toolJsonSuccess(data.value));
    }
  );
}
