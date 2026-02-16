/**
 * HTTP Server for MCP
 *
 * Creates an Express-based HTTP server with:
 * - OAuth authorization server endpoints (via mcpAuthRouter)
 * - OAuth callback from Microsoft
 * - Protected MCP endpoint with Bearer auth
 * - StreamableHTTP transport
 * - Security hardening (helmet, rate limiting, CORS, cache control)
 */

import { randomUUID } from "node:crypto";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { HttpServerConfig } from "./config.js";
import {
  OneNoteProxyOAuthProvider,
  handleMicrosoftOAuthCallback,
} from "./onenote-oauth-provider.js";
import { getServerTokenStore } from "./server-token-store.js";
import { isCorsAllowedPath } from "./cors.js";
import {
  SESSION_ID_DISPLAY_LENGTH,
  JSONRPC_ERROR_INVALID_REQUEST,
  JSONRPC_ERROR_INTERNAL,
} from "../constants.js";
import { escapeHtml } from "../utils/html.js";
import { LRUCache } from "../utils/lru-cache.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Token cleanup interval in milliseconds (5 minutes) */
const TOKEN_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Session idle timeout in milliseconds (30 minutes) */
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Rate limit: max requests per window */
const RATE_LIMIT_MAX = 100;

/** Rate limit window in milliseconds (1 minute) */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** Maximum number of concurrent sessions to prevent memory exhaustion */
const MAX_SESSIONS = 1000;

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

