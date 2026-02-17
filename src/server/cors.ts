/**
 * CORS path allowlisting utilities.
 *
 * IMPORTANT:
 * - This is used to allow browser-based OAuth flows / discovery endpoints.
 * - It must be strict about path boundaries to avoid prefix bypasses
 *   (e.g. "/authorize-admin" must NOT match "/authorize").
 */

const CORS_ALLOWED_PATHS = [
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/authorize",
  "/token",
  "/register",
  "/oauth/callback",
] as const;

/**
 * Boundary-aware "startsWith" that only matches the allowed path when the
 * request path is either exactly the allowed path or is a subpath.
 *
 * Examples:
 * - allowed "/authorize" matches "/authorize" and "/authorize/anything"
 * - allowed "/authorize" does NOT match "/authorize-admin"
 */
/** @internal Exported for testing */
export function matchesAllowedPathBoundary(
  requestPath: string,
  allowedPath: string
): boolean {
  if (requestPath === allowedPath) return true;
  if (allowedPath.endsWith("/")) return requestPath.startsWith(allowedPath);
  return requestPath.startsWith(`${allowedPath}/`);
}

/**
 * Check whether a request path should be allowed for CORS.
 *
 * Returns `true` for OAuth discovery and flow endpoints that need
 * cross-origin access (e.g. browser-based token exchange). Returns
 * `false` for everything else (e.g. the `/mcp` endpoint).
 */
export function isCorsAllowedPath(requestPath: string): boolean {
  return CORS_ALLOWED_PATHS.some((allowedPath) =>
    matchesAllowedPathBoundary(requestPath, allowedPath)
  );
}
