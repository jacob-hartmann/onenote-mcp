# Architecture Review: OneNote MCP Server

**Reviewer**: Senior Software Architect (automated review)
**Date**: 2026-02-16
**Scope**: Full codebase -- core infrastructure, 16 tools, 5 resources, 3 prompts, shared utilities, tests, build configuration
**Severity Scale**: CRITICAL / HIGH / MEDIUM / LOW

---

## 1. Design Flaws

### 1.1 `undefined as T` -- Type Erasure Hiding Runtime Bugs (HIGH)

**File**: `src/onenote/client.ts`, lines 85-86 and 196-197

```ts
if (text.length === 0) {
  return { success: true, data: undefined as T };
}
```

This appears in both `request<T>()` and `requestHtmlBody<T>()`. The cast `undefined as T` silently bypasses TypeScript's type system. When a caller writes `client.request<GraphNotebook>(...)`, they receive `OneNoteResult<GraphNotebook>` -- but on a 204 No Content response, `result.data` is actually `undefined` at runtime while the type says `GraphNotebook`. Any code that accesses `result.data.id` after a `success: true` check will crash with a runtime error that TypeScript cannot catch.

The `delete-page` and `update-page` tools work around this by using `client.request<undefined>(...)`, which happens to be safe because the transform callback ignores the data. But the pattern is a latent trap: any future caller who uses a concrete type with an endpoint that can return empty bodies will face silent breakage.

**Recommendation**: Model the return type honestly. Either:
- Return `OneNoteResult<T | undefined>` for endpoints that may return empty bodies.
- Create a separate `requestNoContent()` method that returns `OneNoteResult<void>`.
- Accept a flag or overload to distinguish "expects JSON" from "expects empty."

### 1.2 Client Has Three Methods With Massive Duplication (HIGH)

**File**: `src/onenote/client.ts`

`request()`, `requestRaw()`, and `requestHtmlBody()` share roughly 80% identical code: URL construction, timeout setup, abort controller, authorization headers, HTTP error mapping, network error mapping, `finally` cleanup. The differences are small:

| Concern | `request<T>` | `requestRaw` | `requestHtmlBody<T>` |
|---|---|---|---|
| Accept header | `application/json` | configurable, default `text/html` | `application/json` |
| Content-Type | `application/json` (if body) | N/A | configurable, default `application/xhtml+xml` |
| Body serialization | `JSON.stringify(body)` | no body | raw string |
| Response parsing | JSON parse to `T` | raw text | JSON parse to `T` |

This is a textbook case for a single internal `_fetch()` method with options for content negotiation and response handling, with the three public methods as thin wrappers. As-is, any change to error handling, header logic, or timeout behavior must be replicated in three places.

**Recommendation**: Extract a private `_execute()` method that handles the common HTTP lifecycle. The public methods become 3-5 line wrappers that configure accept/content-type/response-parsing.

### 1.3 No Input Sanitization for Path Parameters (HIGH)

**Files**: Every tool file that interpolates user input into API paths

```ts
path: `/me/onenote/notebooks/${notebookId}`,
path: `/me/onenote/pages/${pageId}`,
path: `/me/onenote/sections/${sectionId}/pages`,
```

User-supplied IDs are interpolated directly into URL paths with no validation or encoding. While OneNote IDs are typically opaque strings like `0-abc123...`, there is no validation that the input is a plausible ID. A malicious or malformed input containing `/` or `..` could alter the API path. Since the `new URL()` constructor in the client normalizes these, the risk is somewhat mitigated, but it is still an unsanitized path traversal vector against the Graph API.

**Recommendation**: Add a shared `validateId()` helper that rejects inputs containing `/`, `..`, `?`, `#`, or other path-significant characters. Apply it in the client or as a Zod refinement in the tool schemas.

### 1.4 Resources Have Divergent Error Handling From Tools (MEDIUM)

**Files**: `src/resources/notebooks.ts`, `src/resources/sections.ts`, `src/resources/pages.ts`

Tools use the `handleApiResult()` / `mapOneNoteError()` helper chain, which distinguishes auth errors (thrown as `McpError`) from API errors (returned as tool-level errors). Resources, however, simply do:

```ts
if (!result.success) {
  throw new Error(result.error.message);
}
```

