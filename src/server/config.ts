/**
 * HTTP Server Configuration
 *
 * Configuration for the HTTP transport mode with OAuth proxy.
 * Reads from environment variables and provides sensible defaults.
 */

import {
  DEFAULT_OAUTH_SCOPES,
  DEFAULT_TENANT,
  MICROSOFT_IDENTITY_BASE_URL,
} from "../constants.js";
import { validateMicrosoftUrl } from "../utils/validation.js";

/** Default HTTP server port (3001 to avoid conflict with stdio OAuth callback on 3000) */
const DEFAULT_SERVER_PORT = "3001";

/**
 * Configuration for the HTTP server
 */
export interface HttpServerConfig {
  /** Host to bind the server to */
  host: string;
  /** Port to listen on */
  port: number;
  /** Base URL for OAuth endpoints (issuer URL) */
  issuerUrl: string;
  /** Microsoft OAuth client ID */
  microsoftClientId: string;
  /** Microsoft OAuth client secret */
  microsoftClientSecret: string;
  /** Callback URL for Microsoft OAuth (our server's callback endpoint) */
  microsoftRedirectUri: string;
  /** Azure AD tenant (e.g. "common", "consumers", or a tenant ID) */
  tenant: string;
  /** OAuth scopes to request from Microsoft */
  scopes: string[];
  /** Microsoft identity authority base URL */
  authorityBaseUrl: string;
}

/**
 * Check if a URL is using localhost or loopback address
 */
/** @internal Exported for testing */
export function isLocalhost(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

/**
 * Load HTTP server config from environment variables.
 * Returns undefined if required OAuth credentials are not set.
 */
export function getHttpServerConfig(): HttpServerConfig | undefined {
  const microsoftClientId = process.env["ONENOTE_OAUTH_CLIENT_ID"];
  const microsoftClientSecret = process.env["ONENOTE_OAUTH_CLIENT_SECRET"];

  if (!microsoftClientId || !microsoftClientSecret) {
    return undefined;
  }

  const host = process.env["MCP_SERVER_HOST"] ?? "127.0.0.1";
  const port = parseInt(
    process.env["MCP_SERVER_PORT"] ?? DEFAULT_SERVER_PORT,
    10
  );
  // Use localhost in issuer URL for client compatibility (127.0.0.1 != localhost for OAuth)
  const issuerUrl = process.env["MCP_ISSUER_URL"] ?? `http://localhost:${port}`;
  const microsoftRedirectUri =
    process.env["ONENOTE_OAUTH_REDIRECT_URI"] ?? `${issuerUrl}/oauth/callback`;
  const tenant = process.env["ONENOTE_OAUTH_TENANT"] ?? DEFAULT_TENANT;
  const scopes = (
    process.env["ONENOTE_OAUTH_SCOPES"] ?? DEFAULT_OAUTH_SCOPES.join(" ")
  )
    .split(/\s+/)
    .filter(Boolean);
  const authorityBaseUrl =
    process.env["ONENOTE_OAUTH_AUTHORITY_BASE_URL"] ??
    MICROSOFT_IDENTITY_BASE_URL;

  validateMicrosoftUrl(authorityBaseUrl, "authority");

  // Security: Require HTTPS for non-localhost URLs
  if (!isLocalhost(issuerUrl) && !issuerUrl.startsWith("https://")) {
    console.error(
      "[onenote-mcp] ERROR: MCP_ISSUER_URL is using HTTP for a non-localhost address."
    );
    console.error(
      "[onenote-mcp] This is insecure and may expose OAuth tokens to man-in-the-middle attacks."
    );
    console.error(
      "[onenote-mcp] For production use, configure HTTPS with MCP_ISSUER_URL=https://..."
    );
    return undefined;
  }

  return {
    host,
    port,
    issuerUrl,
    microsoftClientId,
    microsoftClientSecret,
    microsoftRedirectUri,
    tenant,
    scopes,
    authorityBaseUrl,
  };
}
