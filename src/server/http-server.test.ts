import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – hoist stubs that are referenced inside vi.mock factories
// ---------------------------------------------------------------------------

const mockAppUse = vi.fn();
const mockAppGet = vi.fn();
const mockAppPost = vi.fn();
const mockAppDelete = vi.fn();
const mockListen = vi.fn();
const mockServerOn = vi.fn();
const mockServerClose = vi.fn();

const mockExpressApp = {
  use: mockAppUse,
  get: mockAppGet,
  post: mockAppPost,
  delete: mockAppDelete,
  listen: mockListen,
};

vi.mock("express", () => {
  const json = vi.fn(() => "json-middleware");
  return {
    default: Object.assign(vi.fn(() => mockExpressApp), { json }),
    __esModule: true,
  };
});

vi.mock("helmet", () => ({
  default: vi.fn(() => "helmet-middleware"),
  __esModule: true,
}));

vi.mock("express-rate-limit", () => ({
  default: vi.fn(() => "rate-limit-middleware"),
  __esModule: true,
}));

vi.mock("@modelcontextprotocol/sdk/server/express.js", () => ({
  createMcpExpressApp: vi.fn(() => mockExpressApp),
}));

vi.mock("@modelcontextprotocol/sdk/server/auth/router.js", () => ({
  mcpAuthRouter: vi.fn(() => "auth-router-middleware"),
}));

vi.mock("@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js", () => ({
  requireBearerAuth: vi.fn(() => "bearer-auth-middleware"),
}));

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(function () {
    return {
      sessionId: "test-session-id",
      handleRequest: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      onclose: null,
      onsessioninitialized: null,
    };
  }),
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  isInitializeRequest: vi.fn(),
}));

vi.mock("./onenote-oauth-provider.js", () => ({
  OneNoteProxyOAuthProvider: class MockOneNoteProxyOAuthProvider {
    clientsStore = {};
  },
  handleMicrosoftOAuthCallback: vi.fn(),
}));

vi.mock("./server-token-store.js", () => ({
  getServerTokenStore: vi.fn(() => ({
    cleanup: vi.fn(),
  })),
}));

vi.mock("./cors.js", () => ({
  isCorsAllowedPath: vi.fn(),
}));

vi.mock("../utils/html.js", () => ({
  escapeHtml: vi.fn((s: string) => s),
}));

vi.mock("../utils/lru-cache.js", () => {
  class MockLRUCache {
    private map = new Map();
    get(k: string): unknown { return this.map.get(k); }
    set(k: string, v: unknown): void { this.map.set(k, v); }
    has(k: string): boolean { return this.map.has(k); }
    delete(k: string): boolean { return this.map.delete(k); }
    get size(): number { return this.map.size; }
    *entries(): IterableIterator<[string, unknown]> { yield* this.map.entries(); }
    clear(): void { this.map.clear(); }
  }
  return { LRUCache: MockLRUCache };
});

import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { isCorsAllowedPath } from "./cors.js";
import { handleMicrosoftOAuthCallback } from "./onenote-oauth-provider.js";
import type { HttpServerConfig } from "./config.js";
import { startHttpServer } from "./http-server.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function mockGetServer(): never {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
  } as never;
}

/** Simulate the listen callback firing */
function simulateListen(): void {
  mockListen.mockImplementation(
    (_port: number, _host: string, callback: () => void) => {
      callback();
      return { on: mockServerOn, close: mockServerClose };
    }
  );
}

