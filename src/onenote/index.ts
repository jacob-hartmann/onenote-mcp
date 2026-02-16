/**
 * OneNote Module
 *
 * Exports OneNote API client, auth utilities, and types.
 */

export {
  OneNoteClient,
  createClientFromEnv,
  createClientFromAuth,
} from "./client.js";
export {
  getOneNoteClient,
  getOneNoteClientOrThrow,
  type OneNoteClientResult,
} from "./client-factory.js";
export {
  OneNoteClientError,
  type OneNoteResult,
  type OneNoteError,
  type OneNoteSuccess,
  type OneNoteErrorCode,
  type OneNoteClientConfig,
} from "./types.js";

export { getOneNoteAccessToken, OneNoteAuthError } from "./auth.js";
export type { AuthResult } from "./auth.js";

export {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  isTokenExpired,
  loadOAuthConfigFromEnv,
  parseScopes,
  generateState,
  OneNoteOAuthError,
} from "./oauth.js";
export type { OneNoteTokenData, OneNoteOAuthConfig } from "./oauth.js";

export {
  loadTokens,
  saveTokens,
  clearTokens,
  getTokenStorePath,
  getDefaultStoreDir,
} from "./token-store.js";
