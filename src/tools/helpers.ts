/**
 * Tool Response Helpers
 *
 * Shared utilities for formatting MCP tool responses and mapping OneNote errors.
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { OneNoteClientError, OneNoteResult } from "../onenote/types.js";

/**
 * Create a success response containing a JSON-serialized object.
 */
export function toolJsonSuccess(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create a success response with plain text.
 */
export function toolTextSuccess(text: string): CallToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

/**
 * Create a tool-level error response.
 */
export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/**
 * Handle a OneNoteResult<T>, returning either a success result (via transform)
 * or a mapped error result. Auth errors are thrown as McpError.
 */
export function handleApiResult<T>(
  result: OneNoteResult<T>,
  transform?: (data: T) => CallToolResult
): CallToolResult {
  if (result.success) {
    return transform ? transform(result.data) : toolJsonSuccess(result.data);
  }
  return mapOneNoteError(result.error);
}

/**
 * Map a OneNoteClientError to a tool response or throw a protocol error.
 */
export function mapOneNoteError(error: OneNoteClientError): CallToolResult {
  // Auth errors should be protocol-level errors
  if (error.code === "MISSING_TOKEN" || error.code === "UNAUTHORIZED") {
    throw new McpError(
      ErrorCode.InternalError,
      `Authentication failed: ${error.message}`
    );
  }

  // All other errors are tool-level errors
  const codeLabel = error.statusCode ? ` (HTTP ${error.statusCode})` : "";
  return toolError(
    `OneNote API error [${error.code}]${codeLabel}: ${error.message}`
  );
}
