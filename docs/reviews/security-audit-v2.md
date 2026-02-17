# Security Audit v2 -- OneNote MCP Server

**Date:** 2026-02-16
**Auditor:** Security Engineering Review (v2)
**Scope:** Full source code review of all `.ts` files under `src/` (excluding test files)
**Commit:** `124d691` (main branch)
**Previous Audit:** `docs/reviews/security-audit.md` (v1)
**Verdict:** No critical vulnerabilities found. Multiple improvements since v1 audit. Several medium and low-severity findings remain, plus new findings related to the HTTP/OAuth proxy server mode.

---

## Executive Summary

This is the second security audit of the OneNote MCP server. Since the v1 audit, significant security hardening has been applied:

- **H-1 (ID Sanitization) -- RESOLVED.** All tool handlers now call `sanitizeId()` which applies `encodeURIComponent()` before URL interpolation. Resource handlers also use `encodeURIComponent()` directly. The `src/utils/validation.ts` module provides centralized ID validation.
- **HTTP server mode added.** A complete OAuth proxy server was introduced in `src/server/`, including rate limiting (`express-rate-limit`), security headers (`helmet`), CORS boundary enforcement, session management with LRU eviction, and Bearer auth middleware. This is new attack surface that was not present in v1.
- **HTML sanitization improved.** The `sanitizeHtmlForXhtml()` function was added for XHTML compliance conversion before page creation.

The codebase demonstrates strong security practices overall. The OAuth proxy correctly implements PKCE pass-through, state parameter binding, authorization code single-use semantics, token TTL enforcement, and periodic cleanup. The main areas of concern are: (1) timing attack vectors in PKCE verification and token lookup, (2) missing upper-bound constraints on in-memory token store Maps, (3) the CORS configuration reflecting arbitrary origins, and (4) several type safety gaps in `as` casts on unvalidated API responses.

---

## Findings

### CRITICAL

**No critical findings.**

There are no immediately exploitable vulnerabilities that could lead to remote code execution, authentication bypass, or unauthorized data access in a standard deployment.

---

### HIGH

#### H-1: Timing Side-Channel in PKCE Verification (Plain Method)

**Severity:** HIGH
**Category:** OAuth / Token Security
**File:** `src/server/server-token-store.ts:388-399`

**Description:**
The `verifyPkceChallenge()` function uses direct string comparison (`===`) for both the `plain` method and the computed S256 digest:

```typescript
if (method === "plain") {
  return codeVerifier === codeChallenge;
}
// ...
return computed === codeChallenge;
```

JavaScript's `===` operator short-circuits on the first mismatched character, making the comparison time proportional to the length of the common prefix. This enables a timing side-channel attack where an attacker can deduce the code challenge one character at a time by measuring response times.

For the S256 method, the practical impact is lower because the attacker would need to guess SHA-256 hash bytes (astronomically unlikely). However, for the `plain` method (which the `PendingAuthRequest` type permits via its `"S256" | "plain"` union), the code verifier itself is being compared directly, and a timing attack could reveal it character by character.

**Risk Assessment:**
The provider hardcodes `codeChallengeMethod: "S256"` in `authorize()` (line 138 of `onenote-oauth-provider.ts`), so `plain` is never used in the current HTTP proxy flow. However, the `PendingAuthRequest` interface and the `verifyPkceChallenge` function both accept `plain`, creating a latent vulnerability if any code path ever sets it. Additionally, the SDK itself calls `challengeForAuthorizationCode()` and performs the PKCE validation, so `verifyPkceChallenge` may not even be invoked directly by production code. The practical risk is LOW given current code paths, but the function itself is HIGH severity because it is a public export that advertises correctness for timing-sensitive operations.

**Recommendation:**
Use a constant-time comparison for PKCE verification:

