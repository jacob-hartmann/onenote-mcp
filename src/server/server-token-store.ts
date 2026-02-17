/**
 * Server Token Store
 *
 * In-memory storage for OAuth authorization codes and tokens.
 * This is used by the proxy OAuth provider to store:
 * - Pending authorization requests (PKCE challenges, redirect URIs)
 * - Authorization codes mapped to upstream Microsoft tokens
 * - Access tokens issued by our server that wrap upstream tokens
 * - Refresh tokens issued by our server that wrap upstream refresh tokens
 */

import { createHash, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Pending authorization request (before user completes Microsoft auth)
 */
export interface PendingAuthRequest {
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: "S256" | "plain";
  redirectUri: string;
  /**
   * OAuth "state" from the MCP client (e.g., Cursor).
   * Must be echoed back to the client on the final redirect.
   */
  clientState?: string;
  scope: string | undefined;
  createdAt: number;
}

/**
 * Authorization code entry (after user completes Microsoft auth)
 */
export interface AuthCodeEntry {
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: "S256" | "plain";
  redirectUri: string;
  upstreamAccessToken: string;
  upstreamRefreshToken: string | undefined;
  scope: string | undefined;
  createdAt: number;
  expiresAt: number;
}

/**
 * Access token entry (after code exchange)
 */
export interface TokenEntry {
  upstreamAccessToken: string;
  upstreamRefreshToken: string | undefined;
  clientId: string;
  scope: string | undefined;
  createdAt: number;
  expiresAt: number;
}

/**
 * Refresh token entry
 */
export interface RefreshTokenEntry {
  upstreamRefreshToken: string;
  clientId: string;
  scope: string | undefined;
  createdAt: number;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Authorization code expiry in seconds (10 minutes) */
const AUTH_CODE_EXPIRY_SECONDS = 600;

/** Access token expiry in seconds (1 hour) */
const ACCESS_TOKEN_EXPIRY_SECONDS = 3600;

/** Pending request expiry in seconds (10 minutes) */
const PENDING_REQUEST_EXPIRY_SECONDS = 600;

/** Refresh token expiry in seconds (30 days) */
const REFRESH_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60;

/** Cleanup interval in milliseconds (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum number of pending authorization requests */
const MAX_PENDING_REQUESTS = 10_000;

/** Maximum number of authorization codes */
const MAX_AUTH_CODES = 10_000;

/** Maximum number of access tokens */
const MAX_ACCESS_TOKENS = 10_000;

/** Maximum number of refresh tokens */
const MAX_REFRESH_TOKENS = 10_000;

// ---------------------------------------------------------------------------
// Server Token Store
// ---------------------------------------------------------------------------

/**
 * In-memory token store for the OAuth proxy server.
 *
 * Manages four categories of data:
 * 1. Pending auth requests -- keyed by an internal state parameter, storing
 *    the MCP client's PKCE challenge and redirect URI while the user
 *    completes Microsoft OAuth in the browser.
 * 2. Authorization codes -- short-lived codes issued after the Microsoft
 *    callback, exchangeable by the MCP client for access/refresh tokens.
 * 3. Access tokens -- proxy tokens that wrap a real Microsoft access token.
 * 4. Refresh tokens -- proxy tokens that wrap a real Microsoft refresh token.
 *
 * A periodic cleanup timer removes expired entries automatically.
 */
export class ServerTokenStore {
  /** Pending auth requests indexed by state */
  private pendingRequests = new Map<string, PendingAuthRequest>();

  /** Authorization codes indexed by code */
  private authCodes = new Map<string, AuthCodeEntry>();

  /** Access tokens indexed by token */
  private accessTokens = new Map<string, TokenEntry>();

  /** Refresh tokens indexed by token */
  private refreshTokens = new Map<string, RefreshTokenEntry>();

  /** Handle for the periodic cleanup timer */
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);

    // Allow the process to exit even if the timer is still running
    this.cleanupTimer.unref();
  }

  // -------------------------------------------------------------------------
  // Pending Authorization Requests
  // -------------------------------------------------------------------------

  /**
   * Store a pending authorization request.
   * Returns the internal state parameter to use for the upstream OAuth redirect.
   */
  storePendingRequest(request: Omit<PendingAuthRequest, "createdAt">): string {
    if (this.pendingRequests.size >= MAX_PENDING_REQUESTS) {
      throw new Error("Too many pending authorization requests");
    }
    const state = crypto.randomUUID();
    this.pendingRequests.set(state, {
      ...request,
      createdAt: Date.now(),
    });
    return state;
  }

  /**
   * Get and remove a pending request by state.
   * Returns undefined if not found or expired.
   */
  consumePendingRequest(state: string): PendingAuthRequest | undefined {
    const request = this.pendingRequests.get(state);
    if (!request) {
      return undefined;
    }

    this.pendingRequests.delete(state);

    // Check if expired
    const expiresAt = request.createdAt + PENDING_REQUEST_EXPIRY_SECONDS * 1000;
    if (Date.now() > expiresAt) {
      return undefined;
    }

    return request;
  }

  // -------------------------------------------------------------------------
  // Authorization Codes
  // -------------------------------------------------------------------------

  /**
   * Store an authorization code with associated data.
   * Returns the authorization code.
   */
  storeAuthCode(data: Omit<AuthCodeEntry, "createdAt" | "expiresAt">): string {
    if (this.authCodes.size >= MAX_AUTH_CODES) {
      throw new Error("Too many authorization codes");
    }
    const code = crypto.randomUUID();
    const now = Date.now();
    this.authCodes.set(code, {
      ...data,
      createdAt: now,
      expiresAt: now + AUTH_CODE_EXPIRY_SECONDS * 1000,
    });
    return code;
  }

  /**
   * Get an authorization code entry (does not consume it).
   * Used for PKCE challenge lookup.
   */
  getAuthCode(code: string): AuthCodeEntry | undefined {
    const entry = this.authCodes.get(code);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.authCodes.delete(code);
      return undefined;
    }

    return entry;
  }

  /**
   * Get and remove an authorization code.
   * Returns undefined if not found or expired.
   */
  consumeAuthCode(code: string): AuthCodeEntry | undefined {
    const entry = this.getAuthCode(code);
    if (entry) {
      this.authCodes.delete(code);
    }
    return entry;
  }

  // -------------------------------------------------------------------------
  // Access Tokens
  // -------------------------------------------------------------------------

  /**
   * Store an access token with associated data.
   * Returns the proxy access token and its TTL.
   */
  storeAccessToken(data: Omit<TokenEntry, "createdAt" | "expiresAt">): {
    accessToken: string;
    expiresIn: number;
  } {
    if (this.accessTokens.size >= MAX_ACCESS_TOKENS) {
      throw new Error("Too many access tokens");
    }
    const token = crypto.randomUUID();
    const now = Date.now();
    this.accessTokens.set(token, {
      ...data,
      createdAt: now,
      expiresAt: now + ACCESS_TOKEN_EXPIRY_SECONDS * 1000,
    });
    return { accessToken: token, expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS };
  }

  /**
   * Validate and get token entry.
   * Returns undefined if not found or expired.
   */
  getAccessToken(token: string): TokenEntry | undefined {
    const entry = this.accessTokens.get(token);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.accessTokens.delete(token);
      return undefined;
    }

    return entry;
  }

  /**
   * Revoke an access token.
   */
  revokeAccessToken(token: string): boolean {
    return this.accessTokens.delete(token);
  }

  // -------------------------------------------------------------------------
  // Refresh Tokens
  // -------------------------------------------------------------------------

  /**
   * Store a refresh token.
   * Returns the proxy refresh token.
   */
  storeRefreshToken(
    data: Omit<RefreshTokenEntry, "createdAt" | "expiresAt">
  ): string {
    if (this.refreshTokens.size >= MAX_REFRESH_TOKENS) {
      throw new Error("Too many refresh tokens");
    }
    const token = crypto.randomUUID();
    const now = Date.now();
    this.refreshTokens.set(token, {
      ...data,
      createdAt: now,
      expiresAt: now + REFRESH_TOKEN_EXPIRY_SECONDS * 1000,
    });
    return token;
  }

  /**
   * Get refresh token entry.
   * Returns undefined if not found or expired.
   */
  getRefreshToken(token: string): RefreshTokenEntry | undefined {
    const entry = this.refreshTokens.get(token);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.refreshTokens.delete(token);
      return undefined;
    }

    return entry;
  }

  /**
   * Revoke a refresh token.
   */
  revokeRefreshToken(token: string): boolean {
    return this.refreshTokens.delete(token);
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /**
   * Clean up expired entries from all maps.
   * Called automatically on a periodic timer, but can also be invoked manually.
   */
  cleanup(): void {
    const now = Date.now();

    // Clean pending requests
    for (const [state, request] of this.pendingRequests) {
      const expiresAt =
        request.createdAt + PENDING_REQUEST_EXPIRY_SECONDS * 1000;
      if (now > expiresAt) {
        this.pendingRequests.delete(state);
      }
    }

    // Clean auth codes
    for (const [code, entry] of this.authCodes) {
      if (now > entry.expiresAt) {
        this.authCodes.delete(code);
      }
    }

    // Clean access tokens
    for (const [token, entry] of this.accessTokens) {
      if (now > entry.expiresAt) {
        this.accessTokens.delete(token);
      }
    }

    // Clean refresh tokens
    for (const [token, entry] of this.refreshTokens) {
      if (now > entry.expiresAt) {
        this.refreshTokens.delete(token);
      }
    }
  }

  /**
   * Stop the automatic cleanup timer.
   * Call this when shutting down the server to avoid resource leaks in tests.
   */
  dispose(): void {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// PKCE Utilities
// ---------------------------------------------------------------------------

/**
 * Verify a PKCE code verifier against a code challenge.
 *
 * For `S256`, the verifier is hashed with SHA-256 and base64url-encoded,
 * then compared to the stored challenge. For `plain`, a direct string
 * comparison is performed.
 */
export function verifyPkceChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: "S256" | "plain"
): boolean {
  if (method === "plain") {
    // Constant-time comparison to prevent timing side-channel attacks
    const a = Buffer.from(codeVerifier);
    const b = Buffer.from(codeChallenge);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  // S256: base64url(sha256(code_verifier)) === code_challenge
  const hash = createHash("sha256").update(codeVerifier).digest();
  const computed = hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  // Constant-time comparison
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Singleton Instance
// ---------------------------------------------------------------------------

let storeInstance: ServerTokenStore | undefined;

/**
 * Get the singleton token store instance.
 * Creates it on first call; subsequent calls return the same instance.
 */
export function getServerTokenStore(): ServerTokenStore {
  storeInstance ??= new ServerTokenStore();
  return storeInstance;
}
