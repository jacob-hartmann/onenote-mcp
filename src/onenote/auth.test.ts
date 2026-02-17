import { get } from "node:http";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./oauth.js", () => ({
  buildAuthorizeUrl: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  generateState: vi.fn(),
  isTokenExpired: vi.fn(),
  loadOAuthConfigFromEnv: vi.fn(),
  refreshAccessToken: vi.fn(),
  OneNoteOAuthError: class OneNoteOAuthError extends Error {
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
  },
}));

vi.mock("./token-store.js", () => ({
  loadTokens: vi.fn(),
  saveTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  generateState,
  isTokenExpired,
  loadOAuthConfigFromEnv,
  refreshAccessToken,
} from "./oauth.js";
import { clearTokens, loadTokens, saveTokens } from "./token-store.js";
import { getOneNoteAccessToken, OneNoteAuthError } from "./auth.js";
import * as htmlUtils from "../utils/html.js";

async function hitCallback(path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    get(path, (response) => {
      response.resume();
      response.on("end", () => {
        resolve();
      });
    }).on("error", (error) => {
      reject(error);
    });
  });
}

describe("getOneNoteAccessToken", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env["ONENOTE_ACCESS_TOKEN"];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses ONENOTE_ACCESS_TOKEN override first", async () => {
    process.env["ONENOTE_ACCESS_TOKEN"] = "manual-token";

    const result = await getOneNoteAccessToken();

    expect(result).toEqual({ accessToken: "manual-token", source: "env" });
    expect(loadOAuthConfigFromEnv).not.toHaveBeenCalled();
  });

  it("throws when OAuth config is missing", async () => {
    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue(undefined);

    await expect(getOneNoteAccessToken()).rejects.toBeInstanceOf(
      OneNoteAuthError
    );
  });

  it("uses cached token when valid", async () => {
    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue({
      accessToken: "cached-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    });
    vi.mocked(isTokenExpired).mockReturnValue(false);

    const result = await getOneNoteAccessToken();

    expect(result).toEqual({ accessToken: "cached-token", source: "cache" });
  });

  it("falls back to interactive OAuth when token is expired and no refresh token", async () => {
    const port = 39011;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost:${port.toString()}/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue({
      accessToken: "cached-token",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    vi.mocked(isTokenExpired).mockReturnValue(true);
    vi.mocked(generateState).mockReturnValue("state-expired");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");
    vi.mocked(exchangeCodeForToken).mockResolvedValue({
      accessToken: "interactive-token",
      refreshToken: "interactive-refresh",
    });

    const promise = getOneNoteAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await hitCallback(
      `http://localhost:${port.toString()}/callback?code=code-123&state=state-expired`
    );

    const result = await promise;

    expect(result).toEqual({
      accessToken: "interactive-token",
      source: "interactive",
    });
  });

  it("uses refresh token when cached token is expired", async () => {
    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3001/callback",
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue({
      accessToken: "cached-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    vi.mocked(isTokenExpired).mockReturnValue(true);
    vi.mocked(refreshAccessToken).mockResolvedValue({
      accessToken: "refreshed-token",
      refreshToken: "new-refresh-token",
    });

    const result = await getOneNoteAccessToken();

    expect(result).toEqual({
      accessToken: "refreshed-token",
      source: "refresh",
    });
    expect(saveTokens).toHaveBeenCalled();
  });

  it("falls back to interactive OAuth after refresh failure", async () => {
    const port = 39009;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost:${port.toString()}/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue({
      accessToken: "cached-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    vi.mocked(isTokenExpired).mockReturnValue(true);
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new Error("refresh failed")
    );
    vi.mocked(generateState).mockReturnValue("state-123");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");
    vi.mocked(exchangeCodeForToken).mockResolvedValue({
      accessToken: "interactive-token",
      refreshToken: "interactive-refresh",
    });

    const resultPromise = getOneNoteAccessToken();

    await new Promise((resolve) => setTimeout(resolve, 100));
    await hitCallback(
      `http://localhost:${port.toString()}/callback?code=abc&state=state-123`
    );

    const result = await resultPromise;

    expect(clearTokens).toHaveBeenCalled();
    expect(result).toEqual({
      accessToken: "interactive-token",
      source: "interactive",
    });
  });

  it("rejects interactive OAuth with invalid state", async () => {
    const port = 39010;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost:${port.toString()}/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue(undefined);
    vi.mocked(generateState).mockReturnValue("expected-state");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");

    const promise = getOneNoteAccessToken();
    const rejection = expect(promise).rejects.toBeInstanceOf(OneNoteAuthError);

    await new Promise((resolve) => setTimeout(resolve, 100));
    await hitCallback(
      `http://localhost:${port.toString()}/callback?code=abc&state=wrong-state`
    );

    await rejection;
  });

  it("maps provider-denied consent to USER_CANCELLED", async () => {
    const port = 39012;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost:${port.toString()}/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue(undefined);
    vi.mocked(generateState).mockReturnValue("state-user-denied");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");

    const promise = getOneNoteAccessToken();
    const rejection = expect(promise).rejects.toMatchObject({
      code: "USER_CANCELLED",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await hitCallback(
      `http://localhost:${port.toString()}/callback?error=access_denied&error_description=Denied&state=state-user-denied`
    );

    await rejection;
  });

  it("rejects interactive OAuth when callback is missing code", async () => {
    const port = 39013;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost:${port.toString()}/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue(undefined);
    vi.mocked(generateState).mockReturnValue("state-missing-code");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");

    const promise = getOneNoteAccessToken();
    const rejection = expect(promise).rejects.toMatchObject({
      code: "OAUTH_FAILED",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await hitCallback(
      `http://localhost:${port.toString()}/callback?state=state-missing-code`
    );

    await rejection;
  });

  it("wraps token exchange errors as OAUTH_FAILED", async () => {
    const port = 39014;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost:${port.toString()}/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue(undefined);
    vi.mocked(generateState).mockReturnValue("state-exchange");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");
    vi.mocked(exchangeCodeForToken).mockRejectedValue(
      new Error("exchange exploded")
    );

    const promise = getOneNoteAccessToken();
    const rejection = expect(promise).rejects.toMatchObject({
      code: "OAUTH_FAILED",
      message: "exchange exploded",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await hitCallback(
      `http://localhost:${port.toString()}/callback?code=code-123&state=state-exchange`
    );

    await rejection;
  });

  it("ignores non-callback paths until the expected callback arrives", async () => {
    const port = 39015;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost:${port.toString()}/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue(undefined);
    vi.mocked(generateState).mockReturnValue("state-wrong-path");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");
    vi.mocked(exchangeCodeForToken).mockResolvedValue({
      accessToken: "interactive-token",
      refreshToken: "interactive-refresh",
    });

    const promise = getOneNoteAccessToken();

    await new Promise((resolve) => setTimeout(resolve, 100));
    await hitCallback(`http://localhost:${port.toString()}/not-callback`);
    await hitCallback(
      `http://localhost:${port.toString()}/callback?code=code-123&state=state-wrong-path`
    );

    const result = await promise;
    expect(result).toEqual({
      accessToken: "interactive-token",
      source: "interactive",
    });
  });

  it("handles callback rendering errors as OAUTH_FAILED", async () => {
    const port = 39016;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost:${port.toString()}/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue(undefined);
    vi.mocked(generateState).mockReturnValue("state-render-error");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");

    const escapeSpy = vi
      .spyOn(htmlUtils, "escapeHtml")
      .mockImplementation(() => {
        throw new Error("escape explode");
      });

    const promise = getOneNoteAccessToken();
    const rejection = expect(promise).rejects.toMatchObject({
      code: "OAUTH_FAILED",
      message: "escape explode",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await hitCallback(
      `http://localhost:${port.toString()}/callback?error=access_denied&error_description=Denied&state=state-render-error`
    );

    await rejection;
    escapeSpy.mockRestore();
  });

  it("rejects invalid redirect URI port values", async () => {
    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:0/callback",
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue(undefined);

    await expect(getOneNoteAccessToken()).rejects.toMatchObject({
      code: "OAUTH_FAILED",
    });
  });

  it("uses cached token without network call when not expired", async () => {
    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue({
      accessToken: "cached-token",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    });
    vi.mocked(isTokenExpired).mockReturnValue(false);

    const result = await getOneNoteAccessToken();

    expect(result.accessToken).toBe("cached-token");
    expect(result.source).toBe("cache");
    // No refresh or interactive flow should have been triggered
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("handles default port for redirect URI without explicit port (http)", async () => {
    const port = 80;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue(undefined);
    vi.mocked(generateState).mockReturnValue("state-port-80");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");
    vi.mocked(exchangeCodeForToken).mockResolvedValue({
      accessToken: "interactive-token-80",
      refreshToken: "refresh-80",
    });

    const promise = getOneNoteAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await hitCallback(
      `http://localhost:${port.toString()}/callback?code=code-80&state=state-port-80`
    );

    const result = await promise;
    expect(result.accessToken).toBe("interactive-token-80");
  });

  it("throws TIMEOUT when OAuth callback is not received in time", async () => {
    vi.useFakeTimers();

    const port = 39018;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost:${port.toString()}/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue(undefined);
    vi.mocked(generateState).mockReturnValue("state-timeout");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");

    const promise = getOneNoteAccessToken();
    const rejection = expect(promise).rejects.toMatchObject({
      code: "TIMEOUT",
    });

    // Advance past the OAUTH_CALLBACK_TIMEOUT_MS (5 minutes)
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

    await rejection;
    vi.useRealTimers();
  });

  it("wraps non-Error thrown values during interactive OAuth as OAUTH_FAILED", async () => {
    const port = 39017;

    vi.mocked(loadOAuthConfigFromEnv).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: `http://localhost:${port.toString()}/callback`,
      tenant: "common",
      scopes: ["Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    });
    vi.mocked(loadTokens).mockReturnValue(undefined);
    vi.mocked(generateState).mockReturnValue("state-non-error");
    vi.mocked(buildAuthorizeUrl).mockReturnValue("https://example.com/auth");
    vi.mocked(exchangeCodeForToken).mockRejectedValue("string-error");

    const promise = getOneNoteAccessToken();
    const rejection = expect(promise).rejects.toMatchObject({
      code: "OAUTH_FAILED",
      message: "Interactive OAuth failed",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await hitCallback(
      `http://localhost:${port.toString()}/callback?code=code-123&state=state-non-error`
    );

    await rejection;
  });
});
