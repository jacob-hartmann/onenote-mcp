import { describe, it, expect, vi, afterEach } from "vitest";
import { getHttpServerConfig, isLocalhost } from "./config.js";

describe("isLocalhost", () => {
  it('recognizes "localhost"', () => {
    expect(isLocalhost("http://localhost:3001")).toBe(true);
  });

  it('recognizes "127.0.0.1"', () => {
    expect(isLocalhost("http://127.0.0.1:3001")).toBe(true);
  });

  it('recognizes "[::1]"', () => {
    expect(isLocalhost("http://[::1]:3001")).toBe(true);
  });

  it("recognizes localhost without port", () => {
    expect(isLocalhost("http://localhost")).toBe(true);
  });

  it("rejects non-localhost hostnames", () => {
    expect(isLocalhost("http://example.com:3001")).toBe(false);
  });

  it("rejects non-localhost IP addresses", () => {
    expect(isLocalhost("http://192.168.1.1:3001")).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isLocalhost("not-a-url")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLocalhost("")).toBe(false);
  });

  it("recognizes https://localhost", () => {
    expect(isLocalhost("https://localhost:3001")).toBe(true);
  });
});

describe("getHttpServerConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined when ONENOTE_OAUTH_CLIENT_ID is missing", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "test-secret");

    expect(getHttpServerConfig()).toBeUndefined();
  });

  it("returns undefined when ONENOTE_OAUTH_CLIENT_SECRET is missing", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "test-id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "");

    expect(getHttpServerConfig()).toBeUndefined();
  });

  it("returns undefined when both credentials are missing", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "");

    expect(getHttpServerConfig()).toBeUndefined();
  });

  it("returns valid config with required env vars and defaults", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "test-client-id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "test-client-secret");
    // Delete optional vars so ?? falls through to defaults
    delete process.env["MCP_SERVER_HOST"];
    delete process.env["MCP_SERVER_PORT"];
    delete process.env["MCP_ISSUER_URL"];
    delete process.env["ONENOTE_OAUTH_REDIRECT_URI"];
    delete process.env["ONENOTE_OAUTH_TENANT"];
    delete process.env["ONENOTE_OAUTH_SCOPES"];
    delete process.env["ONENOTE_OAUTH_AUTHORITY_BASE_URL"];

    const config = getHttpServerConfig();

    expect(config).toBeDefined();
    expect(config!.microsoftClientId).toBe("test-client-id");
    expect(config!.microsoftClientSecret).toBe("test-client-secret");
    expect(config!.host).toBe("127.0.0.1");
    expect(config!.port).toBe(3001);
    expect(config!.issuerUrl).toBe("http://localhost:3001");
    expect(config!.tenant).toBe("common");
    expect(config!.scopes).toContain("offline_access");
    expect(config!.scopes).toContain("Notes.ReadWrite");
    expect(config!.authorityBaseUrl).toBe("https://login.microsoftonline.com");
    expect(config!.microsoftRedirectUri).toBe(
      "http://localhost:3001/oauth/callback"
    );
  });

  it("respects custom MCP_SERVER_HOST", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("MCP_SERVER_HOST", "0.0.0.0");

    const config = getHttpServerConfig();

    expect(config).toBeDefined();
    expect(config!.host).toBe("0.0.0.0");
  });

  it("respects custom MCP_SERVER_PORT", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("MCP_SERVER_PORT", "8080");

    const config = getHttpServerConfig();

    expect(config).toBeDefined();
    expect(config!.port).toBe(8080);
  });

  it("respects custom MCP_ISSUER_URL (localhost)", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("MCP_ISSUER_URL", "http://localhost:9000");

    const config = getHttpServerConfig();

    expect(config).toBeDefined();
    expect(config!.issuerUrl).toBe("http://localhost:9000");
  });

  it("respects custom ONENOTE_OAUTH_TENANT", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("ONENOTE_OAUTH_TENANT", "consumers");

    const config = getHttpServerConfig();

    expect(config).toBeDefined();
    expect(config!.tenant).toBe("consumers");
  });

  it("respects custom ONENOTE_OAUTH_SCOPES", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("ONENOTE_OAUTH_SCOPES", "openid profile");

    const config = getHttpServerConfig();

    expect(config).toBeDefined();
    expect(config!.scopes).toEqual(["openid", "profile"]);
  });

  it("respects custom ONENOTE_OAUTH_REDIRECT_URI", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("ONENOTE_OAUTH_REDIRECT_URI", "http://localhost:9000/cb");

    const config = getHttpServerConfig();

    expect(config).toBeDefined();
    expect(config!.microsoftRedirectUri).toBe("http://localhost:9000/cb");
  });

  it("respects custom ONENOTE_OAUTH_AUTHORITY_BASE_URL", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv(
      "ONENOTE_OAUTH_AUTHORITY_BASE_URL",
      "https://custom-login.example.com"
    );

    const config = getHttpServerConfig();

    expect(config).toBeDefined();
    expect(config!.authorityBaseUrl).toBe("https://custom-login.example.com");
  });

  it("returns undefined for non-localhost HTTP issuer URL (security check)", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("MCP_ISSUER_URL", "http://example.com:3001");

    // Suppress console.error output during this test
    const errorSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());

    const config = getHttpServerConfig();

    expect(config).toBeUndefined();

    errorSpy.mockRestore();
  });

  it("allows HTTPS for non-localhost issuer URL", () => {
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_ID", "id");
    vi.stubEnv("ONENOTE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("MCP_ISSUER_URL", "https://my-server.example.com");

    const config = getHttpServerConfig();

    expect(config).toBeDefined();
    expect(config!.issuerUrl).toBe("https://my-server.example.com");
  });
});
