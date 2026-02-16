/**
 * Shared Constants
 *
 * Centralized constants used across the application.
 */

/** Microsoft identity authority base URL */
export const MICROSOFT_IDENTITY_BASE_URL = "https://login.microsoftonline.com";

/** Microsoft Graph API base URL */
export const MICROSOFT_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

/** Timeout for external API requests in milliseconds (30 seconds) */
export const FETCH_TIMEOUT_MS = 30_000;

/** Token expiry buffer in milliseconds (5 minutes) */
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/** Default OAuth tenant (multi-tenant) */
export const DEFAULT_TENANT = "common";

/** Default OAuth redirect URI for stdio mode */
export const DEFAULT_REDIRECT_URI = "http://localhost:3000/callback";

/** Default OAuth scopes */
export const DEFAULT_OAUTH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "User.Read",
  "Notes.Read",
];

/** OAuth callback timeout in milliseconds (5 minutes) */
export const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