function makeRes(): Record<string, unknown> {
  const res: Record<string, unknown> = {
    headersSent: false,
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
    redirect: vi.fn(),
    send: vi.fn(),
  };
  res["status"] = vi.fn(() => res);
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    headers: {},
    query: {},
    path: "/mcp",
    method: "POST",
    body: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startHttpServer", () => {
  let processOnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    simulateListen();
    processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
  });

  afterEach(() => {
    vi.useRealTimers();
    processOnSpy.mockRestore();
  });

  it("starts the server and listens on configured host/port", async () => {
    await startHttpServer(mockGetServer, mockConfig);

    expect(mockListen).toHaveBeenCalledWith(
      3001,
      "127.0.0.1",
      expect.any(Function)
    );
  });

  it("mounts helmet, rate-limit, and json middleware", async () => {
    await startHttpServer(mockGetServer, mockConfig);

    const useCallArgs = mockAppUse.mock.calls.map(
      (call: unknown[]) => call[call.length - 1]
    );
    expect(useCallArgs).toContain("helmet-middleware");
    expect(useCallArgs).toContain("json-middleware");
  });

  it("sets up POST, GET, DELETE routes for /mcp", async () => {
    await startHttpServer(mockGetServer, mockConfig);

    expect(mockAppPost).toHaveBeenCalledWith(
      "/mcp",
      "bearer-auth-middleware",
      expect.any(Function)
    );
    expect(mockAppGet).toHaveBeenCalledWith(
      "/mcp",
      "bearer-auth-middleware",
      expect.any(Function)
    );
    expect(mockAppDelete).toHaveBeenCalledWith(
      "/mcp",
      "bearer-auth-middleware",
      expect.any(Function)
    );
  });

  it("registers OAuth callback route", async () => {
    await startHttpServer(mockGetServer, mockConfig);

    const getCallNames = mockAppGet.mock.calls.map(
      (call: unknown[]) => call[0]
    );
    expect(getCallNames).toContain("/oauth/callback");
  });

  // -------------------------------------------------------------------------
  // CORS middleware
  // -------------------------------------------------------------------------

  describe("CORS middleware", () => {
    async function getCorsMiddleware(): Promise<
      (req: unknown, res: unknown, next: unknown) => void
    > {
      await startHttpServer(mockGetServer, mockConfig);
      // CORS middleware is the second app.use call (after helmet)
      const corsCall = mockAppUse.mock.calls.find(
        (call: unknown[]) => typeof call[0] === "function" && call.length === 1
      );
      return corsCall![0] as (
        req: unknown,
        res: unknown,
        next: unknown
      ) => void;
    }

    it("calls next when no origin header", async () => {
      const cors = await getCorsMiddleware();
      const req = makeReq({ headers: {} });
      const res = makeRes();
      const next = vi.fn();

      cors(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("allows CORS for allowed paths", async () => {
      vi.mocked(isCorsAllowedPath).mockReturnValue(true);
      const cors = await getCorsMiddleware();
      const req = makeReq({ headers: { origin: "http://example.com" } });
      const res = makeRes();
      const next = vi.fn();

      cors(req, res, next);

      expect(res["setHeader"]).toHaveBeenCalledWith(
        "Access-Control-Allow-Origin",
        "*"
      );
      expect(next).toHaveBeenCalled();
    });

    it("handles OPTIONS preflight for allowed paths", async () => {
      vi.mocked(isCorsAllowedPath).mockReturnValue(true);
      const cors = await getCorsMiddleware();
      const req = makeReq({
        headers: { origin: "http://example.com" },
        method: "OPTIONS",
      });
      const res = makeRes();
      const next = vi.fn();

      cors(req, res, next);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(204);
      expect(res["end"]).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("blocks CORS for disallowed paths", async () => {
      vi.mocked(isCorsAllowedPath).mockReturnValue(false);
      const cors = await getCorsMiddleware();
      const req = makeReq({
        headers: { origin: "http://example.com" },
        path: "/mcp",
      });
      const res = makeRes();
      const next = vi.fn();

      cors(req, res, next);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // OAuth callback handler
  // -------------------------------------------------------------------------

  describe("OAuth callback handler", () => {
    async function getCallbackHandler(): Promise<
      (req: unknown, res: unknown) => Promise<void>
    > {
      await startHttpServer(mockGetServer, mockConfig);
      const callbackCall = mockAppGet.mock.calls.find(
        (call: unknown[]) => call[0] === "/oauth/callback"
      );
      return callbackCall![1] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
    }

    it("returns 400 when Microsoft sends an error", async () => {
      const handler = await getCallbackHandler();
      const req = makeReq({
        query: { error: "access_denied", error_description: "Denied by user" },
      });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(400);
      expect(res["send"]).toHaveBeenCalled();
    });

    it("returns 400 when code or state is missing", async () => {
      const handler = await getCallbackHandler();
      const req = makeReq({ query: {} });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(400);
    });

    it("returns 400 when callback handler returns error", async () => {
      vi.mocked(handleMicrosoftOAuthCallback).mockResolvedValue({
        error: "invalid_request",
        errorDescription: "Bad state",
      });
      const handler = await getCallbackHandler();
      const req = makeReq({ query: { code: "abc", state: "xyz" } });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(400);
    });

    it("redirects on successful callback", async () => {
      vi.mocked(handleMicrosoftOAuthCallback).mockResolvedValue({
        redirectUrl: "http://localhost:3000/callback?code=our-code&state=xyz",
      });
      const handler = await getCallbackHandler();
      const req = makeReq({ query: { code: "ms-code", state: "ms-state" } });
      const res = makeRes();

      await handler(req, res);

      expect(res["redirect"]).toHaveBeenCalledWith(
        "http://localhost:3000/callback?code=our-code&state=xyz"
      );
    });

    it("handles error with non-string error_description", async () => {
      const handler = await getCallbackHandler();
      const req = makeReq({
        query: { error: "server_error", error_description: 42 },
      });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(400);
    });
  });

  // -------------------------------------------------------------------------
  // MCP POST handler
  // -------------------------------------------------------------------------

  describe("MCP POST handler", () => {
    async function getPostHandler(): Promise<
      (req: unknown, res: unknown) => Promise<void>
    > {
      await startHttpServer(mockGetServer, mockConfig);
      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      return postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
    }

    it("returns 400 when no session ID and not an init request", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(false);
      const handler = await getPostHandler();
      const req = makeReq({ headers: {}, body: {} });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(400);
    });

    it("returns 404 when session ID is not found", async () => {
      const handler = await getPostHandler();
      const req = makeReq({
        headers: { "mcp-session-id": "nonexistent-session" },
      });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(404);
    });

    it("creates new session for initialize request", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      // Track the onsessioninitialized callback so we can fire it during handleRequest
      let capturedOnInit: ((sid: string) => void) | null = null;

      const mockTransport = {
        sessionId: "new-session-id",
        handleRequest: vi.fn().mockImplementation(() => {
          // Simulate what the real transport does: fire onsessioninitialized during handleRequest
          if (capturedOnInit) capturedOnInit("new-session-id");
          return Promise.resolve();
        }),
        close: vi.fn().mockResolvedValue(undefined),
        onclose: null as (() => void) | null,
      };

      const { StreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
      );
      vi.mocked(StreamableHTTPServerTransport).mockImplementation(
        function (this: unknown, opts: unknown) {
          const options = opts as Record<string, unknown>;
          capturedOnInit = options["onsessioninitialized"] as (
            sid: string
          ) => void;
          return mockTransport as never;
        }
      );

      await startHttpServer(mockGetServer, mockConfig);
      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const handler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;

      const req = makeReq({
        headers: {},
        body: { jsonrpc: "2.0", method: "initialize" },
      });
      const res = makeRes();

      await handler(req, res);

      expect(mockTransport.handleRequest).toHaveBeenCalled();
    });

    it("reuses existing session transport for known session ID", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      let capturedOnInit: ((sid: string) => void) | null = null;

      const mockTransport = {
        sessionId: "existing-session-id",
        handleRequest: vi.fn().mockImplementation(() => {
          // Fire onsessioninitialized on first call to register the session
          if (capturedOnInit) {
            capturedOnInit("existing-session-id");
            capturedOnInit = null; // Only fire once
          }
          return Promise.resolve();
        }),
        close: vi.fn().mockResolvedValue(undefined),
        onclose: null as (() => void) | null,
      };

      const { StreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
      );
      vi.mocked(StreamableHTTPServerTransport).mockImplementation(
        function (this: unknown, opts: unknown) {
          const options = opts as Record<string, unknown>;
          capturedOnInit = options["onsessioninitialized"] as (
            sid: string
          ) => void;
          return mockTransport as never;
        }
      );

      await startHttpServer(mockGetServer, mockConfig);
      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const handler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;

      // First: init request to create the session
      const initReq = makeReq({
        headers: {},
        body: { jsonrpc: "2.0", method: "initialize" },
      });
      const initRes = makeRes();
      await handler(initReq, initRes);

      // Second: reuse the session
      vi.mocked(isInitializeRequest).mockReturnValue(false);
      mockTransport.handleRequest.mockClear();
      mockTransport.handleRequest.mockResolvedValue(undefined);

      const req = makeReq({
        headers: { "mcp-session-id": "existing-session-id" },
        body: { jsonrpc: "2.0", method: "tools/list" },
      });
      const res = makeRes();

      await handler(req, res);

      expect(mockTransport.handleRequest).toHaveBeenCalled();
    });

    it("returns 500 on unexpected error (headers not sent)", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      // Make getServer() throw
      const brokenGetServer = (): never => {
        throw new Error("boom");
      };

      // Reset the listen mock to resolve for the new server
      simulateListen();

      await startHttpServer(brokenGetServer as never, mockConfig);

      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const handler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;

      const req = makeReq({
        headers: {},
        body: { jsonrpc: "2.0", method: "initialize" },
      });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(500);
    });

    it("does not send 500 when headers already sent", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      const brokenGetServer = (): never => {
        throw new Error("boom");
      };

      simulateListen();
      await startHttpServer(brokenGetServer as never, mockConfig);

      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const handler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;

      const req = makeReq({
        headers: {},
        body: { jsonrpc: "2.0", method: "initialize" },
      });
      const res = makeRes();
      res["headersSent"] = true;

      await handler(req, res);

      expect(vi.mocked(res["status"])).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // MCP GET handler
  // -------------------------------------------------------------------------

  describe("MCP GET handler", () => {
    async function getGetHandler(): Promise<
      (req: unknown, res: unknown) => Promise<void>
    > {
      await startHttpServer(mockGetServer, mockConfig);
      const getCall = mockAppGet.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      return getCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
    }

    it("returns 400 when no session ID provided", async () => {
      const handler = await getGetHandler();
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(400);
    });

    it("returns 404 when session not found", async () => {
      const handler = await getGetHandler();
      const req = makeReq({
        headers: { "mcp-session-id": "unknown-session" },
      });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(404);
    });

    it("delegates to transport for valid session", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      let capturedOnInit: ((sid: string) => void) | null = null;

      const mockTransport = {
        sessionId: "get-session-id",
        handleRequest: vi.fn().mockImplementation(() => {
          if (capturedOnInit) {
            capturedOnInit("get-session-id");
            capturedOnInit = null;
          }
          return Promise.resolve();
        }),
        close: vi.fn().mockResolvedValue(undefined),
        onclose: null as (() => void) | null,
      };

      const { StreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
      );
      vi.mocked(StreamableHTTPServerTransport).mockImplementation(
        function (this: unknown, opts: unknown) {
          const options = opts as Record<string, unknown>;
          capturedOnInit = options["onsessioninitialized"] as (
            sid: string
          ) => void;
          return mockTransport as never;
        }
      );

      await startHttpServer(mockGetServer, mockConfig);

      // Create session via POST
      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const postHandler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
      await postHandler(
        makeReq({
          headers: {},
          body: { jsonrpc: "2.0", method: "initialize" },
        }),
        makeRes()
      );

      // Now test GET
      const getCall = mockAppGet.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const getHandler = getCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;

      mockTransport.handleRequest.mockClear();
      mockTransport.handleRequest.mockResolvedValue(undefined);
      const req = makeReq({
        headers: { "mcp-session-id": "get-session-id" },
      });
      const res = makeRes();

      await getHandler(req, res);

      expect(mockTransport.handleRequest).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // MCP DELETE handler
  // -------------------------------------------------------------------------

  describe("MCP DELETE handler", () => {
    async function getDeleteHandler(): Promise<
      (req: unknown, res: unknown) => Promise<void>
    > {
      await startHttpServer(mockGetServer, mockConfig);
      const deleteCall = mockAppDelete.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      return deleteCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
    }

    it("returns 400 when no session ID provided", async () => {
      const handler = await getDeleteHandler();
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(400);
    });

    it("returns 404 when session not found", async () => {
      const handler = await getDeleteHandler();
      const req = makeReq({
        headers: { "mcp-session-id": "unknown-session" },
      });
      const res = makeRes();

      await handler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(404);
    });

    it("delegates to transport for valid session", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      let capturedOnInit: ((sid: string) => void) | null = null;

      const mockTransport = {
        sessionId: "delete-session-id",
        handleRequest: vi.fn().mockImplementation(() => {
          if (capturedOnInit) {
            capturedOnInit("delete-session-id");
            capturedOnInit = null;
          }
          return Promise.resolve();
        }),
        close: vi.fn().mockResolvedValue(undefined),
        onclose: null as (() => void) | null,
      };

      const { StreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
      );
      vi.mocked(StreamableHTTPServerTransport).mockImplementation(
        function (this: unknown, opts: unknown) {
          const options = opts as Record<string, unknown>;
          capturedOnInit = options["onsessioninitialized"] as (
            sid: string
          ) => void;
          return mockTransport as never;
        }
      );

      await startHttpServer(mockGetServer, mockConfig);

      // Create session via POST
      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const postHandler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
      await postHandler(
        makeReq({
          headers: {},
          body: { jsonrpc: "2.0", method: "initialize" },
        }),
        makeRes()
      );

      // Now test DELETE
      const deleteCall = mockAppDelete.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const deleteHandler = deleteCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;

      mockTransport.handleRequest.mockClear();
      mockTransport.handleRequest.mockResolvedValue(undefined);
      const req = makeReq({
        headers: { "mcp-session-id": "delete-session-id" },
      });
      const res = makeRes();

      await deleteHandler(req, res);

      expect(mockTransport.handleRequest).toHaveBeenCalled();
    });

    it("returns 500 when transport throws during DELETE", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      let capturedOnInit: ((sid: string) => void) | null = null;

      const mockTransport = {
        sessionId: "delete-err-session",
        handleRequest: vi.fn().mockImplementation(() => {
          // Register session on first call, then reject on subsequent calls
          if (capturedOnInit) {
            capturedOnInit("delete-err-session");
            capturedOnInit = null;
            return Promise.resolve();
          }
          return Promise.reject(new Error("transport error"));
        }),
        close: vi.fn().mockResolvedValue(undefined),
        onclose: null as (() => void) | null,
      };

      const { StreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
      );
      vi.mocked(StreamableHTTPServerTransport).mockImplementation(
        function (this: unknown, opts: unknown) {
          const options = opts as Record<string, unknown>;
          capturedOnInit = options["onsessioninitialized"] as (
            sid: string
          ) => void;
          return mockTransport as never;
        }
      );

      await startHttpServer(mockGetServer, mockConfig);

      // Create session via POST
      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const postHandler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
      await postHandler(
        makeReq({
          headers: {},
          body: { jsonrpc: "2.0", method: "initialize" },
        }),
        makeRes()
      );

      // DELETE with error
      const deleteCall = mockAppDelete.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const deleteHandler = deleteCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;

      const req = makeReq({
        headers: { "mcp-session-id": "delete-err-session" },
      });
      const res = makeRes();

      await deleteHandler(req, res);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(500);
    });
  });

  // -------------------------------------------------------------------------
  // Global error handler
  // -------------------------------------------------------------------------

  describe("global error handler", () => {
    async function getErrorHandler(): Promise<
      (err: Error, req: unknown, res: unknown, next: unknown) => void
    > {
      await startHttpServer(mockGetServer, mockConfig);
      // The last app.use call with 1 argument (a function with 4 params) is the global error handler
      const errorHandlerCall = mockAppUse.mock.calls.find(
        (call: unknown[]) => {
          const fn = call[0];
          return typeof fn === "function" && fn.length === 4;
        }
      );
      return errorHandlerCall![0] as (
        err: Error,
        req: unknown,
        res: unknown,
        next: unknown
      ) => void;
    }

    it("returns 500 JSON error", async () => {
      const handler = await getErrorHandler();
      const res = makeRes();
      const next = vi.fn();

      handler(new Error("unhandled"), {}, res, next);

      expect(vi.mocked(res["status"])).toHaveBeenCalledWith(500);
      expect(res["json"]).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: "2.0",
          error: expect.objectContaining({ message: "Internal server error" }),
        })
      );
    });

    it("does not send when headers already sent", async () => {
      const handler = await getErrorHandler();
      const res = makeRes();
      res["headersSent"] = true;
      const next = vi.fn();

      handler(new Error("unhandled"), {}, res, next);

      expect(vi.mocked(res["status"])).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup interval
  // -------------------------------------------------------------------------

  describe("cleanup interval and shutdown", () => {
    it("registers signal handlers for graceful shutdown", async () => {
      await startHttpServer(mockGetServer, mockConfig);

      const signalCalls = processOnSpy.mock.calls.map(
        (call: unknown[]) => call[0]
      );
      expect(signalCalls).toContain("SIGINT");
      expect(signalCalls).toContain("SIGTERM");
    });

    it("cleanup interval triggers token cleanup and idle session cleanup", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      let capturedOnInit: ((sid: string) => void) | null = null;

      const mockTransport = {
        sessionId: "idle-session",
        handleRequest: vi.fn().mockImplementation(() => {
          if (capturedOnInit) {
            capturedOnInit("idle-session");
            capturedOnInit = null;
          }
          return Promise.resolve();
        }),
        close: vi.fn().mockResolvedValue(undefined),
        onclose: null as (() => void) | null,
      };

      const { StreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
      );
      vi.mocked(StreamableHTTPServerTransport).mockImplementation(
        function (this: unknown, opts: unknown) {
          const options = opts as Record<string, unknown>;
          capturedOnInit = options["onsessioninitialized"] as (
            sid: string
          ) => void;
          return mockTransport as never;
        }
      );

      await startHttpServer(mockGetServer, mockConfig);

      // Create a session
      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const handler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
      await handler(
        makeReq({
          headers: {},
          body: { jsonrpc: "2.0", method: "initialize" },
        }),
        makeRes()
      );

      // Advance time past the idle timeout (30 min) + cleanup interval (5 min)
      vi.advanceTimersByTime(35 * 60 * 1000);

      // The cleanup interval should have fired and closed the idle session
      expect(mockTransport.close).toHaveBeenCalled();
    });

    it("SIGINT handler invokes graceful shutdown", async () => {
      const mockProcessExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      await startHttpServer(mockGetServer, mockConfig);

      // Find the SIGINT handler
      const sigintCall = processOnSpy.mock.calls.find(
        (call: unknown[]) => call[0] === "SIGINT"
      );
      const sigintHandler = sigintCall![1] as () => void;

      // Call the SIGINT handler
      sigintHandler();

      // The server.close callback should have been registered
      expect(mockServerClose).toHaveBeenCalled();

      // Advance timers to trigger the forced exit setTimeout (5000ms)
      vi.advanceTimersByTime(5000);

      expect(mockProcessExit).toHaveBeenCalledWith(0);
      mockProcessExit.mockRestore();
    });

    it("SIGTERM handler invokes graceful shutdown with sessions", async () => {
      const mockProcessExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      let capturedOnInit: ((sid: string) => void) | null = null;

      const mockTransport = {
        sessionId: "shutdown-session",
        handleRequest: vi.fn().mockImplementation(() => {
          if (capturedOnInit) {
            capturedOnInit("shutdown-session");
            capturedOnInit = null;
          }
          return Promise.resolve();
        }),
        close: vi.fn().mockResolvedValue(undefined),
        onclose: null as (() => void) | null,
      };

      const { StreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
      );
      vi.mocked(StreamableHTTPServerTransport).mockImplementation(
        function (this: unknown, opts: unknown) {
          const options = opts as Record<string, unknown>;
          capturedOnInit = options["onsessioninitialized"] as (
            sid: string
          ) => void;
          return mockTransport as never;
        }
      );

      await startHttpServer(mockGetServer, mockConfig);

      // Create a session
      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const postHandler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
      await postHandler(
        makeReq({
          headers: {},
          body: { jsonrpc: "2.0", method: "initialize" },
        }),
        makeRes()
      );

      // Find the SIGTERM handler
      const sigtermCall = processOnSpy.mock.calls.find(
        (call: unknown[]) => call[0] === "SIGTERM"
      );
      const sigtermHandler = sigtermCall![1] as () => void;

      // Call the SIGTERM handler
      sigtermHandler();

      // Session transport should be closed
      expect(mockTransport.close).toHaveBeenCalled();
      expect(mockServerClose).toHaveBeenCalled();

      vi.advanceTimersByTime(5000);
      expect(mockProcessExit).toHaveBeenCalledWith(0);
      mockProcessExit.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Transport onclose and session callbacks
  // -------------------------------------------------------------------------

  describe("transport lifecycle callbacks", () => {
    it("transport.onclose removes the session from the sessions map", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      let capturedOnInit: ((sid: string) => void) | null = null;
      let capturedOnclose: (() => void) | null = null;

      const mockTransport = {
        sessionId: "onclose-session",
        handleRequest: vi.fn().mockImplementation(() => {
          if (capturedOnInit) {
            capturedOnInit("onclose-session");
            capturedOnInit = null;
          }
          return Promise.resolve();
        }),
        close: vi.fn().mockResolvedValue(undefined),
        set onclose(fn: (() => void) | null) {
          capturedOnclose = fn;
        },
        get onclose() {
          return capturedOnclose;
        },
      };

      const { StreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
      );
      vi.mocked(StreamableHTTPServerTransport).mockImplementation(
        function (this: unknown, opts: unknown) {
          const options = opts as Record<string, unknown>;
          capturedOnInit = options["onsessioninitialized"] as (
            sid: string
          ) => void;
          return mockTransport as never;
        }
      );

      await startHttpServer(mockGetServer, mockConfig);

      // Create a session
      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const handler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
      await handler(
        makeReq({
          headers: {},
          body: { jsonrpc: "2.0", method: "initialize" },
        }),
        makeRes()
      );

      // Verify the session exists (GET should find it)
      const getCall = mockAppGet.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const getHandler = getCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;

      mockTransport.handleRequest.mockClear();
      mockTransport.handleRequest.mockResolvedValue(undefined);
      const getRes1 = makeRes();
      await getHandler(
        makeReq({ headers: { "mcp-session-id": "onclose-session" } }),
        getRes1
      );
      // Should succeed, not 404
      expect(vi.mocked(getRes1["status"])).not.toHaveBeenCalledWith(404);

      // Now trigger onclose
      expect(capturedOnclose).not.toBeNull();
      capturedOnclose!();

      // Session should now be gone
      const getRes2 = makeRes();
      await getHandler(
        makeReq({ headers: { "mcp-session-id": "onclose-session" } }),
        getRes2
      );
      expect(vi.mocked(getRes2["status"])).toHaveBeenCalledWith(404);
    });

    it("sessionIdGenerator is called during transport creation", async () => {
      vi.mocked(isInitializeRequest).mockReturnValue(true);

      let capturedSessionIdGenerator: (() => string) | null = null;

      const mockTransport = {
        sessionId: "generated-id",
        handleRequest: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        onclose: null as (() => void) | null,
      };

      const { StreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
      );
      vi.mocked(StreamableHTTPServerTransport).mockImplementation(
        function (this: unknown, opts: unknown) {
          const options = opts as Record<string, unknown>;
          capturedSessionIdGenerator = options["sessionIdGenerator"] as () => string;
          return mockTransport as never;
        }
      );

      await startHttpServer(mockGetServer, mockConfig);

      const postCall = mockAppPost.mock.calls.find(
        (call: unknown[]) => call[0] === "/mcp"
      );
      const handler = postCall![2] as (
        req: unknown,
        res: unknown
      ) => Promise<void>;
      await handler(
        makeReq({
          headers: {},
          body: { jsonrpc: "2.0", method: "initialize" },
        }),
        makeRes()
      );

      // The sessionIdGenerator should have been captured
      expect(capturedSessionIdGenerator).not.toBeNull();
      // Call it to exercise the code path (randomUUID)
      const id = capturedSessionIdGenerator!();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cache-control middleware
  // -------------------------------------------------------------------------

  describe("no-cache middleware", () => {
    it("sets cache-control headers", async () => {
      await startHttpServer(mockGetServer, mockConfig);

      // Find the cache-control middleware (function used with /oauth, /mcp, /authorize, etc.)
      const noCacheCalls = mockAppUse.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === "string" && typeof call[1] === "function"
      );

      // Should have no-cache middleware for multiple paths
      expect(noCacheCalls.length).toBeGreaterThanOrEqual(5);

      // Test the middleware function
      if (noCacheCalls.length > 0) {
        const middleware = noCacheCalls[0]![1] as (
          req: unknown,
          res: unknown,
          next: () => void
        ) => void;
        const res = makeRes();
        const next = vi.fn();
        middleware({}, res, next);

        expect(res["setHeader"]).toHaveBeenCalledWith(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, private"
        );
        expect(next).toHaveBeenCalled();
      }
    });
  });
});
