/**
 * OneNote Authentication
 *
 * Resolves an access token using the following precedence:
 *   1. ONENOTE_ACCESS_TOKEN environment variable
 *   2. Cached token from disk (if not expired and valid)
 *   3. Refresh using stored refresh_token
 *   4. Interactive OAuth login via local callback server
 */

import http from "node:http";
import { URL } from "node:url";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  generateState,
  isTokenExpired,
  loadOAuthConfigFromEnv,
  OneNoteOAuthError,
  refreshAccessToken,
  type OneNoteOAuthConfig,
  type OneNoteTokenData,
} from "./oauth.js";
import { clearTokens, loadTokens, saveTokens } from "./token-store.js";
import { OAUTH_CALLBACK_TIMEOUT_MS } from "../constants.js";
import { escapeHtml } from "../utils/html.js";

export interface AuthResult {
  accessToken: string;
  source: "env" | "cache" | "refresh" | "interactive";
}

export class OneNoteAuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NO_CONFIG"
      | "OAUTH_FAILED"
      | "USER_CANCELLED"
      | "TIMEOUT"
  ) {
    super(message);
    this.name = "OneNoteAuthError";
  }
}

/** Get a valid OneNote access token using the precedence chain. */
export async function getOneNoteAccessToken(): Promise<AuthResult> {
  const envToken = process.env["ONENOTE_ACCESS_TOKEN"];
  if (envToken) {
    return { accessToken: envToken, source: "env" };
  }

  const config = loadOAuthConfigFromEnv();
  if (!config) {
    throw new OneNoteAuthError(
      "No ONENOTE_ACCESS_TOKEN set and ONENOTE_OAUTH_CLIENT_ID/ONENOTE_OAUTH_CLIENT_SECRET are not configured.",
      "NO_CONFIG"
    );
  }

  const cached = loadTokens();

  // Step 1: If the cached token is not expired (local check), use it directly.
  // No network verification needed -- the expiry buffer already accounts for
  // clock skew and we avoid a round-trip on every single tool/resource call.
  if (cached?.accessToken && !isTokenExpired(cached.expiresAt)) {
    console.error("[onenote-mcp] Cached token is still valid (not expired).");
    return { accessToken: cached.accessToken, source: "cache" };
  }

  // Step 2: Token is expired (or missing expiresAt). Attempt refresh if we
  // have a refresh token. Microsoft refresh tokens last up to 90 days, so
  // this should succeed across many access-token lifetimes.
  if (cached?.refreshToken) {
    try {
      console.error(
        "[onenote-mcp] Access token expired, refreshing using refresh token..."
      );
      const refreshed = await refreshAccessToken(config, cached.refreshToken);
      saveTokens(refreshed);
      console.error(
        "[onenote-mcp] Token refresh successful.",
        refreshed.expiresAt
          ? `New token expires at ${refreshed.expiresAt}.`
          : ""
      );
      return { accessToken: refreshed.accessToken, source: "refresh" };
    } catch (error) {
      console.error(
        "[onenote-mcp] Token refresh failed, falling back to interactive login:",
        error instanceof Error ? error.message : error
      );
      clearTokens();
    }
  }

  // Step 3: No valid cached token and no (usable) refresh token -- start
  // interactive OAuth so the user can authorize in their browser.
  console.error("[onenote-mcp] Starting interactive OAuth login...");
  const tokens = await runInteractiveOAuth(config);
  saveTokens(tokens);
  return { accessToken: tokens.accessToken, source: "interactive" };
}