/** Track session last activity for idle timeout */
interface SessionInfo {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

/**
 * Start the HTTP server with OAuth and MCP endpoints.
 */
export async function startHttpServer(
  getServer: () => McpServer,
  config: HttpServerConfig
): Promise<void> {
  const { host, port, issuerUrl } = config;

  // Create OAuth provider
  const provider = new OneNoteProxyOAuthProvider(config);

  // Create Express app with DNS rebinding protection
  const app = createMcpExpressApp({ host });

  // Security headers via helmet
  app.use(
    helmet({
      // Use restrictive CSP appropriate for JSON-RPC API with minimal HTML responses
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'none'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // Disable COEP for SSE streaming support in MCP protocol
      crossOriginEmbedderPolicy: false,
    })
  );

  // Rate limiting for OAuth and MCP endpoints
  const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });

  // Apply rate limiting to sensitive endpoints
  app.use("/oauth", limiter);
  app.use("/mcp", limiter);

  // CORS middleware - allow OAuth endpoints, restrict MCP endpoint
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }

    // Allow CORS for OAuth discovery and flow endpoints
    // mcpAuthRouter mounts at root: /authorize, /token, /register
    // Our custom callback is at /oauth/callback
    const isAllowed = isCorsAllowedPath(req.path);

    if (isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );
      res.setHeader("Access-Control-Max-Age", "86400");

      // Handle preflight
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }

      next();
      return;
    }

    // Block cross-origin requests to /mcp endpoint
    res.status(403).json({ error: "Cross-origin requests not allowed" });
    return;
  });

  // Cache-Control headers for OAuth and MCP endpoints
  const noCacheMiddleware: express.RequestHandler = (_req, res, next) => {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  };

  // Apply no-cache to all OAuth endpoints (both root-level and /oauth/*)
  app.use("/oauth", noCacheMiddleware);
  app.use("/mcp", noCacheMiddleware);
  app.use("/authorize", noCacheMiddleware);
  app.use("/token", noCacheMiddleware);
  app.use("/register", noCacheMiddleware);
  app.use("/.well-known", noCacheMiddleware);

  // Parse JSON bodies
  app.use(express.json());

  // Mount OAuth auth router (AS metadata, authorize, token, register endpoints)
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: new URL(issuerUrl),
      scopesSupported: ["read:user"],
      resourceName: "OneNote MCP Server",
    })
  );

  // Handle OAuth callback from Microsoft
  app.get("/oauth/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query;

    // Handle error from Microsoft
    if (error) {
      const errorMsg = typeof error === "string" ? error : "Unknown error";
      const errorDesc =
        typeof error_description === "string" ? error_description : errorMsg;
      console.error(`[onenote-mcp] Microsoft OAuth error: ${errorMsg}`);
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <h1>Authorization Failed</h1>
          <p>${escapeHtml(errorDesc)}</p>
          <p>You can close this window.</p>
        </body>
        </html>
      `);
      return;
    }

    // Validate params
    if (typeof code !== "string" || typeof state !== "string") {
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Invalid Request</title></head>
        <body>
          <h1>Invalid Request</h1>
          <p>Missing code or state parameter.</p>
        </body>
        </html>
      `);
      return;
    }

    // Process callback
    const result = await handleMicrosoftOAuthCallback(
      config,
      getServerTokenStore(),
      code,
      state
    );

    if ("error" in result) {
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <h1>Authorization Failed</h1>
          <p>${escapeHtml(result.errorDescription)}</p>
          <p>You can close this window.</p>
        </body>
        </html>
      `);
      return;
    }

    res.redirect(result.redirectUrl);
  });

  // Create session-to-transport map for stateful connections with activity tracking
  // Uses LRU cache to prevent memory exhaustion from spam attacks
  const sessions = new LRUCache<SessionInfo>({
    maxSize: MAX_SESSIONS,
    onEvict: (sessionId, session) => {
      console.error(
        `[onenote-mcp] Evicting session ${sessionId.slice(0, SESSION_ID_DISPLAY_LENGTH)} (max sessions reached)`
      );
      try {
        session.transport.close().catch((err: unknown) => {
          console.error(
            `[onenote-mcp] Error closing evicted session:`,
            err instanceof Error ? err.message : err
          );
        });
      } catch {
        // Ignore close errors on eviction
      }
    },
  });

  // Get resource metadata URL for WWW-Authenticate header
  const resourceMetadataUrl = `${issuerUrl}/.well-known/oauth-protected-resource`;

  // Helper to update session activity
  const touchSession = (sessionId: string): void => {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.lastActivity = Date.now();
    // Re-set to update LRU order
    sessions.set(sessionId, session);
  };

  // Helper to clean up a session
  const cleanupSession = (sessionId: string): void => {
    const session = sessions.get(sessionId);
    if (!session) return;
    try {
      session.transport.close().catch((err: unknown) => {
        console.error(
          `[onenote-mcp] Error closing session ${sessionId.slice(0, SESSION_ID_DISPLAY_LENGTH)}:`,
          err instanceof Error ? err.message : err
        );
      });
    } catch (err) {
      console.error(
        `[onenote-mcp] Error closing session ${sessionId.slice(0, SESSION_ID_DISPLAY_LENGTH)}:`,
        err instanceof Error ? err.message : err
      );
    }
    sessions.delete(sessionId);
  };

  // MCP POST handler
  const mcpPostHandler: express.RequestHandler = async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      const existingSession = sessionId ? sessions.get(sessionId) : undefined;
      if (sessionId && existingSession) {
        // Reuse existing transport and update activity
        transport = existingSession.transport;
        touchSession(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, {
              transport,
              lastActivity: Date.now(),
            });
          },
        });

        // Clean up on close
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessions.has(sid)) {
            sessions.delete(sid);
          }
        };

        // Connect transport to a new server instance
        // Cast required due to exactOptionalPropertyTypes incompatibility with SDK
        const server = getServer();
        await server.connect(transport as unknown as Transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else if (sessionId && !existingSession) {
        // Client presented a session ID we don't recognize (expired/evicted/restarted).
        // Per MCP Streamable HTTP spec, respond 404 so the client re-initializes.
        res.status(404).json({
          jsonrpc: "2.0",
          error: {
            code: JSONRPC_ERROR_INVALID_REQUEST,
            message: "Session not found",
          },
          id: null,
        });
        return;
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: JSONRPC_ERROR_INVALID_REQUEST,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[onenote-mcp] Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: JSONRPC_ERROR_INTERNAL,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  };

  // MCP GET handler (SSE streams)
  const mcpGetHandler: express.RequestHandler = async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!sessionId || !session) {
      res.status(sessionId ? 404 : 400).json({
        jsonrpc: "2.0",
        error: {
          code: JSONRPC_ERROR_INVALID_REQUEST,
          message: sessionId ? "Session not found" : "Missing session ID",
        },
        id: null,
      });
      return;
    }

    touchSession(sessionId);
    await session.transport.handleRequest(req, res);
  };

  // MCP DELETE handler (session termination)
  const mcpDeleteHandler: express.RequestHandler = async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const session = sessionId ? sessions.get(sessionId) : undefined;

    if (!sessionId || !session) {
      res.status(sessionId ? 404 : 400).json({
        jsonrpc: "2.0",
        error: {
          code: JSONRPC_ERROR_INVALID_REQUEST,
          message: sessionId ? "Session not found" : "Missing session ID",
        },
        id: null,
      });
      return;
    }

    try {
      await session.transport.handleRequest(req, res);
    } catch (error) {
      console.error("[onenote-mcp] Error handling session termination:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: JSONRPC_ERROR_INTERNAL,
            message: "Error processing session termination",
          },
          id: null,
        });
      }
    }
  };

  // Set up routes with Bearer auth middleware
  const authMiddleware = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl,
  });

  app.post("/mcp", authMiddleware, mcpPostHandler);
  app.get("/mcp", authMiddleware, mcpGetHandler);
  app.delete("/mcp", authMiddleware, mcpDeleteHandler);

  // Global error handler - must be registered after all routes
  // Express identifies error handlers by their 4-parameter signature
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("[onenote-mcp] Unhandled error:", err);

      // Always return JSON, never HTML
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: JSONRPC_ERROR_INTERNAL,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  );

  // Start automatic token cleanup interval
  const tokenStore = getServerTokenStore();
  const cleanupInterval = setInterval(() => {
    tokenStore.cleanup();

    // Also clean up idle sessions
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
      if (now - session.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
        console.error(
          `[onenote-mcp] Closing idle session ${sessionId.slice(0, SESSION_ID_DISPLAY_LENGTH)}...`
        );
        cleanupSession(sessionId);
      }
    }
  }, TOKEN_CLEANUP_INTERVAL_MS);

  // Don't keep the process alive just for cleanup
  cleanupInterval.unref();

  // Start listening
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.error(`[onenote-mcp] HTTP server listening on ${host}:${port}`);
      console.error(
        `[onenote-mcp] OAuth metadata: ${issuerUrl}/.well-known/oauth-authorization-server`
      );
      console.error(`[onenote-mcp] MCP endpoint: ${issuerUrl}/mcp`);
      resolve();
    });

    server.on("error", reject);

    // Graceful shutdown handler
    const shutdown = (signal: string): void => {
      console.error(
        `[onenote-mcp] Received ${signal}, shutting down gracefully...`
      );

      // Stop accepting new connections
      server.close(() => {
        console.error("[onenote-mcp] HTTP server closed");
      });

      // Clear the cleanup interval
      clearInterval(cleanupInterval);

      // Close all active sessions
      console.error(
        `[onenote-mcp] Closing ${sessions.size} active session(s)...`
      );
      for (const [sessionId, session] of sessions.entries()) {
        try {
          session.transport.close().catch((err: unknown) => {
            console.error(
              `[onenote-mcp] Error closing session ${sessionId.slice(0, SESSION_ID_DISPLAY_LENGTH)}:`,
              err instanceof Error ? err.message : err
            );
          });
        } catch {
          // Ignore close errors during shutdown
        }
      }
      sessions.clear();

      // Give connections time to close gracefully, then force exit
      setTimeout(() => {
        console.error("[onenote-mcp] Shutdown complete");
        process.exit(0);
      }, 5000);
    };

    // Handle termination signals
    process.on("SIGINT", () => {
      shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      shutdown("SIGTERM");
    });
  });
}
