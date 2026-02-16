/**
 * get-section Tool
 *
 * Get detailed information about a specific section by its ID,
 * including its parent notebook.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphSection } from "../onenote/graph-types.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult } from "./helpers.js";

export function registerGetSection(server: McpServer): void {
  server.registerTool(
    "get-section",
    {
      title: "Get Section",
      description:
        "Get detailed information about a specific section by its ID, including its parent notebook.",
      inputSchema: {
        sectionId: z.string().describe("The unique identifier of the section"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sectionId }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.request<GraphSection>({
        path: `/me/onenote/sections/${sanitizeId(sectionId, "sectionId")}`,
        params: { $expand: "parentNotebook" },
      });

      return handleApiResult(result);
    }
  );
}
