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
});
