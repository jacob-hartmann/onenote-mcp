import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OneNoteOAuthConfig } from "./oauth.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("OAuth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["ONENOTE_OAUTH_CLIENT_ID"];
    delete process.env["ONENOTE_OAUTH_CLIENT_SECRET"];
    delete process.env["ONENOTE_OAUTH_REDIRECT_URI"];
    delete process.env["ONENOTE_OAUTH_TENANT"];
    delete process.env["ONENOTE_OAUTH_SCOPES"];
    delete process.env["ONENOTE_OAUTH_AUTHORITY_BASE_URL"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generateState returns unique values", async () => {
    const { generateState } = await import("./oauth.js");
    const first = generateState();
    const second = generateState();

    expect(first).not.toBe(second);
    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
  });

  it("parseScopes returns defaults when unset", async () => {
    const { parseScopes } = await import("./oauth.js");
    const scopes = parseScopes(undefined);

    expect(scopes).toContain("Notes.Read");
    expect(scopes).toContain("offline_access");
  });

  it("loadOAuthConfigFromEnv returns undefined when missing credentials", async () => {
    const { loadOAuthConfigFromEnv } = await import("./oauth.js");
    expect(loadOAuthConfigFromEnv()).toBeUndefined();
  });

  it("loadOAuthConfigFromEnv reads configured values", async () => {
    const { loadOAuthConfigFromEnv } = await import("./oauth.js");

    process.env["ONENOTE_OAUTH_CLIENT_ID"] = "client-id";
    process.env["ONENOTE_OAUTH_CLIENT_SECRET"] = "client-secret";
    process.env["ONENOTE_OAUTH_TENANT"] = "tenant-id";
    process.env["ONENOTE_OAUTH_SCOPES"] = "offline_access Notes.Read";

    const config = loadOAuthConfigFromEnv();

    expect(config).toBeDefined();
    expect(config?.tenant).toBe("tenant-id");
    expect(config?.scopes).toEqual(["offline_access", "Notes.Read"]);
  });

  it("buildAuthorizeUrl includes expected parameters", async () => {
    const { buildAuthorizeUrl } = await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access", "Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    const url = new URL(buildAuthorizeUrl(config, "state-123"));

    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toContain("/common/oauth2/v2.0/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toContain("Notes.Read");
  });

  it("isTokenExpired handles missing and future expiry", async () => {
    const { isTokenExpired } = await import("./oauth.js");

    expect(isTokenExpired(undefined)).toBe(false);
    expect(
      isTokenExpired(new Date(Date.now() + 1000 * 60 * 60).toISOString())
    ).toBe(false);
  });

  it("isTokenExpired handles past expiry", async () => {
    const { isTokenExpired } = await import("./oauth.js");

    expect(
      isTokenExpired(new Date(Date.now() - 1000 * 60 * 60).toISOString())
    ).toBe(true);
  });

  it("exchangeCodeForToken returns parsed token data", async () => {
    const { exchangeCodeForToken } = await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access", "Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "offline_access Notes.Read",
        })
      ),
    });

    const tokenData = await exchangeCodeForToken(config, "auth-code");

    expect(tokenData.accessToken).toBe("access-token");
    expect(tokenData.refreshToken).toBe("refresh-token");
    expect(tokenData.expiresAt).toBeDefined();
  });

  it("exchangeCodeForToken throws INVALID_RESPONSE for invalid JSON", async () => {
    const { exchangeCodeForToken } = await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access", "Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("not-json"),
    });

    await expect(
      exchangeCodeForToken(config, "auth-code")
    ).rejects.toMatchObject({
      name: "OneNoteOAuthError",
      code: "INVALID_RESPONSE",
    });
  });

  it("exchangeCodeForToken throws INVALID_RESPONSE for malformed payload shape", async () => {
    const { exchangeCodeForToken } = await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access", "Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ access_token: 123 })),
    });

    await expect(
      exchangeCodeForToken(config, "auth-code")
    ).rejects.toMatchObject({
      name: "OneNoteOAuthError",
      code: "INVALID_RESPONSE",
    });
  });

  it("aborts token request when timeout elapses", async () => {
    const { exchangeCodeForToken } = await import("./oauth.js");
    const { FETCH_TIMEOUT_MS } = await import("../constants.js");
    vi.useFakeTimers();

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access", "Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    });

    const promise = exchangeCodeForToken(config, "auth-code");
    const rejection = expect(promise).rejects.toBeInstanceOf(Error);

    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 1);
    await rejection;
    vi.useRealTimers();
  });

  it("refreshAccessToken throws on non-ok response", async () => {
    const { refreshAccessToken, OneNoteOAuthError } =
      await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access", "Notes.Read"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue("bad request"),
    });

    await expect(
      refreshAccessToken(config, "refresh-token")
    ).rejects.toBeInstanceOf(OneNoteOAuthError);
  });
});
