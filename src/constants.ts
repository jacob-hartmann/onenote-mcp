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
  "Notes.ReadWrite",
];

/** OAuth callback timeout in milliseconds (5 minutes) */
export const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

/** Number of characters to display from session IDs in logs */
export const SESSION_ID_DISPLAY_LENGTH = 8;

/** JSON-RPC error code: Invalid request */
export const JSONRPC_ERROR_INVALID_REQUEST = -32600;

/** JSON-RPC error code: Internal error */
export const JSONRPC_ERROR_INTERNAL = -32603;

/** Maximum safety limit for pagination loops */
export const ONENOTE_MAX_PAGINATION_PAGES = 50;

/** $select fields for notebook list responses */
export const NOTEBOOK_SELECT_FIELDS =
  "id,displayName,createdDateTime,lastModifiedDateTime,isDefault,isShared,userRole,links,self";

/** $select fields for section list responses */
export const SECTION_SELECT_FIELDS =
  "id,displayName,isDefault,createdDateTime,lastModifiedDateTime,pagesUrl,links,self";

/** $select fields for section group list responses */
export const SECTION_GROUP_SELECT_FIELDS =
  "id,displayName,createdDateTime,lastModifiedDateTime,sectionsUrl,sectionGroupsUrl,self";

/** $select fields for page list responses */
export const PAGE_SELECT_FIELDS =
  "id,title,createdDateTime,lastModifiedDateTime,order,level,links,self";
