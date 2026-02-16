/**
 * create-section Tool
 *
 * Create a new section in a notebook or section group.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphSection } from "../onenote/graph-types.js";
import { sanitizeId } from "../utils/validation.js";
import { handleApiResult, toolError } from "./helpers.js";

export function registerCreateSection(server: McpServer): void {
  server.registerTool(
    "create-section",
    {
      title: "Create Section",
      description:
        "Create a new section. Provide notebookId to create in a notebook, or sectionGroupId to create inside a section group. Exactly one parent must be specified. Section names must be unique within the same hierarchy level, max 50 characters, and cannot contain: ? * / : < > | & # ' % ~",
      inputSchema: {
        displayName: z
          .string()
          .min(1)
          .max(50)
          .describe("Name for the new section (max 50 characters)"),
        notebookId: z
          .string()
          .optional()
          .describe("ID of the notebook to create the section in"),
        sectionGroupId: z
          .string()
          .optional()
          .describe(
            "ID of the section group to create the section in. Takes precedence over notebookId."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ displayName, notebookId, sectionGroupId }, extra) => {
      // Validate forbidden characters in section name
      const forbiddenChars = new RegExp("[?*/:<>|&#'%~]");
      if (forbiddenChars.test(displayName)) {
        return toolError(
          "Section name contains forbidden characters: ? * / : < > | & # ' % ~"
        );
      }

      // Validate that exactly one parent is provided
      const hasNotebook = notebookId !== undefined && notebookId !== "";
      const hasSectionGroup =
        sectionGroupId !== undefined && sectionGroupId !== "";

      if (!hasNotebook && !hasSectionGroup) {
        return toolError(
          "Exactly one of notebookId or sectionGroupId must be provided. Neither was specified."
        );
      }

      if (hasNotebook && hasSectionGroup) {
        return toolError(
          "Exactly one of notebookId or sectionGroupId must be provided. Both were specified — use only one."
        );
      }

      const client = await getOneNoteClientOrThrow(extra);

      // At this point, exactly one of notebookId or sectionGroupId is defined and non-empty
      const parentId = hasSectionGroup ? sectionGroupId : notebookId;
      const parentType = hasSectionGroup ? "sectionGroups" : "notebooks";
      const paramName = hasSectionGroup ? "sectionGroupId" : "notebookId";
      const path = `/me/onenote/${parentType}/${sanitizeId(parentId ?? "", paramName)}/sections`;

      const result = await client.request<GraphSection>({
        path,
        method: "POST",
        body: { displayName },
      });

      return handleApiResult(result);
    }
  );
}
