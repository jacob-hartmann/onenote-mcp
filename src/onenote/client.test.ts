import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OneNoteClient,
  createClientFromAuth,
  createClientFromEnv,
} from "./client.js";

describe("OneNoteClient", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["ONENOTE_ACCESS_TOKEN"];
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success for valid JSON response", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ id: "123" })),
    });

    const result = await client.request<{ id: string }>({ path: "/me" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("123");
    }
  });

  it("maps unauthorized errors", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({
        error: { message: "invalid token" },
      }),
    });

    const result = await client.request<{ id: string }>({ path: "/me" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNAUTHORIZED");
    }
  });

  it("maps non-JSON success bodies to UNKNOWN errors", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("not-json"),
    });

    const result = await client.request<{ id: string }>({ path: "/me" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNKNOWN");
      expect(result.error.statusCode).toBe(200);
    }
  });

  it("returns success for empty response bodies", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    });

    const result = await client.request<undefined>({ path: "/me" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it.each([
    { status: 403, expectedCode: "FORBIDDEN", retryable: false },
    { status: 404, expectedCode: "NOT_FOUND", retryable: false },
    { status: 429, expectedCode: "RATE_LIMITED", retryable: true },
    { status: 503, expectedCode: "SERVER_ERROR", retryable: true },
    { status: 400, expectedCode: "UNKNOWN", retryable: false },
  ])(
    "maps HTTP $status to $expectedCode",
    async ({ status, expectedCode, retryable }) => {
      const client = new OneNoteClient({ token: "token" });

      mockFetch.mockResolvedValue({
        ok: false,
        status,
        json: vi.fn().mockResolvedValue({
          error: { message: "detail message" },
        }),
      });

      const result = await client.request<{ id: string }>({ path: "/me" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(expectedCode);
        expect(result.error.retryable).toBe(retryable);
      }
    }
  );

  it("handles non-JSON error response payloads", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 418,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });

    const result = await client.request<{ id: string }>({ path: "/me" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNKNOWN");
      expect(result.error.message).toContain("Unexpected error (418)");
    }
  });

  it("maps generic network errors", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockRejectedValue(new Error("socket hang up"));

    const result = await client.request<{ id: string }>({ path: "/me" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NETWORK_ERROR");
    }
  });

  it("maps non-Error thrown values", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockRejectedValue("boom");

    const result = await client.request<{ id: string }>({ path: "/me" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNKNOWN");
    }
  });

  it("sends method, params, and JSON body", async () => {
    const client = new OneNoteClient({
      token: "token",
      baseUrl: "https://graph.test/v1.0/",
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ ok: true })),
    });

    await client.request<{ ok: boolean }>({
      path: "/me/onenote/pages",
      method: "POST",
      params: { select: "id" },
      body: { title: "Test" },
    });

    const [url, init] = vi.mocked(mockFetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("https://graph.test/v1.0/me/onenote/pages");
    expect(url).toContain("select=id");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ title: "Test" }));
    expect(init.headers).toMatchObject({
      Authorization: "Bearer token",
      Accept: "application/json",
      "Content-Type": "application/json",
    });
  });

  it("maps timeout errors", async () => {
    const client = new OneNoteClient({ token: "token", timeoutMs: 1 });

    const timeoutError = Object.assign(new Error("timed out"), {
      name: "AbortError",
    });
    mockFetch.mockRejectedValue(timeoutError);

    const result = await client.request<{ id: string }>({ path: "/me" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TIMEOUT");
    }
  });

  it("aborts requests when timeout elapses", async () => {
    vi.useFakeTimers();
    const client = new OneNoteClient({ token: "token", timeoutMs: 5 });

    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }
        signal.addEventListener("abort", () => {
          const error = Object.assign(new Error("aborted"), {
            name: "AbortError",
          });
          reject(error);
        });
      });
    });

    const promise = client.request<{ id: string }>({ path: "/me" });
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TIMEOUT");
    }

    vi.useRealTimers();
  });
});

describe("OneNoteClient.requestRaw", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns raw text on success", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi
        .fn()
        .mockResolvedValue("<html><body><p>Content</p></body></html>"),
    });

    const result = await client.requestRaw({
      path: "/me/onenote/pages/p1/content",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("<html><body><p>Content</p></body></html>");
    }
  });

  it("sets Accept header to text/html by default", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
    });

    await client.requestRaw({ path: "/me/onenote/pages/p1/content" });

    const [, init] = vi.mocked(mockFetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.headers).toMatchObject({
      Accept: "text/html",
    });
  });

  it("allows overriding the Accept header", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
    });

    await client.requestRaw({
      path: "/me/onenote/pages/p1/content",
      accept: "application/xml",
    });

    const [, init] = vi.mocked(mockFetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.headers).toMatchObject({
      Accept: "application/xml",
    });
  });

  it("handles HTTP errors", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({
        error: { message: "Page not found" },
      }),
    });

    const result = await client.requestRaw({
      path: "/me/onenote/pages/bad/content",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("handles network errors", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockRejectedValue(new Error("connection refused"));

    const result = await client.requestRaw({
      path: "/me/onenote/pages/p1/content",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NETWORK_ERROR");
    }
  });
});

