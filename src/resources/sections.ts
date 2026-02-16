/**
 * Section Resources
 *
 * Provides URI-addressable access to OneNote sections.
 *
 * - onenote://notebooks/{notebookId}/sections (template) -- sections in a notebook
 */

import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  GraphODataCollection,
  GraphSection,
} from "../onenote/graph-types.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { SECTION_SELECT_FIELDS } from "../constants.js";

/**
 * Register section resources with the MCP server.
 */
export function registerSectionResources(server: McpServer): void {
  // ── Template resource: onenote://notebooks/{notebookId}/sections ───
  server.registerResource(
    "notebook-sections",
    new ResourceTemplate("onenote://notebooks/{notebookId}/sections", {
      list: undefined,
    }),
    {
      title: "Notebook Sections",
      description: "Sections in a specific OneNote notebook",
      mimeType: "application/json",
    },
    async (uri, variables, extra) => {
      const notebookId = variables["notebookId"] as string;
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.request<GraphODataCollection<GraphSection>>({
        path: `/me/onenote/notebooks/${encodeURIComponent(notebookId)}/sections`,
        params: { $select: SECTION_SELECT_FIELDS },
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
}
