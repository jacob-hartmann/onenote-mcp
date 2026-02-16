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
import { OneNoteClient, createClientFromAuth } from "./client.js";

export type OneNoteClientResult =
  | { success: true; client: OneNoteClient }
  | { success: false; error: string };

/**
 * Get a OneNoteClient from MCP request context.
 *
 * In HTTP mode the OAuth proxy stores the Microsoft access token in
 * `extra.authInfo.extra.oneNoteToken`. When present, a client is created
 * directly with that token. Otherwise falls back to the local OAuth flow
 * used in STDIO mode.
 */
export async function getOneNoteClient(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<OneNoteClientResult> {
  // HTTP mode: use token from OAuth proxy
  const token = extra.authInfo?.extra?.["oneNoteToken"];
  if (typeof token === "string") {
    return { success: true, client: new OneNoteClient({ token }) };
  }

  // STDIO mode: fall back to local OAuth / env token
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