This discards all structured error information (error code, status code, retryability) and wraps everything in a generic `Error`. A 404 and a 429 are indistinguishable to the caller. The `list` callback in notebook resources goes even further -- it silently swallows errors and returns `{ resources: [] }`, making it impossible for clients to know that the listing failed versus the user having no notebooks.

**Recommendation**: Create a shared `handleResourceResult()` helper analogous to `handleApiResult()` that maps error codes to appropriate MCP-level exceptions.

### 1.5 No Retry Logic Despite Marking Errors as Retryable (MEDIUM)

**Files**: `src/onenote/types.ts`, `src/onenote/client.ts`

`OneNoteClientError` has a `retryable` boolean that is set to `true` for 429 (rate limited), 5xx (server error), and timeouts. However, nothing in the codebase reads this field. The information is computed, stored on the error, and then thrown away. This is dead data.

**Recommendation**: Either implement retry logic (exponential backoff with the `retryable` flag) or remove the field until it is needed. Dead code/data creates false confidence.

### 1.6 A New Client Is Created Per Request (MEDIUM)

**Files**: `src/onenote/client-factory.ts`, `src/onenote/auth.ts`

Every tool invocation calls `getOneNoteClientOrThrow(extra)`, which calls `createClientFromAuth()`, which runs the full auth chain: check env var, load tokens from disk, possibly verify the token with a Graph API call, possibly refresh, possibly start interactive OAuth. For cached tokens, this means every single MCP tool call triggers a filesystem read and potentially a network round-trip (`verifyToken`).

The `verifyToken` call on line 100 of `auth.ts` is particularly concerning -- it makes a `GET /me` call to Graph on every request just to check if the cached token is still valid. This adds latency to every operation.

**Recommendation**: Cache the `OneNoteClient` instance in memory (or at least the validated token) with a TTL. Only re-verify when the TTL expires or after receiving a 401 from an actual API call.

---

## 2. Code Quality

### 2.1 Tool File Boilerplate Is Highly Repetitive But Not Duplicated Logic (LOW)

Each tool file follows the exact same pattern:
1. Import `McpServer`, `z`, `getOneNoteClientOrThrow`, Graph types, helpers
2. Export a `registerXxx()` function
3. Call `server.registerTool()` with name, metadata, schema, callback
4. In the callback: get client, make request, return `handleApiResult(result)`

While this is repetitive, it is not code duplication in the harmful sense -- each tool's path, parameters, and schema are genuinely different. The structure is predictable and easy to follow. This is the kind of boilerplate that a code generator or declarative tool definition could eliminate, but it is not causing maintenance pain today.

**Assessment**: The repetition is structural, not logical. Acceptable for 16 tools. Would become painful at 50+.

### 2.2 `as never` Casts in Tests (LOW)

**Files**: Every test file

```ts
vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
  request: mockRequest,
  requestRaw: vi.fn(),
  requestHtmlBody: vi.fn(),
} as never);
```

The `as never` cast is used to bypass type checking when creating mock client objects. This means the tests would not catch interface changes to `OneNoteClient` -- if a method were renamed or its signature changed, the tests would still compile. This is somewhat mitigated by the fact that the mocks are exercised at runtime.

### 2.3 Test Pattern: Extracting Callbacks From Mock Registration (MEDIUM)

**Files**: Every tool test file

```ts
const callback = mockRegisterTool.mock.calls[0]![2] as Function;
const result = await callback({ pageId: "pg-1" }, mockExtra);
```

Every test extracts the tool callback by reaching into `mock.calls[0]![2]`. This is extremely fragile and coupled to the positional arguments of `registerTool`. If the MCP SDK changes the `registerTool` signature, every test breaks simultaneously. The `as Function` cast also loses all type information.

**Recommendation**: Consider creating a test helper that wraps this pattern, e.g.:

```ts
function extractToolCallback(mock: vi.Mock): ToolCallback {
  return mock.mock.calls[0]![2] as ToolCallback;
}
```

At minimum, centralize the index and provide a proper type.

### 2.4 `as const` Assertions Are Unnecessary With Literal Types (LOW)

**File**: `src/prompts/summarize-page.ts`, `src/prompts/search-notes.ts`, `src/prompts/create-note.ts`

