/**
 * Notebook Resources
 *
 * Provides URI-addressable access to OneNote notebooks.
 *
 * - onenote://notebooks (static) -- list all notebooks
 * - onenote://notebooks/{notebookId} (template) -- a specific notebook with sections/sectionGroups
 */

import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  GraphNotebook,
  GraphODataCollection,
} from "../onenote/graph-types.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { NOTEBOOK_SELECT_FIELDS } from "../constants.js";

/**
 * Register notebook resources with the MCP server.
 */
export function registerNotebookResources(server: McpServer): void {
  // ── Static resource: onenote://notebooks ───────────────────────────
  server.registerResource(
    "notebooks-list",
    "onenote://notebooks",
    {
      title: "OneNote Notebooks",
      description:
        "List of all OneNote notebooks accessible to the authenticated user",
      mimeType: "application/json",
    },
    async (uri, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.request<GraphODataCollection<GraphNotebook>>({
        path: "/me/onenote/notebooks",
        params: { $select: NOTEBOOK_SELECT_FIELDS },
      });

      if (!result.success) {
        throw new Error(
          `OneNote API error [${result.error.code}]: ${result.error.message}`
        );
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result.data.value, null, 2),
          },
        ],
      };
    }
  );

  // ── Template resource: onenote://notebooks/{notebookId} ────────────
  server.registerResource(
    "notebook",
    new ResourceTemplate("onenote://notebooks/{notebookId}", {
      list: async (extra) => {
        const client = await getOneNoteClientOrThrow(extra);

        const result = await client.request<
          GraphODataCollection<GraphNotebook>
        >({
          path: "/me/onenote/notebooks",
          params: { $select: "id,displayName" },
        });

        if (!result.success) {
          console.error(
            `[onenote-mcp] Failed to list notebooks for resource discovery: ${result.error.message}`
          );
          return { resources: [] };
        }

        return {
          resources: result.data.value.map((nb) => ({
            uri: `onenote://notebooks/${nb.id}`,
            name: nb.displayName,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      title: "OneNote Notebook",
      description:
        "A specific OneNote notebook with its sections and section groups",
      mimeType: "application/json",
    },
    async (uri, variables, extra) => {
      const notebookId = variables["notebookId"] as string;
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.request<GraphNotebook>({
        path: `/me/onenote/notebooks/${encodeURIComponent(notebookId)}`,
        params: { $expand: "sections,sectionGroups" },
      });

      if (!result.success) {
        throw new Error(
          `OneNote API error [${result.error.code}]: ${result.error.message}`
        );
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }
  );
}
