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

    expect(scopes).toContain("Notes.ReadWrite");
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

  it("isTokenExpired treats missing expiresAt as expired", async () => {
    const { isTokenExpired } = await import("./oauth.js");

    expect(isTokenExpired(undefined)).toBe(true);
  });

  it("isTokenExpired treats future expiry as not expired", async () => {
    const { isTokenExpired } = await import("./oauth.js");

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

  it("parseScopes returns defaults when scope string is whitespace only", async () => {
    const { parseScopes } = await import("./oauth.js");
    const scopes = parseScopes("   ");
    expect(scopes).toContain("Notes.ReadWrite");
    expect(scopes).toContain("offline_access");
  });

  it("parseScopes parses custom scope string", async () => {
    const { parseScopes } = await import("./oauth.js");
    const scopes = parseScopes("scope1  scope2  scope3");
    expect(scopes).toEqual(["scope1", "scope2", "scope3"]);
  });

  it("exchangeCodeForToken returns minimal token data without optional fields", async () => {
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
          access_token: "access-only",
          // No refresh_token, expires_in, scope, or token_type
        })
      ),
    });

    const tokenData = await exchangeCodeForToken(config, "auth-code");

    expect(tokenData.accessToken).toBe("access-only");
    expect(tokenData.refreshToken).toBeUndefined();
    expect(tokenData.expiresAt).toBeUndefined();
    expect(tokenData.scope).toBeUndefined();
    expect(tokenData.tokenType).toBeUndefined();
  });

  it("exchangeCodeForToken throws TOKEN_EXCHANGE_FAILED on non-ok response", async () => {
    const { exchangeCodeForToken, OneNoteOAuthError } =
      await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue("bad request"),
    });

    await expect(
      exchangeCodeForToken(config, "auth-code")
    ).rejects.toBeInstanceOf(OneNoteOAuthError);
  });

  it("loadOAuthConfigFromEnv uses defaults when optional env vars are not set", async () => {
    const { loadOAuthConfigFromEnv } = await import("./oauth.js");

    process.env["ONENOTE_OAUTH_CLIENT_ID"] = "client-id";
    process.env["ONENOTE_OAUTH_CLIENT_SECRET"] = "client-secret";
    // Do NOT set optional env vars

    const config = loadOAuthConfigFromEnv();

    expect(config).toBeDefined();
    expect(config?.tenant).toBe("common");
    expect(config?.redirectUri).toBe("http://localhost:3000/callback");
    expect(config?.authorityBaseUrl).toBe("https://login.microsoftonline.com");
  });

  it("loadOAuthConfigFromEnv uses custom authority base URL", async () => {
    const { loadOAuthConfigFromEnv } = await import("./oauth.js");

    process.env["ONENOTE_OAUTH_CLIENT_ID"] = "client-id";
    process.env["ONENOTE_OAUTH_CLIENT_SECRET"] = "client-secret";
    process.env["ONENOTE_OAUTH_AUTHORITY_BASE_URL"] =
      "https://custom-authority.example.com";

    const config = loadOAuthConfigFromEnv();

    expect(config?.authorityBaseUrl).toBe(
      "https://custom-authority.example.com"
    );
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

  // ---------------------------------------------------------------------------
  // Error response parsing in requestToken
  // ---------------------------------------------------------------------------

  it("parses error response with valid JSON containing error and error_description", async () => {
    const { exchangeCodeForToken } = await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "AADSTS70000: The refresh token has expired.",
        })
      ),
    });

    await expect(exchangeCodeForToken(config, "auth-code")).rejects.toSatisfy(
      (err: unknown) => {
        const e = err as { code: string; message: string };
        return (
          e.code === "TOKEN_EXCHANGE_FAILED" &&
          e.message.includes("invalid_grant") &&
          e.message.includes("AADSTS70000")
        );
      }
    );
  });

  it("parses error response with error only (no error_description)", async () => {
    const { exchangeCodeForToken } = await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: "invalid_client",
        })
      ),
    });

    await expect(exchangeCodeForToken(config, "auth-code")).rejects.toSatisfy(
      (err: unknown) => {
        const e = err as { code: string; message: string };
        return (
          e.code === "TOKEN_EXCHANGE_FAILED" &&
          e.message.includes("invalid_client") &&
          !e.message.includes(" - ")
        );
      }
    );
  });

  it("parses error response with valid JSON but no error/error_description fields", async () => {
    const { exchangeCodeForToken } = await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ message: "Internal Server Error" })
        ),
    });

    await expect(exchangeCodeForToken(config, "auth-code")).rejects.toSatisfy(
      (err: unknown) => {
        const e = err as { code: string; message: string };
        return (
          e.code === "TOKEN_EXCHANGE_FAILED" &&
          e.message === "Token request failed (500)"
        );
      }
    );
  });

  it("handles error response with invalid JSON (non-JSON text body)", async () => {
    const { exchangeCodeForToken } = await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue("<html>Service Unavailable</html>"),
    });

    await expect(exchangeCodeForToken(config, "auth-code")).rejects.toSatisfy(
      (err: unknown) => {
        const e = err as { code: string; message: string };
        return (
          e.code === "TOKEN_EXCHANGE_FAILED" &&
          e.message === "Token request failed (503)"
        );
      }
    );
  });

  it("parses error response with error_description only (no error)", async () => {
    const { exchangeCodeForToken } = await import("./oauth.js");

    const config: OneNoteOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      tenant: "common",
      scopes: ["offline_access"],
      authorityBaseUrl: "https://login.microsoftonline.com",
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error_description: "Token has been revoked",
        })
      ),
    });

    await expect(exchangeCodeForToken(config, "auth-code")).rejects.toSatisfy(
      (err: unknown) => {
        const e = err as { code: string; message: string };
        return (
          e.code === "TOKEN_EXCHANGE_FAILED" &&
          e.message.includes("unknown_error") &&
          e.message.includes("Token has been revoked")
        );
      }
    );
  });
});