describe("OneNoteClient.requestHtmlBody", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends raw HTML body with correct Content-Type", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: vi.fn().mockResolvedValue(JSON.stringify({ id: "new-page" })),
    });

    const htmlBody =
      "<!DOCTYPE html><html><head><title>Test</title></head><body><p>Hello</p></body></html>";
    await client.requestHtmlBody<{ id: string }>({
      path: "/me/onenote/sections/sec1/pages",
      body: htmlBody,
    });

    const [, init] = vi.mocked(mockFetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(htmlBody);
    expect(init.headers).toMatchObject({
      "Content-Type": "application/xhtml+xml",
      Accept: "application/json",
    });
  });

  it("returns parsed JSON response", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ id: "page-123", title: "New Page" })
        ),
    });

    const result = await client.requestHtmlBody<{ id: string; title: string }>({
      path: "/me/onenote/sections/sec1/pages",
      body: "<html></html>",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("page-123");
      expect(result.data.title).toBe("New Page");
    }
  });

  it("handles empty (204) responses", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    });

    const result = await client.requestHtmlBody<undefined>({
      path: "/me/onenote/sections/sec1/pages",
      body: "<html></html>",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("handles JSON parse errors", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("not-valid-json"),
    });

    const result = await client.requestHtmlBody<{ id: string }>({
      path: "/me/onenote/sections/sec1/pages",
      body: "<html></html>",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNKNOWN");
      expect(result.error.message).toContain("non-JSON response");
    }
  });

  it("handles HTTP errors", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({
        error: { message: "Access denied" },
      }),
    });

    const result = await client.requestHtmlBody<{ id: string }>({
      path: "/me/onenote/sections/sec1/pages",
      body: "<html></html>",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
  });

  it("allows overriding the content type", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ ok: true })),
    });

    await client.requestHtmlBody<{ ok: boolean }>({
      path: "/me/onenote/sections/sec1/pages",
      body: "<html></html>",
      contentType: "text/html",
    });

    const [, init] = vi.mocked(mockFetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.headers).toMatchObject({
      "Content-Type": "text/html",
    });
  });
});

describe("OneNoteClient.requestEmpty", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success with void data for 204 No Content", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    });

    const result = await client.requestEmpty({
      path: "/me/onenote/pages/pg-1",
      method: "DELETE",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("returns success even when response has a body (body is discarded)", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ ignored: true })),
    });

    const result = await client.requestEmpty({
      path: "/me/onenote/pages/pg-1/content",
      method: "PATCH",
      body: [{ target: "body", action: "append", content: "<p>Hi</p>" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("sends Authorization header and JSON body", async () => {
    const client = new OneNoteClient({
      token: "my-token",
      baseUrl: "https://graph.test/v1.0/",
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    });

    const patches = [{ target: "body", action: "append", content: "<p>X</p>" }];
    await client.requestEmpty({
      path: "/me/onenote/pages/pg-1/content",
      method: "PATCH",
      body: patches,
    });

    const [url, init] = vi.mocked(mockFetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain(
      "https://graph.test/v1.0/me/onenote/pages/pg-1/content"
    );
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify(patches));
    expect(init.headers).toMatchObject({
      Authorization: "Bearer my-token",
      Accept: "application/json",
      "Content-Type": "application/json",
    });
  });

  it("handles HTTP errors", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({
        error: { message: "Page not found" },
      }),
    });

    const result = await client.requestEmpty({
      path: "/me/onenote/pages/bad-id",
      method: "DELETE",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("handles network errors", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockRejectedValue(new Error("connection reset"));

    const result = await client.requestEmpty({
      path: "/me/onenote/pages/pg-1",
      method: "DELETE",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NETWORK_ERROR");
    }
  });

  it("handles timeout errors", async () => {
    const client = new OneNoteClient({ token: "token", timeoutMs: 1 });

    const timeoutError = Object.assign(new Error("timed out"), {
      name: "AbortError",
    });
    mockFetch.mockRejectedValue(timeoutError);

    const result = await client.requestEmpty({
      path: "/me/onenote/pages/pg-1",
      method: "DELETE",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TIMEOUT");
    }
  });

  it("sends query params", async () => {
    const client = new OneNoteClient({ token: "token" });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    });

    await client.requestEmpty({
      path: "/me/onenote/pages/pg-1",
      method: "DELETE",
      params: { key: "value" },
    });

    const [url] = vi.mocked(mockFetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("key=value");
  });
});

describe("client factory helpers", () => {
  it("createClientFromEnv returns missing token error when unset", () => {
    const result = createClientFromEnv();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("MISSING_TOKEN");
    }
  });

  it("createClientFromEnv returns client when token exists", () => {
    process.env["ONENOTE_ACCESS_TOKEN"] = "manual-token";

    const result = createClientFromEnv();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeInstanceOf(OneNoteClient);
    }
  });

  it("createClientFromAuth returns missing token error on auth failures", async () => {
    delete process.env["ONENOTE_ACCESS_TOKEN"];
    delete process.env["ONENOTE_OAUTH_CLIENT_ID"];
    delete process.env["ONENOTE_OAUTH_CLIENT_SECRET"];

    const result = await createClientFromAuth();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("MISSING_TOKEN");
    }
  });

  it("createClientFromAuth returns a client when auth succeeds", async () => {
    const authModule = await import("./auth.js");
    const spy = vi
      .spyOn(authModule, "getOneNoteAccessToken")
      .mockResolvedValue({ accessToken: "token-from-auth", source: "cache" });

    const result = await createClientFromAuth();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeInstanceOf(OneNoteClient);
    }

    spy.mockRestore();
  });

  it("createClientFromAuth maps unknown auth failures", async () => {
    const authModule = await import("./auth.js");
    const spy = vi
      .spyOn(authModule, "getOneNoteAccessToken")
      .mockRejectedValue(new Error("unexpected auth failure"));

    const result = await createClientFromAuth();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNKNOWN");
    }

    spy.mockRestore();
  });
});
