import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the server-token-store module so we can inject a fake store
vi.mock("./server-token-store.js", async (importOriginal) => {
  const original = await importOriginal();
  return Object.assign({}, original, { getServerTokenStore: vi.fn() });
});

// Mock the token-store save (used by exchangeRefreshToken)
vi.mock("../onenote/token-store.js", () => ({
  saveTokens: vi.fn(),
}));

import {
  OneNoteClientsStore,
  OneNoteProxyOAuthProvider,
} from "./onenote-oauth-provider.js";
import { getServerTokenStore } from "./server-token-store.js";
import type { HttpServerConfig } from "./config.js";
import type { TokenEntry } from "./server-token-store.js";

// ---------------------------------------------------------------------------
// OneNoteClientsStore
// ---------------------------------------------------------------------------

describe("OneNoteClientsStore", () => {
  let store: OneNoteClientsStore;

  beforeEach(() => {
    store = new OneNoteClientsStore();
  });

  it("registerClient generates a client_id", () => {
    const client = store.registerClient({
      redirect_uris: ["http://localhost:3000/callback"],
    });

    expect(client.client_id).toBeTypeOf("string");
    expect(client.client_id.length).toBeGreaterThan(0);
  });

  it("registerClient returns client info with timestamp", () => {
    const before = Math.floor(Date.now() / 1000);

    const client = store.registerClient({
      redirect_uris: ["http://localhost:3000/callback"],
    });

    const after = Math.floor(Date.now() / 1000);

    expect(client.client_id_issued_at).toBeGreaterThanOrEqual(before);
    expect(client.client_id_issued_at).toBeLessThanOrEqual(after);
  });

  it("registerClient preserves metadata", () => {
    const client = store.registerClient({
      redirect_uris: ["http://localhost:3000/callback"],
      client_name: "Test Client",
      grant_types: ["authorization_code"],
    });

    expect(client.client_name).toBe("Test Client");
    expect(client.grant_types).toEqual(["authorization_code"]);
    expect(client.redirect_uris).toHaveLength(1);
  });

  it("getClient retrieves a registered client", () => {
    const registered = store.registerClient({
      redirect_uris: ["http://localhost:3000/callback"],
    });

    const retrieved = store.getClient(registered.client_id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.client_id).toBe(registered.client_id);
    expect(retrieved!.client_id_issued_at).toBe(registered.client_id_issued_at);
  });

  it("getClient returns undefined for unknown client", () => {
    expect(store.getClient("nonexistent-id")).toBeUndefined();
  });

  it("generates unique client_ids for different registrations", () => {
    const client1 = store.registerClient({
      redirect_uris: ["http://localhost:3000/callback"],
    });
    const client2 = store.registerClient({
      redirect_uris: ["http://localhost:3000/callback"],
    });

    expect(client1.client_id).not.toBe(client2.client_id);
  });
});

// ---------------------------------------------------------------------------
// OneNoteProxyOAuthProvider.verifyAccessToken
// ---------------------------------------------------------------------------

