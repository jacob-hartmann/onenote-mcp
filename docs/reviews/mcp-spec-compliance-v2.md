# MCP Spec Compliance Audit (v2)

**Reviewer**: MCP SDK Compliance Auditor (automated)
**Date**: 2026-02-16
**Scope**: Full MCP specification compliance and SDK feature utilization audit
**SDK Version**: `@modelcontextprotocol/sdk` 1.26.0 (latest in `node_modules`)
**Zod Version**: `zod` 4.3.6
**Server Implementation**: 16 tools, 5 resources (2 static + 3 templates), 3 prompts

---

## Executive Summary

The OneNote MCP server is **broadly compliant** with the MCP specification and uses the v2 `registerTool` / `registerResource` / `registerPrompt` API correctly throughout. Tool annotations, resource templates, prompt argument schemas, and error handling are all implemented with care. The transport layer (both stdio and StreamableHTTP) follows the spec.

However, there are several areas where the implementation could be improved or where available SDK features are not yet utilized. This report categorizes findings as:

- **VIOLATION** -- Must fix; breaks spec compliance or uses deprecated/incorrect patterns
- **IMPROVEMENT** -- Should fix; current behavior is suboptimal or may cause issues
- **ENHANCEMENT** -- Nice to have; leverages SDK features not yet used

**Overall Status: 0 VIOLATIONS, 5 IMPROVEMENTS, 10 ENHANCEMENTS**

---

## Table of Contents

