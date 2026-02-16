/**
 * OneNote Proxy OAuth Provider
 *
 * Implements OAuthServerProvider to proxy OAuth requests to Microsoft.
 * This allows MCP clients to use standard OAuth/PKCE with dynamic client
 * registration while we handle the Microsoft Identity Platform flow
 * behind the scenes.
 *
 * Flow:
 * 1. MCP client starts OAuth with PKCE code_challenge
 * 2. We store the PKCE params and redirect to Microsoft OAuth
 * 3. User authorizes at Microsoft, Microsoft redirects back to our callback
 * 4. Our callback exchanges Microsoft code for Microsoft tokens
 * 5. We generate our own auth code and store mapping to Microsoft tokens
 * 6. We redirect MCP client with our auth code
 * 7. MCP client exchanges our code + code_verifier at our token endpoint
 * 8. We validate PKCE, issue our token wrapping the Microsoft token
 */

import type { Response as ExpressResponse } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import type { HttpServerConfig } from "./config.js";
import {
  getServerTokenStore,
  type PendingAuthRequest,
  type ServerTokenStore,
} from "./server-token-store.js";
import { FETCH_TIMEOUT_MS } from "../constants.js";
import { saveTokens } from "../onenote/token-store.js";

// ---------------------------------------------------------------------------
// Clients Store
// ---------------------------------------------------------------------------

/**
 * In-memory store for registered OAuth clients.
 * Supports dynamic client registration per RFC 7591.
 */
export class OneNoteClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    clientMetadata: Omit<
      OAuthClientInformationFull,
      "client_id" | "client_id_issued_at"
    >
  ): OAuthClientInformationFull {
    const client: OAuthClientInformationFull = {
      ...clientMetadata,
      client_id: crypto.randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(client.client_id, client);
    return client;
  }
}

// ---------------------------------------------------------------------------
// OneNote Proxy OAuth Provider
// ---------------------------------------------------------------------------

/**
 * OAuth provider that proxies authorization to Microsoft Identity Platform.
 *
 * Microsoft supports PKCE natively, but we still need the proxy pattern because:
 * 1. The MCP client dynamically registers with OUR server
 * 2. OUR server proxies the auth to Microsoft
 * 3. We wrap Microsoft tokens in our own tokens so the MCP SDK auth
 *    middleware can verify them locally
 */
export class OneNoteProxyOAuthProvider implements OAuthServerProvider {
  private readonly config: HttpServerConfig;
  private readonly tokenStore: ServerTokenStore;
  readonly clientsStore: OneNoteClientsStore;

  constructor(config: HttpServerConfig) {
    this.config = config;
    this.tokenStore = getServerTokenStore();
    this.clientsStore = new OneNoteClientsStore();
  }