```ts
role: "user" as const,
type: "text" as const,
```

These `as const` assertions appear throughout the prompt files. With `strict: true` and the return type expected by the MCP SDK, these should be inferred. This is cosmetic noise but not harmful.

---

## 3. Type Safety

### 3.1 `variables["notebookId"] as string` in Resources (MEDIUM)

**Files**: `src/resources/notebooks.ts` line 93, `src/resources/sections.ts` line 36, `src/resources/pages.ts` lines 37 and 76

```ts
const notebookId = variables["notebookId"] as string;
```

Resource template variables come from URL pattern matching and could be `undefined` or a `string | string[]` depending on the MCP SDK version. The `as string` cast bypasses this, meaning a missing or repeated parameter would silently become the string `"undefined"` and produce a confusing Graph API 400 error.

**Recommendation**: Validate the variable exists and is a string before using it. A simple guard would suffice.

### 3.2 Graph API Types Are Optimistic (LOW)

**File**: `src/onenote/graph-types.ts`

The interfaces declare many fields as required (e.g., `id: string`, `links: GraphNotebookLinks`) when the Graph API may omit them depending on `$select` parameters or API versioning changes. The `$select` constants in `constants.ts` control which fields are returned, but if a select field is removed, the types would still claim those fields exist.

This is a pragmatic trade-off -- modeling every field as optional would make the consumer code verbose with null checks. But it should be documented that these types assume specific `$select` configurations.

### 3.3 `JSON.parse(text) as T` Is an Unsafe Cast (LOW)

**File**: `src/onenote/client.ts` lines 89, 201

```ts
const data = JSON.parse(text) as T;
```

This is a fundamentally unsafe operation -- `JSON.parse` returns `unknown`, and the `as T` cast tells TypeScript to trust that the response matches the expected type without any runtime validation. This is standard practice in HTTP client code and would be expensive to fix with runtime validation (e.g., Zod schemas for every response type). The risk is low given that the Graph API is well-documented, but it should be acknowledged.

### 3.4 `response.json()` in Error Handler Returns `any` (LOW)

**File**: `src/onenote/client.ts` line 226

```ts
const body = (await response.json()) as
  | { message?: string; error?: { message?: string } }
  | undefined;
```

This is actually handled well -- the cast is conservative and the code accesses optional properties safely. No issue here beyond the inherent unsafety of `response.json()`.

---

## 4. Maintainability

### 4.1 Pagination Has No Error Recovery Mid-Stream (MEDIUM)

**File**: `src/onenote/pagination.ts`

`fetchAllPages()` accumulates items across pages but returns the entire error if any page fails:

```ts
if (!result.success) {
  return result;  // Discards all items collected so far
}
```

If page 1 and 2 succeed (returning 40 items) but page 3 fails due to a transient error, all 40 items are lost. For large collections, this is frustrating. There is no partial result mechanism.

**Recommendation**: Consider returning partial results with an error indicator, or adding retry logic for individual pages.

### 4.2 `verifyToken` Swallows Network Errors (MEDIUM)

**File**: `src/onenote/auth.ts` lines 78-80

```ts
} catch {
  return true;  // Assume valid on network error
}
```

If the verification request fails due to a network error, the function returns `true` (token is valid). This means a genuinely expired token will be used if the network is flaky during the verification step, leading to a 401 on the actual API call with no clear indication of why.

This is a defensible design decision (prefer availability over correctness), but it should be documented with a comment explaining the rationale.

### 4.3 Server Instructions Are Stale (LOW)

**File**: `src/index.ts` lines 39-42

```ts
instructions:
  "OneNote MCP scaffold server. Stage 1 includes OAuth/auth foundations " +
  "and empty tool/resource/prompt registrars. OneNote-specific MCP " +
  "features will be added in Stage 2.",
```

The instructions still describe Stage 1 as incomplete, but Stage 2 has been fully implemented with 16 tools, 5 resources, and 3 prompts. These instructions are surfaced to MCP clients and should accurately describe the server's capabilities.

**Recommendation**: Update to reflect the current state of the server.

### 4.4 `htmlPage` Function in Auth Module Is Out of Place (LOW)

