import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ServerTokenStore, getServerTokenStore } from "./server-token-store.js";

describe("ServerTokenStore", () => {
  let store: ServerTokenStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new ServerTokenStore();
  });

  afterEach(() => {
    store.dispose();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Pending Requests
  // ---------------------------------------------------------------------------

  describe("pending requests", () => {
    it("stores and retrieves a pending request", () => {
      const state = store.storePendingRequest({
        clientId: "client-1",
        codeChallenge: "challenge-abc",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid",
      });

      expect(typeof state).toBe("string");
      expect(state.length).toBeGreaterThan(0);

      const consumed = store.consumePendingRequest(state);

      expect(consumed).toBeDefined();
      expect(consumed!.clientId).toBe("client-1");
      expect(consumed!.codeChallenge).toBe("challenge-abc");
      expect(consumed!.codeChallengeMethod).toBe("S256");
      expect(consumed!.redirectUri).toBe("http://localhost:3000/callback");
      expect(consumed!.scope).toBe("openid");
      expect(consumed!.createdAt).toBeTypeOf("number");
    });

    it("consume removes the pending request", () => {
      const state = store.storePendingRequest({
        clientId: "client-1",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        scope: undefined,
      });

      // First consume succeeds
      expect(store.consumePendingRequest(state)).toBeDefined();

      // Second consume returns undefined
      expect(store.consumePendingRequest(state)).toBeUndefined();
    });

    it("returns undefined for unknown state", () => {
      expect(store.consumePendingRequest("nonexistent")).toBeUndefined();
    });

    it("returns undefined for expired pending requests", () => {
      const state = store.storePendingRequest({
        clientId: "client-1",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        scope: undefined,
      });

      // Advance past 10 minute expiry
      vi.advanceTimersByTime(11 * 60 * 1000);

      expect(store.consumePendingRequest(state)).toBeUndefined();
    });

    it("preserves clientState when provided", () => {
      const state = store.storePendingRequest({
        clientId: "client-1",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        clientState: "my-client-state",
        scope: "openid",
      });

      const consumed = store.consumePendingRequest(state);
      expect(consumed!.clientState).toBe("my-client-state");
    });
  });

  // ---------------------------------------------------------------------------
  // Authorization Codes
  // ---------------------------------------------------------------------------

  describe("authorization codes", () => {
    it("stores and retrieves an auth code", () => {
      const code = store.storeAuthCode({
        clientId: "client-1",
        codeChallenge: "challenge-abc",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        upstreamAccessToken: "ms-access-token",
        upstreamRefreshToken: "ms-refresh-token",
        scope: "openid profile",
      });

      expect(typeof code).toBe("string");

      const entry = store.getAuthCode(code);
      expect(entry).toBeDefined();
      expect(entry!.clientId).toBe("client-1");
      expect(entry!.upstreamAccessToken).toBe("ms-access-token");
      expect(entry!.upstreamRefreshToken).toBe("ms-refresh-token");
      expect(entry!.scope).toBe("openid profile");
    });

    it("consume removes the auth code", () => {
      const code = store.storeAuthCode({
        clientId: "client-1",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        upstreamAccessToken: "token",
        upstreamRefreshToken: undefined,
        scope: undefined,
      });

      // First consume succeeds
      const entry = store.consumeAuthCode(code);
      expect(entry).toBeDefined();
      expect(entry!.clientId).toBe("client-1");

      // Second consume returns undefined
      expect(store.consumeAuthCode(code)).toBeUndefined();

      // getAuthCode also returns undefined now
      expect(store.getAuthCode(code)).toBeUndefined();
    });

    it("returns undefined for expired auth codes", () => {
      const code = store.storeAuthCode({
        clientId: "client-1",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        upstreamAccessToken: "token",
        upstreamRefreshToken: undefined,
        scope: undefined,
      });

      // Advance past 10 minute expiry
      vi.advanceTimersByTime(11 * 60 * 1000);

      expect(store.getAuthCode(code)).toBeUndefined();
      expect(store.consumeAuthCode(code)).toBeUndefined();
    });

    it("returns undefined for unknown code", () => {
      expect(store.getAuthCode("nonexistent")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Access Tokens
  // ---------------------------------------------------------------------------

  describe("access tokens", () => {
    it("stores and retrieves an access token", () => {
      const { accessToken, expiresIn } = store.storeAccessToken({
        upstreamAccessToken: "ms-token",
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: "openid",
      });

      expect(typeof accessToken).toBe("string");
      expect(expiresIn).toBe(3600);

      const entry = store.getAccessToken(accessToken);
      expect(entry).toBeDefined();
      expect(entry!.upstreamAccessToken).toBe("ms-token");
      expect(entry!.upstreamRefreshToken).toBe("ms-refresh");
      expect(entry!.clientId).toBe("client-1");
      expect(entry!.scope).toBe("openid");
    });

    it("revokes an access token", () => {
      const { accessToken } = store.storeAccessToken({
        upstreamAccessToken: "ms-token",
        upstreamRefreshToken: undefined,
        clientId: "client-1",
        scope: undefined,
      });

      expect(store.revokeAccessToken(accessToken)).toBe(true);
      expect(store.getAccessToken(accessToken)).toBeUndefined();

      // Revoking again returns false
      expect(store.revokeAccessToken(accessToken)).toBe(false);
    });

    it("returns undefined for expired access tokens", () => {
      const { accessToken } = store.storeAccessToken({
        upstreamAccessToken: "ms-token",
        upstreamRefreshToken: undefined,
        clientId: "client-1",
        scope: undefined,
      });

      // Advance past 1 hour expiry
      vi.advanceTimersByTime(61 * 60 * 1000);

      expect(store.getAccessToken(accessToken)).toBeUndefined();
    });

    it("returns undefined for unknown token", () => {
      expect(store.getAccessToken("nonexistent")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Refresh Tokens
  // ---------------------------------------------------------------------------

  describe("refresh tokens", () => {
    it("stores and retrieves a refresh token", () => {
      const token = store.storeRefreshToken({
        upstreamRefreshToken: "ms-refresh-token",
        clientId: "client-1",
        scope: "offline_access",
      });

      expect(typeof token).toBe("string");

      const entry = store.getRefreshToken(token);
      expect(entry).toBeDefined();
      expect(entry!.upstreamRefreshToken).toBe("ms-refresh-token");
      expect(entry!.clientId).toBe("client-1");
      expect(entry!.scope).toBe("offline_access");
    });

    it("revokes a refresh token", () => {
      const token = store.storeRefreshToken({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: undefined,
      });

      expect(store.revokeRefreshToken(token)).toBe(true);
      expect(store.getRefreshToken(token)).toBeUndefined();

      // Revoking again returns false
      expect(store.revokeRefreshToken(token)).toBe(false);
    });

    it("returns undefined for expired refresh tokens", () => {
      const token = store.storeRefreshToken({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: undefined,
      });

      // Advance past 30 day expiry
      vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);

      expect(store.getRefreshToken(token)).toBeUndefined();
    });

    it("returns undefined for unknown token", () => {
      expect(store.getRefreshToken("nonexistent")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  describe("cleanup", () => {
    it("removes expired entries on manual cleanup", () => {
      // Store a pending request
      const state = store.storePendingRequest({
        clientId: "client-1",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        scope: undefined,
      });

      // Store an auth code
      const code = store.storeAuthCode({
        clientId: "client-1",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        upstreamAccessToken: "token",
        upstreamRefreshToken: undefined,
        scope: undefined,
      });

      // Store an access token
      const { accessToken } = store.storeAccessToken({
        upstreamAccessToken: "ms-token",
        upstreamRefreshToken: undefined,
        clientId: "client-1",
        scope: undefined,
      });

      // Store a refresh token
      const refreshToken = store.storeRefreshToken({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: undefined,
      });

      // Advance past the longest short-lived expiry (1 hour for access tokens)
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      store.cleanup();

      // Pending request, auth code, and access token should be cleaned up
      // (Note: consume also checks expiry, but the entry should be deleted by cleanup)
      expect(store.consumePendingRequest(state)).toBeUndefined();
      expect(store.getAuthCode(code)).toBeUndefined();
      expect(store.getAccessToken(accessToken)).toBeUndefined();

      // Refresh token has 30-day expiry, should still exist
      expect(store.getRefreshToken(refreshToken)).toBeDefined();
    });

    it("automatic cleanup timer fires periodically", () => {
      // Store an access token
      const { accessToken } = store.storeAccessToken({
        upstreamAccessToken: "ms-token",
        upstreamRefreshToken: undefined,
        clientId: "client-1",
        scope: undefined,
      });

      // Advance past access token expiry AND past the 5-minute cleanup interval
      // The cleanup interval is 5 minutes; expiry is 1 hour
      // So we advance 1 hour + 5 minutes to trigger both expiry and cleanup
      vi.advanceTimersByTime(65 * 60 * 1000);

      // The token should have been cleaned up by the periodic timer
      expect(store.getAccessToken(accessToken)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Map size cap enforcement
  // ---------------------------------------------------------------------------

  describe("size caps", () => {
    it("throws when pending requests map is full", () => {
      // Access private pendingRequests map and simulate it being at capacity
      const privateStore = store as unknown as {
        pendingRequests: Map<string, unknown>;
      };
      // Fake the size to be at the limit (10_000)
      Object.defineProperty(privateStore.pendingRequests, "size", {
        get: () => 10_000,
        configurable: true,
      });

      expect(() =>
        store.storePendingRequest({
          clientId: "client-1",
          codeChallenge: "challenge",
          codeChallengeMethod: "S256",
          redirectUri: "http://localhost:3000/callback",
          scope: undefined,
        })
      ).toThrow("Too many pending authorization requests");
    });

    it("throws when auth codes map is full", () => {
      const privateStore = store as unknown as {
        authCodes: Map<string, unknown>;
      };
      Object.defineProperty(privateStore.authCodes, "size", {
        get: () => 10_000,
        configurable: true,
      });

      expect(() =>
        store.storeAuthCode({
          clientId: "client-1",
          codeChallenge: "challenge",
          codeChallengeMethod: "S256",
          redirectUri: "http://localhost:3000/callback",
          upstreamAccessToken: "token",
          upstreamRefreshToken: undefined,
          scope: undefined,
        })
      ).toThrow("Too many authorization codes");
    });

    it("throws when access tokens map is full", () => {
      const privateStore = store as unknown as {
        accessTokens: Map<string, unknown>;
      };
      Object.defineProperty(privateStore.accessTokens, "size", {
        get: () => 10_000,
        configurable: true,
      });

      expect(() =>
        store.storeAccessToken({
          upstreamAccessToken: "ms-token",
          upstreamRefreshToken: undefined,
          clientId: "client-1",
          scope: undefined,
        })
      ).toThrow("Too many access tokens");
    });

    it("throws when refresh tokens map is full", () => {
      const privateStore = store as unknown as {
        refreshTokens: Map<string, unknown>;
      };
      Object.defineProperty(privateStore.refreshTokens, "size", {
        get: () => 10_000,
        configurable: true,
      });

      expect(() =>
        store.storeRefreshToken({
          upstreamRefreshToken: "ms-refresh",
          clientId: "client-1",
          scope: undefined,
        })
      ).toThrow("Too many refresh tokens");
    });
  });

  // ---------------------------------------------------------------------------
  // Cleanup edge cases
  // ---------------------------------------------------------------------------

  describe("cleanup edge cases", () => {
    it("cleanup removes expired refresh tokens", () => {
      const token = store.storeRefreshToken({
        upstreamRefreshToken: "ms-refresh",
        clientId: "client-1",
        scope: undefined,
      });

      // Advance past 30-day expiry
      vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);

      store.cleanup();

      expect(store.getRefreshToken(token)).toBeUndefined();
    });

    it("cleanup does not remove non-expired entries", () => {
      const state = store.storePendingRequest({
        clientId: "client-1",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        scope: undefined,
      });

      const { accessToken } = store.storeAccessToken({
        upstreamAccessToken: "ms-token",
        upstreamRefreshToken: undefined,
        clientId: "client-1",
        scope: undefined,
      });

      // Advance only 1 minute -- nothing should expire yet
      vi.advanceTimersByTime(60 * 1000);

      store.cleanup();

      // Both should still be valid
      const consumed = store.consumePendingRequest(state);
      expect(consumed).toBeDefined();
      expect(store.getAccessToken(accessToken)).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  describe("dispose", () => {
    it("stops the cleanup timer", () => {
      // dispose is called in afterEach; here we just verify calling it twice is safe
      store.dispose();
      store.dispose();
    });
  });
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe("getServerTokenStore", () => {
  it("returns a ServerTokenStore instance", () => {
    const instance = getServerTokenStore();
    expect(instance).toBeInstanceOf(ServerTokenStore);
  });

  it("returns the same instance on subsequent calls", () => {
    const instance1 = getServerTokenStore();
    const instance2 = getServerTokenStore();
    expect(instance1).toBe(instance2);
  });
});