async function runInteractiveOAuth(
  config: OneNoteOAuthConfig
): Promise<OneNoteTokenData> {
  const redirectUrl = new URL(config.redirectUri);
  const expectedPath = redirectUrl.pathname || "/callback";
  const host = redirectUrl.hostname || "localhost";
  const port =
    redirectUrl.port === ""
      ? redirectUrl.protocol === "https:"
        ? 443
        : 80
      : Number.parseInt(redirectUrl.port, 10);

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new OneNoteAuthError(
      `Invalid port in redirect URI: ${config.redirectUri}`,
      "OAUTH_FAILED"
    );
  }

  const state = generateState();
  const authorizeUrl = buildAuthorizeUrl(config, state);

  const { promise: codePromise, server } = createCallbackServer({
    host,
    port,
    expectedPath,
    expectedState: state,
  });

  console.error("");
  console.error("=".repeat(60));
  console.error("OneNote authorization required.");
  console.error("");
  console.error("Open this URL in your browser to authorize:");
  console.error(authorizeUrl);
  console.error("");
  console.error(
    `Waiting for callback on ${host}:${port.toString()}${expectedPath}...`
  );
  console.error("=".repeat(60));
  console.error("");

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<string>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new OneNoteAuthError("Timed out waiting for OAuth callback.", "TIMEOUT")
      );
    }, OAUTH_CALLBACK_TIMEOUT_MS);
  });

  try {
    const code = await Promise.race([codePromise, timeoutPromise]);
    clearTimeout(timeoutHandle);
    console.error("[onenote-mcp] Authorization code received, exchanging...");
    const tokens = await exchangeCodeForToken(config, code);
    console.error("[onenote-mcp] Token exchange successful.");
    return tokens;
  } catch (error) {
    if (error instanceof OneNoteAuthError) {
      throw error;
    }

    if (error instanceof OneNoteOAuthError) {
      if (error.code === "USER_DENIED") {
        throw new OneNoteAuthError(error.message, "USER_CANCELLED");
      }
      throw new OneNoteAuthError(error.message, "OAUTH_FAILED");
    }

    throw new OneNoteAuthError(
      error instanceof Error ? error.message : "Interactive OAuth failed",
      "OAUTH_FAILED"
    );
  } finally {
    clearTimeout(timeoutHandle);
    server.close();
  }
}

interface CallbackServerOptions {
  host: string;
  port: number;
  expectedPath: string;
  expectedState: string;
}

interface CallbackServerResult {
  promise: Promise<string>;
  server: http.Server;
}

function createCallbackServer(
  options: CallbackServerOptions
): CallbackServerResult {
  const { host, port, expectedPath, expectedState } = options;

  let resolveCode: ((code: string) => void) | undefined;
  let rejectCode: ((error: Error) => void) | undefined;

  const promise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = http.createServer((req, res) => {
    try {
      const reqUrl = new URL(
        req.url ?? "/",
        `http://${host}:${port.toString()}`
      );

      if (reqUrl.pathname !== expectedPath) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          htmlPage("OneNote OAuth", "<p>Waiting for authorization...</p>")
        );
        return;
      }

      const error = reqUrl.searchParams.get("error");
      if (error) {
        const desc = reqUrl.searchParams.get("error_description") ?? error;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          htmlPage(
            "Authorization Failed",
            `<h1>Authorization Failed</h1><p>${escapeHtml(desc)}</p><p>You can close this tab.</p>`
          )
        );
        rejectCode?.(new OneNoteOAuthError(desc, "USER_DENIED"));
        return;
      }

      const returnedState = reqUrl.searchParams.get("state");
      if (returnedState !== expectedState) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          htmlPage(
            "Invalid State",
            "<h1>Invalid State</h1><p>CSRF validation failed. Please retry.</p>"
          )
        );
        rejectCode?.(new OneNoteOAuthError("State mismatch", "OAUTH_FAILED"));
        return;
      }

      const code = reqUrl.searchParams.get("code");
      if (!code) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          htmlPage(
            "Missing Code",
            "<h1>Missing Code</h1><p>No authorization code received.</p>"
          )
        );
        rejectCode?.(
          new OneNoteOAuthError(
            "No authorization code received",
            "OAUTH_FAILED"
          )
        );
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        htmlPage(
          "Authorization Successful",
          "<h1>Authorization Successful</h1><p>You can close this tab and return to your terminal.</p>"
        )
      );
      resolveCode?.(code);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
      }
      if (!res.writableEnded) {
        res.end("Internal error");
      }
      rejectCode?.(
        error instanceof Error
          ? error
          : new Error("Unknown callback server error")
      );
    }
  });

  server.listen(port, host);

  return { promise, server };
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}