**File**: `src/onenote/auth.ts` lines 322-343

The `htmlPage()` function that generates a full HTML page with CSS lives in the auth module. It is only used for the OAuth callback server, so it is not misplaced per se, but if any other module needs to generate HTML pages, there will be pressure to import from `auth.ts` or duplicate the function.

Given that `src/utils/html.ts` already exists as the home for HTML utilities, `htmlPage()` could live there. However, since it is only used in one place and is 20 lines, this is minor.

### 4.5 `NOTEBOOK_HIERARCHY_EXPAND` Constant Is Fragile (LOW)

**File**: `src/constants.ts` lines 63-64

```ts
export const NOTEBOOK_HIERARCHY_EXPAND =
  "sections($select=id,displayName,isDefault,pagesUrl,self),sectionGroups($expand=sections(...),sectionGroups($levels=max;$expand=sections(...)))";
```

This 250-character OData expand string is a single opaque constant. It is correct but unmaintainable -- if any field needs to be added or removed, the developer must parse and reconstruct a nested OData expression by hand. There is no builder or structured representation.

For now, this works. If the hierarchy expand logic becomes more complex (e.g., conditional expansion), a builder pattern would be warranted.

---

## 5. Configuration and Constants

### 5.1 Constants Are Well-Extracted (POSITIVE)

**File**: `src/constants.ts`

All magic numbers, URLs, and OData query strings are centralized. The naming convention is clear (`ONENOTE_*` for API-related, `DEFAULT_*` for configuration defaults, `*_SELECT_FIELDS` for OData). There are no hardcoded strings buried in tool files.

### 5.2 Environment Variable Names Are Consistent (POSITIVE)

All env vars follow the `ONENOTE_*` prefix convention: `ONENOTE_ACCESS_TOKEN`, `ONENOTE_OAUTH_CLIENT_ID`, `ONENOTE_OAUTH_CLIENT_SECRET`, etc. This prevents collisions and makes configuration discoverable.

---

## 6. Build and Bundle

### 6.1 tsup Configuration Is Sound (POSITIVE)

**File**: `tsup.config.ts`

- Single entry point (`src/index.ts`) -- clean, no multiple bundles needed
- ESM-only output -- correct for a Node 22 target
- `splitting: false` -- appropriate for a CLI/server binary (no lazy-loaded chunks)
- `clean: true` -- prevents stale artifacts
- `dts: true` -- generates declaration files for library consumers
- `sourcemap: true` -- enables debugging of the built output

### 6.2 `splitting: false` Means the Entire Application Is One Bundle (LOW)

With `splitting: false`, tsup produces a single `dist/index.js` containing all tool code, all auth code, and all resource code. For a CLI binary this is fine. If the project were used as a library where consumers only need subsets of functionality, this would be a problem. Given the current use case (standalone MCP server), this is correct.

### 6.3 Node 22 Target Is Appropriate (POSITIVE)

Both `tsconfig.json` (`target: ES2022`) and `tsup.config.ts` (`target: node22`) are aligned. The `engines.node >= 22` in `package.json` matches. The use of `fetch` (stable in Node 22), `import.meta.url`, and ESM is consistent with this target.

---

## 7. Testing Patterns

### 7.1 Tests Are Comprehensive for the Happy Path (POSITIVE)

Every tool has a test that verifies:
- Registration name
- Correct API path construction
- Correct parameters passed to the client
- Success response format
- Error response format

The helpers test (`helpers.test.ts`) is particularly thorough, covering all error code mappings.

### 7.2 Tests Are Tightly Coupled to Implementation Details (MEDIUM)

Every test mocks `getOneNoteClientOrThrow` and inspects `mockRegisterTool.mock.calls[0]![2]`. This couples tests to:
- The import path of `client-factory.js`
- The positional arguments of `registerTool`
- The internal structure of mock client objects

If the MCP SDK changes `registerTool`'s signature, or if the codebase refactors to use a different client creation pattern, every test breaks. However, this is somewhat inherent to unit testing registration-based frameworks.

### 7.3 No Integration Tests (MEDIUM)

There are no tests that exercise the actual MCP server end-to-end (e.g., sending a JSON-RPC request and verifying the response). The unit tests verify individual tool callbacks in isolation but do not test that tools are correctly wired into the server, that schema validation works, or that the stdio transport correctly serializes responses.

