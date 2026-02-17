/**
 * OneNote OAuth Helpers
 *
 * OAuth 2.0 authorization code flow for Microsoft identity platform.
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  DEFAULT_OAUTH_SCOPES,
  DEFAULT_REDIRECT_URI,
  DEFAULT_TENANT,
  FETCH_TIMEOUT_MS,
  MICROSOFT_IDENTITY_BASE_URL,
  TOKEN_EXPIRY_BUFFER_MS,
} from "../constants.js";
import { validateMicrosoftUrl } from "../utils/validation.js";

/** Stored token data (persisted to disk) */
export interface OneNoteTokenData {
  accessToken: string;
  refreshToken?: string;
  /** ISO 8601 timestamp when the access token expires */
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
}

/** OAuth configuration from environment */
export interface OneNoteOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tenant: string;
  scopes: string[];
  authorityBaseUrl: string;
}

const OneNoteTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

type OneNoteTokenResponse = z.infer<typeof OneNoteTokenResponseSchema>;

/** Error thrown during OAuth operations */
export class OneNoteOAuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_CONFIG"
      | "TOKEN_EXCHANGE_FAILED"
      | "REFRESH_FAILED"
      | "INVALID_RESPONSE"
      | "USER_DENIED"
      | "OAUTH_FAILED"
  ) {
    super(message);
    this.name = "OneNoteOAuthError";
  }
}

/** Generate a cryptographically random state parameter for CSRF protection */
export function generateState(): string {
  return randomBytes(16).toString("hex");
}

/** Parse configured scope string into scope array. */
export function parseScopes(scopeString: string | undefined): string[] {
  if (!scopeString) {
    return [...DEFAULT_OAUTH_SCOPES];
  }

  const parsed = scopeString
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  return parsed.length > 0 ? parsed : [...DEFAULT_OAUTH_SCOPES];
}

/** Build the OAuth authorization endpoint URL for the configured tenant. */
function getAuthorizeEndpoint(config: OneNoteOAuthConfig): string {
  const base = config.authorityBaseUrl.replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(config.tenant)}/oauth2/v2.0/authorize`;
}

/** Build the OAuth token endpoint URL for the configured tenant. */
function getTokenEndpoint(config: OneNoteOAuthConfig): string {
  const base = config.authorityBaseUrl.replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(config.tenant)}/oauth2/v2.0/token`;
}

/** Build the OAuth authorization URL */
export function buildAuthorizeUrl(
  config: OneNoteOAuthConfig,
  state: string
): string {
  const url = new URL(getAuthorizeEndpoint(config));
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

/** Exchange an authorization code for tokens */
export async function exchangeCodeForToken(
  config: OneNoteOAuthConfig,
  code: string
): Promise<OneNoteTokenData> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    scope: config.scopes.join(" "),
  });

  return requestToken(config, body, "TOKEN_EXCHANGE_FAILED");
}

/** Refresh an access token using a refresh token */
export async function refreshAccessToken(
  config: OneNoteOAuthConfig,
  refreshToken: string
): Promise<OneNoteTokenData> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: config.scopes.join(" "),
  });

  return requestToken(config, body, "REFRESH_FAILED");
}

async function requestToken(
  config: OneNoteOAuthConfig,
  body: URLSearchParams,
  code: "TOKEN_EXCHANGE_FAILED" | "REFRESH_FAILED"
): Promise<OneNoteTokenData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(getTokenEndpoint(config), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();

  if (!response.ok) {
    // Parse error response to extract only safe fields, avoiding raw body leaks
    let errorMessage = `Token request failed (${response.status})`;
    try {
      const errorBody: unknown = JSON.parse(text);
      if (typeof errorBody === "object" && errorBody !== null) {
        const obj = errorBody as Record<string, unknown>;
        const errorCode = typeof obj["error"] === "string" ? obj["error"] : undefined;
        const errorDesc = typeof obj["error_description"] === "string" ? obj["error_description"] : undefined;
        if (errorCode || errorDesc) {
          errorMessage = `Token request failed (${response.status}): ${errorCode ?? "unknown_error"}${errorDesc ? ` - ${errorDesc}` : ""}`;
        }
      }
    } catch {
      // Response is not JSON, use generic message
    }
    throw new OneNoteOAuthError(errorMessage, code);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OneNoteOAuthError(
      "Token endpoint returned invalid JSON",
      "INVALID_RESPONSE"
    );
  }

  const parsed = OneNoteTokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new OneNoteOAuthError(
      `Invalid token response: ${parsed.error.message}`,
      "INVALID_RESPONSE"
    );
  }

  return tokenResponseToData(parsed.data);
}

function tokenResponseToData(response: OneNoteTokenResponse): OneNoteTokenData {
  const data: OneNoteTokenData = {
    accessToken: response.access_token,
  };

  if (response.refresh_token) {
    data.refreshToken = response.refresh_token;
  }

  if (response.expires_in !== undefined) {
    const expiresAt = new Date(Date.now() + response.expires_in * 1000);
    data.expiresAt = expiresAt.toISOString();
  }

  if (response.scope) {
    data.scope = response.scope;
  }

  if (response.token_type) {
    data.tokenType = response.token_type;
  }

  return data;
}

/** Check if a token is expired or about to expire.
 *  Returns true when expiresAt is missing (conservative: treat unknown expiry
 *  as expired so a refresh is attempted rather than using a potentially stale
 *  token). */
export function isTokenExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) {
    return true;
  }

  const expiresAtMs = new Date(expiresAt).getTime();
  const nowMs = Date.now();

  return nowMs >= expiresAtMs - TOKEN_EXPIRY_BUFFER_MS;
}

/**
 * Load OAuth config from environment variables.
 * Returns undefined if required values are missing.
 */
export function loadOAuthConfigFromEnv(): OneNoteOAuthConfig | undefined {
  const clientId = process.env["ONENOTE_OAUTH_CLIENT_ID"];
  const clientSecret = process.env["ONENOTE_OAUTH_CLIENT_SECRET"];

  if (!clientId || !clientSecret) {
    return undefined;
  }

  const redirectUri =
    process.env["ONENOTE_OAUTH_REDIRECT_URI"] ?? DEFAULT_REDIRECT_URI;
  const tenant = process.env["ONENOTE_OAUTH_TENANT"] ?? DEFAULT_TENANT;
  const scopes = parseScopes(process.env["ONENOTE_OAUTH_SCOPES"]);
  const authorityBaseUrl =
    process.env["ONENOTE_OAUTH_AUTHORITY_BASE_URL"] ??
    MICROSOFT_IDENTITY_BASE_URL;

  validateMicrosoftUrl(authorityBaseUrl, "authority");

  return {
    clientId,
    clientSecret,
    redirectUri,
    tenant,
    scopes,
    authorityBaseUrl,
  };
}
