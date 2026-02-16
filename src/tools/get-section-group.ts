/**
 * get-section-group Tool
 *
 * Get detailed information about a specific section group, including
 * its sections and nested section groups.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphSectionGroup } from "../onenote/graph-types.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult } from "./helpers.js";

export function registerGetSectionGroup(server: McpServer): void {
  server.registerTool(
    "get-section-group",
    {
      title: "Get Section Group",
      description:
        "Get detailed information about a specific section group, including its sections and nested section groups.",
      inputSchema: {
        sectionGroupId: z
          .string()
          .describe("The unique identifier of the section group"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sectionGroupId }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.request<GraphSectionGroup>({
        path: `/me/onenote/sectionGroups/${sanitizeId(sectionGroupId, "sectionGroupId")}`,
        params: { $expand: "sections,sectionGroups" },
      });

      return handleApiResult(result);
    }
  );
}