**Recommendation**: Add at least one integration test that creates a real `McpServer`, registers tools, and simulates a tool call through the SDK.

### 7.4 Coverage Thresholds Are Ambitious (POSITIVE)

**File**: `vitest.config.ts`

```ts
thresholds: {
  statements: 95,
  branches: 85,
  functions: 95,
  lines: 95,
}
```

95% statement/function/line coverage thresholds are high and appropriate for a project of this size. The 85% branch threshold accounts for the difficulty of covering all error paths.

---

## 8. Dependency Management

### 8.1 Dependencies Are Minimal and Appropriate (POSITIVE)

Production dependencies:
- `@modelcontextprotocol/sdk` -- required
- `dotenv` -- standard env management
- `zod` -- schema validation, used by the MCP SDK

No unnecessary dependencies. No utility libraries (lodash, etc.) where native APIs suffice.

### 8.2 No Circular Dependencies (POSITIVE)

The dependency graph is clean and unidirectional:

```
index.ts
  -> tools/index.ts -> tools/*.ts -> onenote/client-factory.ts -> onenote/client.ts -> onenote/types.ts
  -> resources/index.ts -> resources/*.ts -> onenote/client-factory.ts
  -> prompts/index.ts -> prompts/*.ts -> onenote/client-factory.ts
```

Constants and types are leaf modules. The `client.ts` imports `types.ts` but not vice versa. The barrel exports (`index.ts` files) only re-export, they do not contain logic:

### 8.3 Barrel Exports Are Used Correctly (POSITIVE)

**Files**: `src/tools/index.ts`, `src/resources/index.ts`, `src/prompts/index.ts`

Each barrel file exports a single `register*` function that orchestrates sub-registrations. They do not re-export internal types or create import cycles. This is the correct use of barrel exports.

---

## 9. Naming Consistency

### 9.1 File, Function, and Tool Names Are Highly Consistent (POSITIVE)

| File | Export | Tool Name |
|---|---|---|
| `list-notebooks.ts` | `registerListNotebooks` | `list-notebooks` |
| `get-notebook.ts` | `registerGetNotebook` | `get-notebook` |
| `create-page.ts` | `registerCreatePage` | `create-page` |
| `delete-page.ts` | `registerDeletePage` | `delete-page` |

The kebab-case file name, PascalCase function name, and kebab-case tool name are perfectly predictable. Given a tool name, you can derive the file name and function name without looking at code.

### 9.2 Type Naming Is Consistent (POSITIVE)

Graph API types use the `Graph` prefix (`GraphNotebook`, `GraphSection`, `GraphPage`). Internal types use the `OneNote` prefix (`OneNoteClient`, `OneNoteClientError`, `OneNoteResult`). This disambiguation is clear and helpful.

---

## 10. Scalability

### 10.1 The Architecture Scales Linearly (POSITIVE)

Adding a new tool requires:
1. Create `src/tools/new-tool.ts` with `registerNewTool()`
2. Add import and call in `src/tools/index.ts`
3. Create `src/tools/new-tool.test.ts`

No existing files need modification beyond `index.ts`. The same applies to resources and prompts. This is well-structured for growth.

### 10.2 No Service Layer Between Tools and Client (MEDIUM)

Tools directly call `client.request()` with Graph API paths and OData parameters. This means:
- Each tool knows the exact Graph API endpoint path
- Each tool constructs its own OData query parameters
- If the Graph API path changes (e.g., v1.0 to v2.0), every tool must be updated

A thin service layer (e.g., `NotebookService.list()`, `PageService.getContent(pageId)`) would encapsulate API paths and OData construction, making tools more declarative. However, for 16 tools, the current approach is workable. The pain threshold is around 30-40 tools.

### 10.3 Resource Templates Duplicate Tool Logic (MEDIUM)

**Files**: `src/resources/notebooks.ts`, `src/tools/list-notebooks.ts`, `src/tools/get-notebook.ts`

The notebook list resource and the `list-notebooks` tool make the same API call with the same parameters. The notebook template resource and the `get-notebook` tool are similarly identical. This is not shared logic; it is reimplemented in both places.

