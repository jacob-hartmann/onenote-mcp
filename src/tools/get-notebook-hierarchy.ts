/**
 * get-notebook-hierarchy Tool
 *
 * Get the complete hierarchy of all notebooks, section groups, and sections.
 * The OneNote API limits $expand to 2 levels, so we fetch the first 2 levels
 * in one call, then recursively fetch deeper section groups.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { OneNoteClient } from "../onenote/client.js";
import type {
  GraphNotebook,
  GraphODataCollection,
  GraphSectionGroup,
} from "../onenote/graph-types.js";
import { mapOneNoteError, toolJsonSuccess } from "./helpers.js";

/** Max 2-level $expand: notebooks → sections + sectionGroups → sections + sectionGroups (stubs) */
const HIERARCHY_EXPAND =
  "sections($select=id,displayName,isDefault,self)," +
  "sectionGroups($select=id,displayName,self;" +
  "$expand=sections($select=id,displayName,isDefault,self)," +
  "sectionGroups($select=id,displayName,self))";

/** Safety limit to prevent runaway recursion */
const MAX_DEPTH = 10;

/**
 * Recursively expand section groups that have stub children (no sections/sectionGroups expanded).
 * The API returns IDs for nested groups at the leaf level but doesn't expand them.
 */
async function expandSectionGroups(
  client: OneNoteClient,
  groups: GraphSectionGroup[] | undefined,
  depth: number
): Promise<void> {
  if (!groups || groups.length === 0 || depth >= MAX_DEPTH) return;

  for (const group of groups) {
    // If this group has child sectionGroups that are stubs (no sections/sectionGroups expanded),
    // fetch them with another 2-level expand
    if (
      group.sectionGroups &&
      group.sectionGroups.length > 0 &&
      group.sectionGroups.some((sg) => sg.sections === undefined)
    ) {
      const result = await client.request<GraphSectionGroup>({
        path: `/me/onenote/sectionGroups/${encodeURIComponent(group.id)}`,
        params: {
          $select: "id,displayName,self",
          $expand:
            "sections($select=id,displayName,isDefault,self)," +
            "sectionGroups($select=id,displayName,self;" +
            "$expand=sections($select=id,displayName,isDefault,self)," +
            "sectionGroups($select=id,displayName,self))",
        },
      });

      if (result.success) {
        if (result.data.sections !== undefined) {
          group.sections = result.data.sections;
        }
        if (result.data.sectionGroups !== undefined) {
          group.sectionGroups = result.data.sectionGroups;
        }
      }
    }

    // Recurse into child section groups
    await expandSectionGroups(client, group.sectionGroups, depth + 1);
  }
}

export function registerGetNotebookHierarchy(server: McpServer): void {
  server.registerTool(
    "get-notebook-hierarchy",
    {
      title: "Get Notebook Hierarchy",
      description:
        "Get the complete hierarchy of all notebooks, section groups, and sections. " +
        "Returns a tree structure: Notebooks > Section Groups > Sections " +
        "(recursively for nested section groups). " +
        "This is the most efficient way to understand the user's OneNote organization.",
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

      // Fetch notebooks with 2-level expand (API max)
      const result = await client.request<GraphODataCollection<GraphNotebook>>({
        path: "/me/onenote/notebooks",
        params: {
          $select: "id,displayName,isDefault,isShared,userRole,self",
          $expand: HIERARCHY_EXPAND,
        },
      });

      if (!result.success) {
        return mapOneNoteError(result.error);
      }

      // Recursively expand any deeper section groups
      for (const notebook of result.data.value) {
        await expandSectionGroups(client, notebook.sectionGroups, 0);
      }

      return toolJsonSuccess(result.data.value);
    }
  );
}
