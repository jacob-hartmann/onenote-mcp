/**
 * MCP Tools Registration
 *
 * Imports and registers all 16 OneNote tools with the MCP server.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListNotebooks } from "./list-notebooks.js";
import { registerGetNotebook } from "./get-notebook.js";
import { registerListSectionGroups } from "./list-section-groups.js";
import { registerGetSectionGroup } from "./get-section-group.js";
import { registerListSections } from "./list-sections.js";
import { registerGetSection } from "./get-section.js";
import { registerCreateSection } from "./create-section.js";
import { registerListPages } from "./list-pages.js";
import { registerGetPage } from "./get-page.js";
import { registerGetPageContent } from "./get-page-content.js";
import { registerGetPagePreview } from "./get-page-preview.js";
import { registerCreatePage } from "./create-page.js";
import { registerUpdatePage } from "./update-page.js";
import { registerDeletePage } from "./delete-page.js";
import { registerSearchPages } from "./search-pages.js";
import { registerGetNotebookHierarchy } from "./get-notebook-hierarchy.js";

export function registerTools(server: McpServer): void {
  // Notebook tools
  registerListNotebooks(server);
  registerGetNotebook(server);

  // Section Group tools
  registerListSectionGroups(server);
  registerGetSectionGroup(server);

  // Section tools
  registerListSections(server);
  registerGetSection(server);
  registerCreateSection(server);

  // Page tools
  registerListPages(server);
  registerGetPage(server);
  registerGetPageContent(server);
  registerGetPagePreview(server);
  registerCreatePage(server);
  registerUpdatePage(server);
  registerDeletePage(server);
  registerSearchPages(server);

  // Navigation tools
  registerGetNotebookHierarchy(server);
}