If the API path or query parameters change, both the tool and the resource must be updated. A service layer would eliminate this duplication.

---

## 11. Security

### 11.1 Token Store Has Correct File Permissions (POSITIVE)

**File**: `src/onenote/token-store.ts` line 89

```ts
writeFileSync(path, JSON.stringify(tokens, null, 2), {
  encoding: "utf-8",
  mode: 0o600,
});
```

The token file is written with `0o600` permissions (owner read/write only). This is correct for credential storage on Unix systems. On Windows, `mode` is ignored, but Windows filesystem permissions typically default to user-only access.

### 11.2 HTML Escaping Is Present But Minimal (LOW)

**File**: `src/utils/html.ts`

`escapeHtml()` handles `&`, `<`, `>`, `"` but not `'` (single quote). This is used for the page title in `buildPageHtml()` and for the OAuth callback HTML pages. Since the title appears inside `<title>` tags and HTML attributes use double quotes, the missing single-quote escaping is not exploitable in the current usage. However, it would be unsafe if used in a single-quoted HTML attribute context.

---

## 12. Specific Module Reviews

### 12.1 Pagination Module (`src/onenote/pagination.ts`)

**Design**: Clean and reusable. The `fetchPage` / `fetchAllPages` split is appropriate. The safety limit (`ONENOTE_MAX_PAGINATION_PAGES = 50`) prevents infinite loops.

**Concern**: The `nextLink` URL parsing on line 64 uses a hardcoded regex:

```ts
currentPath = nextUrl.pathname.replace(/^\/v1\.0/, "");
```

This assumes the Graph API version is `v1.0`. If the base URL is configured to use `beta` or a future version, this stripping would fail silently, producing paths like `/beta/me/onenote/...` which would then get prepended with the base URL, resulting in a double path.

**Severity**: MEDIUM -- only matters if `baseUrl` is overridden, which is a supported configuration.

### 12.2 Token Store (`src/onenote/token-store.ts`)

**Design**: Platform-aware path resolution (Windows/macOS/Linux) with `XDG_CONFIG_HOME` support. Correct.

**Concern**: Token validation on load (lines 62-67) only checks that `accessToken` is a string. It does not validate `expiresAt`, `refreshToken`, or any other fields. A corrupted token file with `{ "accessToken": "" }` would be accepted.

**Severity**: LOW -- `isTokenExpired` handles the missing `expiresAt` case, and an empty access token would fail at the Graph API level.

### 12.3 OAuth Module (`src/onenote/oauth.ts`)

**Design**: Well-structured with Zod validation of token responses, proper CSRF state parameter, and clean separation between authorize URL building and token exchange.

No significant concerns.

---

## Summary

### Findings by Severity

| Severity | Count | Key Items |
|---|---|---|
| CRITICAL | 0 | -- |
| HIGH | 3 | `undefined as T` type erasure, client method duplication, unsanitized path parameters |
| MEDIUM | 8 | Divergent error handling in resources, no retry logic, per-request client creation, pagination error recovery, stale server instructions, pagination URL parsing, service layer absence, test coupling |
| LOW | 8 | Tool boilerplate, `as never` in tests, `as const` noise, optimistic Graph types, unsafe JSON parse, HTML escaping edge case, single bundle output, `htmlPage` placement |

### Top 3 Actionable Recommendations

1. **Unify the three client methods** into a single internal `_execute()` with configurable content negotiation. This eliminates ~100 lines of duplication and ensures consistent behavior.

2. **Fix `undefined as T`** by introducing a `requestNoContent()` method or making the return type honest. This is the one place where the type system is actively lying.

3. **Add input validation for IDs** with a shared Zod refinement or helper function that rejects path-traversal characters. This is low-effort, high-safety-impact.

### Overall Assessment

This is a well-structured, consistently designed codebase. The naming conventions are exemplary, the separation between infrastructure and tool definitions is clean, and the error handling in the tool layer (via `handleApiResult`) is a good pattern. The main architectural risks are in the HTTP client layer (method duplication, type safety of empty responses) and in the lack of a service layer to insulate tools from API path details. For a 16-tool MCP server, these are manageable. At 40+ tools, the service layer gap and resource/tool duplication would become painful.
