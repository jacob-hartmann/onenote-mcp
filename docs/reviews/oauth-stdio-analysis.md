# OAuth-over-STDIO Analysis: OneNote MCP vs Quire MCP

## Problem Statement

The OneNote MCP server fails with **"failed to discover OAuth metadata"** when connected
via `pnpm inspect` (MCP Inspector). The Quire MCP server handles this correctly.

This document provides a thorough analysis of how both projects handle OAuth, identifies
the exact gap, and recommends specific code changes.

---

## 1. How Quire Does It

### 1.1 Dual-Transport Architecture

Quire MCP supports **two transport modes**, selected via the `MCP_TRANSPORT` environment
variable:

- **stdio** (default): Plain `StdioServerTransport`, no protocol-level OAuth. Auth is
  handled by reading tokens from environment variables or disk, or by launching an
  interactive OAuth flow (local callback HTTP server).
- **http**: Full Express HTTP server with the MCP SDK's built-in OAuth authorization
  server, using `mcpAuthRouter`, `OAuthServerProvider`, `requireBearerAuth`, and
  `StreamableHTTPServerTransport`.

**File:** `C:\Users\JacobHartmann\Projects\Personal\MCP Development\Quire MCP\src\index.ts`
(lines 88-100)

```typescript
async function main(): Promise<void> {
  const transport = process.env["MCP_TRANSPORT"] ?? "stdio";
  // ...
  if (transport === "http") {
    await startHttpServerMode();
  } else {
    await startStdioServer(createServer());
  }
}
```

### 1.2 STDIO Mode: No OAuth Metadata Needed

In stdio mode, Quire simply creates a `StdioServerTransport` and connects the MCP server
to it. **There is no OAuth metadata endpoint, no authorization server, no bearer auth
middleware.** The server just starts and responds to MCP JSON-RPC messages over stdin/stdout.

**File:** `C:\Users\JacobHartmann\Projects\Personal\MCP Development\Quire MCP\src\index.ts`
(lines 42-46)