- [1. Tool Registration Audit](#1-tool-registration-audit)
- [2. Resource Registration Audit](#2-resource-registration-audit)
- [3. Prompt Registration Audit](#3-prompt-registration-audit)
- [4. Error Handling Audit](#4-error-handling-audit)
- [5. Transport Audit](#5-transport-audit)
- [6. Server Capabilities Audit](#6-server-capabilities-audit)
- [7. Available SDK Features Not Yet Used](#7-available-sdk-features-not-yet-used)
- [8. Zod Import Pattern](#8-zod-import-pattern)
- [Summary of Findings](#summary-of-findings)

---

## 1. Tool Registration Audit

### 1.1 API Pattern: `server.registerTool()` (v2 API)

**Status: COMPLIANT**

All 16 tools use `server.registerTool(name, config, callback)` -- the correct v2 API. None use the deprecated `server.tool()` overloads. The config object includes `title`, `description`, `inputSchema`, and `annotations` for every tool.

Files verified:
- `src/tools/list-notebooks.ts:15` -- `server.registerTool("list-notebooks", {...}, ...)`
- `src/tools/get-notebook.ts:16` -- `server.registerTool("get-notebook", {...}, ...)`
- `src/tools/create-page.ts:16` -- `server.registerTool("create-page", {...}, ...)`
- `src/tools/delete-page.ts:14` -- `server.registerTool("delete-page", {...}, ...)`
- `src/tools/update-page.ts:14` -- `server.registerTool("update-page", {...}, ...)`
- `src/tools/search-pages.ts:21` -- `server.registerTool("search-pages", {...}, ...)`
- All remaining 10 tools follow the same pattern.

### 1.2 Tool Metadata: `title`, `description`

**Status: COMPLIANT**

Every tool provides both `title` and `description`. The `title` field is the human-readable display name (SDK v2 feature), and descriptions are detailed enough to guide LLM usage. Example:

```
src/tools/create-page.ts:20-22
  title: "Create Page",
  description: "Create a new page in a OneNote section. The content should be provided as HTML..."
```

### 1.3 Tool Input Schema

**Status: COMPLIANT**

All tools define `inputSchema` using Zod schemas passed as a plain shape object (matching the SDK's `ZodRawShapeCompat` type). The SDK internally wraps these in `z.object()`. Tools with no parameters pass `inputSchema: {}` (e.g., `list-notebooks`, `get-notebook-hierarchy`).

### 1.4 Tool Annotations

**Status: COMPLIANT**

All 16 tools provide the full set of annotation hints. Each has been verified for correctness:

| Tool | readOnly | destructive | idempotent | openWorld | Correct? |
|------|----------|-------------|------------|-----------|----------|
| list-notebooks | true | false | true | false | Yes |
| get-notebook | true | false | true | false | Yes |
| list-section-groups | true | false | true | false | Yes |
| get-section-group | true | false | true | false | Yes |
| list-sections | true | false | true | false | Yes |
| get-section | true | false | true | false | Yes |
| create-section | false | false | false | false | Yes |
| list-pages | true | false | true | false | Yes |
| get-page | true | false | true | false | Yes |
| get-page-content | true | false | true | false | Yes |
| get-page-preview | true | false | true | false | Yes |
| create-page | false | false | false | false | Yes |
| update-page | false | false | false | false | Yes |
| delete-page | false | true | true | false | Yes |
| search-pages | true | false | true | false | Yes |
| get-notebook-hierarchy | true | false | true | false | Yes |

All annotations are logically correct:
- Read-only tools are marked `readOnlyHint: true`
- `delete-page` is the only tool marked `destructiveHint: true`
- `create-page` and `create-section` are not idempotent (creating again produces a new resource)
- `update-page` uses PATCH commands that may not be idempotent depending on the action (e.g., `append`)
- `delete-page` IS idempotent (deleting a deleted page is a no-op / returns 404)
- `openWorldHint: false` is correct for all tools (they interact with a bounded OneNote API, not the open web)

### 1.5 Structured Content / Output Schema

**Status: NOT USED (see ENHANCEMENT-01)**

No tools use `outputSchema` or `structuredContent`. All tools return only `content: [{ type: "text", text: ... }]`. The SDK v1.26.0 supports `outputSchema` with Zod schemas and `structuredContent` in the return value.

### 1.6 Embedded Resources in Tool Responses

**Status: NOT USED (see ENHANCEMENT-02)**

No tools return embedded resources (content items of `type: "resource"`). The `get-page-content` tool, for example, could benefit from returning an embedded resource reference to `onenote://pages/{pageId}` alongside the text content.

---

## 2. Resource Registration Audit

### 2.1 API Pattern: `server.registerResource()` (v2 API)

**Status: COMPLIANT**

All 5 resources use `server.registerResource(name, uriOrTemplate, config, callback)`. None use the deprecated `server.resource()` overloads.

Files verified:
- `src/resources/notebooks.ts:26` -- static resource `"notebooks-list"` at `"onenote://notebooks"`
- `src/resources/notebooks.ts:63` -- template resource `"notebook"` at `"onenote://notebooks/{notebookId}"`
- `src/resources/sections.ts:25` -- template resource `"notebook-sections"` at `"onenote://notebooks/{notebookId}/sections"`
- `src/resources/pages.ts:27` -- template resource `"section-pages"` at `"onenote://sections/{sectionId}/pages"`
- `src/resources/pages.ts:67` -- template resource `"page-content"` at `"onenote://pages/{pageId}"`

### 2.2 Resource Metadata: `title`, `description`, `mimeType`

**Status: COMPLIANT**

All resources provide `title`, `description`, and `mimeType` in the config object. JSON resources use `"application/json"` and the page content resource uses `"text/html"`.

### 2.3 URI Templates

**Status: COMPLIANT**

URI templates follow RFC 6570 simple string expansion syntax (`{variable}`). All templates are well-formed:
- `onenote://notebooks/{notebookId}`
- `onenote://notebooks/{notebookId}/sections`
- `onenote://sections/{sectionId}/pages`
- `onenote://pages/{pageId}`

### 2.4 `ResourceTemplate` `list` Callback

**Status: PARTIALLY IMPLEMENTED (see IMPROVEMENT-01)**

The `notebook` resource template (`src/resources/notebooks.ts:64`) correctly implements a `list` callback that enumerates all notebooks as discoverable resources. However, the other three template resources pass `list: undefined`:

- `src/resources/sections.ts:28` -- `list: undefined`
- `src/resources/pages.ts:29` -- `list: undefined`
- `src/resources/pages.ts:69` -- `list: undefined`

Per the SDK, `list` must be explicitly specified (even as `undefined`) to avoid accidentally forgetting resource listing. The explicit `undefined` is technically correct per the SDK contract, but it means clients cannot discover sections or pages via `resources/list`. This is likely intentional due to the need for a parent ID parameter, but it limits discoverability.

### 2.5 Resource Completion/Autocomplete Callbacks

**Status: NOT USED (see ENHANCEMENT-03)**

The `ResourceTemplate` constructor accepts an optional `complete` property for providing autocomplete suggestions for URI template variables. None of the templates provide completion callbacks. For example, `onenote://notebooks/{notebookId}` could offer autocomplete for `notebookId` by listing available notebook IDs.

### 2.6 Resource Error Handling

**Status: IMPROVEMENT-02**

Resources throw plain `Error` on API failures:
```typescript
// src/resources/notebooks.ts:45-47
if (!result.success) {
  throw new Error(
    `OneNote API error [${result.error.code}]: ${result.error.message}`
  );
}
```

Unlike tools (which use `McpError` for auth errors and tool-level error responses for API errors), resources always throw plain `Error`. While not strictly a violation (the SDK will catch and convert this to an error response), using `McpError` with appropriate `ErrorCode` values would be more precise and consistent with the tool error handling pattern.

**Where**: `src/resources/notebooks.ts:45-47`, `src/resources/notebooks.ts:106-109`, `src/resources/sections.ts:44-47`, `src/resources/pages.ts:48-51`, `src/resources/pages.ts:85-88`

**Recommendation**: Use `McpError` with `ErrorCode.InternalError` for general API errors and consider distinguishing auth errors (which should use `ErrorCode.InternalError` or a more specific code) from not-found errors (which could use `ErrorCode.InvalidParams`).

---

## 3. Prompt Registration Audit

### 3.1 API Pattern: `server.registerPrompt()` (v2 API)

**Status: COMPLIANT**

All 3 prompts use `server.registerPrompt(name, config, callback)`. None use the deprecated `server.prompt()` overloads.

Files verified:
- `src/prompts/summarize-page.ts:14` -- `server.registerPrompt("summarize-page", {...}, ...)`
- `src/prompts/search-notes.ts:12` -- `server.registerPrompt("search-notes", {...}, ...)`
- `src/prompts/create-note.ts:12` -- `server.registerPrompt("create-note", {...}, ...)`

### 3.2 Prompt Metadata: `title`, `description`, `argsSchema`

**Status: COMPLIANT**

All prompts provide `title`, `description`, and `argsSchema` using Zod schemas as raw shapes. Arguments have `.describe()` annotations for discoverability.

### 3.3 Prompt Message Structure

**Status: COMPLIANT**

All prompts return `{ messages: [{ role: "user", content: { type: "text", text: "..." } }] }` which is the correct structure for `GetPromptResult`.

### 3.4 Prompt Error Handling

**Status: IMPROVEMENT-03**

The `summarize-page` prompt (`src/prompts/summarize-page.ts:28-39`) catches auth errors and returns them as a user message rather than throwing. While this is valid (prompts can return error text to the user), it means the client cannot programmatically distinguish between a successful prompt response and an error. The `search-notes` and `create-note` prompts do not fetch any data, so they are not affected.

The metadata/content fetch errors in `summarize-page` (`src/prompts/summarize-page.ts:53-84`) are also returned as user messages. This is a reasonable design choice for prompts (the LLM can interpret the error message), but it's inconsistent with how tools handle similar errors.

**Where**: `src/prompts/summarize-page.ts:28-39` and `src/prompts/summarize-page.ts:53-84`

**Recommendation**: Consider throwing `McpError` for auth errors in prompts (to match the tool pattern) and keeping API errors as user messages (since the LLM can provide guidance).

---

## 4. Error Handling Audit

### 4.1 `McpError` with `ErrorCode` Usage

**Status: COMPLIANT (but see note below)**

The error handling in `src/tools/helpers.ts` correctly distinguishes between:
- **Protocol-level errors**: Auth errors (`MISSING_TOKEN`, `UNAUTHORIZED`) are thrown as `McpError` with `ErrorCode.InternalError`
- **Tool-level errors**: All other API errors are returned as `{ content: [...], isError: true }` using the `toolError()` helper

```typescript
// src/tools/helpers.ts:57-63
if (error.code === "MISSING_TOKEN" || error.code === "UNAUTHORIZED") {
  throw new McpError(
    ErrorCode.InternalError,
    `Authentication failed: ${error.message}`
  );
}
```

**Note on `McpError` vs v2 `ProtocolError`**: The SDK v1.26.0 exports `McpError` and `ErrorCode` from `@modelcontextprotocol/sdk/types.js`. The Context7 migration docs mention `ProtocolError` and `SdkError` as v2 replacements, but **these types are NOT exported from SDK v1.26.0**. A search of the installed SDK confirms `ProtocolError` and `SdkError` do not exist in this version. The current `McpError`/`ErrorCode` usage is correct for SDK v1.26.0.

### 4.2 Error Code Correctness

**Status: IMPROVEMENT-04**

All `McpError` throws use `ErrorCode.InternalError`. While this works, some error cases could use more specific codes:

| Current | Better | When |
|---------|--------|------|
| `ErrorCode.InternalError` | `ErrorCode.InvalidParams` | When a tool receives invalid input (e.g., forbidden characters in section name) |
| `ErrorCode.InternalError` | `ErrorCode.InternalError` | Auth errors (correct) |

Currently, input validation errors in `create-section` (`src/tools/create-section.ts:48-52`) return tool-level errors (which is actually fine since the client needs to see these). However, if `getOneNoteClientOrThrow` fails in resources, it throws a plain `Error` rather than `McpError`. This is inconsistent.

**Where**: `src/onenote/client-factory.ts:52-53` throws plain `Error`

**Recommendation**: `getOneNoteClientOrThrow` should throw `McpError(ErrorCode.InternalError, ...)` to provide consistent protocol-level error signaling for authentication failures across tools, resources, and prompts.

### 4.3 Standard Error Codes Coverage

**Status: COMPLIANT**

The SDK's `ErrorCode` enum (in v1.26.0) includes:
- `ConnectionClosed` (-32000)
- `RequestTimeout` (-32001)
- `ParseError` (-32700)
- `InvalidRequest` (-32600)
- `MethodNotFound` (-32601)
- `InvalidParams` (-32602)
- `InternalError` (-32603)
- `UrlElicitationRequired` (-32042)

The server correctly uses `InternalError` for auth failures. The SDK handles `InvalidRequest`, `MethodNotFound`, `ParseError`, and `InvalidParams` for schema validation automatically. The HTTP server manually uses JSON-RPC error codes (`JSONRPC_ERROR_INVALID_REQUEST = -32600`, `JSONRPC_ERROR_INTERNAL = -32603`) which align with the standard codes.

---

## 5. Transport Audit

### 5.1 STDIO Transport

**Status: COMPLIANT**

`src/index.ts:30-34`:
```typescript
async function startStdioServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server running on stdio transport`);
}
```

- Uses `StdioServerTransport` correctly
- Logs to `stderr` (not `stdout`) to avoid corrupting JSON-RPC
- Signal handlers (`SIGTERM`, `SIGINT`) call `server.close()` for graceful shutdown

### 5.2 StreamableHTTP Transport

**Status: COMPLIANT**

`src/server/http-server.ts:314-337` sets up `StreamableHTTPServerTransport` correctly:
- `sessionIdGenerator` generates UUIDs
- `onsessioninitialized` stores sessions for reuse
- `transport.onclose` cleans up sessions
- Unknown session IDs receive HTTP 404 (per MCP Streamable HTTP spec)
- Missing session IDs on non-initialize requests receive HTTP 400
- Uses `isInitializeRequest()` to detect new sessions
- All three HTTP methods are handled: POST (messages), GET (SSE streams), DELETE (session termination)

### 5.3 Session Management

**Status: COMPLIANT**

Session management uses an LRU cache (`src/utils/lru-cache.ts`) with:
- Max 1000 concurrent sessions (`MAX_SESSIONS`)
- 30-minute idle timeout (`SESSION_IDLE_TIMEOUT_MS`)
- Periodic cleanup every 5 minutes
- `touchSession()` updates activity timestamp on each request
- Eviction callback closes transports gracefully

### 5.4 Connection Lifecycle

**Status: COMPLIANT**

- Graceful shutdown handles `SIGINT`/`SIGTERM` on both stdio and HTTP
- HTTP server stops accepting new connections, closes all active sessions, and exits after 5 seconds
- Transport `onclose` callbacks properly clean up session maps

### 5.5 Express App Creation

**Status: COMPLIANT**

Uses `createMcpExpressApp({ host })` from `@modelcontextprotocol/sdk/server/express.js` which provides built-in DNS rebinding protection via host validation.

---

## 6. Server Capabilities Audit

### 6.1 Capabilities Declaration

**Status: IMPROVEMENT-05**

The `McpServer` constructor in `src/index.ts:37-44`:
```typescript
const server = new McpServer(
  { name: SERVER_NAME, version: SERVER_VERSION },
  {
    instructions: "OneNote MCP server providing tools for reading, creating, and " +
      "managing OneNote notebooks, sections, and pages via Microsoft Graph API.",
  }
);
```

No `capabilities` object is provided. The SDK's `McpServer` high-level class automatically declares `tools`, `resources`, and `prompts` capabilities based on what is registered. However, **logging capability must be explicitly declared** if you want to use `server.sendLoggingMessage()`.

Currently the server does NOT declare `capabilities: { logging: {} }`, which means:
1. The server cannot use `sendLoggingMessage()` to send structured log messages to connected clients
2. This is not a violation (logging is optional), but it's a missed opportunity

**Where**: `src/index.ts:37-44`

**Recommendation**: Add `capabilities: { logging: {} }` to the `McpServer` options to enable the logging capability. This allows the server to send structured log messages to clients instead of only using `console.error`.

---

## 7. Available SDK Features Not Yet Used

### ENHANCEMENT-01: Output Schema and Structured Content

**Priority**: Medium
**Available in**: SDK v1.26.0 (`registerTool` config accepts `outputSchema`)

Tools that return well-defined JSON structures could benefit from `outputSchema` and `structuredContent`. This enables clients to programmatically parse tool results without relying on JSON embedded in text.

**Example candidates**:
- `list-notebooks` -- returns an array of notebook objects with known shape
- `get-notebook` -- returns a single notebook object
- `search-pages` -- returns an array of page objects

**How to implement**:
```typescript
server.registerTool("list-notebooks", {
  title: "List Notebooks",
  description: "...",
  inputSchema: {},
  outputSchema: z.object({
    notebooks: z.array(z.object({
      id: z.string(),
      displayName: z.string(),
      // ...
    }))
  }),
  annotations: { ... },
}, async (_args, extra) => {
  // ...
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: { notebooks: data },
  };
});
```

### ENHANCEMENT-02: Embedded Resource References in Tool Responses

**Priority**: Low
**Available in**: SDK v1.26.0 (content items support `type: "resource"`)

The MCP spec allows tool responses to include embedded resources. For example, `get-page-content` could return an embedded resource reference:
```typescript
return {
  content: [
    { type: "text", text: htmlContent },
    {
      type: "resource",
      resource: {
        uri: `onenote://pages/${pageId}`,
        mimeType: "text/html",
        text: htmlContent,
      }
    }
  ],
};
```

This would allow clients to cache the resource and avoid re-fetching.

### ENHANCEMENT-03: Resource Template Completion/Autocomplete

**Priority**: Medium
**Available in**: SDK v1.26.0 (`ResourceTemplate` constructor accepts `complete` callbacks)

The `ResourceTemplate` constructor supports a `complete` property that maps variable names to autocomplete callbacks. This enables clients to offer suggestions as users type URI template variables.

**Example**:
```typescript
new ResourceTemplate("onenote://notebooks/{notebookId}", {
  list: async (extra) => { ... },
  complete: {
    notebookId: async (value) => {
      // Return notebook IDs that start with `value`
      const client = await getOneNoteClientOrThrow(extra);
      const result = await client.request<GraphODataCollection<GraphNotebook>>({...});
      return result.data.value
        .filter(nb => nb.id.startsWith(value))
        .map(nb => nb.id);
    }
  }
})
```

**Where**: `src/resources/notebooks.ts:64`, `src/resources/sections.ts:27`, `src/resources/pages.ts:28`, `src/resources/pages.ts:68`

### ENHANCEMENT-04: Logging Capability

**Priority**: High
**Available in**: SDK v1.26.0 (`McpServer.sendLoggingMessage()`)

The SDK provides `server.sendLoggingMessage()` for sending structured log messages to connected clients. This is more useful than `console.error` because:
1. Clients can display or filter log messages in their UI
2. Log levels are respected (debug, info, warning, error)
3. Logger names help identify the source

**How to implement**:
1. Declare logging capability: `capabilities: { logging: {} }`
2. Replace key `console.error` calls with `server.sendLoggingMessage`:
```typescript
await server.sendLoggingMessage({
  level: "info",
  data: "Fetching notebooks from Microsoft Graph",
  logger: "onenote-mcp",
});
```

**Where**: `src/index.ts:37-44` (capability declaration) and throughout tool/resource handlers

### ENHANCEMENT-05: Progress Notifications for Long-Running Operations

**Priority**: Medium
**Available in**: SDK v1.26.0 (via `extra` context in request handlers)

The `get-notebook-hierarchy` tool recursively fetches potentially many API pages. Long-running tools like this could send progress notifications to the client. The `extra` parameter in tool callbacks provides access to the request context, which can be used to send progress updates via the underlying server.

**Where**: `src/tools/get-notebook-hierarchy.ts:93`

**Note**: Progress notifications require the client to send a `_meta.progressToken` in the tool call request. The server can then send `notifications/progress` with the token and current progress.

### ENHANCEMENT-06: Resource Subscriptions

**Priority**: Low
**Available in**: SDK v1.26.0 (`resources.subscribe` capability)

The server could allow clients to subscribe to resource changes. When a notebook, section, or page is modified through a tool (e.g., `create-page`, `update-page`, `delete-page`), the server could notify subscribed clients that the relevant resources have changed.

**How to implement**:
1. Declare capability: `capabilities: { resources: { subscribe: true, listChanged: true } }`
2. After mutation tools complete, call `server.sendResourceListChanged()`
3. Implement resource subscription handlers

### ENHANCEMENT-07: Prompt Completion/Autocomplete

**Priority**: Low
**Available in**: SDK v1.26.0 (handled automatically by `McpServer` via `setCompletionRequestHandler`)

The SDK's `McpServer` class automatically handles `completion/complete` requests for prompt arguments and resource template variables when completions are available. If prompts had completion callbacks, clients could offer suggestions for arguments like `pageId`.

### ENHANCEMENT-08: `_meta` Field on Tool Registration

**Priority**: Low
**Available in**: SDK v1.26.0 (`registerTool` config accepts `_meta`)

Tools can include arbitrary metadata via the `_meta` field that could be used for documentation links, versioning, or other custom data.

### ENHANCEMENT-09: Elicitation Support

**Priority**: Low
**Available in**: SDK v1.26.0 (server-side via `ctx.mcpReq.elicitInput()`)

The SDK supports requesting user input via forms during tool execution. This could be useful for tools like `delete-page` (confirming destructive action) or `create-page` (gathering additional details).

**Note**: This requires the client to declare elicitation support in its capabilities.

### ENHANCEMENT-10: `sendToolListChanged` / `sendResourceListChanged` / `sendPromptListChanged`

**Priority**: Low
**Available in**: SDK v1.26.0 (`McpServer` methods)

The server exposes `sendToolListChanged()`, `sendResourceListChanged()`, and `sendPromptListChanged()` methods. These are useful if tools, resources, or prompts are dynamically added/removed at runtime. Currently the server registers everything at startup, so these are not needed unless dynamic registration is added later.

---

## 8. Zod Import Pattern

### Status: COMPLIANT

All files import Zod as:
```typescript
import { z } from "zod";
```

The SDK v1.26.0 README states: *"This SDK has a required peer dependency on `zod` for schema validation. The SDK internally imports from `zod/v4`, but maintains backwards compatibility with projects using Zod v3.25 or later."*

The project uses `zod` version 4.3.6 (which provides `zod/v4` natively), and the import path `"zod"` resolves correctly. The SDK's internal `zod/v4` import is compatible with this version. No issues found.

---

## Summary of Findings

### Improvements (should fix)

| ID | Category | Severity | Location | Description |
|----|----------|----------|----------|-------------|
| IMPROVEMENT-01 | Resources | Should Fix | `src/resources/sections.ts:28`, `src/resources/pages.ts:29,69` | Template resources pass `list: undefined` -- sections and pages cannot be discovered via `resources/list`. Consider implementing `list` callbacks for at least the `section-pages` template (by requiring a default section or listing recent pages). |
| IMPROVEMENT-02 | Resources | Should Fix | `src/resources/notebooks.ts:45`, `src/resources/sections.ts:44`, `src/resources/pages.ts:48,85` | Resources throw plain `Error` instead of `McpError` for API failures. Use `McpError` for consistency with tool error handling. |
| IMPROVEMENT-03 | Prompts | Should Fix | `src/prompts/summarize-page.ts:28-39` | Auth errors in prompts are returned as user messages instead of thrown as `McpError`. Consider throwing for auth errors (protocol-level) and keeping API errors as user messages. |
| IMPROVEMENT-04 | Errors | Should Fix | `src/onenote/client-factory.ts:52-53` | `getOneNoteClientOrThrow` throws plain `Error` on auth failure. Should throw `McpError(ErrorCode.InternalError, ...)` for consistent protocol-level error handling. |
| IMPROVEMENT-05 | Capabilities | Should Fix | `src/index.ts:37-44` | No `capabilities` object is provided in `McpServer` options. While the SDK auto-declares tools/resources/prompts, `logging` must be explicitly declared to use `sendLoggingMessage`. |

### Enhancements (nice to have)

| ID | Category | Priority | Description |
|----|----------|----------|-------------|
| ENHANCEMENT-01 | Tools | Medium | Add `outputSchema` and `structuredContent` to tools with well-defined return shapes. |
| ENHANCEMENT-02 | Tools | Low | Return embedded resource references (`type: "resource"`) in content-fetching tools. |
| ENHANCEMENT-03 | Resources | Medium | Add `complete` callbacks to `ResourceTemplate` constructors for URI variable autocomplete. |
| ENHANCEMENT-04 | Server | High | Enable logging capability and use `server.sendLoggingMessage()` for structured client-visible logs. |
| ENHANCEMENT-05 | Tools | Medium | Send progress notifications for long-running tools like `get-notebook-hierarchy`. |
| ENHANCEMENT-06 | Resources | Low | Implement resource subscriptions so clients are notified when mutations occur. |
| ENHANCEMENT-07 | Prompts | Low | Add completion callbacks for prompt argument autocomplete (e.g., `pageId`). |
| ENHANCEMENT-08 | Tools | Low | Use `_meta` field for tool metadata (documentation links, version info). |
| ENHANCEMENT-09 | Tools | Low | Leverage elicitation for destructive operations (e.g., confirm before `delete-page`). |
| ENHANCEMENT-10 | Server | Low | Use `sendResourceListChanged()` after mutation tools to notify clients of changes. |

### Compliance Matrix

| Area | Status |
|------|--------|
| Tool registration API (v2) | Compliant |
| Tool `title` and `description` | Compliant |
| Tool `inputSchema` | Compliant |
| Tool `annotations` | Compliant |
| Tool error handling | Compliant |
| Resource registration API (v2) | Compliant |
| Resource `title`, `description`, `mimeType` | Compliant |
| Resource URI templates | Compliant |
| Resource `list` callbacks | Partial (IMPROVEMENT-01) |
| Prompt registration API (v2) | Compliant |
| Prompt `title`, `description`, `argsSchema` | Compliant |
| Prompt message structure | Compliant |
| Error handling (`McpError`/`ErrorCode`) | Compliant (IMPROVEMENT-02/03/04 for consistency) |
| STDIO transport | Compliant |
| StreamableHTTP transport | Compliant |
| Session management | Compliant |
| Connection lifecycle | Compliant |
| OAuth auth flow | Compliant |
| Zod import compatibility | Compliant |
| Server capabilities declaration | Partial (IMPROVEMENT-05) |
| Logging capability | Not used (ENHANCEMENT-04) |
| Output schema / structured content | Not used (ENHANCEMENT-01) |
| Resource autocomplete | Not used (ENHANCEMENT-03) |
| Progress notifications | Not used (ENHANCEMENT-05) |
| Resource subscriptions | Not used (ENHANCEMENT-06) |
| Elicitation | Not used (ENHANCEMENT-09) |

---

## Appendix: SDK Version Notes

The installed `@modelcontextprotocol/sdk` version is **1.26.0**. Key observations about this version:

1. **v2 API is available**: `registerTool`, `registerResource`, `registerPrompt` are all present. The old `tool()`, `resource()`, `prompt()` methods exist but are marked `@deprecated`.

2. **`McpError` is the error class**: The v2 migration docs on Context7 mention `ProtocolError` and `SdkError`, but these are NOT exported from SDK v1.26.0. The server correctly uses `McpError` and `ErrorCode` from `@modelcontextprotocol/sdk/types.js`.

3. **`createMcpExpressApp`** is available from `@modelcontextprotocol/sdk/server/express.js` and is used correctly for DNS rebinding protection.

4. **`sendLoggingMessage`** is available on `McpServer` class but requires `capabilities: { logging: {} }` to be declared.

5. **Experimental features**: The SDK includes `ExperimentalMcpServerTasks` for task-based tool execution, but this is experimental and not recommended for production use.

6. **Zod v4 compatibility**: The SDK imports from `zod/v4` internally. The project uses `zod` 4.3.6 which is fully compatible.
