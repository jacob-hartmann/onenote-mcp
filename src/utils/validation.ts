/**
 * Validation Utilities
 *
 * Input validation and sanitization helpers for safe API interactions.
 */

/**
 * Validate and encode a Graph API entity ID for safe URL interpolation.
 * IDs from the Graph API are typically base64-like strings, but we must
 * protect against path traversal and query injection.
 */
export function sanitizeId(id: string, paramName: string): string {
  if (!id || id.trim().length === 0) {
    throw new Error(`${paramName} must not be empty`);
  }
  // Encode to prevent path traversal (../), query injection (?), fragment injection (#)
  return encodeURIComponent(id);
}

// ---------------------------------------------------------------------------
// Microsoft URL Allowlisting
// ---------------------------------------------------------------------------

/** Allowed hostnames for Microsoft identity platform endpoints */
const ALLOWED_AUTHORITY_HOSTNAMES = new Set([
  "login.microsoftonline.com",
  "login.microsoftonline.us",   // US Government
  "login.chinacloudapi.cn",     // China
  "login.microsoftonline.de",   // Germany (legacy)
]);

/** Allowed hostnames for Microsoft Graph API endpoints */
const ALLOWED_GRAPH_HOSTNAMES = new Set([
  "graph.microsoft.com",
  "graph.microsoft.us",         // US Government
  "microsoftgraph.chinacloudapi.cn", // China
  "graph.microsoft.de",         // Germany (legacy)
]);

/**
 * Validate that a base URL points to a known Microsoft endpoint.
 * Throws if the URL hostname is not in the allowlist.
 * Allows any hostname when NODE_ENV=development or NODE_ENV=test.
 */
export function validateMicrosoftUrl(
  url: string,
  kind: "authority" | "graph"
): void {
  const env = process.env["NODE_ENV"];
  if (env === "development" || env === "test") return;

  const allowlist = kind === "authority" ? ALLOWED_AUTHORITY_HOSTNAMES : ALLOWED_GRAPH_HOSTNAMES;

  try {
    const parsed = new URL(url);
    if (!allowlist.has(parsed.hostname.toLowerCase())) {
      throw new Error(
        `${kind === "authority" ? "Authority" : "Graph API"} base URL hostname "${parsed.hostname}" is not in the allowed list. ` +
        `Allowed: ${[...allowlist].join(", ")}. ` +
        `Set NODE_ENV=development to bypass this check.`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("not in the allowed list")) {
      throw error;
    }
    throw new Error(`Invalid ${kind} base URL: ${url}`, { cause: error });
  }
}