describe("OneNoteProxyOAuthProvider", () => {
  const mockConfig: HttpServerConfig = {
    host: "127.0.0.1",
    port: 3001,
    issuerUrl: "http://localhost:3001",
    microsoftClientId: "ms-client-id",
    microsoftClientSecret: "ms-client-secret",
    microsoftRedirectUri: "http://localhost:3001/oauth/callback",
    tenant: "common",
    scopes: ["openid", "Notes.ReadWrite"],
    authorityBaseUrl: "https://login.microsoftonline.com",
  };

  let mockTokenStore: {
    getAccessToken: ReturnType<typeof vi.fn>;
    storePendingRequest: ReturnType<typeof vi.fn>;
    consumePendingRequest: ReturnType<typeof vi.fn>;
    storeAuthCode: ReturnType<typeof vi.fn>;
    getAuthCode: ReturnType<typeof vi.fn>;
    consumeAuthCode: ReturnType<typeof vi.fn>;
    storeAccessToken: ReturnType<typeof vi.fn>;
    revokeAccessToken: ReturnType<typeof vi.fn>;
    storeRefreshToken: ReturnType<typeof vi.fn>;
    getRefreshToken: ReturnType<typeof vi.fn>;
    revokeRefreshToken: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTokenStore = {
      getAccessToken: vi.fn(),
      storePendingRequest: vi.fn(),
      consumePendingRequest: vi.fn(),
      storeAuthCode: vi.fn(),
      getAuthCode: vi.fn(),
      consumeAuthCode: vi.fn(),
      storeAccessToken: vi.fn(),
      revokeAccessToken: vi.fn(),
      storeRefreshToken: vi.fn(),
      getRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
      dispose: vi.fn(),
    };

    vi.mocked(getServerTokenStore).mockReturnValue(
      mockTokenStore as unknown as ReturnType<typeof getServerTokenStore>
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("verifyAccessToken", () => {
    it("returns AuthInfo with correct fields for a valid token", async () => {
      const tokenEntry: TokenEntry = {
        upstreamAccessToken: "ms-real-token-xyz",
        upstreamRefreshToken: "ms-refresh-abc",
        clientId: "client-123",
        scope: "openid Notes.ReadWrite",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600 * 1000,
      };

      mockTokenStore.getAccessToken.mockReturnValue(tokenEntry);

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const authInfo = await provider.verifyAccessToken("proxy-token-abc");

      expect(authInfo.token).toBe("proxy-token-abc");
      expect(authInfo.clientId).toBe("client-123");
      expect(authInfo.scopes).toEqual(["openid", "Notes.ReadWrite"]);
      expect(authInfo.expiresAt).toBe(Math.floor(tokenEntry.expiresAt / 1000));
      expect(authInfo.extra).toEqual({
        oneNoteToken: "ms-real-token-xyz",
      });

      expect(mockTokenStore.getAccessToken).toHaveBeenCalledWith(
        "proxy-token-abc"
      );
    });

    it("returns empty scopes array when scope is undefined", async () => {
      const tokenEntry: TokenEntry = {
        upstreamAccessToken: "ms-token",
        upstreamRefreshToken: undefined,
        clientId: "client-1",
        scope: undefined,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600 * 1000,
      };

      mockTokenStore.getAccessToken.mockReturnValue(tokenEntry);

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const authInfo = await provider.verifyAccessToken("token");

      expect(authInfo.scopes).toEqual([]);
    });

    it("throws for invalid/expired tokens", async () => {
      mockTokenStore.getAccessToken.mockReturnValue(undefined);

      const provider = new OneNoteProxyOAuthProvider(mockConfig);

      await expect(provider.verifyAccessToken("bad-token")).rejects.toThrow(
        "Invalid or expired token"
      );
    });
  });

  describe("clientsStore", () => {
    it("exposes a OneNoteClientsStore instance", () => {
      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      expect(provider.clientsStore).toBeInstanceOf(OneNoteClientsStore);
    });
  });

  // -------------------------------------------------------------------------
  // authorize
  // -------------------------------------------------------------------------

  describe("authorize", () => {
    it("redirects to Microsoft OAuth with correct parameters", async () => {
      mockTokenStore.storePendingRequest.mockReturnValue("ms-state-123");

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = {
        client_id: "client-1",
        redirect_uris: ["http://localhost:3000/callback"],
      };
      const params = {
        redirectUri: "http://localhost:3000/callback",
        codeChallenge: "challenge-abc",
        state: "client-state",
        scopes: ["read:user"],
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        redirect: vi.fn(),
      };

      await provider.authorize(client as never, params as never, res as never);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = new URL(res.redirect.mock.calls[0]![0] as string);
      expect(redirectUrl.pathname).toContain("/common/oauth2/v2.0/authorize");
      expect(redirectUrl.searchParams.get("client_id")).toBe("ms-client-id");
      expect(redirectUrl.searchParams.get("state")).toBe("ms-state-123");
      expect(redirectUrl.searchParams.get("response_type")).toBe("code");
    });

    it("returns 400 for invalid redirect_uri", async () => {
      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = {
        client_id: "client-1",
        redirect_uris: ["http://localhost:3000/callback"],
      };
      const params = {
        redirectUri: "http://evil.com/callback",
        codeChallenge: "challenge",
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        redirect: vi.fn(),
      };

      await provider.authorize(client as never, params as never, res as never);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "invalid_request" })
      );
    });

    it("stores pending request without clientState when state is empty", async () => {
      mockTokenStore.storePendingRequest.mockReturnValue("ms-state-456");

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = {
        client_id: "client-1",
        redirect_uris: ["http://localhost:3000/callback"],
      };
      const params = {
        redirectUri: "http://localhost:3000/callback",
        codeChallenge: "challenge",
        state: "",
      };
      const res = { redirect: vi.fn() };

      await provider.authorize(client as never, params as never, res as never);

      const storedRequest = mockTokenStore.storePendingRequest.mock
        .calls[0]![0] as Record<string, unknown>;
      expect(storedRequest["clientState"]).toBeUndefined();
    });

    it("stores pending request with clientState when state is provided", async () => {
      mockTokenStore.storePendingRequest.mockReturnValue("ms-state-789");

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = {
        client_id: "client-1",
        redirect_uris: ["http://localhost:3000/callback"],
      };
      const params = {
        redirectUri: "http://localhost:3000/callback",
        codeChallenge: "challenge",
        state: "my-state",
        scopes: undefined,
      };
      const res = { redirect: vi.fn() };

      await provider.authorize(client as never, params as never, res as never);

      const storedRequest = mockTokenStore.storePendingRequest.mock
        .calls[0]![0] as Record<string, unknown>;
      expect(storedRequest["clientState"]).toBe("my-state");
    });
  });

  // -------------------------------------------------------------------------
  // challengeForAuthorizationCode
  // -------------------------------------------------------------------------

  describe("challengeForAuthorizationCode", () => {
    it("returns the code challenge for a valid auth code", async () => {
      mockTokenStore.getAuthCode.mockReturnValue({
        codeChallenge: "challenge-xyz",
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const challenge = await provider.challengeForAuthorizationCode(
        {} as never,
        "auth-code-1"
      );

      expect(challenge).toBe("challenge-xyz");
    });

    it("throws for invalid authorization code", async () => {
      mockTokenStore.getAuthCode.mockReturnValue(undefined);

      const provider = new OneNoteProxyOAuthProvider(mockConfig);

      await expect(
        provider.challengeForAuthorizationCode({} as never, "bad-code")
      ).rejects.toThrow("Invalid authorization code");
    });
  });

  // -------------------------------------------------------------------------
  // exchangeAuthorizationCode
  // -------------------------------------------------------------------------

  describe("exchangeAuthorizationCode", () => {
    it("exchanges auth code for tokens successfully", async () => {
      mockTokenStore.consumeAuthCode.mockReturnValue({
        clientId: "client-1",
        redirectUri: "http://localhost:3000/callback",
        upstreamAccessToken: "ms-access",
        upstreamRefreshToken: "ms-refresh",
        scope: "openid Notes.ReadWrite",
        codeChallenge: "challenge",
      });
      mockTokenStore.storeAccessToken.mockReturnValue({
        accessToken: "proxy-access",
        expiresIn: 3600,
      });
      mockTokenStore.storeRefreshToken.mockReturnValue("proxy-refresh");

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      const tokens = await provider.exchangeAuthorizationCode(
        client as never,
        "auth-code",
        "verifier",
        "http://localhost:3000/callback"
      );

      expect(tokens.access_token).toBe("proxy-access");
      expect(tokens.token_type).toBe("bearer");
      expect(tokens.expires_in).toBe(3600);
      expect(tokens.refresh_token).toBe("proxy-refresh");
      expect(tokens.scope).toBe("openid Notes.ReadWrite");
    });

    it("throws for invalid or expired auth code", async () => {
      mockTokenStore.consumeAuthCode.mockReturnValue(undefined);

      const provider = new OneNoteProxyOAuthProvider(mockConfig);

      await expect(
        provider.exchangeAuthorizationCode({} as never, "bad-code")
      ).rejects.toThrow("Invalid or expired authorization code");
    });

    it("throws when client_id does not match", async () => {
      mockTokenStore.consumeAuthCode.mockReturnValue({
        clientId: "other-client",
        redirectUri: "http://localhost:3000/callback",
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "wrong-client" };

      await expect(
        provider.exchangeAuthorizationCode(client as never, "auth-code")
      ).rejects.toThrow("Authorization code was not issued to this client");
    });

    it("throws when redirect_uri does not match", async () => {
      mockTokenStore.consumeAuthCode.mockReturnValue({
        clientId: "client-1",
        redirectUri: "http://localhost:3000/callback",
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      await expect(
        provider.exchangeAuthorizationCode(
          client as never,
          "auth-code",
          "verifier",
          "http://different.com/callback"
        )
      ).rejects.toThrow("redirect_uri mismatch");
    });

    it("omits refresh_token when upstream has none", async () => {
      mockTokenStore.consumeAuthCode.mockReturnValue({
        clientId: "client-1",
        redirectUri: "http://localhost:3000/callback",
        upstreamAccessToken: "ms-access",
        upstreamRefreshToken: undefined,
        scope: "openid",
      });
      mockTokenStore.storeAccessToken.mockReturnValue({
        accessToken: "proxy-access",
        expiresIn: 3600,
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      const tokens = await provider.exchangeAuthorizationCode(
        client as never,
        "auth-code"
      );

      expect(tokens.refresh_token).toBeUndefined();
      expect(mockTokenStore.storeRefreshToken).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // exchangeRefreshToken
  // -------------------------------------------------------------------------

  describe("exchangeRefreshToken", () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("refreshes tokens against Microsoft and issues new proxy tokens", async () => {
      mockTokenStore.getRefreshToken.mockReturnValue({
        upstreamRefreshToken: "ms-old-refresh",
        clientId: "client-1",
        scope: "openid Notes.ReadWrite",
      });
      mockTokenStore.storeAccessToken.mockReturnValue({
        accessToken: "new-proxy-access",
        expiresIn: 3600,
      });
      mockTokenStore.storeRefreshToken.mockReturnValue("new-proxy-refresh");

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "new-ms-access",
          refresh_token: "new-ms-refresh",
          expires_in: 3600,
        }),
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      const tokens = await provider.exchangeRefreshToken(
        client as never,
        "old-refresh-token"
      );

      expect(tokens.access_token).toBe("new-proxy-access");
      expect(tokens.refresh_token).toBe("new-proxy-refresh");
      expect(tokens.token_type).toBe("bearer");
      expect(mockTokenStore.revokeRefreshToken).toHaveBeenCalledWith(
        "old-refresh-token"
      );
    });

    it("throws for invalid refresh token", async () => {
      mockTokenStore.getRefreshToken.mockReturnValue(undefined);

      const provider = new OneNoteProxyOAuthProvider(mockConfig);

      await expect(
        provider.exchangeRefreshToken({} as never, "bad-token")
      ).rejects.toThrow("Invalid refresh token");
    });

    it("throws when client_id does not match", async () => {
      mockTokenStore.getRefreshToken.mockReturnValue({
        upstreamRefreshToken: "ms-refresh",
        clientId: "other-client",
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "wrong-client" };

      await expect(
        provider.exchangeRefreshToken(client as never, "refresh-token")
      ).rejects.toThrow("Refresh token was not issued to this client");
    });

    it("throws when Microsoft token refresh fails", async () => {
      mockTokenStore.getRefreshToken.mockReturnValue({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: "openid",
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue("bad request"),
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      await expect(
        provider.exchangeRefreshToken(client as never, "refresh-token")
      ).rejects.toThrow("Microsoft token refresh failed");
    });

    it("omits new refresh_token when Microsoft does not return one", async () => {
      mockTokenStore.getRefreshToken.mockReturnValue({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: "openid",
      });
      mockTokenStore.storeAccessToken.mockReturnValue({
        accessToken: "new-proxy-access",
        expiresIn: 3600,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "new-ms-access",
          // No refresh_token or expires_in
        }),
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      const tokens = await provider.exchangeRefreshToken(
        client as never,
        "refresh-token"
      );

      expect(tokens.refresh_token).toBeUndefined();
      expect(mockTokenStore.storeRefreshToken).not.toHaveBeenCalled();
    });

    it("persists tokens to disk and handles save failure gracefully", async () => {
      const { saveTokens } = await import("../onenote/token-store.js");
      vi.mocked(saveTokens).mockImplementation(() => {
        throw new Error("disk write failed");
      });

      mockTokenStore.getRefreshToken.mockReturnValue({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: "openid",
      });
      mockTokenStore.storeAccessToken.mockReturnValue({
        accessToken: "proxy-access",
        expiresIn: 3600,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "ms-access",
          refresh_token: "ms-refresh-new",
          expires_in: 3600,
        }),
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      // Should not throw even though saveTokens fails
      const tokens = await provider.exchangeRefreshToken(
        client as never,
        "refresh-token"
      );

      expect(tokens.access_token).toBe("proxy-access");
    });

    it("throws when Microsoft returns invalid token response (Zod validation fails)", async () => {
      mockTokenStore.getRefreshToken.mockReturnValue({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: "openid",
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          // Missing required access_token
          token_type: "Bearer",
        }),
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      await expect(
        provider.exchangeRefreshToken(client as never, "refresh-token")
      ).rejects.toThrow("Invalid Microsoft token response");
    });

    it("parses error response with JSON containing error and error_description", async () => {
      mockTokenStore.getRefreshToken.mockReturnValue({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: "openid",
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "AADSTS70000: Token expired",
          })
        ),
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      await expect(
        provider.exchangeRefreshToken(client as never, "refresh-token")
      ).rejects.toThrow(/invalid_grant.*AADSTS70000/);
    });

    it("parses error response with error only (no error_description)", async () => {
      mockTokenStore.getRefreshToken.mockReturnValue({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: "openid",
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            error: "unauthorized_client",
          })
        ),
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      await expect(
        provider.exchangeRefreshToken(client as never, "refresh-token")
      ).rejects.toThrow("unauthorized_client");
    });

    it("parses error response with JSON but no error/error_description fields", async () => {
      mockTokenStore.getRefreshToken.mockReturnValue({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: "openid",
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ message: "Server Error" })),
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      await expect(
        provider.exchangeRefreshToken(client as never, "refresh-token")
      ).rejects.toThrow("Microsoft token refresh failed (500)");
    });

    it("handles non-JSON error response gracefully", async () => {
      mockTokenStore.getRefreshToken.mockReturnValue({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: "openid",
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue("<html>Service Unavailable</html>"),
      });

      const provider = new OneNoteProxyOAuthProvider(mockConfig);
      const client = { client_id: "client-1" };

      await expect(
        provider.exchangeRefreshToken(client as never, "refresh-token")
      ).rejects.toThrow("Microsoft token refresh failed (503)");
    });
  });

  // -------------------------------------------------------------------------
  // revokeToken
  // -------------------------------------------------------------------------

  describe("revokeToken", () => {
    it("revokes refresh token when hint is refresh_token", async () => {
      const provider = new OneNoteProxyOAuthProvider(mockConfig);

      await provider.revokeToken(
        {} as never,
        {
          token: "refresh-xyz",
          token_type_hint: "refresh_token",
        } as never
      );

      expect(mockTokenStore.revokeRefreshToken).toHaveBeenCalledWith(
        "refresh-xyz"
      );
      expect(mockTokenStore.revokeAccessToken).not.toHaveBeenCalled();
    });

    it("tries both token types when hint is not refresh_token", async () => {
      const provider = new OneNoteProxyOAuthProvider(mockConfig);

      await provider.revokeToken(
        {} as never,
        {
          token: "some-token",
          token_type_hint: "access_token",
        } as never
      );

      expect(mockTokenStore.revokeAccessToken).toHaveBeenCalledWith(
        "some-token"
      );
      expect(mockTokenStore.revokeRefreshToken).toHaveBeenCalledWith(
        "some-token"
      );
    });

    it("tries both token types when no hint is provided", async () => {
      const provider = new OneNoteProxyOAuthProvider(mockConfig);

      await provider.revokeToken(
        {} as never,
        {
          token: "unknown-token",
        } as never
      );

      expect(mockTokenStore.revokeAccessToken).toHaveBeenCalledWith(
        "unknown-token"
      );
      expect(mockTokenStore.revokeRefreshToken).toHaveBeenCalledWith(
        "unknown-token"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// handleMicrosoftOAuthCallback
// ---------------------------------------------------------------------------

describe("handleMicrosoftOAuthCallback", () => {
  const mockConfig: HttpServerConfig = {
    host: "127.0.0.1",
    port: 3001,
    issuerUrl: "http://localhost:3001",
    microsoftClientId: "ms-client-id",
    microsoftClientSecret: "ms-client-secret",
    microsoftRedirectUri: "http://localhost:3001/oauth/callback",
    tenant: "common",
    scopes: ["openid", "Notes.ReadWrite"],
    authorityBaseUrl: "https://login.microsoftonline.com",
  };

  let mockTokenStore: {
    consumePendingRequest: ReturnType<typeof vi.fn>;
    storeAuthCode: ReturnType<typeof vi.fn>;
  };

  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);

    mockTokenStore = {
      consumePendingRequest: vi.fn(),
      storeAuthCode: vi.fn(),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns error when pending request is not found", async () => {
    const { handleMicrosoftOAuthCallback } =
      await import("./onenote-oauth-provider.js");
    mockTokenStore.consumePendingRequest.mockReturnValue(undefined);

    const result = await handleMicrosoftOAuthCallback(
      mockConfig,
      mockTokenStore as never,
      "code",
      "bad-state"
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.errorDescription).toContain("Invalid or expired");
    }
  });

  it("returns error when Microsoft token exchange fails (non-ok)", async () => {
    const { handleMicrosoftOAuthCallback } =
      await import("./onenote-oauth-provider.js");
    mockTokenStore.consumePendingRequest.mockReturnValue({
      clientId: "client-1",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      redirectUri: "http://localhost:3000/callback",
      scope: "openid",
    });

    mockFetch.mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue("unauthorized"),
    });

    const result = await handleMicrosoftOAuthCallback(
      mockConfig,
      mockTokenStore as never,
      "ms-code",
      "ms-state"
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("server_error");
    }
  });

  it("returns error when fetch throws (network error)", async () => {
    const { handleMicrosoftOAuthCallback } =
      await import("./onenote-oauth-provider.js");
    mockTokenStore.consumePendingRequest.mockReturnValue({
      clientId: "client-1",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      redirectUri: "http://localhost:3000/callback",
      scope: "openid",
    });

    mockFetch.mockRejectedValue(new Error("network error"));

    const result = await handleMicrosoftOAuthCallback(
      mockConfig,
      mockTokenStore as never,
      "ms-code",
      "ms-state"
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.errorDescription).toContain("Failed to communicate");
    }
  });

  it("returns redirect URL on successful callback with clientState", async () => {
    const { handleMicrosoftOAuthCallback } =
      await import("./onenote-oauth-provider.js");
    mockTokenStore.consumePendingRequest.mockReturnValue({
      clientId: "client-1",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      redirectUri: "http://localhost:3000/callback",
      scope: "openid",
      clientState: "original-client-state",
    });
    mockTokenStore.storeAuthCode.mockReturnValue("our-code-123");

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "ms-access",
        refresh_token: "ms-refresh",
        expires_in: 3600,
      }),
    });

    const result = await handleMicrosoftOAuthCallback(
      mockConfig,
      mockTokenStore as never,
      "ms-code",
      "ms-state"
    );

    expect("redirectUrl" in result).toBe(true);
    if ("redirectUrl" in result) {
      const url = new URL(result.redirectUrl);
      expect(url.searchParams.get("code")).toBe("our-code-123");
      expect(url.searchParams.get("state")).toBe("original-client-state");
    }
  });

  it("falls back to upstream state when clientState is not set", async () => {
    const { handleMicrosoftOAuthCallback } =
      await import("./onenote-oauth-provider.js");
    mockTokenStore.consumePendingRequest.mockReturnValue({
      clientId: "client-1",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      redirectUri: "http://localhost:3000/callback",
      scope: "openid",
      // no clientState
    });
    mockTokenStore.storeAuthCode.mockReturnValue("our-code-456");

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "ms-access",
      }),
    });

    const result = await handleMicrosoftOAuthCallback(
      mockConfig,
      mockTokenStore as never,
      "ms-code",
      "upstream-state"
    );

    expect("redirectUrl" in result).toBe(true);
    if ("redirectUrl" in result) {
      const url = new URL(result.redirectUrl);
      expect(url.searchParams.get("state")).toBe("upstream-state");
    }
  });

  it("returns error when Microsoft returns invalid token response (Zod fails)", async () => {
    const { handleMicrosoftOAuthCallback } =
      await import("./onenote-oauth-provider.js");
    mockTokenStore.consumePendingRequest.mockReturnValue({
      clientId: "client-1",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      redirectUri: "http://localhost:3000/callback",
      scope: "openid",
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        // Missing required access_token field
        token_type: "Bearer",
      }),
    });

    const result = await handleMicrosoftOAuthCallback(
      mockConfig,
      mockTokenStore as never,
      "ms-code",
      "ms-state"
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("server_error");
      expect(result.errorDescription).toContain(
        "Microsoft returned an unexpected token response"
      );
    }
  });

  it("handles saveTokens failure gracefully", async () => {
    const { handleMicrosoftOAuthCallback } =
      await import("./onenote-oauth-provider.js");
    const { saveTokens } = await import("../onenote/token-store.js");
    vi.mocked(saveTokens).mockImplementation(() => {
      throw new Error("disk full");
    });

    mockTokenStore.consumePendingRequest.mockReturnValue({
      clientId: "client-1",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      redirectUri: "http://localhost:3000/callback",
      scope: "openid",
      clientState: "state",
    });
    mockTokenStore.storeAuthCode.mockReturnValue("our-code-789");

    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "ms-access",
        refresh_token: "ms-refresh",
        expires_in: 3600,
      }),
    });

    // Should not throw even though saveTokens fails
    const result = await handleMicrosoftOAuthCallback(
      mockConfig,
      mockTokenStore as never,
      "ms-code",
      "ms-state"
    );

    expect("redirectUrl" in result).toBe(true);
  });
});
