/**
 * OneNote Client Factory
 *
 * Shared factory for creating OneNoteClient instances.
 */

import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { createClientFromAuth } from "./client.js";
import type { OneNoteClient } from "./client.js";

export type OneNoteClientResult =
  | { success: true; client: OneNoteClient }
  | { success: false; error: string };

/**
 * Get a OneNoteClient from MCP request context.
 */
export async function getOneNoteClient(
  _extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<OneNoteClientResult> {
  const clientResult = await createClientFromAuth();
  if (!clientResult.success) {
    return { success: false, error: clientResult.error.message };
  }

  return { success: true, client: clientResult.data };
}

/**
 * Get a OneNoteClient, throwing on error.
 */
export async function getOneNoteClientOrThrow(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<OneNoteClient> {
  const result = await getOneNoteClient(extra);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.client;
}