```typescript
import { timingSafeEqual } from "node:crypto";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

Also consider removing `plain` from the supported methods entirely, as RFC 7636 recommends S256 and many security guides discourage `plain`.

---

#### H-2: SSRF via Configurable Base URLs (Unchanged from v1)

**Severity:** HIGH
**Category:** Input Validation / SSRF
**Files:**
- `src/onenote/auth.ts:53-54` (`ONENOTE_GRAPH_BASE_URL` override)
- `src/onenote/client.ts:51-53` (`baseUrl` config option)
- `src/server/config.ts:87-89` (`ONENOTE_OAUTH_AUTHORITY_BASE_URL` override)

**Description:**
This finding is unchanged from v1 audit (H-2). The server allows overriding both the Graph API base URL and the OAuth authority base URL via environment variables with no validation that they point to legitimate Microsoft endpoints. An attacker who can set environment variables can redirect token verification and all Graph API requests to an attacker-controlled server, capturing Bearer tokens.

**Recommendation:**
Validate that overridden base URLs match an allowlist of Microsoft domains (`graph.microsoft.com`, `graph.microsoft.us`, `login.microsoftonline.com`, etc.), or restrict overrides to a documented `NODE_ENV=development` mode.

---

### MEDIUM

#### M-1: CORS Reflects Arbitrary Origins

**Severity:** MEDIUM
**Category:** HTTP Security
**File:** `src/server/http-server.ts:114-148`

**Description:**
The CORS middleware reflects the request's `Origin` header value in `Access-Control-Allow-Origin` for allowed paths:

```typescript
const origin = req.headers.origin;
// ...
if (isAllowed) {
  res.setHeader("Access-Control-Allow-Origin", origin);
```

This means any origin can make cross-origin requests to the OAuth endpoints (`/authorize`, `/token`, `/register`, `/oauth/callback`, `/.well-known/*`). While the `/mcp` endpoint correctly blocks cross-origin requests, reflecting arbitrary origins on OAuth endpoints means:

1. Any website can perform dynamic client registration at `/register`.
2. Any website can discover the authorization server metadata.
3. Any website can attempt token exchange at `/token`.

For OAuth endpoints, this is somewhat expected (public OAuth endpoints need to be accessible from various clients), but reflecting the exact origin rather than using `*` means the browser will also send cookies if any exist, which could enable CSRF-like scenarios.

**Recommendation:**
For public OAuth endpoints that require cross-origin access, use `Access-Control-Allow-Origin: *` (which prevents credential-bearing requests) instead of reflecting the origin. If credential-bearing requests are needed, validate the origin against an allowlist.

---

#### M-2: In-Memory Token Store Has No Size Limits on Maps

**Severity:** MEDIUM
**Category:** Resource Exhaustion / DoS
**File:** `src/server/server-token-store.ts:112-121`

**Description:**
The `ServerTokenStore` uses four `Map` instances for pending requests, auth codes, access tokens, and refresh tokens. None of these Maps have a maximum size limit. While there is periodic cleanup of expired entries every 5 minutes, an attacker who repeatedly triggers the OAuth flow (e.g., by automated dynamic client registration followed by authorization requests) can grow these Maps unboundedly within the cleanup interval.

The session map uses an `LRUCache` with a max of 1000 entries, which is good. But the token store Maps do not have equivalent protection.

**Attack Scenario:**
An attacker scripts rapid dynamic client registration + authorization initiation requests. Each request creates a pending auth entry in the Map. With the 10-minute expiry and 5-minute cleanup, entries accumulate. At ~100 requests per minute (rate limit), 500 entries accumulate before the first cleanup. This is manageable, but if rate limiting is bypassed (e.g., from multiple IPs), memory could grow.

**Recommendation:**
Add a maximum size cap to each Map (e.g., 10,000 entries), rejecting new entries when full:

```typescript
private static readonly MAX_PENDING_REQUESTS = 10_000;

storePendingRequest(request: ...): string {
  if (this.pendingRequests.size >= ServerTokenStore.MAX_PENDING_REQUESTS) {
    throw new Error("Too many pending authorization requests");
  }
  // ...
}
```

---

#### M-3: OAuth Token Error Response May Leak Sensitive Data (Partially Improved)

**Severity:** MEDIUM
**Category:** Information Disclosure
**File:** `src/onenote/oauth.ts:168-172`

**Description:**
This was M-1 in v1. The token request error still includes up to 500 characters of the raw response body in the error message:

```typescript
throw new OneNoteOAuthError(
  `Token request failed (${response.status}): ${text.slice(0, 500)}`,
  code
);
```

In the HTTP proxy path (`onenote-oauth-provider.ts:287`), the response is truncated to 200 characters, which is better:

```typescript
throw new Error(`Microsoft token refresh failed: ${text.slice(0, 200)}`);
```

The callback handler (`onenote-oauth-provider.ts:460-461`) logs to `console.error` with 200-char truncation but returns a generic message to the user, which is good.

**Recommendation:**
Parse the error JSON and extract only `error` and `error_description` fields rather than including raw response text.

---

#### M-4: Token Store Directory Permissions on Windows (Unchanged from v1)

**Severity:** MEDIUM
**Category:** File System Security
**File:** `src/onenote/token-store.ts:84-92`

**Description:**
This was M-2 in v1 and is unchanged. The `mode: 0o600` on `writeFileSync` has no effect on Windows. The directory is created with `mkdirSync({ recursive: true })` without explicit permissions. On Windows, the token file is potentially readable by other users on the same machine.

**Recommendation:**
1. Set directory permissions: `mkdirSync(dir, { recursive: true, mode: 0o700 })`
2. On Windows, use `icacls` to set proper ACLs, or use the Windows Credential Manager.
3. Consider using the OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service).

---

#### M-5: `sanitizeHtmlForXhtml` Regex Patterns May Be Susceptible to ReDoS

**Severity:** MEDIUM
**Category:** Input Validation / ReDoS
**File:** `src/utils/html.ts:46-49`

**Description:**
The `sanitizeHtmlForXhtml` function iterates over 13 void element names, creating a new regex for each and running it against the input:

```typescript
for (const tag of voidElements) {
  result = result.replace(
    new RegExp(`<(${tag})(\\s[^>]*)?>(?!\\s*</${tag}>)`, "gi"),
    // ...
  );
}
```

The regex `(\s[^>]*)?` uses a greedy quantifier on `[^>]*` which could cause quadratic behavior on adversarial input like `<br aaaa...aaaa>` with very long attribute strings (though the `[^>]` character class limits catastrophic backtracking). More concerning is the negative lookahead `(?!\s*</${tag}>)` combined with the optional group, which could interact poorly on malformed HTML with many near-matches.

Additionally, the ampersand escaping regex is complex:

```typescript
result = result.replace(
  /&(?!(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/g,
  "&amp;"
);
```

This has nested alternation with quantifiers inside a negative lookahead, which can cause polynomial backtracking on inputs with many `&` characters followed by long alphanumeric strings that do not end with `;`.

**Risk Assessment:**
The `content` parameter in `create-page` is provided by the LLM, which could be prompt-injected. A carefully crafted string with thousands of `&` followed by long alphanumeric sequences could cause the regex engine to hang. The 30-second timeout provides some protection, but during the hang the server is blocked.

**Recommendation:**
1. Test the regexes with adversarial inputs to measure actual backtracking.
2. Consider using a simple state-machine approach for ampersand escaping.
3. Add a maximum content length check before applying regex sanitization.

---

#### M-6: Open Redirect Potential in OAuth Callback

**Severity:** MEDIUM
**Category:** OAuth Security
**File:** `src/server/onenote-oauth-provider.ts:514-525`

**Description:**
After the Microsoft OAuth callback completes, the server redirects to the client's `redirectUri` stored in the pending request:

```typescript
const redirectUrl = new URL(pending.redirectUri);
redirectUrl.searchParams.set("code", ourCode);
// ...
res.redirect(result.redirectUrl);
```

The `redirectUri` was originally provided by the dynamically registered client during the authorization request. While the `authorize()` method validates that `params.redirectUri` is in `client.redirect_uris` (line 123), the dynamic client registration endpoint allows any client to register with arbitrary `redirect_uris`. This means an attacker can:

1. Register a client with `redirect_uris: ["https://attacker.example.com/steal"]`
2. Initiate an authorization flow
3. After the user authenticates with Microsoft, the proxy server redirects the user to `https://attacker.example.com/steal?code=...` with a valid authorization code.

The authorization code can then be exchanged for tokens at the proxy's `/token` endpoint.

**Risk Assessment:**
This is an inherent property of dynamic client registration (RFC 7591). The proxy server cannot distinguish legitimate from malicious clients. However, the PKCE flow provides protection: the attacker would also need the `code_verifier` to exchange the authorization code. Since the code verifier is generated by the attacker's client, they already have it, so PKCE does not protect against this specific scenario (the attacker *is* the client).

However, the user must still authenticate with Microsoft and grant consent, so the attacker cannot steal tokens silently. The risk is that a user could be social-engineered into authorizing a malicious client.

**Recommendation:**
1. Consider requiring pre-registration of clients rather than allowing fully dynamic registration.
2. Display a consent screen showing which client is requesting access before redirecting to Microsoft.
3. Log all dynamic client registrations for audit purposes.

---

#### M-7: Pagination `nextLink` Path Not Validated (Improved but Not Fully Resolved)

**Severity:** MEDIUM
**Category:** Input Validation / SSRF
**File:** `src/onenote/pagination.ts:56-66`

**Description:**
This was M-4 in v1 and is partially improved. The `nextLink` URL's hostname is discarded (the client always uses its configured `baseUrl`), which is good. However, the path is extracted and used without validation:

```typescript
currentPath = nextUrl.pathname.replace(/^\/v1\.0/, "");
```

A malicious Graph API response (possible if `ONENOTE_GRAPH_BASE_URL` is overridden per H-2) could set `@odata.nextLink` to a path like `/admin/dangerousEndpoint` and the client would make authenticated requests to that path on the configured base URL.

**Recommendation:**
Validate that the extracted path starts with the expected API prefix (e.g., `/me/onenote/`):

```typescript
if (!currentPath.startsWith("/me/onenote/")) {
  break;
}
```

---

### LOW

#### L-1: `verifyToken` Returns `true` on Network Error (Unchanged from v1)

**Severity:** LOW
**Category:** Error Handling
**File:** `src/onenote/auth.ts:78-80`

**Description:**
Unchanged from v1 (L-1). The fail-open design means a revoked token may be used if the verification endpoint is unreachable. This is an intentional design choice for offline resilience.

**Recommendation:**
Add a log message when verification fails due to a network error.

---

#### L-2: `escapeHtml` Does Not Escape Single Quotes (Unchanged from v1)

**Severity:** LOW
**Category:** XSS Prevention
**File:** `src/utils/html.ts:10-16`

**Description:**
Unchanged from v1 (L-3). The function does not escape `'` to `&#39;`. Current usage contexts (element content, `<title>` text) are safe, but this is a latent issue.

**Recommendation:**
Add `.replace(/'/g, "&#39;")`.

---

#### L-3: No Upper Bound on Registered Clients Map

**Severity:** LOW
**Category:** Resource Exhaustion / DoS
**File:** `src/server/onenote-oauth-provider.ts:50-71`

**Description:**
The `OneNoteClientsStore` keeps all registered clients in an in-memory `Map` with no size limit. Each call to `registerClient()` adds a new entry. Rate limiting on `/register` is 100/minute, but over time this Map can grow unboundedly (clients are never cleaned up).

**Recommendation:**
Implement an LRU cache or TTL-based eviction for registered clients, or cap the maximum number of registered clients.

---

#### L-4: `delete-page` Tool Uses `request<undefined>` Instead of `requestEmpty`

**Severity:** LOW
**Category:** Type Safety
**File:** `src/tools/delete-page.ts:35-38`

**Description:**
The `delete-page` tool uses `client.request<undefined>()` for a DELETE operation that returns no body, rather than the purpose-built `client.requestEmpty()`. This works because `request<T>` handles empty bodies with `undefined as unknown as T`, but it is a type safety gap -- the caller gets `OneNoteResult<undefined>` via an unsafe cast rather than the clean `OneNoteResult<void>` from `requestEmpty()`.

Similarly, `update-page.ts:62` uses `client.request<undefined>()` for PATCH.

**Recommendation:**
Switch to `requestEmpty()` for void endpoints:

```typescript
const result = await client.requestEmpty({
  path: `/me/onenote/pages/${sanitizeId(pageId, "pageId")}`,
  method: "DELETE",
});
```

---

#### L-5: Token Store Path Injection via Environment Variable (Unchanged from v1)

**Severity:** LOW
**Category:** File System Security
**File:** `src/onenote/token-store.ts:41-45`

**Description:**
Unchanged from v1 (L-4). `ONENOTE_TOKEN_STORE_PATH` is used without validation.

**Recommendation:**
Validate the path is not a symlink and is within an expected directory.

---

#### L-6: OAuth Callback Server Binds to Configured Host Without Restriction (Unchanged from v1)

**Severity:** LOW
**Category:** Network Security
**File:** `src/onenote/auth.ts:136-143, 317`

**Description:**
Unchanged from v1 (M-5), downgraded to LOW because the default is safe (`localhost`) and altering it requires an explicit environment variable change.

**Recommendation:**
Warn when binding to a non-loopback address.

---

#### L-7: Timeout Race Condition in Interactive OAuth Callback

**Severity:** LOW
**Category:** Error Handling / Resource Cleanup
**File:** `src/onenote/auth.ts:174-179`

**Description:**
The timeout promise in `runInteractiveOAuth` creates a timer that is never cleared:

```typescript
const timeoutPromise = new Promise<string>((_, reject) => {
  setTimeout(() => {
    reject(new OneNoteAuthError("Timed out waiting for OAuth callback.", "TIMEOUT"));
  }, OAUTH_CALLBACK_TIMEOUT_MS);
});
```

If the code promise resolves first (success), the timeout's `setTimeout` continues to run until it fires, at which point the rejection is swallowed (the promise is already resolved). While this does not cause a runtime error, it keeps the timer alive in the event loop for the remaining timeout duration. The `server.close()` in `finally` should handle cleanup, but the orphaned timer could prevent the process from exiting promptly if `unref()` is not called.

**Recommendation:**
Store the timer handle and clear it on success:

```typescript
let timeoutHandle: ReturnType<typeof setTimeout>;
const timeoutPromise = new Promise<string>((_, reject) => {
  timeoutHandle = setTimeout(() => {
    reject(new OneNoteAuthError(...));
  }, OAUTH_CALLBACK_TIMEOUT_MS);
});

try {
  const code = await Promise.race([codePromise, timeoutPromise]);
  clearTimeout(timeoutHandle!);
  // ...
} finally {
  clearTimeout(timeoutHandle!);
  server.close();
}
```

---

#### L-8: Search Query Has No Maximum Length

**Severity:** LOW
**Category:** Input Validation / DoS
**File:** `src/tools/search-pages.ts:30-31`

**Description:**
The `query` parameter has a `.min(1)` constraint but no `.max()` constraint:

```typescript
query: z.string().min(1).describe("Search query string...")
```

An extremely long search query could cause performance issues when URL-encoded and sent to the Graph API, or could be used for memory pressure.

**Recommendation:**
Add a reasonable maximum length: `z.string().min(1).max(1000)`.

---

#### L-9: No Content Length Limit on `create-page` Content

**Severity:** LOW
**Category:** Input Validation / DoS
**File:** `src/tools/create-page.ts:25-30`

**Description:**
Same as v1 (L-6). The `content` parameter in `create-page` and the `patches` array in `update-page` have no maximum size constraint. The 30-second fetch timeout and Graph API limits provide some protection.

**Recommendation:**
Add `z.string().max(1_000_000)` for content and a max items limit on the patches array.

---

#### L-10: `stripHtml` Regex May Not Handle All Edge Cases

**Severity:** LOW
**Category:** Input Validation
**File:** `src/utils/html.ts:74-81`

**Description:**
The `stripHtml` function uses simple regex patterns:

```typescript
.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
.replace(/<[^>]+>/g, " ")
```

The `<style[^>]*>` pattern does not handle the case where a `>` appears inside an attribute value (e.g., `<style data-x="a>b">`). In practice, this function is only used for generating text summaries, not for security-critical sanitization, so the impact is minimal.

**Recommendation:**
Document that `stripHtml` is best-effort for display purposes, not a security boundary.

---

---

## Type Safety Audit

This section catalogs all type assertions (`as`), `unknown` casts, and unchecked type assumptions found in the source code.

### Unsafe `as` Casts

| # | File | Line | Cast | Risk |
|---|------|------|------|------|
| 1 | `src/onenote/client.ts:147` | `JSON.parse(text) as T` | The response body is parsed and cast to the generic type parameter `T` without runtime validation. If the Graph API changes response shapes or returns an error body, the cast silently produces incorrect types. | **MEDIUM** -- All `request<T>()` callers trust the cast. |
| 2 | `src/onenote/client.ts:228` | `JSON.parse(text) as T` | Same issue in `requestHtmlBody<T>()`. | **MEDIUM** |
| 3 | `src/onenote/client.ts:143` | `undefined as unknown as T` | When the response body is empty, returns `undefined` cast through `unknown` to `T`. The comment acknowledges this is unsafe and recommends using `requestEmpty()`. | **LOW** -- callers that expect data will get `undefined` at runtime. |
| 4 | `src/onenote/client.ts:224` | `undefined as unknown as T` | Same pattern in `requestHtmlBody<T>()`. | **LOW** |
| 5 | `src/onenote/client.ts:286` | `(await response.json()) as {...}` | Error response body cast without validation. Wrapped in try/catch so failures are handled. | **LOW** |
| 6 | `src/onenote/token-store.ts:66-68` | `(data as Record<string, unknown>)["accessToken"]` | Used inside a type guard that checks `typeof ... === "string"`. Reasonably safe. | **LOW** |
| 7 | `src/onenote/token-store.ts:69` | `data as OneNoteTokenData` | After the type guard, this cast trusts that the remaining fields match `OneNoteTokenData`. Optional fields (e.g., `refreshToken`, `expiresAt`) are not validated. | **MEDIUM** -- A corrupted token file with wrong types for optional fields would produce silent type errors. |
| 8 | `src/server/onenote-oauth-provider.ts:290-294` | `(await response.json()) as {...}` | Microsoft token refresh response is cast without validation. Unlike the stdio path which validates with Zod (`OneNoteTokenResponseSchema`), the proxy path trusts the response shape. | **MEDIUM** -- If Microsoft returns unexpected fields, the server could store garbage. |
| 9 | `src/server/onenote-oauth-provider.ts:471` | `(await response.json()) as typeof msTokens` | Same issue for the callback token exchange. | **MEDIUM** |
| 10 | `src/server/http-server.ts:302` | `req.headers["mcp-session-id"] as string \| undefined` | Express header access. The header value could be `string[]` if sent multiple times. The cast to `string \| undefined` ignores the array case. | **LOW** -- Express typically coalesces duplicate headers, but the type is technically wrong. |
| 11 | `src/server/http-server.ts:335` | `transport as unknown as Transport` | Required due to SDK type incompatibility. Comment documents the reason. | **LOW** -- SDK interop issue, not a logic bug. |
| 12 | `src/resources/notebooks.ts:98` | `variables["notebookId"] as string` | Template variable cast. The MCP SDK guarantees template variables are strings. | **SAFE** |
| 13 | `src/resources/sections.ts:36` | `variables["notebookId"] as string` | Same. | **SAFE** |
| 14 | `src/resources/pages.ts:37,78` | `variables["sectionId"] as string`, `variables["pageId"] as string` | Same. | **SAFE** |
| 15 | `src/index.ts:27` | `require("../package.json") as { version: string }` | Package.json cast. Safe in practice. | **SAFE** |

### Unvalidated API Response Parsing

The most significant type safety concern is the pattern of `JSON.parse(text) as T` in `OneNoteClient.request()` and `requestHtmlBody()`. Every tool, resource, and prompt that calls these methods receives an unvalidated object cast to the expected Graph API type. If the Graph API returns an unexpected shape (e.g., an error wrapped differently, a schema change, or an entirely different response format), the TypeScript type system provides no runtime protection.

**Recommendation:**
For critical data paths, consider adding a Zod validation layer similar to what `oauth.ts` already uses for token responses (`OneNoteTokenResponseSchema`). A minimal approach would validate the presence of required fields (e.g., `id`, `displayName`) before returning.

### Unvalidated Token Response in Proxy Path

The HTTP proxy path (`onenote-oauth-provider.ts`) casts Microsoft token responses without Zod validation, while the stdio path (`oauth.ts`) validates with `OneNoteTokenResponseSchema`. This inconsistency means the proxy path is less resilient to unexpected responses.

**Recommendation:**
Apply the same `OneNoteTokenResponseSchema` validation in `handleMicrosoftOAuthCallback` and `exchangeRefreshToken`.

---

## Edge Cases

### Tool-Specific Edge Cases

#### Empty String IDs
- **Current behavior:** `sanitizeId()` rejects empty and whitespace-only strings with a thrown `Error`.
- **Assessment:** Properly handled.

#### Extremely Long IDs
- **Current behavior:** `encodeURIComponent()` is applied, which increases the length. A 10,000-character ID would produce a very long URL.
- **Assessment:** No length limit on IDs. The Graph API will reject with 414 URI Too Long, but the server wastes resources constructing and sending the request. Consider adding `.max(500)` to ID schema fields.

#### Unicode/Emoji in IDs
- **Current behavior:** `encodeURIComponent()` properly percent-encodes Unicode characters. Graph API IDs are typically base64-like and should not contain Unicode, but the server correctly handles it.
- **Assessment:** Properly handled.

#### Unicode/Emoji in Section Names
- **Current behavior:** The `create-section` tool validates against forbidden characters but allows Unicode. The Graph API supports Unicode section names.
- **Assessment:** Properly handled.

#### Concurrent Requests
- **Current behavior:** The HTTP server handles concurrent requests through Express. Sessions are tracked in an LRU cache. Token store operations on Maps are synchronous (no async gaps between check and use for `consumeAuthCode`, `consumePendingRequest`), so there are no TOCTOU race conditions.
- **Assessment:** Properly handled for single-process deployment. Not safe for multi-process deployments (in-memory stores would be separate).

#### Graph API Returns Unexpected Shapes
- **Current behavior:** `JSON.parse(text) as T` blindly casts. If the API returns `{ "error": { ... } }` with a 200 status code (which Microsoft sometimes does), the tool would return the error object as if it were the expected data.
- **Assessment:** Missing validation. See Type Safety Audit section.

#### Token Expires Mid-Request
- **Current behavior:** For the HTTP proxy, the access token TTL is 1 hour. If the upstream Microsoft token expires during a long request, the Graph API returns 401. The client returns a `OneNoteClientError` with code `UNAUTHORIZED`, which `mapOneNoteError` converts to an `McpError` thrown to the MCP client.
- **Assessment:** The error is surfaced correctly. The MCP client can then re-authenticate. However, there is no automatic retry with a refreshed token.

#### Malformed `@odata.nextLink`
- **Current behavior:** `new URL(nextLink)` would throw if the `nextLink` is not a valid URL. This error propagates as a network error from `fetchAllPages`.
- **Assessment:** The error is caught by the calling tool's try/catch or by `handleApiResult`. Not a crash bug, but the error message could be confusing ("Network error" for what is actually a parsing error).

#### Session ID Header Injection
- **Current behavior:** The `mcp-session-id` header is read as a string and used as a Map key. If an attacker sends a header value containing special characters, it is safely used as a Map key (JavaScript Maps accept any string key).
- **Assessment:** Safe. Session IDs are UUIDs generated server-side; invalid IDs simply result in "Session not found" responses.

#### Rate Limiting Bypass via Multiple IPs
- **Current behavior:** `express-rate-limit` defaults to using `req.ip` for rate limiting. Behind a reverse proxy, this could be the proxy's IP rather than the client's IP, allowing all clients to share one rate limit bucket (too restrictive), or if `trust proxy` is set incorrectly, allowing rate limit bypass via `X-Forwarded-For` header manipulation.
- **Assessment:** The server binds to `127.0.0.1` by default and does not set `trust proxy`. For non-localhost deployments, rate limiting configuration should be reviewed.

#### Extremely Large Notebook Hierarchies
- **Current behavior:** `get-notebook-hierarchy` fetches all notebooks with 2-level expand, then recursively fetches deeper section groups with a `MAX_DEPTH = 10` safety limit. For a user with thousands of notebooks and deeply nested section groups, this could result in many sequential API calls.
- **Assessment:** The safety limit prevents infinite recursion, but there is no limit on the number of section groups at each level. A notebook with 1000 section groups would trigger 1000 sequential API requests. Consider adding a breadth limit.

#### `htmlPage` Body Parameter Accepts Raw HTML
- **Current behavior:** In `src/onenote/auth.ts:322-343`, the `htmlPage()` function inserts its `body` parameter directly into the HTML document without escaping. The callers pass hardcoded HTML strings (safe) and values processed through `escapeHtml()` (safe), but the function signature does not enforce this.
- **Assessment:** Safe in current usage, but the function is a potential injection point if a caller passes unsanitized user input in the future.

---

## Positive Security Observations

The following security-positive patterns are noted:

1. **PKCE pass-through is correctly implemented.** The proxy stores the client's code challenge, the SDK validates the code verifier, and authorization codes are single-use via `consumeAuthCode`.

2. **State parameter binding is correct.** The proxy generates its own `microsoftState` for the upstream redirect while preserving the client's `clientState` for the downstream redirect. The `consumePendingRequest` atomically deletes the entry, preventing replay.

3. **Token TTL enforcement with cleanup.** All token types have explicit expiry times. A periodic cleanup timer removes expired entries. The timer is `unref()`ed to avoid keeping the process alive.

4. **Session management with LRU eviction.** The session map uses `LRUCache` with a max of 1000 sessions, preventing memory exhaustion. Evicted sessions are properly closed. Idle sessions are cleaned up after 30 minutes.

5. **Security headers via Helmet.** The HTTP server uses Helmet with a restrictive CSP (`script-src: 'none'`), `X-Frame-Options`, and other security headers.

6. **Rate limiting on sensitive endpoints.** Both `/oauth` and `/mcp` have rate limiting (100 req/min).

7. **CORS boundary enforcement.** The `/mcp` endpoint blocks all cross-origin requests. OAuth endpoints allow CORS with proper boundary-aware path matching (preventing `/authorize-admin` from matching `/authorize`).

8. **No-cache headers on sensitive endpoints.** All OAuth and MCP endpoints set `Cache-Control: no-store` and `Pragma: no-cache`.

9. **Bearer auth middleware on MCP endpoint.** The `/mcp` endpoint requires valid Bearer tokens verified through the `OneNoteProxyOAuthProvider.verifyAccessToken()` method.

10. **Input sanitization via `sanitizeId()`.** All tool handlers use `sanitizeId()` which applies `encodeURIComponent()`, preventing path traversal and query injection. This resolves the H-1 finding from v1.

11. **HTML escaping in error responses.** User-visible error messages in OAuth callback HTML responses are escaped via `escapeHtml()`.

12. **Graceful shutdown handler.** The HTTP server handles SIGINT/SIGTERM, closes all sessions, and shuts down cleanly.

13. **Fetch timeouts on all external requests.** All `fetch()` calls use `AbortController` with `FETCH_TIMEOUT_MS` (30s) timeout.

14. **Zod schema validation on tool inputs.** All tool parameters are validated before reaching handlers.

15. **Refresh token rotation.** When refreshing tokens, the old refresh token is revoked before issuing a new one.

---

## Summary Table

| ID   | Severity | Finding | Status vs v1 |
|------|----------|---------|---------------|
| H-1  | HIGH     | Timing side-channel in PKCE verification | NEW |
| H-2  | HIGH     | SSRF via configurable base URLs | UNCHANGED |
| M-1  | MEDIUM   | CORS reflects arbitrary origins | NEW |
| M-2  | MEDIUM   | In-memory token store Maps have no size limits | NEW |
| M-3  | MEDIUM   | OAuth token error response may leak metadata | PARTIALLY IMPROVED |
| M-4  | MEDIUM   | Token store directory permissions on Windows | UNCHANGED |
| M-5  | MEDIUM   | `sanitizeHtmlForXhtml` regex potential ReDoS | NEW |
| M-6  | MEDIUM   | Open redirect potential via dynamic client registration | NEW |
| M-7  | MEDIUM   | Pagination `nextLink` path not validated | PARTIALLY IMPROVED |
| L-1  | LOW      | `verifyToken` returns true on network error | UNCHANGED |
| L-2  | LOW      | `escapeHtml` missing single quote escaping | UNCHANGED |
| L-3  | LOW      | No upper bound on registered clients Map | NEW |
| L-4  | LOW      | `delete-page`/`update-page` use `request<undefined>` not `requestEmpty` | NEW |
| L-5  | LOW      | Token store path injection via env var | UNCHANGED |
| L-6  | LOW      | OAuth callback server host binding not restricted | UNCHANGED (downgraded) |
| L-7  | LOW      | Timeout race condition in interactive OAuth | NEW |
| L-8  | LOW      | Search query has no maximum length | NEW |
| L-9  | LOW      | No content length limit on create-page | UNCHANGED |
| L-10 | LOW      | `stripHtml` regex edge cases | NEW |

### Resolved from v1

| v1 ID | Finding | Resolution |
|-------|---------|------------|
| H-1   | Unsanitized IDs in Graph API URL paths | **RESOLVED.** All tools now use `sanitizeId()` with `encodeURIComponent()`. Resources use `encodeURIComponent()` directly. |

---

## Recommendations Priority

1. **Immediate (H-1):** Replace string `===` in `verifyPkceChallenge` with `crypto.timingSafeEqual`. Consider removing `plain` method support.
2. **Immediate (H-2):** Add URL hostname allowlist for base URL overrides.
3. **Short-term (M-2, L-3):** Add size caps to in-memory token store Maps and registered clients Map.
4. **Short-term (M-1):** Switch CORS for public OAuth endpoints from origin reflection to `Access-Control-Allow-Origin: *`.
5. **Short-term (Type Safety):** Add Zod validation for Microsoft token responses in the proxy path to match the stdio path.
6. **Medium-term (M-4):** Address Windows token storage with platform-specific ACLs or OS keychain integration.
7. **Medium-term (M-5):** Audit and test regex patterns with adversarial inputs; add content length limits.
8. **Backlog (L-*):** Address remaining low-severity items as part of regular development.