  /**
   * Build the Microsoft OAuth authorize endpoint URL for the configured tenant.
   */
  private getAuthorizeEndpoint(): string {
    const base = this.config.authorityBaseUrl.replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(this.config.tenant)}/oauth2/v2.0/authorize`;
  }

  /**
   * Build the Microsoft OAuth token endpoint URL for the configured tenant.
   */
  private getTokenEndpoint(): string {
    const base = this.config.authorityBaseUrl.replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(this.config.tenant)}/oauth2/v2.0/token`;
  }

  /**
   * Begin authorization by storing PKCE params and redirecting to Microsoft.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: ExpressResponse
  ): Promise<void> {
    // Validate redirect_uri
    if (!client.redirect_uris.includes(params.redirectUri)) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Invalid redirect_uri",
      });
      return;
    }

    // Store pending request with PKCE params.
    // We generate our own "Microsoft state" for the upstream redirect, but we
    // must preserve the client's original OAuth state so we can echo it back
    // to the MCP client on the final redirect.
    const pendingRequest: Omit<PendingAuthRequest, "createdAt"> = {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: "S256", // We only support S256
      redirectUri: params.redirectUri,
      scope: params.scopes?.join(" "),
    };
    if (params.state && params.state.length > 0) {
      pendingRequest.clientState = params.state;
    }

    const microsoftState = this.tokenStore.storePendingRequest(pendingRequest);

    // Build Microsoft OAuth URL
    const msAuthUrl = new URL(this.getAuthorizeEndpoint());
    msAuthUrl.searchParams.set("client_id", this.config.microsoftClientId);
    msAuthUrl.searchParams.set("response_type", "code");
    msAuthUrl.searchParams.set(
      "redirect_uri",
      this.config.microsoftRedirectUri
    );
    msAuthUrl.searchParams.set("response_mode", "query");
    msAuthUrl.searchParams.set("scope", this.config.scopes.join(" "));
    msAuthUrl.searchParams.set("state", microsoftState);

    res.redirect(msAuthUrl.toString());
  }

  /**
   * Return the stored code_challenge for PKCE validation.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const entry = this.tokenStore.getAuthCode(authorizationCode);
    if (!entry) {
      throw new Error("Invalid authorization code");
    }
    return entry.codeChallenge;
  }

  /**
   * Exchange authorization code for tokens.
   * Validates PKCE locally, then returns our token wrapping Microsoft token.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    // Get and consume the auth code
    const codeEntry = this.tokenStore.consumeAuthCode(authorizationCode);
    if (!codeEntry) {
      throw new Error("Invalid or expired authorization code");
    }

    // Verify client matches
    if (codeEntry.clientId !== client.client_id) {
      throw new Error("Authorization code was not issued to this client");
    }

    // Verify redirect_uri matches
    if (redirectUri && codeEntry.redirectUri !== redirectUri) {
      throw new Error("redirect_uri mismatch");
    }

    // Note: PKCE validation is handled by the SDK via challengeForAuthorizationCode()
    // The SDK validates code_verifier before calling this method

    // Issue our access token wrapping the Microsoft token
    const { accessToken, expiresIn } = this.tokenStore.storeAccessToken({
      upstreamAccessToken: codeEntry.upstreamAccessToken,
      upstreamRefreshToken: codeEntry.upstreamRefreshToken,
      clientId: client.client_id,
      scope: codeEntry.scope,
    });

    // Issue refresh token if Microsoft gave us one
    let refreshToken: string | undefined;
    if (codeEntry.upstreamRefreshToken) {
      refreshToken = this.tokenStore.storeRefreshToken({
        upstreamRefreshToken: codeEntry.upstreamRefreshToken,
        clientId: client.client_id,
        scope: codeEntry.scope,
      });
    }

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      scope: codeEntry.scope,
      refresh_token: refreshToken,
    };
  }

  /**
   * Exchange refresh token for new access token.
   * Refreshes against Microsoft's token endpoint.
   */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    // Get refresh token entry
    const refreshEntry = this.tokenStore.getRefreshToken(refreshToken);
    if (!refreshEntry) {
      throw new Error("Invalid refresh token");
    }

    // Verify client matches
    if (refreshEntry.clientId !== client.client_id) {
      throw new Error("Refresh token was not issued to this client");
    }

    // Refresh against Microsoft -- scope is required for Microsoft token refresh
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshEntry.upstreamRefreshToken,
      client_id: this.config.microsoftClientId,
      client_secret: this.config.microsoftClientSecret,
      scope: this.config.scopes.join(" "),
    });

    const controller = new AbortController();
    /* v8 ignore start -- timeout callback only fires on real network delays */
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, FETCH_TIMEOUT_MS);
    /* v8 ignore stop */

    let response: Response;
    try {
      response = await fetch(this.getTokenEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Microsoft token refresh failed: ${text.slice(0, 200)}`);
    }

    const msTokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    // Revoke old refresh token and issue new ones
    this.tokenStore.revokeRefreshToken(refreshToken);

    const { accessToken, expiresIn } = this.tokenStore.storeAccessToken({
      upstreamAccessToken: msTokens.access_token,
      upstreamRefreshToken: msTokens.refresh_token,
      clientId: client.client_id,
      scope: refreshEntry.scope,
    });

    // Persist refreshed Microsoft tokens to disk for stdio mode fallback
    try {
      const tokenData: {
        accessToken: string;
        refreshToken?: string;
        expiresAt?: string;
      } = {
        accessToken: msTokens.access_token,
      };
      if (msTokens.refresh_token !== undefined) {
        tokenData.refreshToken = msTokens.refresh_token;
      }
      if (msTokens.expires_in !== undefined) {
        tokenData.expiresAt = new Date(
          Date.now() + msTokens.expires_in * 1000
        ).toISOString();
      }
      saveTokens(tokenData);
    } catch (err) {
      console.error(
        "[onenote-mcp] Failed to persist refreshed tokens to disk:",
        err
      );
    }

    let newRefreshToken: string | undefined;
    if (msTokens.refresh_token) {
      newRefreshToken = this.tokenStore.storeRefreshToken({
        upstreamRefreshToken: msTokens.refresh_token,
        clientId: client.client_id,
        scope: refreshEntry.scope,
      });
    }

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      scope: refreshEntry.scope,
      refresh_token: newRefreshToken,
    };
  }

  /**
   * Verify an access token and return auth info.
   * The Microsoft token is stored in extra.oneNoteToken for use by handlers.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const entry = this.tokenStore.getAccessToken(token);
    if (!entry) {
      throw new Error("Invalid or expired token");
    }

    return {
      token,
      clientId: entry.clientId,
      scopes: entry.scope ? entry.scope.split(" ") : [],
      expiresAt: Math.floor(entry.expiresAt / 1000),
      extra: {
        oneNoteToken: entry.upstreamAccessToken,
      },
    };
  }

  /**
   * Revoke an access or refresh token.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const { token, token_type_hint } = request;

    if (token_type_hint === "refresh_token") {
      this.tokenStore.revokeRefreshToken(token);
    } else {
      // Try both - token could be either type
      this.tokenStore.revokeAccessToken(token);
      this.tokenStore.revokeRefreshToken(token);
    }
  }
}

// ---------------------------------------------------------------------------
// Microsoft OAuth Callback Handler
// ---------------------------------------------------------------------------

/**
 * Handle the OAuth callback from Microsoft.
 * Exchanges Microsoft auth code for tokens, then redirects to MCP client.
 */
export async function handleMicrosoftOAuthCallback(
  config: HttpServerConfig,
  tokenStore: ServerTokenStore,
  code: string,
  state: string
): Promise<
  { redirectUrl: string } | { error: string; errorDescription: string }
> {
  // Get pending request
  const pending = tokenStore.consumePendingRequest(state);
  if (!pending) {
    return {
      error: "invalid_request",
      errorDescription: "Invalid or expired state parameter",
    };
  }

  // Build Microsoft token endpoint URL
  const tokenEndpoint = (() => {
    const base = config.authorityBaseUrl.replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(config.tenant)}/oauth2/v2.0/token`;
  })();

  // Exchange Microsoft code for tokens -- redirect_uri and scope are required
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.microsoftClientId,
    client_secret: config.microsoftClientSecret,
    redirect_uri: config.microsoftRedirectUri,
    scope: config.scopes.join(" "),
  });

  let msTokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const controller = new AbortController();
  /* v8 ignore start -- timeout callback only fires on real network delays */
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);
  /* v8 ignore stop */

  try {
    let response: Response;
    try {
      response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      // Truncate error details to avoid leaking sensitive data in logs
      console.error(
        `[onenote-mcp] Microsoft token exchange failed: ${text.slice(0, 200)}`
      );
      return {
        error: "server_error",
        errorDescription:
          "Failed to exchange authorization code with Microsoft",
      };
    }

    msTokens = (await response.json()) as typeof msTokens;
  } catch (err) {
    console.error("[onenote-mcp] Microsoft token exchange error:", err);
    return {
      error: "server_error",
      errorDescription: "Failed to communicate with Microsoft",
    };
  }

  // Generate our authorization code
  const ourCode = tokenStore.storeAuthCode({
    clientId: pending.clientId,
    codeChallenge: pending.codeChallenge,
    codeChallengeMethod: pending.codeChallengeMethod,
    redirectUri: pending.redirectUri,
    upstreamAccessToken: msTokens.access_token,
    upstreamRefreshToken: msTokens.refresh_token,
    scope: pending.scope,
  });

  // Persist Microsoft tokens to disk for stdio mode fallback
  try {
    const tokenData: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: string;
    } = {
      accessToken: msTokens.access_token,
    };
    if (msTokens.refresh_token !== undefined) {
      tokenData.refreshToken = msTokens.refresh_token;
    }
    if (msTokens.expires_in !== undefined) {
      tokenData.expiresAt = new Date(
        Date.now() + msTokens.expires_in * 1000
      ).toISOString();
    }
    saveTokens(tokenData);
  } catch (err) {
    // Non-fatal: stdio mode may not work but HTTP mode continues
    console.error("[onenote-mcp] Failed to persist tokens to disk:", err);
  }

  // Build redirect URL back to MCP client
  const redirectUrl = new URL(pending.redirectUri);
  redirectUrl.searchParams.set("code", ourCode);
  // Echo back the client's original OAuth state (Cursor validates this).
  // If none was provided, fall back to our upstream state.
  if (pending.clientState && pending.clientState.length > 0) {
    redirectUrl.searchParams.set("state", pending.clientState);
  } else {
    redirectUrl.searchParams.set("state", state);
  }

  return { redirectUrl: redirectUrl.toString() };
}
