/**
 * MCP Prompts Registration
 *
 * Registers all OneNote prompt templates with the MCP server.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSummarizePage } from "./summarize-page.js";
import { registerSearchNotes } from "./search-notes.js";
import { registerCreateNote } from "./create-note.js";

/**
 * Register all prompts with the MCP server.
 */
export function registerPrompts(server: McpServer): void {
  registerSummarizePage(server);
  registerSearchNotes(server);
  registerCreateNote(server);
}
