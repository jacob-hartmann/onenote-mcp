/**
 * MCP Resources Registration
 *
 * Registers all OneNote resources with the MCP server.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerNotebookResources } from "./notebooks.js";
import { registerSectionResources } from "./sections.js";
import { registerPageResources } from "./pages.js";

/**
 * Register all resources with the MCP server.
 */
export function registerResources(server: McpServer): void {
  registerNotebookResources(server);
  registerSectionResources(server);
  registerPageResources(server);
}
