/**
 * OneNote MCP Server
 *
 * A Model Context Protocol (MCP) server for Microsoft OneNote.
 *
 * Supports two transport modes:
 * - **stdio** (default): JSON-RPC over stdin/stdout for direct LLM integration.
 *   All logging goes to stderr to avoid corrupting JSON-RPC over stdout.
 * - **http**: HTTP+SSE with OAuth proxy for browser-based clients (e.g., MCP Inspector).
 *   Set `MCP_TRANSPORT=http` to enable.
 *
 * @see https://modelcontextprotocol.io/
 * @see https://learn.microsoft.com/en-us/graph/onenote-concept-overview
 */

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

const SERVER_NAME = "onenote-mcp";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };
const SERVER_VERSION = packageJson.version;

async function startStdioServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server running on stdio transport`);
}

function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "OneNote MCP server providing tools for reading, creating, and " +
        "managing OneNote notebooks, sections, and pages via Microsoft Graph API.",
    }
  );

  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}

async function main(): Promise<void> {
  const transport = process.env["MCP_TRANSPORT"] ?? "stdio";

  if (transport === "http") {
    const { getHttpServerConfig, startHttpServer } =
      await import("./server/index.js");

    const config = getHttpServerConfig();
    if (!config) {
      console.error(
        `[${SERVER_NAME}] HTTP transport requires ONENOTE_OAUTH_CLIENT_ID and ONENOTE_OAUTH_CLIENT_SECRET.`
      );
      console.error(
        `[${SERVER_NAME}] Set these in your .env file or environment, then try again.`
      );
      process.exit(1);
    }

    console.error(
      `[${SERVER_NAME}] Starting server v${SERVER_VERSION} (http transport)...`
    );
    await startHttpServer(createServer, config);
  } else {
    console.error(
      `[${SERVER_NAME}] Starting server v${SERVER_VERSION} (stdio transport)...`
    );
    const server = createServer();

    process.on("SIGTERM", () => {
      void server.close();
    });
    process.on("SIGINT", () => {
      void server.close();
    });

    await startStdioServer(server);
  }
}

main().catch((error: unknown) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  process.exit(1);
});
