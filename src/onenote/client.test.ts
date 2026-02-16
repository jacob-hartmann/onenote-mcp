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
