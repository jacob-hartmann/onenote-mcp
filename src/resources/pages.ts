/**
 * Page Resources
 *
 * Provides URI-addressable access to OneNote pages.
 *
 * - onenote://sections/{sectionId}/pages (template) -- pages in a section
 * - onenote://pages/{pageId} (template) -- HTML content of a specific page
 */

import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  GraphODataCollection,
  GraphPage,
} from "../onenote/graph-types.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { PAGE_SELECT_FIELDS } from "../constants.js";

/**
 * Register page resources with the MCP server.
 */
export function registerPageResources(server: McpServer): void {
  // ── Template resource: onenote://sections/{sectionId}/pages ────────
  server.registerResource(
    "section-pages",
    new ResourceTemplate("onenote://sections/{sectionId}/pages", {
      list: undefined,
    }),
    {
      title: "Section Pages",
      description: "Pages in a specific OneNote section",
      mimeType: "application/json",
    },
    async (uri, variables, extra) => {
      const sectionId = variables["sectionId"] as string;
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.request<GraphODataCollection<GraphPage>>({
        path: `/me/onenote/sections/${encodeURIComponent(sectionId)}/pages`,
        params: {
          $select: PAGE_SELECT_FIELDS,
          pagelevel: "true",
        },
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

  // ── Template resource: onenote://pages/{pageId} ────────────────────
  server.registerResource(
    "page-content",
    new ResourceTemplate("onenote://pages/{pageId}", {
      list: undefined,
    }),
    {
      title: "OneNote Page",
      description: "The HTML content of a specific OneNote page",
      mimeType: "text/html",
    },
    async (uri, variables, extra) => {
      const pageId = variables["pageId"] as string;
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.requestRaw({
        path: `/me/onenote/pages/${encodeURIComponent(pageId)}/content`,
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
            mimeType: "text/html",
            text: result.data,
          },
        ],
      };
    }
  );
}