```typescript
async function startStdioServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server running on stdio transport`);
}
```

Authentication in stdio mode is handled **internally** by the client factory, which uses
a precedence chain:

1. `QUIRE_ACCESS_TOKEN` environment variable
2. Cached token from disk (`tokens.json`)
3. Refresh using stored `refresh_token`
4. Interactive OAuth login (spawns a local HTTP server for the callback, prints the URL
   to stderr)

**File:** `C:\Users\JacobHartmann\Projects\Personal\MCP Development\Quire MCP\src\quire\auth.ts`
(lines 100-158)

### 1.3 HTTP Mode: Full MCP OAuth Stack

When `MCP_TRANSPORT=http`, the Quire MCP launches a full Express server with:

1. **`mcpAuthRouter`** (from `@modelcontextprotocol/sdk/server/auth/router.js`) -- Mounts
   the following endpoints:
   - `GET /.well-known/oauth-authorization-server` -- OAuth metadata discovery
   - `GET /.well-known/oauth-protected-resource` -- Protected resource metadata
   - `POST /authorize` -- Authorization endpoint
   - `POST /token` -- Token endpoint
   - `POST /register` -- Dynamic client registration (RFC 7591)

2. **`QuireProxyOAuthProvider`** (implements `OAuthServerProvider`) -- A proxy that:
   - Receives PKCE-based authorization requests from MCP clients
   - Redirects to Quire's OAuth (which doesn't support PKCE) storing the PKCE params
   - Receives the callback from Quire, exchanges the code for Quire tokens
   - Issues its own authorization codes and tokens that wrap the Quire tokens
   - Validates PKCE on the MCP client side

3. **`requireBearerAuth`** middleware -- Protects the `/mcp` endpoint, extracting the
   bearer token and calling `provider.verifyAccessToken()` to get the underlying Quire
   token.

4. **`StreamableHTTPServerTransport`** -- Handles MCP JSON-RPC over HTTP with session
   management.

**File:** `C:\Users\JacobHartmann\Projects\Personal\MCP Development\Quire MCP\src\server\http-server.ts`
(lines 71-562)

### 1.4 Client Factory: Dual-Mode Token Resolution

The client factory checks `extra.authInfo` first (populated by the bearer auth middleware
in HTTP mode), and falls back to the stdio auth chain:

**File:** `C:\Users\JacobHartmann\Projects\Personal\MCP Development\Quire MCP\src\quire\client-factory.ts`
(lines 31-47)

```typescript
export async function getQuireClient(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<QuireClientResult> {
  // In HTTP mode, the Quire token is passed via authInfo.extra.quireToken
  const quireToken = extra.authInfo?.extra?.["quireToken"];

  if (typeof quireToken === "string" && quireToken.length > 0) {
    return { success: true, client: new QuireClient({ token: quireToken }) };
  }

  // Fallback to stdio mode auth (env var or interactive OAuth)
  const clientResult = await createClientFromAuth();
  // ...
}
```

### 1.5 Key Dependencies for HTTP Mode

**File:** `C:\Users\JacobHartmann\Projects\Personal\MCP Development\Quire MCP\package.json`
(lines 53-61)

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.26.0",
    "cross-env": "^10.1.0",
    "express": "^5.1.0",
    "express-rate-limit": "^8.2.1",
    "helmet": "^8.1.0"
  }
}
```

The HTTP mode requires `express`, `helmet`, and `express-rate-limit` as production
dependencies. These are NOT needed for stdio-only mode.

### 1.6 Files Comprising the HTTP/OAuth Server

| File | Purpose |
|------|---------|
| `src/server/index.ts` | Module barrel export |
| `src/server/config.ts` | `HttpServerConfig` type and `getHttpServerConfig()` |
| `src/server/http-server.ts` | Express app setup, route mounting, session management |
| `src/server/quire-oauth-provider.ts` | `QuireProxyOAuthProvider` (implements `OAuthServerProvider`), `QuireClientsStore`, `handleQuireOAuthCallback()` |
| `src/server/server-token-store.ts` | In-memory token store for auth codes, access tokens, refresh tokens, PKCE state |
| `src/server/cors.ts` | CORS path allowlisting for OAuth endpoints |

---

## 2. How OneNote Does It Currently

### 2.1 STDIO-Only Architecture

The OneNote MCP **only supports stdio transport**. There is no HTTP mode, no
`mcpAuthRouter`, no `OAuthServerProvider`, no bearer auth middleware.

**File:** `C:\Users\JacobHartmann\Projects\Personal\MCP Development\OneNote MCP\src\index.ts`
(lines 53-67)

```typescript
async function main(): Promise<void> {
  console.error(
    `[${SERVER_NAME}] Starting server v${SERVER_VERSION} (stdio transport)...`
  );
  const server = createServer();
  // ...
  await startStdioServer(server);
}
```

### 2.2 Authentication: Interactive-Only Over STDIO

Authentication follows the same precedence chain as Quire's stdio mode:

1. `ONENOTE_ACCESS_TOKEN` environment variable
2. Cached token from disk
3. Refresh using stored `refresh_token`
4. Interactive OAuth login (spawns a local HTTP server for the callback)

**File:** `C:\Users\JacobHartmann\Projects\Personal\MCP Development\OneNote MCP\src\onenote\auth.ts`
(lines 84-128)

This is identical in structure to Quire's stdio auth, but adapted for Microsoft's OAuth
endpoints (Azure Entra / Microsoft Identity Platform) instead of Quire's.

### 2.3 Client Factory: No HTTP Mode Support

The OneNote client factory **does not check `extra.authInfo`**. It always falls back to
the stdio auth chain. The `_extra` parameter is explicitly unused:

**File:** `C:\Users\JacobHartmann\Projects\Personal\MCP Development\OneNote MCP\src\onenote\client-factory.ts`
(lines 22-31)

```typescript
export async function getOneNoteClient(
  _extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<OneNoteClientResult> {
  const clientResult = await createClientFromAuth();
  // ...
}
```

### 2.4 No Server-Side OAuth Files

The OneNote MCP has **none** of the following:

- `src/server/` directory
- `OAuthServerProvider` implementation
- `mcpAuthRouter` usage
- `requireBearerAuth` middleware
- `StreamableHTTPServerTransport`
- `express` dependency
- `MCP_TRANSPORT` environment variable

---

## 3. The Gap

### 3.1 Root Cause of the Error

When the MCP Inspector connects to a server via `pnpm inspect` (or `mcp-inspector`), it
runs the server as a STDIO subprocess. However, the MCP Inspector's UI **also** provides
an OAuth flow for authenticating the user. To do this, the Inspector needs to discover
the server's OAuth metadata.

The MCP Inspector's approach depends on the SDK version and how the server is configured.
With SDK version 1.26.0, the MCP Inspector spawns the process and communicates via STDIO.
However, it may also try to discover OAuth metadata either:

1. **Via the MCP protocol** -- by sending a discovery request over the STDIO transport
   itself, or
2. **Via HTTP** -- by expecting the server to also expose an HTTP endpoint for
   `/.well-known/oauth-authorization-server`.

The error **"failed to discover OAuth metadata"** indicates the Inspector is attempting
to use the MCP protocol's OAuth discovery mechanism, and the OneNote MCP server has no
handler for it. In stdio mode, neither Quire nor OneNote exposes OAuth metadata through
the protocol -- but Quire works because it uses a different authentication strategy that
doesn't require protocol-level OAuth.

### 3.2 The Actual Difference

Looking more carefully at how the MCP Inspector works:

The MCP Inspector (`@modelcontextprotocol/inspector` v0.19.0) when running in STDIO mode
with `pnpm inspect`, starts the server as a subprocess. It does NOT require OAuth
metadata discovery for STDIO transport -- it only needs OAuth metadata when connecting to
an HTTP server.

The key insight is that **the MCP Inspector DOES work with STDIO servers that handle
auth internally** (like Quire's stdio mode). The error "failed to discover OAuth
metadata" likely occurs because:

1. The OneNote MCP's interactive OAuth flow spawns a local HTTP callback server on
   `localhost:3000`, which may conflict with the Inspector's own HTTP server.
2. The interactive OAuth flow writes the authorization URL to stderr and waits for a
   browser callback -- but the MCP Inspector intercepts stderr and the callback never
   completes, causing a failure that manifests as the metadata discovery error.
3. **Most likely**: The MCP Inspector is being configured to use HTTP transport (perhaps
   the Inspector's UI has an "Auth" tab that tries HTTP-based OAuth), and the OneNote MCP
   has no HTTP mode to respond.

### 3.3 What Quire Has That OneNote Doesn't

| Feature | Quire MCP | OneNote MCP |
|---------|-----------|-------------|
| STDIO transport | Yes | Yes |
| HTTP transport | Yes (via `MCP_TRANSPORT=http`) | **No** |
| `OAuthServerProvider` implementation | `QuireProxyOAuthProvider` | **None** |
| `mcpAuthRouter` (OAuth metadata, authorize, token, register) | Yes | **No** |
| `requireBearerAuth` middleware | Yes | **No** |
| `StreamableHTTPServerTransport` | Yes | **No** |
| Dynamic client registration (RFC 7591) | Yes (via `QuireClientsStore`) | **No** |
| OAuth callback endpoint | Yes (`/oauth/callback`) | **No** (only has interactive localhost callback) |
| `express` dependency | Yes | **No** |
| `authInfo` check in client factory | Yes (`extra.authInfo?.extra?.["quireToken"]`) | **No** (ignores `extra`) |
| CORS for OAuth endpoints | Yes | **No** |
| In-memory server token store | Yes (`ServerTokenStore`) | **No** |
| Session management with LRU | Yes | **No** |
| `cross-env` for transport selection | Yes | **No** |

---

## 4. Recommended Fix

### 4.1 Architecture Decision

To make the OneNote MCP work with the MCP Inspector's OAuth flow, the server needs to
support the **HTTP transport mode** with the MCP SDK's built-in OAuth authorization
server, exactly as Quire does.

This means adding:

1. A new `src/server/` module with:
   - `config.ts` -- HTTP server configuration
   - `http-server.ts` -- Express app with OAuth + MCP endpoints
   - `onenote-oauth-provider.ts` -- `OAuthServerProvider` that proxies to Microsoft
   - `server-token-store.ts` -- In-memory storage for OAuth state (can be copied from
     Quire with minor adjustments)
   - `cors.ts` -- CORS path allowlisting
   - `index.ts` -- Barrel export

2. Updates to `src/index.ts` to support dual transport modes

3. Updates to `src/onenote/client-factory.ts` to check `extra.authInfo`

4. New dependencies: `express`, `helmet`, `express-rate-limit`, `cross-env`

5. New dev dependency types: `@types/express`

### 4.2 Implementation Steps

#### Step 1: Add Dependencies

```bash
pnpm add express helmet express-rate-limit cross-env
pnpm add -D @types/express
```

#### Step 2: Create `src/server/config.ts`

Adapted from Quire's `src/server/config.ts`:

```typescript
/**
 * HTTP Server Configuration
 */

import { DEFAULT_SERVER_PORT } from "../constants.js";

export interface HttpServerConfig {
  host: string;
  port: number;
  issuerUrl: string;
  microsoftClientId: string;
  microsoftClientSecret: string;
  microsoftRedirectUri: string;
  tenant: string;
  scopes: string[];
  authorityBaseUrl: string;
}

function isLocalhost(urlString: string): boolean {
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
  const issuerUrl =
    process.env["MCP_ISSUER_URL"] ?? `http://localhost:${port}`;
  const microsoftRedirectUri =
    process.env["ONENOTE_OAUTH_REDIRECT_URI"] ??
    `${issuerUrl}/oauth/callback`;
  const tenant = process.env["ONENOTE_OAUTH_TENANT"] ?? "common";
  const scopes = (
    process.env["ONENOTE_OAUTH_SCOPES"] ??
    "offline_access openid profile User.Read Notes.ReadWrite"
  ).split(/\s+/).filter(Boolean);
  const authorityBaseUrl =
    process.env["ONENOTE_OAUTH_AUTHORITY_BASE_URL"] ??
    "https://login.microsoftonline.com";

  if (!isLocalhost(issuerUrl) && !issuerUrl.startsWith("https://")) {
    console.error(
      "[onenote-mcp] ERROR: MCP_ISSUER_URL must use HTTPS for non-localhost."
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
```

#### Step 3: Create `src/server/server-token-store.ts`

This can be **copied verbatim** from Quire's `src/server/server-token-store.ts`. The
server token store is transport-agnostic -- it manages proxy authorization codes, access
tokens, refresh tokens, and PKCE state. No Quire-specific logic.

#### Step 4: Create `src/server/onenote-oauth-provider.ts`

Adapted from Quire's `src/server/quire-oauth-provider.ts`, but with Microsoft OAuth
endpoints:

```typescript
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
import { saveTokens } from "../onenote/token-store.js";
import { FETCH_TIMEOUT_MS } from "../constants.js";

// Clients store -- identical to Quire's
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

/**
 * KEY DIFFERENCE from Quire: Microsoft OAuth uses tenant-specific URLs
 * and supports PKCE natively (no need to strip PKCE and re-add it).
 *
 * However, we still need the proxy pattern because:
 * 1. The MCP client needs to dynamically register with OUR server
 * 2. OUR server proxies the auth to Microsoft
 * 3. We wrap Microsoft tokens in our own tokens
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

  private getAuthorizeEndpoint(): string {
    const base = this.config.authorityBaseUrl.replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(this.config.tenant)}/oauth2/v2.0/authorize`;
  }

  private getTokenEndpoint(): string {
    const base = this.config.authorityBaseUrl.replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(this.config.tenant)}/oauth2/v2.0/token`;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: ExpressResponse
  ): Promise<void> {
    if (!client.redirect_uris.includes(params.redirectUri)) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "Invalid redirect_uri",
      });
      return;
    }

    const pendingRequest: Omit<PendingAuthRequest, "createdAt"> = {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: "S256",
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
    msAuthUrl.searchParams.set("redirect_uri", this.config.microsoftRedirectUri);
    msAuthUrl.searchParams.set("response_mode", "query");
    msAuthUrl.searchParams.set("scope", this.config.scopes.join(" "));
    msAuthUrl.searchParams.set("state", microsoftState);

    res.redirect(msAuthUrl.toString());
  }

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

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const codeEntry = this.tokenStore.consumeAuthCode(authorizationCode);
    if (!codeEntry) {
      throw new Error("Invalid or expired authorization code");
    }
    if (codeEntry.clientId !== client.client_id) {
      throw new Error("Authorization code was not issued to this client");
    }
    if (redirectUri && codeEntry.redirectUri !== redirectUri) {
      throw new Error("redirect_uri mismatch");
    }

    const { accessToken, expiresIn } = this.tokenStore.storeAccessToken({
      quireAccessToken: codeEntry.quireAccessToken,  // rename field
      quireRefreshToken: codeEntry.quireRefreshToken,
      clientId: client.client_id,
      scope: codeEntry.scope,
    });

    let refreshToken: string | undefined;
    if (codeEntry.quireRefreshToken) {
      refreshToken = this.tokenStore.storeRefreshToken({
        quireRefreshToken: codeEntry.quireRefreshToken,
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

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    const refreshEntry = this.tokenStore.getRefreshToken(refreshToken);
    if (!refreshEntry) {
      throw new Error("Invalid refresh token");
    }
    if (refreshEntry.clientId !== client.client_id) {
      throw new Error("Refresh token was not issued to this client");
    }

    // Refresh against Microsoft
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshEntry.quireRefreshToken,
      client_id: this.config.microsoftClientId,
      client_secret: this.config.microsoftClientSecret,
      scope: this.config.scopes.join(" "),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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

    this.tokenStore.revokeRefreshToken(refreshToken);

    const { accessToken, expiresIn } = this.tokenStore.storeAccessToken({
      quireAccessToken: msTokens.access_token,
      quireRefreshToken: msTokens.refresh_token,
      clientId: client.client_id,
      scope: refreshEntry.scope,
    });

    // Persist to disk
    try {
      const tokenData: {
        accessToken: string;
        refreshToken?: string;
        expiresAt?: string;
      } = { accessToken: msTokens.access_token };
      if (msTokens.refresh_token) tokenData.refreshToken = msTokens.refresh_token;
      if (msTokens.expires_in) {
        tokenData.expiresAt = new Date(
          Date.now() + msTokens.expires_in * 1000
        ).toISOString();
      }
      saveTokens(tokenData);
    } catch (err) {
      console.error("[onenote-mcp] Failed to persist tokens:", err);
    }

    let newRefreshToken: string | undefined;
    if (msTokens.refresh_token) {
      newRefreshToken = this.tokenStore.storeRefreshToken({
        quireRefreshToken: msTokens.refresh_token,
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
        oneNoteToken: entry.quireAccessToken,  // the Microsoft token
      },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const { token, token_type_hint } = request;
    if (token_type_hint === "refresh_token") {
      this.tokenStore.revokeRefreshToken(token);
    } else {
      this.tokenStore.revokeAccessToken(token);
      this.tokenStore.revokeRefreshToken(token);
    }
  }
}

/**
 * Handle the OAuth callback from Microsoft.
 */
export async function handleMicrosoftOAuthCallback(
  config: HttpServerConfig,
  tokenStore: ServerTokenStore,
  code: string,
  state: string
): Promise<
  { redirectUrl: string } | { error: string; errorDescription: string }
> {
  const pending = tokenStore.consumePendingRequest(state);
  if (!pending) {
    return {
      error: "invalid_request",
      errorDescription: "Invalid or expired state parameter",
    };
  }

  const tokenEndpoint = (() => {
    const base = config.authorityBaseUrl.replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(config.tenant)}/oauth2/v2.0/token`;
  })();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.microsoftClientId,
    client_secret: config.microsoftClientSecret,
    redirect_uri: config.microsoftRedirectUri,
    scope: config.scopes.join(" "),
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
      console.error(
        `[onenote-mcp] Microsoft token exchange failed: ${text.slice(0, 200)}`
      );
      return {
        error: "server_error",
        errorDescription: "Failed to exchange authorization code with Microsoft",
      };
    }

    const msTokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const ourCode = tokenStore.storeAuthCode({
      clientId: pending.clientId,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
      redirectUri: pending.redirectUri,
      quireAccessToken: msTokens.access_token,
      quireRefreshToken: msTokens.refresh_token,
      scope: pending.scope,
    });

    // Persist tokens to disk for stdio mode fallback
    try {
      const tokenData: {
        accessToken: string;
        refreshToken?: string;
        expiresAt?: string;
      } = { accessToken: msTokens.access_token };
      if (msTokens.refresh_token) tokenData.refreshToken = msTokens.refresh_token;
      if (msTokens.expires_in) {
        tokenData.expiresAt = new Date(
          Date.now() + msTokens.expires_in * 1000
        ).toISOString();
      }
      saveTokens(tokenData);
    } catch (err) {
      console.error("[onenote-mcp] Failed to persist tokens:", err);
    }

    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set("code", ourCode);
    if (pending.clientState && pending.clientState.length > 0) {
      redirectUrl.searchParams.set("state", pending.clientState);
    } else {
      redirectUrl.searchParams.set("state", state);
    }

    return { redirectUrl: redirectUrl.toString() };
  } catch (err) {
    console.error("[onenote-mcp] Microsoft token exchange error:", err);
    return {
      error: "server_error",
      errorDescription: "Failed to communicate with Microsoft",
    };
  }
}
```

**Note on naming:** The `ServerTokenStore` from Quire uses field names like
`quireAccessToken` and `quireRefreshToken`. When copying the store, these should be
renamed to `upstreamAccessToken` and `upstreamRefreshToken` (or kept as-is with the
understanding that "quire" is just a legacy name for "upstream provider token").

#### Step 5: Create `src/server/cors.ts`

This can be **copied verbatim** from Quire's `src/server/cors.ts`.

#### Step 6: Create `src/server/http-server.ts`

Adapted from Quire's version, replacing Quire references with OneNote/Microsoft.

#### Step 7: Create `src/server/index.ts`

```typescript
export { getHttpServerConfig, type HttpServerConfig } from "./config.js";
export { startHttpServer } from "./http-server.js";
export { OneNoteProxyOAuthProvider } from "./onenote-oauth-provider.js";
export {
  getServerTokenStore,
  type AuthCodeEntry,
  type TokenEntry,
  type PendingAuthRequest,
  type RefreshTokenEntry,
} from "./server-token-store.js";
```

#### Step 8: Update `src/index.ts`

Add dual-transport support:

```typescript
async function startHttpServerMode(): Promise<void> {
  const { getHttpServerConfig, startHttpServer } =
    await import("./server/index.js");

  const config = getHttpServerConfig();
  if (!config) {
    console.error(
      `[${SERVER_NAME}] Error: HTTP mode requires OAuth configuration.`
    );
    console.error(
      `[${SERVER_NAME}] Please set ONENOTE_OAUTH_CLIENT_ID and ONENOTE_OAUTH_CLIENT_SECRET.`
    );
    process.exit(1);
  }

  await startHttpServer(createServer, config);
}

async function main(): Promise<void> {
  const transport = process.env["MCP_TRANSPORT"] ?? "stdio";
  console.error(
    `[${SERVER_NAME}] Starting server v${SERVER_VERSION} (${transport} transport)...`
  );

  if (transport === "http") {
    await startHttpServerMode();
  } else {
    await startStdioServer(createServer());
  }
}
```

#### Step 9: Update `src/onenote/client-factory.ts`

Add `authInfo` check for HTTP mode:

```typescript
export async function getOneNoteClient(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<OneNoteClientResult> {
  // In HTTP mode, the Microsoft token is passed via authInfo.extra.oneNoteToken
  const oneNoteToken = extra.authInfo?.extra?.["oneNoteToken"];

  if (typeof oneNoteToken === "string" && oneNoteToken.length > 0) {
    return {
      success: true,
      client: new OneNoteClient({ token: oneNoteToken }),
    };
  }

  // Fallback to stdio mode auth (env var or interactive OAuth)
  const clientResult = await createClientFromAuth();
  if (!clientResult.success) {
    return { success: false, error: clientResult.error.message };
  }
  return { success: true, client: clientResult.data };
}
```

#### Step 10: Add Constants

In `src/constants.ts`, add:

```typescript
/** Default HTTP server port */
export const DEFAULT_SERVER_PORT = "3001";

/** Number of characters to display from session IDs in logs */
export const SESSION_ID_DISPLAY_LENGTH = 8;

/** JSON-RPC error code: Invalid request */
export const JSONRPC_ERROR_INVALID_REQUEST = -32600;

/** JSON-RPC error code: Internal error */
export const JSONRPC_ERROR_INTERNAL = -32603;
```

#### Step 11: Update `package.json` Scripts

Add HTTP mode scripts:

```json
{
  "scripts": {
    "dev:http": "cross-env MCP_TRANSPORT=http tsx watch --require dotenv/config src/index.ts",
    "start:http": "cross-env MCP_TRANSPORT=http node -r dotenv/config dist/index.js"
  }
}
```

#### Step 12: Update `.env.example`

Add HTTP mode configuration (similar to Quire's `.env.example` lines 52-69).

---

## 5. Key Differences Between Microsoft OAuth and Quire OAuth

When adapting the proxy pattern, note these differences:

| Aspect | Quire OAuth | Microsoft OAuth (Azure Entra) |
|--------|------------|-------------------------------|
| Authorization URL | `https://quire.io/oauth` | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` |
| Token URL | `https://quire.io/oauth/token` | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` |
| PKCE support | No (must proxy) | Yes (native, but proxy still needed for MCP) |
| Scopes | Not scoped | `offline_access openid profile User.Read Notes.ReadWrite` |
| `response_mode` | Not needed | `query` |
| `scope` in token request | Not needed | Required |
| `redirect_uri` in token request | Not sent | Required |
| Multi-tenant support | No | Yes (via `{tenant}` in URL) |
| Token refresh requires `scope` | No | Yes |

Microsoft supports PKCE natively, so the proxy could forward the PKCE challenge to
Microsoft. However, the simpler approach (matching Quire's pattern) is to handle PKCE
at the proxy level and use client credentials with Microsoft.

---

## 6. Summary

The OneNote MCP fails with "failed to discover OAuth metadata" because it **only supports
STDIO transport** and has **no HTTP/OAuth authorization server**. The MCP Inspector (when
using OAuth features or HTTP transport mode) expects to discover OAuth metadata via
`/.well-known/oauth-authorization-server`, which the OneNote MCP does not expose.

The fix is to add an HTTP transport mode with the full MCP SDK OAuth stack, following the
exact same pattern as the Quire MCP:

1. `OAuthServerProvider` implementation that proxies to Microsoft
2. Express server with `mcpAuthRouter`, bearer auth, and `StreamableHTTPServerTransport`
3. Dynamic client registration store
4. In-memory server token store
5. OAuth callback handler for Microsoft's redirect
6. Updated client factory to read `authInfo` from the MCP request context
7. Dual-transport mode selection via `MCP_TRANSPORT` environment variable

The entire `src/server/` module from Quire can be adapted with relatively minor changes:
swapping Quire API URLs for Microsoft Identity Platform URLs, adjusting the scope
handling, and renaming identifiers.
