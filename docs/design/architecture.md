# Stage 2 Architecture Design: OneNote MCP Server

> **Version:** 1.0
> **Date:** 2026-02-16
> **Status:** Design / Pre-Implementation
> **Target:** Implementation agents building from this specification

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tools Design](#2-tools-design)
3. [Resources Design](#3-resources-design)
4. [Prompts Design](#4-prompts-design)
5. [Shared Utilities Design](#5-shared-utilities-design)
6. [Graph API Type Definitions](#6-graph-api-type-definitions)
7. [File Organization](#7-file-organization)
8. [Permissions / Scopes](#8-permissions--scopes)
9. [Implementation Priority](#9-implementation-priority)

---

## 1. Overview

### 1.1 What Stage 1 Provides

The Stage 1 scaffold delivers:

- **OAuth authentication**: Full token lifecycle (env var, cache, refresh, interactive) via `src/onenote/auth.ts`
- **Graph API client**: `OneNoteClient` with typed `request<T>()` method, error mapping, timeout handling in `src/onenote/client.ts`
- **Client factory**: `getOneNoteClientOrThrow(extra)` for use in tool/resource/prompt callbacks in `src/onenote/client-factory.ts`
- **Result type pattern**: `OneNoteResult<T>` discriminated union in `src/onenote/types.ts`
- **Empty registrars**: `registerTools()`, `registerResources()`, `registerPrompts()` ready to receive implementations
- **HTML utilities**: `escapeHtml()` in `src/utils/html.ts`
- **Constants**: Graph base URL, timeouts, OAuth defaults in `src/constants.ts`

### 1.2 What Stage 2 Builds

Stage 2 fills the empty registrars with:

- **16 tools** covering all OneNote CRUD operations available via the Graph v1.0 API
- **5 resources** providing URI-addressable access to OneNote data
- **3 prompts** for guided LLM workflows
- **Shared utilities** for pagination, error mapping, response formatting, and HTML processing
- **TypeScript type definitions** for all Graph API response objects

### 1.3 Key API Constraints Shaping This Design

These constraints from the research phase directly influence the tool design:

| Constraint | Impact |
|---|---|
| No update/rename/delete for notebooks, sections, section groups | Only expose `create` + `read` tools for these entities. No `update-notebook`, `delete-section`, etc. |
| Pages support full CRUD | Expose create, read, update (PATCH), delete for pages. |
| `$search` not supported on OneNote endpoints | The `search-pages` tool uses the `search` query parameter on the pages endpoint (which IS supported) rather than `$search`. For title search, use `$filter` with `contains(tolower(title),'term')`. |
| App-only auth deprecated since March 2025 | All operations use delegated auth via `/me/onenote/...` paths. No `/users/{id}/onenote/` support needed. |
| MCP SDK v2 uses `server.registerTool()` | All registrations use the config-based v2 API, not the deprecated `server.tool()`. |
| Default page size 20, max 100 | Pagination helper auto-follows `@odata.nextLink`. Tools expose optional `top` parameter, capped at 100. |
| `GET /me/onenote/pages` can fail with 400 on accounts with many sections | The `list-pages` tool requires a `sectionId` parameter (not optional) to avoid this failure mode. A separate `search-pages` tool provides cross-section search. |

---

## 2. Tools Design

All tools use `server.registerTool()` with the v2 config-based API. Each tool follows a consistent pattern:

1. Validate input (Zod handles structural validation; tool logic handles semantic validation)
2. Obtain client via `getOneNoteClientOrThrow(extra)`
3. Call Graph API via `client.request<T>()`
4. Handle errors using `handleApiResult()` helper
5. Return formatted `CallToolResult`

### 2.1 Notebook Tools

#### `list-notebooks`

| Property | Value |
|---|---|
| **Name** | `list-notebooks` |
| **Description** | `"List all OneNote notebooks accessible to the authenticated user. Returns notebook names, IDs, and metadata. Use this to discover available notebooks before accessing sections or pages."` |
| **Input Schema** | None (no parameters) |
| **Output Format** | JSON array of notebook objects with `id`, `displayName`, `createdDateTime`, `lastModifiedDateTime`, `isDefault`, `isShared`, `userRole`, and `links` |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | `GET /me/onenote/notebooks` |
| **OData Parameters** | `$select=id,displayName,createdDateTime,lastModifiedDateTime,isDefault,isShared,userRole,links` |
| **Error Scenarios** | 401 Unauthorized (expired token), 403 Forbidden (insufficient scopes), 429 Rate Limited |

#### `get-notebook`

| Property | Value |
|---|---|
| **Name** | `get-notebook` |
| **Description** | `"Get detailed information about a specific OneNote notebook by its ID, including its sections and section groups. Use list-notebooks first to find the notebook ID."` |
| **Input Schema** | `{ notebookId: z.string().describe("The unique identifier of the notebook") }` |
| **Output Format** | JSON notebook object with expanded `sections` and `sectionGroups` |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | `GET /me/onenote/notebooks/{notebookId}?$expand=sections,sectionGroups` |
| **Error Scenarios** | 404 Not Found (invalid notebook ID), 401, 403, 429 |

### 2.2 Section Group Tools

#### `list-section-groups`

| Property | Value |
|---|---|
| **Name** | `list-section-groups` |
| **Description** | `"List section groups. When notebookId is provided, lists section groups in that notebook. Otherwise lists all section groups across all notebooks."` |
| **Input Schema** | `{ notebookId: z.string().optional().describe("Optional notebook ID to scope the listing. Omit to list all section groups.") }` |
| **Output Format** | JSON array of section group objects with `id`, `displayName`, `createdDateTime`, `lastModifiedDateTime`, and parent info |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | If `notebookId` provided: `GET /me/onenote/notebooks/{notebookId}/sectionGroups`. Otherwise: `GET /me/onenote/sectionGroups` |
| **OData Parameters** | `$select=id,displayName,createdDateTime,lastModifiedDateTime,sectionsUrl,sectionGroupsUrl,self` |
| **Error Scenarios** | 404 (invalid notebookId), 401, 403, 429 |

#### `get-section-group`

| Property | Value |
|---|---|
| **Name** | `get-section-group` |
| **Description** | `"Get detailed information about a specific section group, including its sections and nested section groups."` |
| **Input Schema** | `{ sectionGroupId: z.string().describe("The unique identifier of the section group") }` |
| **Output Format** | JSON section group object with expanded `sections` and `sectionGroups` |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | `GET /me/onenote/sectionGroups/{sectionGroupId}?$expand=sections,sectionGroups` |
| **Error Scenarios** | 404 Not Found, 401, 403, 429 |

### 2.3 Section Tools

#### `list-sections`

| Property | Value |
|---|---|
| **Name** | `list-sections` |
| **Description** | `"List sections. Provide notebookId to list sections in a notebook, sectionGroupId to list sections in a section group, or omit both to list all sections across all notebooks."` |
| **Input Schema** | `{ notebookId: z.string().optional().describe("Notebook ID to scope the listing"), sectionGroupId: z.string().optional().describe("Section group ID to scope the listing. Takes precedence over notebookId if both are provided.") }` |
| **Output Format** | JSON array of section objects with `id`, `displayName`, `isDefault`, `createdDateTime`, `lastModifiedDateTime`, `pagesUrl`, `links`, and parent info |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | With `sectionGroupId`: `GET /me/onenote/sectionGroups/{sectionGroupId}/sections`. With `notebookId`: `GET /me/onenote/notebooks/{notebookId}/sections`. Neither: `GET /me/onenote/sections` |
| **OData Parameters** | `$select=id,displayName,isDefault,createdDateTime,lastModifiedDateTime,pagesUrl,links,self` |
| **Error Scenarios** | 404 (invalid parent ID), 401, 403, 429 |

**Validation logic**: If both `notebookId` and `sectionGroupId` are provided, `sectionGroupId` takes precedence (more specific scope).

#### `get-section`

| Property | Value |
|---|---|
| **Name** | `get-section` |
| **Description** | `"Get detailed information about a specific section by its ID, including its parent notebook."` |
| **Input Schema** | `{ sectionId: z.string().describe("The unique identifier of the section") }` |
| **Output Format** | JSON section object with expanded `parentNotebook` |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | `GET /me/onenote/sections/{sectionId}?$expand=parentNotebook` |
| **Error Scenarios** | 404, 401, 403, 429 |

#### `create-section`

| Property | Value |
|---|---|
| **Name** | `create-section` |
| **Description** | `"Create a new section. Provide notebookId to create in a notebook, or sectionGroupId to create inside a section group. Exactly one parent must be specified. Section names must be unique within the same hierarchy level, max 50 characters, and cannot contain: ? * / : < > | & # ' % ~"` |
| **Input Schema** | `{ displayName: z.string().min(1).max(50).describe("Name for the new section (max 50 characters)"), notebookId: z.string().optional().describe("ID of the notebook to create the section in"), sectionGroupId: z.string().optional().describe("ID of the section group to create the section in. Takes precedence over notebookId.") }` |
| **Output Format** | JSON of the newly created section object |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: false` |
| **Graph API Endpoint** | With `sectionGroupId`: `POST /me/onenote/sectionGroups/{sectionGroupId}/sections`. With `notebookId`: `POST /me/onenote/notebooks/{notebookId}/sections` |
| **Request Body** | `{ "displayName": "{displayName}" }` |
| **Error Scenarios** | 409 Conflict (duplicate name), 400 Bad Request (invalid name characters), 404 (invalid parent ID), 401, 403, 429 |

**Validation logic**: Exactly one of `notebookId` or `sectionGroupId` must be provided. If neither or both are provided, return a tool-level error with a clear message.

### 2.4 Page Tools

#### `list-pages`

| Property | Value |
|---|---|
| **Name** | `list-pages` |
| **Description** | `"List pages in a specific section. Returns page titles, IDs, and metadata. Always specify a sectionId to avoid errors on accounts with many sections."` |
| **Input Schema** | `{ sectionId: z.string().describe("The section ID to list pages from"), top: z.number().int().min(1).max(100).optional().describe("Maximum number of pages to return (1-100, default 20)") }` |
| **Output Format** | JSON array of page objects with `id`, `title`, `createdDateTime`, `lastModifiedDateTime`, `order`, `level`, `links`, and parent section info |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | `GET /me/onenote/sections/{sectionId}/pages` |
| **OData Parameters** | `$select=id,title,createdDateTime,lastModifiedDateTime,order,level,links,self`, `$top={top}`, `pagelevel=true` |
| **Pagination** | Auto-follows `@odata.nextLink` until all pages are retrieved or `top` is satisfied. If `top` is specified, pass it as `$top` and do NOT follow nextLink (single page of results). If `top` is omitted, follow all `@odata.nextLink` to return the complete list. |
| **Error Scenarios** | 404 (invalid sectionId), 401, 403, 429 |

#### `get-page`

| Property | Value |
|---|---|
| **Name** | `get-page` |
| **Description** | `"Get metadata for a specific OneNote page by its ID. Returns title, timestamps, and parent info but NOT the page content. Use get-page-content to retrieve the actual HTML content."` |
| **Input Schema** | `{ pageId: z.string().describe("The unique identifier of the page") }` |
| **Output Format** | JSON page object with `id`, `title`, `createdDateTime`, `lastModifiedDateTime`, `level`, `order`, `links`, parent section/notebook info |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | `GET /me/onenote/pages/{pageId}?pagelevel=true&$expand=parentSection,parentNotebook` |
| **Error Scenarios** | 404, 401, 403, 429 |

#### `get-page-content`

| Property | Value |
|---|---|
| **Name** | `get-page-content` |
| **Description** | `"Get the full HTML content of a OneNote page. The content is returned as HTML which represents the page's text, images, tables, and formatting. Use includeIds=true if you plan to update the page afterward."` |
| **Input Schema** | `{ pageId: z.string().describe("The unique identifier of the page"), includeIds: z.boolean().optional().default(false).describe("If true, includes generated element IDs needed for PATCH update operations") }` |
| **Output Format** | The page HTML content as a text content block. The tool returns the raw HTML string (not JSON-wrapped). |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | `GET /me/onenote/pages/{pageId}/content` (with `?includeIDs=true` when `includeIds` is true) |
| **Request Headers** | Override `Accept: text/html` for this endpoint (the client defaults to `application/json`) |
| **Error Scenarios** | 404, 401, 403, 429 |

**Implementation note**: This endpoint returns HTML, not JSON. The `OneNoteClient.request<T>()` method parses JSON. A new method or special handling is needed. Two options:

- **Option A (recommended)**: Add a `requestRaw(options): Promise<OneNoteResult<string>>` method to `OneNoteClient` that returns the raw response body as a string without JSON parsing. This is cleaner and avoids hacking around the existing `request<T>()`.
- **Option B**: Use the existing method but detect the "non-JSON response" error and instead treat the raw text as the result. This is fragile.

Choose Option A: add `requestRaw()` to `OneNoteClient`.

#### `get-page-preview`

| Property | Value |
|---|---|
| **Name** | `get-page-preview` |
| **Description** | `"Get a text preview of a OneNote page (up to 300 characters). Useful for quickly scanning page content without fetching the full HTML."` |
| **Input Schema** | `{ pageId: z.string().describe("The unique identifier of the page") }` |
| **Output Format** | JSON object with `previewText` property (string, up to 300 chars) |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | `GET /me/onenote/pages/{pageId}/preview` |
| **Error Scenarios** | 404, 401, 403, 429 |

#### `create-page`

| Property | Value |
|---|---|
| **Name** | `create-page` |
| **Description** | `"Create a new page in a OneNote section. The content should be provided as HTML. The HTML must be valid XHTML with a title in the <title> tag. At minimum, provide a title; the body can be empty for a blank page."` |
| **Input Schema** | `{ sectionId: z.string().describe("The section ID to create the page in"), title: z.string().min(1).describe("The title for the new page"), content: z.string().optional().describe("HTML body content for the page. If omitted, creates a page with only the title. Do not include <html>, <head>, or <body> tags -- only the inner body content (e.g., '<p>Hello world</p>').") }` |
| **Output Format** | JSON of the newly created page object (metadata, not content) |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: false` |
| **Graph API Endpoint** | `POST /me/onenote/sections/{sectionId}/pages` |
| **Request Headers** | `Content-Type: application/xhtml+xml` (NOT `application/json`) |
| **Request Body** | Constructed HTML: `<!DOCTYPE html><html><head><title>{title}</title></head><body>{content}</body></html>` |
| **Error Scenarios** | 404 (invalid sectionId), 400 (malformed HTML), 507 (section page limit reached), 401, 403, 429 |

**Implementation note**: This endpoint expects raw HTML in the request body, NOT JSON. The `OneNoteClient.request()` method always sets `Content-Type: application/json` and JSON-stringifies the body. A new method `requestHtml(options)` is needed, or the existing `requestRaw()` method should accept custom headers and raw string bodies. **Recommendation**: Extend `RequestOptions` to support `rawBody: string` and `contentType: string` overrides, and update `OneNoteClient.request()` to handle these.

#### `update-page`

| Property | Value |
|---|---|
| **Name** | `update-page` |
| **Description** | `"Update the content of an existing OneNote page using JSON patch commands. Each patch specifies a target element, an action (append, insert, replace), and content. Before updating, use get-page-content with includeIds=true to get element IDs for targeting."` |
| **Input Schema** | `{ pageId: z.string().describe("The unique identifier of the page to update"), patches: z.array(z.object({ target: z.string().describe("Target element ID. Use '#data-id' for custom IDs, generated IDs as-is (no # prefix), 'body' for the first div, or 'title' for the page title"), action: z.enum(["append", "prepend", "insert", "replace"]).describe("The update action to perform"), position: z.enum(["before", "after"]).optional().describe("Position relative to target. For append: 'before' = first child, 'after' = last child (default). For insert: 'before' or 'after' (default) the target."), content: z.string().describe("HTML content string or plain text (for title replace)") })).min(1).describe("Array of patch operations to apply to the page") }` |
| **Output Format** | Success message text (the API returns 204 No Content on success) |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: false` |
| **Graph API Endpoint** | `PATCH /me/onenote/pages/{pageId}/content` |
| **Request Headers** | `Content-Type: application/json` |
| **Request Body** | The `patches` array directly (it is already in the Graph API's expected JSON patch format) |
| **Error Scenarios** | 404 (page not found), 400 (invalid patch format, invalid target ID), 401, 403, 429 |

#### `delete-page`

| Property | Value |
|---|---|
| **Name** | `delete-page` |
| **Description** | `"Permanently delete a OneNote page. This action cannot be undone. The page is immediately and permanently removed."` |
| **Input Schema** | `{ pageId: z.string().describe("The unique identifier of the page to delete") }` |
| **Output Format** | Success message text (the API returns 204 No Content) |
| **Annotations** | `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | `DELETE /me/onenote/pages/{pageId}` |
| **Error Scenarios** | 404 (page not found or already deleted), 401, 403, 429 |

#### `search-pages`

| Property | Value |
|---|---|
| **Name** | `search-pages` |
| **Description** | `"Search for OneNote pages by keyword. Searches page titles and content (including OCR text from images). Optionally scope the search to a specific section. Returns matching page metadata."` |
| **Input Schema** | `{ query: z.string().min(1).describe("Search query string to find in page titles and content"), sectionId: z.string().optional().describe("Optional section ID to scope the search to a specific section"), top: z.number().int().min(1).max(100).optional().describe("Maximum number of results to return (1-100, default 20)") }` |
| **Output Format** | JSON array of matching page objects with `id`, `title`, `createdDateTime`, `lastModifiedDateTime`, `links`, and parent section info |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | With `sectionId`: `GET /me/onenote/sections/{sectionId}/pages?search={query}`. Without: `GET /me/onenote/pages?search={query}` |
| **OData Parameters** | `$select=id,title,createdDateTime,lastModifiedDateTime,links,self`, `$top={top}`, `search={query}` |
| **Error Scenarios** | 404 (invalid sectionId), 400 (error 20266 if too many sections without sectionId), 401, 403, 429 |

**Implementation note**: The `search` parameter is a OneNote-specific query parameter (not OData `$search`). It is appended as a regular query parameter. The Graph API pages endpoint supports this parameter for full-text content search including OCR. When `sectionId` is omitted and the user has many sections, this can fail with error code 20266 -- the tool should catch this and return a helpful message suggesting the user narrow search to a specific section.

### 2.5 Navigation Tool

#### `get-notebook-hierarchy`

| Property | Value |
|---|---|
| **Name** | `get-notebook-hierarchy` |
| **Description** | `"Get the complete hierarchy of all notebooks, section groups, and sections in a single call. Returns a tree structure: Notebooks > Section Groups > Sections (recursively for nested section groups). This is the most efficient way to understand the user's OneNote organization."` |
| **Input Schema** | None (no parameters) |
| **Output Format** | JSON array of notebook objects, each with expanded `sections` and `sectionGroups` (recursively expanded with nested sections and section groups) |
| **Annotations** | `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| **Graph API Endpoint** | `GET /me/onenote/notebooks?$expand=sections($select=id,displayName,isDefault,pagesUrl,self),sectionGroups($expand=sections($select=id,displayName,isDefault,pagesUrl,self),sectionGroups($levels=max;$expand=sections($select=id,displayName,isDefault,pagesUrl,self)))` |
| **OData Parameters** | `$select=id,displayName,isDefault,isShared,userRole,self` on the root notebooks, with the `$expand` described above |
| **Error Scenarios** | 401, 403, 429 |

**Implementation note**: The Graph API supports recursive `$expand` with `$levels=max`. The full expand string should be built as a constant. This is a single API call that returns the entire notebook structure. For users with very large OneNote libraries, this response could be large, but it is the recommended approach per Microsoft best practices ("use `$expand` instead of multiple calls").

### 2.6 Tool Summary Table

| Tool | Category | Read/Write | Destructive |
|---|---|---|---|
| `list-notebooks` | Notebook | Read | No |
| `get-notebook` | Notebook | Read | No |
| `list-section-groups` | Section Group | Read | No |
| `get-section-group` | Section Group | Read | No |
| `list-sections` | Section | Read | No |
| `get-section` | Section | Read | No |
| `create-section` | Section | Write | No |
| `list-pages` | Page | Read | No |
| `get-page` | Page | Read | No |
| `get-page-content` | Page | Read | No |
| `get-page-preview` | Page | Read | No |
| `create-page` | Page | Write | No |
| `update-page` | Page | Write | No |
| `delete-page` | Page | Write | Yes |
| `search-pages` | Page | Read | No |
| `get-notebook-hierarchy` | Navigation | Read | No |

---

## 3. Resources Design

Resources provide URI-addressable access to OneNote data. They are useful for clients that support resource subscriptions and for embedding data references in conversations.

### 3.1 `onenote://notebooks`

| Property | Value |
|---|---|
| **Type** | Static resource |
| **URI** | `onenote://notebooks` |
| **Name** | `notebooks-list` |
| **Title** | `"OneNote Notebooks"` |
| **Description** | `"List of all OneNote notebooks accessible to the authenticated user"` |
| **MIME Type** | `application/json` |
| **Returns** | JSON array of notebook objects (same as `list-notebooks` tool output) |
| **Graph API** | `GET /me/onenote/notebooks?$select=id,displayName,createdDateTime,lastModifiedDateTime,isDefault,isShared,userRole,links` |

### 3.2 `onenote://notebooks/{notebookId}`

| Property | Value |
|---|---|
| **Type** | Resource template |
| **URI Template** | `onenote://notebooks/{notebookId}` |
| **Name** | `notebook` |
| **Title** | `"OneNote Notebook"` |
| **Description** | `"A specific OneNote notebook with its sections and section groups"` |
| **MIME Type** | `application/json` |
| **Returns** | JSON notebook object with expanded `sections` and `sectionGroups` |
| **Graph API** | `GET /me/onenote/notebooks/{notebookId}?$expand=sections,sectionGroups` |
| **List callback** | Fetches all notebooks and returns `{ uri, name, mimeType }` for each |

### 3.3 `onenote://notebooks/{notebookId}/sections`

| Property | Value |
|---|---|
| **Type** | Resource template |
| **URI Template** | `onenote://notebooks/{notebookId}/sections` |
| **Name** | `notebook-sections` |
| **Title** | `"Notebook Sections"` |
| **Description** | `"Sections in a specific OneNote notebook"` |
| **MIME Type** | `application/json` |
| **Returns** | JSON array of section objects within the specified notebook |
| **Graph API** | `GET /me/onenote/notebooks/{notebookId}/sections?$select=id,displayName,isDefault,createdDateTime,lastModifiedDateTime,pagesUrl,links,self` |
| **List callback** | `undefined` (cannot efficiently enumerate all notebook-section combinations) |

### 3.4 `onenote://sections/{sectionId}/pages`

| Property | Value |
|---|---|
| **Type** | Resource template |
| **URI Template** | `onenote://sections/{sectionId}/pages` |
| **Name** | `section-pages` |
| **Title** | `"Section Pages"` |
| **Description** | `"Pages in a specific OneNote section"` |
| **MIME Type** | `application/json` |
| **Returns** | JSON array of page metadata objects within the specified section |
| **Graph API** | `GET /me/onenote/sections/{sectionId}/pages?$select=id,title,createdDateTime,lastModifiedDateTime,order,level,links,self&pagelevel=true` |
| **List callback** | `undefined` (cannot efficiently enumerate all section-page combinations) |

### 3.5 `onenote://pages/{pageId}`

| Property | Value |
|---|---|
| **Type** | Resource template |
| **URI Template** | `onenote://pages/{pageId}` |
| **Name** | `page-content` |
| **Title** | `"OneNote Page"` |
| **Description** | `"The HTML content of a specific OneNote page"` |
| **MIME Type** | `text/html` |
| **Returns** | Raw HTML content of the page |
| **Graph API** | `GET /me/onenote/pages/{pageId}/content` |
| **List callback** | `undefined` (cannot efficiently enumerate all pages) |

---

## 4. Prompts Design

Prompts provide reusable message templates for common LLM workflows. Per the MCP specification, all prompt arguments are strings.

### 4.1 `summarize-page`

| Property | Value |
|---|---|
| **Name** | `summarize-page` |
| **Title** | `"Summarize Page"` |
| **Description** | `"Summarize the content of a specific OneNote page. Fetches the page content and generates a structured summary."` |
| **Arguments** | `{ pageId: z.string().describe("The ID of the OneNote page to summarize") }` |

**Callback logic**:

1. Obtain client via `getOneNoteClientOrThrow(extra)`
2. Fetch page metadata: `GET /me/onenote/pages/{pageId}?$expand=parentSection`
3. Fetch page content: `GET /me/onenote/pages/{pageId}/content`
4. Construct and return a multi-part prompt message

**Returned messages**:

```typescript
{
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `Please summarize the following OneNote page.

Page title: ${pageTitle}
Section: ${sectionName}
Last modified: ${lastModified}

Page content (HTML):
${htmlContent}

Provide:
1. A concise summary (2-3 sentences)
2. Key points or topics covered
3. Any action items or follow-ups mentioned
4. Notable dates, names, or references`,
      },
    },
  ],
}
```

**Error handling**: If page content cannot be fetched, return a message explaining the error and asking the user to verify the page ID.

### 4.2 `search-notes`

| Property | Value |
|---|---|
| **Name** | `search-notes` |
| **Title** | `"Search Notes"` |
| **Description** | `"Help the user search across their OneNote notes. Guides through a search workflow using available tools."` |
| **Arguments** | `{ query: z.string().describe("What the user is looking for in their notes"), scope: z.string().optional().describe("Optional: 'all' to search everywhere, or a notebook name to narrow scope") }` |

**Callback logic**: This prompt does NOT call the API itself. It constructs a message that guides the LLM to use the appropriate tools.

**Returned messages**:

```typescript
{
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `I want to search my OneNote notes for: "${query}"
${scope ? `Scope: ${scope}` : "Search across all my notebooks."}

Please help me find relevant notes by:
1. First, use the search-pages tool to search for "${query}"${scope && scope !== "all" ? ` (you may need to use list-notebooks and list-sections first to find the right section ID for the "${scope}" notebook)` : ""}
2. For each relevant result, use get-page-preview to show me a preview of the content
3. Summarize what you found and ask if I want to see the full content of any specific page`,
      },
    },
  ],
}
```

### 4.3 `create-note`

| Property | Value |
|---|---|
| **Name** | `create-note` |
| **Title** | `"Create Note"` |
| **Description** | `"Guide the user through creating a new OneNote page. Helps select the target notebook and section, then creates the page."` |
| **Arguments** | `{ topic: z.string().describe("The topic or subject for the new note"), content: z.string().optional().describe("Optional initial content or outline for the note") }` |

**Callback logic**: Constructs a message guiding the LLM to use the available tools.

**Returned messages**:

```typescript
{
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `I want to create a new OneNote page about: "${topic}"
${content ? `\nHere's what I want in the note:\n${content}` : ""}

Please help me create this note by:
1. Use list-notebooks to show me my available notebooks
2. Ask me which notebook to use (or suggest the most appropriate one)
3. Use list-sections to show me the sections in the chosen notebook
4. Ask me which section to use (or suggest creating a new one)
5. Create the page using create-page with well-formatted HTML content based on the topic${content ? " and the content I provided" : ""}
6. Confirm the page was created and provide the page link`,
      },
    },
  ],
}
```

---

## 5. Shared Utilities Design

### 5.1 Tool Response Helpers (`src/tools/helpers.ts`)

```typescript
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { OneNoteClientError } from "../onenote/types.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Create a success response containing a JSON-serialized object.
 */
export function toolJsonSuccess(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create a success response with plain text.
 */
export function toolTextSuccess(text: string): CallToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

/**
 * Create a tool-level error response.
 */
export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/**
 * Handle an OneNoteResult<T>, returning either a success result (via transform)
 * or a mapped error result. Auth errors are thrown as McpError.
 */
export function handleApiResult<T>(
  result: import("../onenote/types.js").OneNoteResult<T>,
  transform?: (data: T) => CallToolResult
): CallToolResult {
  if (result.success) {
    return transform
      ? transform(result.data)
      : toolJsonSuccess(result.data);
  }
  return mapOneNoteError(result.error);
}

/**
 * Map a OneNoteClientError to a tool response or throw a protocol error.
 */
export function mapOneNoteError(error: OneNoteClientError): CallToolResult {
  // Auth errors should be protocol-level errors
  if (error.code === "MISSING_TOKEN" || error.code === "UNAUTHORIZED") {
    throw new McpError(
      ErrorCode.InternalError,
      `Authentication failed: ${error.message}`
    );
  }

  // All other errors are tool-level errors
  const codeLabel = error.statusCode ? ` (HTTP ${error.statusCode})` : "";
  return toolError(`OneNote API error [${error.code}]${codeLabel}: ${error.message}`);
}
```

### 5.2 Pagination Helper (`src/onenote/pagination.ts`)

```typescript
import type { OneNoteClient } from "./client.js";
import type { OneNoteResult } from "./types.js";

/**
 * OData collection response shape.
 */
export interface ODataCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
  "@odata.context"?: string;
}

/**
 * Fetch a single page from a collection endpoint.
 */
export async function fetchPage<T>(
  client: OneNoteClient,
  path: string,
  params?: Record<string, string>
): Promise<OneNoteResult<ODataCollection<T>>> {
  return client.request<ODataCollection<T>>({ path, params });
}

/**
 * Fetch ALL items from a paginated collection endpoint,
 * automatically following @odata.nextLink.
 *
 * @param client  - Authenticated OneNoteClient
 * @param path    - Initial API path (e.g., "/me/onenote/sections/abc/pages")
 * @param params  - OData query parameters for the initial request
 * @param maxPages - Safety limit to prevent infinite loops (default: 50)
 */
export async function fetchAllPages<T>(
  client: OneNoteClient,
  path: string,
  params?: Record<string, string>,
  maxPages = 50
): Promise<OneNoteResult<T[]>> {
  const allItems: T[] = [];
  let currentPath = path;
  let currentParams: Record<string, string> | undefined = params;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const result = await fetchPage<T>(client, currentPath, currentParams);

    if (!result.success) {
      return result;
    }

    allItems.push(...result.data.value);

    const nextLink = result.data["@odata.nextLink"];
    if (!nextLink) {
      break;
    }

    // Parse the nextLink URL to extract path and params for the next request.
    // The nextLink is a full URL; we need to make it relative to the base URL.
    const nextUrl = new URL(nextLink);
    currentPath = nextUrl.pathname.replace(/^\/v1\.0/, "");
    currentParams = Object.fromEntries(nextUrl.searchParams.entries());
    pageCount++;
  }

  return { success: true, data: allItems };
}
```

### 5.3 HTML Content Utilities (`src/utils/html.ts` -- extend existing)

Add these functions alongside the existing `escapeHtml()`:

```typescript
/**
 * Wrap page body content with the required HTML envelope for page creation.
 * The Graph API expects a full XHTML document.
 */
export function buildPageHtml(title: string, bodyContent?: string): string {
  const escapedTitle = escapeHtml(title);
  const body = bodyContent ?? "";
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${escapedTitle}</title>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

/**
 * Strip HTML tags from a string, returning plain text.
 * Used for generating text summaries from page HTML content.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

### 5.4 OneNoteClient Extensions (`src/onenote/client.ts`)

The existing `OneNoteClient.request<T>()` method always expects JSON responses. Two new methods are needed:

#### `requestRaw()` -- For HTML content retrieval

```typescript
/**
 * Make an authenticated request that returns the raw response body as a string.
 * Used for endpoints that return non-JSON content (e.g., page HTML content).
 */
async requestRaw(options: RequestOptions & {
  accept?: string;
}): Promise<OneNoteResult<string>> {
  const { path, method = "GET", params, accept } = options;

  const url = new URL(`${this.baseUrl}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: accept ?? "text/html",
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return { success: false, error: await this.mapHttpError(response) };
    }

    const text = await response.text();
    return { success: true, data: text };
  } catch (error) {
    return { success: false, error: this.mapNetworkError(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

#### `requestHtmlBody()` -- For HTML page creation

```typescript
/**
 * Make an authenticated request with a raw string body (not JSON).
 * Used for page creation where the body is HTML.
 */
async requestHtmlBody<T>(options: {
  path: string;
  method?: HttpMethod;
  body: string;
  contentType?: string;
}): Promise<OneNoteResult<T>> {
  const { path, method = "POST", body, contentType = "application/xhtml+xml" } = options;

  const url = new URL(`${this.baseUrl}${path}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": contentType,
        Accept: "application/json",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      return { success: false, error: await this.mapHttpError(response) };
    }

    const text = await response.text();
    if (text.length === 0) {
      return { success: true, data: undefined as T };
    }

    try {
      const data = JSON.parse(text) as T;
      return { success: true, data };
    } catch {
      return {
        success: false,
        error: new OneNoteClientError(
          "Received non-JSON response from Microsoft Graph",
          "UNKNOWN",
          response.status,
          false
        ),
      };
    }
  } catch (error) {
    return { success: false, error: this.mapNetworkError(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 5.5 Constants Extensions (`src/constants.ts`)

Add these constants for Stage 2:

```typescript
/** Default number of items per page for OneNote API requests */
export const ONENOTE_DEFAULT_PAGE_SIZE = 20;

/** Maximum number of items per page for OneNote API requests */
export const ONENOTE_MAX_PAGE_SIZE = 100;

/** Maximum safety limit for pagination loops */
export const ONENOTE_MAX_PAGINATION_PAGES = 50;

/** $select fields for notebook list responses */
export const NOTEBOOK_SELECT_FIELDS =
  "id,displayName,createdDateTime,lastModifiedDateTime,isDefault,isShared,userRole,links,self";

/** $select fields for section list responses */
export const SECTION_SELECT_FIELDS =
  "id,displayName,isDefault,createdDateTime,lastModifiedDateTime,pagesUrl,links,self";

/** $select fields for section group list responses */
export const SECTION_GROUP_SELECT_FIELDS =
  "id,displayName,createdDateTime,lastModifiedDateTime,sectionsUrl,sectionGroupsUrl,self";

/** $select fields for page list responses */
export const PAGE_SELECT_FIELDS =
  "id,title,createdDateTime,lastModifiedDateTime,order,level,links,self";

/** $expand for full notebook hierarchy */
export const NOTEBOOK_HIERARCHY_EXPAND =
  "sections($select=id,displayName,isDefault,pagesUrl,self),sectionGroups($expand=sections($select=id,displayName,isDefault,pagesUrl,self),sectionGroups($levels=max;$expand=sections($select=id,displayName,isDefault,pagesUrl,self)))";
```

---

## 6. Graph API Type Definitions

Create TypeScript interfaces for all Graph API response objects. These go in `src/onenote/graph-types.ts`.

```typescript
/**
 * TypeScript interfaces for Microsoft Graph OneNote API responses.
 * These map to the JSON representations returned by the v1.0 API.
 */

export interface GraphIdentity {
  id?: string;
  displayName?: string;
}

export interface GraphIdentitySet {
  user?: GraphIdentity;
  application?: GraphIdentity;
  device?: GraphIdentity;
}

export interface GraphExternalLink {
  href: string;
}

export interface GraphNotebookLinks {
  oneNoteClientUrl: GraphExternalLink;
  oneNoteWebUrl: GraphExternalLink;
}

export interface GraphSectionLinks {
  oneNoteClientUrl: GraphExternalLink;
  oneNoteWebUrl: GraphExternalLink;
}

export interface GraphPageLinks {
  oneNoteClientUrl: GraphExternalLink;
  oneNoteWebUrl: GraphExternalLink;
}

export interface GraphNotebook {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy?: GraphIdentitySet;
  lastModifiedBy?: GraphIdentitySet;
  isDefault: boolean;
  isShared: boolean;
  userRole: "Owner" | "Contributor" | "Reader" | "None";
  links: GraphNotebookLinks;
  sectionsUrl: string;
  sectionGroupsUrl: string;
  self: string;
  // Expanded relationships
  sections?: GraphSection[];
  sectionGroups?: GraphSectionGroup[];
}

export interface GraphSectionGroup {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy?: GraphIdentitySet;
  lastModifiedBy?: GraphIdentitySet;
  sectionsUrl: string;
  sectionGroupsUrl: string;
  self: string;
  // Expanded relationships
  parentNotebook?: GraphNotebook;
  parentSectionGroup?: GraphSectionGroup;
  sections?: GraphSection[];
  sectionGroups?: GraphSectionGroup[];
}

export interface GraphSection {
  id: string;
  displayName: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy?: GraphIdentitySet;
  lastModifiedBy?: GraphIdentitySet;
  isDefault: boolean;
  links: GraphSectionLinks;
  pagesUrl: string;
  self: string;
  // Expanded relationships
  parentNotebook?: GraphNotebook;
  parentSectionGroup?: GraphSectionGroup;
}

export interface GraphPage {
  id: string;
  title: string;
  contentUrl: string;
  createdByAppId?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  level?: number;
  order?: number;
  self: string;
  links: GraphPageLinks;
  // Expanded relationships
  parentSection?: GraphSection;
  parentNotebook?: GraphNotebook;
}

export interface GraphPagePreview {
  "@odata.context"?: string;
  previewText: string;
}

export interface GraphODataCollection<T> {
  "@odata.context"?: string;
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
  value: T[];
}
```

---

## 7. File Organization

### 7.1 Proposed Structure

```
src/
  index.ts                          # Server bootstrap (no changes)
  constants.ts                      # Add new constants for Stage 2

  onenote/
    client.ts                       # Add requestRaw() and requestHtmlBody() methods
    client-factory.ts               # No changes
    types.ts                        # No changes
    graph-types.ts                  # NEW: TypeScript interfaces for Graph API responses
    pagination.ts                   # NEW: ODataCollection, fetchPage, fetchAllPages
    auth.ts                         # No changes
    oauth.ts                        # No changes
    token-store.ts                  # No changes
    index.ts                        # Update exports to include new modules

  tools/
    index.ts                        # registerTools() -- imports and calls all register functions
    helpers.ts                      # NEW: toolJsonSuccess, toolError, handleApiResult, mapOneNoteError
    list-notebooks.ts               # NEW
    get-notebook.ts                 # NEW
    list-section-groups.ts          # NEW
    get-section-group.ts            # NEW
    list-sections.ts                # NEW
    get-section.ts                  # NEW
    create-section.ts               # NEW
    list-pages.ts                   # NEW
    get-page.ts                     # NEW
    get-page-content.ts             # NEW
    get-page-preview.ts             # NEW
    create-page.ts                  # NEW
    update-page.ts                  # NEW
    delete-page.ts                  # NEW
    search-pages.ts                 # NEW
    get-notebook-hierarchy.ts       # NEW

  resources/
    index.ts                        # registerResources() -- imports and calls all register functions
    notebooks.ts                    # NEW: notebooks-list (static) + notebook (template)
    sections.ts                     # NEW: notebook-sections (template)
    pages.ts                        # NEW: section-pages (template) + page-content (template)

  prompts/
    index.ts                        # registerPrompts() -- imports and calls all register functions
    summarize-page.ts               # NEW
    search-notes.ts                 # NEW
    create-note.ts                  # NEW

  utils/
    html.ts                         # Add buildPageHtml() and stripHtml()
    index.ts                        # Update exports
```

### 7.2 Justification: Individual Files per Tool

**Decision**: One file per tool, grouped resources by domain (2-3 files), one file per prompt.

**Reasons**:

1. **Tools are independent units**: Each tool has its own input schema, validation logic, API call, and error handling. Keeping them separate makes each file focused and easy to review.

2. **Parallel development**: Multiple implementation agents can work on different tool files simultaneously without merge conflicts.

3. **Testability**: Each tool file can have a corresponding `.test.ts` file that tests its specific behavior in isolation.

4. **Discoverability**: When debugging "the `create-page` tool is failing," you immediately know to look at `src/tools/create-page.ts`.

5. **Resources grouped by domain**: Resources are thinner (just a URI mapping and a fetch) and naturally cluster. Notebooks and their templates fit in one file. Pages fit in another. This avoids many tiny files with almost identical boilerplate.

6. **Prompts are one file each**: Each prompt has distinct logic and message construction, so separate files keep them clean.

### 7.3 Tool File Template

Each tool file follows this structure:

```typescript
// src/tools/{tool-name}.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import type { GraphSomeType } from "../onenote/graph-types.js";
import type { GraphODataCollection } from "../onenote/graph-types.js";
import { handleApiResult, toolJsonSuccess } from "./helpers.js";

export function registerToolName(server: McpServer): void {
  server.registerTool(
    "tool-name",
    {
      title: "Tool Title",
      description: "Tool description for the LLM",
      inputSchema: {
        // Zod raw shape
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ param1, param2 }, extra) => {
      const client = await getOneNoteClientOrThrow(extra);

      const result = await client.request<SomeType>({
        path: "/me/onenote/...",
        params: { "$select": "..." },
      });

      return handleApiResult(result);
    }
  );
}
```

### 7.4 Tools Index Pattern

```typescript
// src/tools/index.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListNotebooks } from "./list-notebooks.js";
import { registerGetNotebook } from "./get-notebook.js";
import { registerListSectionGroups } from "./list-section-groups.js";
import { registerGetSectionGroup } from "./get-section-group.js";
import { registerListSections } from "./list-sections.js";
import { registerGetSection } from "./get-section.js";
import { registerCreateSection } from "./create-section.js";
import { registerListPages } from "./list-pages.js";
import { registerGetPage } from "./get-page.js";
import { registerGetPageContent } from "./get-page-content.js";
import { registerGetPagePreview } from "./get-page-preview.js";
import { registerCreatePage } from "./create-page.js";
import { registerUpdatePage } from "./update-page.js";
import { registerDeletePage } from "./delete-page.js";
import { registerSearchPages } from "./search-pages.js";
import { registerGetNotebookHierarchy } from "./get-notebook-hierarchy.js";

export function registerTools(server: McpServer): void {
  // Notebook tools
  registerListNotebooks(server);
  registerGetNotebook(server);

  // Section Group tools
  registerListSectionGroups(server);
  registerGetSectionGroup(server);

  // Section tools
  registerListSections(server);
  registerGetSection(server);
  registerCreateSection(server);

  // Page tools
  registerListPages(server);
  registerGetPage(server);
  registerGetPageContent(server);
  registerGetPagePreview(server);
  registerCreatePage(server);
  registerUpdatePage(server);
  registerDeletePage(server);
  registerSearchPages(server);

  // Navigation tools
  registerGetNotebookHierarchy(server);
}
```

---

## 8. Permissions / Scopes

### 8.1 Operation-to-Scope Mapping

| Tool | Operation | Minimum Scope Required |
|---|---|---|
| `list-notebooks` | Read notebooks | `Notes.Read` |
| `get-notebook` | Read notebook | `Notes.Read` |
| `list-section-groups` | Read section groups | `Notes.Read` |
| `get-section-group` | Read section group | `Notes.Read` |
| `list-sections` | Read sections | `Notes.Read` |
| `get-section` | Read section | `Notes.Read` |
| `create-section` | Create section | `Notes.ReadWrite` |
| `list-pages` | Read pages | `Notes.Read` |
| `get-page` | Read page metadata | `Notes.Read` |
| `get-page-content` | Read page content | `Notes.Read` |
| `get-page-preview` | Read page preview | `Notes.Read` |
| `create-page` | Create page | `Notes.ReadWrite` |
| `update-page` | Update page | `Notes.ReadWrite` |
| `delete-page` | Delete page | `Notes.ReadWrite` |
| `search-pages` | Read pages | `Notes.Read` |
| `get-notebook-hierarchy` | Read notebooks with expand | `Notes.Read` |
| All resources | Read data | `Notes.Read` |

### 8.2 Recommended Default Scope Set

The current `DEFAULT_OAUTH_SCOPES` in `src/constants.ts` is:

```typescript
export const DEFAULT_OAUTH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "User.Read",
  "Notes.Read",
];
```

**This must be updated for Stage 2** to support write operations:

```typescript
export const DEFAULT_OAUTH_SCOPES = [
  "offline_access",      // Needed for refresh tokens
  "openid",              // Required for OIDC
  "profile",             // User profile info
  "User.Read",           // Basic user info (for /me endpoint)
  "Notes.ReadWrite",     // Read and write OneNote content
];
```

**Rationale**: `Notes.ReadWrite` is the single scope that covers all operations the MCP server needs on the user's own notebooks (read, create, update, delete). It subsumes `Notes.Read` and `Notes.Create`. We do NOT request `Notes.ReadWrite.All` because:

1. It requires admin consent in organizational environments
2. The MCP server operates on behalf of the signed-in user, not across the organization
3. Principle of least privilege

**Note on `Notes.Read` vs `Notes.ReadWrite`**: If a deployment only needs read access (no page creation/update/deletion), the scope can be downgraded to `Notes.Read` via environment configuration. This should be documented in the README but `Notes.ReadWrite` is the appropriate default for a server that exposes write tools.

### 8.3 Scope Validation at Tool Level

Write tools (`create-section`, `create-page`, `update-page`, `delete-page`) should include clear error messages when scope is insufficient. The Graph API returns HTTP 403 with error code 40002 (write permission) or 40004 (missing scope). The error mapping in `mapOneNoteError` already handles 403 as `FORBIDDEN`, and the tool-level error message will be surfaced to the user. No additional scope-checking logic is needed in the tools themselves -- the Graph API enforces it.

---

## 9. Implementation Priority

### 9.1 Ordered Implementation Plan

The implementation is ordered by: (1) shared infrastructure first, (2) most useful read tools, (3) hierarchy/navigation, (4) write tools, (5) resources, (6) prompts.

#### Phase 1: Shared Infrastructure

Build first because all tools depend on these:

1. **`src/onenote/graph-types.ts`** -- TypeScript interfaces for Graph API responses
2. **`src/onenote/pagination.ts`** -- `ODataCollection`, `fetchPage`, `fetchAllPages`
3. **`src/onenote/client.ts` extensions** -- `requestRaw()` and `requestHtmlBody()` methods
4. **`src/tools/helpers.ts`** -- `toolJsonSuccess`, `toolTextSuccess`, `toolError`, `handleApiResult`, `mapOneNoteError`
5. **`src/utils/html.ts` extensions** -- `buildPageHtml()`, `stripHtml()`
6. **`src/constants.ts` extensions** -- New constants for select fields, page sizes, hierarchy expand
7. **Update `src/constants.ts`** -- Change `DEFAULT_OAUTH_SCOPES` to include `Notes.ReadWrite`

**Estimated file count**: 2 new files, 3 modified files

#### Phase 2: Core Read Tools (Notebooks + Sections)

These are the foundation -- users need to browse their notebook structure before doing anything else:

8. **`list-notebooks`** -- First tool users will call
9. **`get-notebook`** -- View notebook details with sections
10. **`get-notebook-hierarchy`** -- Most powerful single tool for understanding structure
11. **`list-sections`** -- Browse sections
12. **`get-section`** -- Section details
13. **`list-section-groups`** -- Browse section groups
14. **`get-section-group`** -- Section group details

**Estimated file count**: 7 new files, 1 modified (`tools/index.ts`)

#### Phase 3: Page Read Tools

With the hierarchy browsable, users need to access page content:

15. **`list-pages`** -- Browse pages in a section
16. **`get-page`** -- Page metadata
17. **`get-page-content`** -- Full HTML content (depends on `requestRaw()`)
18. **`get-page-preview`** -- Quick content preview
19. **`search-pages`** -- Find pages by content

**Estimated file count**: 5 new files

#### Phase 4: Page Write Tools

Write operations depend on read tools being available for verification:

20. **`create-page`** -- Create new pages (depends on `requestHtmlBody()` and `buildPageHtml()`)
21. **`update-page`** -- Update page content via PATCH
22. **`delete-page`** -- Delete pages
23. **`create-section`** -- Create new sections

**Estimated file count**: 4 new files

#### Phase 5: Resources

Resources layer on top of the same Graph API calls the tools use:

24. **`src/resources/notebooks.ts`** -- `onenote://notebooks` (static) + `onenote://notebooks/{notebookId}` (template)
25. **`src/resources/sections.ts`** -- `onenote://notebooks/{notebookId}/sections` (template)
26. **`src/resources/pages.ts`** -- `onenote://sections/{sectionId}/pages` (template) + `onenote://pages/{pageId}` (template)
27. **Update `src/resources/index.ts`**

**Estimated file count**: 3 new files, 1 modified

#### Phase 6: Prompts

Prompts are the final layer -- they guide LLM workflows using the tools:

28. **`src/prompts/summarize-page.ts`**
29. **`src/prompts/search-notes.ts`**
30. **`src/prompts/create-note.ts`**
31. **Update `src/prompts/index.ts`**

**Estimated file count**: 3 new files, 1 modified

#### Phase 7: Tests

Each phase should include tests, but they can also be written as a final pass:

32. **Update `src/tools/index.test.ts`** -- Verify all 16 tools are registered
33. **Individual tool tests** -- Mock client and verify correct API calls, error handling
34. **`src/tools/helpers.test.ts`** -- Unit tests for response helpers and error mapping
35. **`src/onenote/pagination.test.ts`** -- Test fetchAllPages with mock responses
36. **`src/resources/index.test.ts`** -- Verify all 5 resources are registered
37. **`src/prompts/index.test.ts`** -- Verify all 3 prompts are registered

### 9.2 Summary Statistics

| Category | New Files | Modified Files | Items |
|---|---|---|---|
| Shared Infrastructure | 2 | 3 | -- |
| Graph Types | 1 | 1 | -- |
| Tools | 17 (16 tools + helpers) | 1 (index) | 16 tools |
| Resources | 3 | 1 (index) | 5 resources |
| Prompts | 3 | 1 (index) | 3 prompts |
| **Total** | **26** | **7** | **24 registrations** |

---

## Appendix A: Tool Input Schema Quick Reference

| Tool | Required Parameters | Optional Parameters |
|---|---|---|
| `list-notebooks` | -- | -- |
| `get-notebook` | `notebookId: string` | -- |
| `list-section-groups` | -- | `notebookId: string` |
| `get-section-group` | `sectionGroupId: string` | -- |
| `list-sections` | -- | `notebookId: string`, `sectionGroupId: string` |
| `get-section` | `sectionId: string` | -- |
| `create-section` | `displayName: string` | `notebookId: string`, `sectionGroupId: string` (exactly one required) |
| `list-pages` | `sectionId: string` | `top: number` |
| `get-page` | `pageId: string` | -- |
| `get-page-content` | `pageId: string` | `includeIds: boolean` |
| `get-page-preview` | `pageId: string` | -- |
| `create-page` | `sectionId: string`, `title: string` | `content: string` |
| `update-page` | `pageId: string`, `patches: PatchOp[]` | -- |
| `delete-page` | `pageId: string` | -- |
| `search-pages` | `query: string` | `sectionId: string`, `top: number` |
| `get-notebook-hierarchy` | -- | -- |

## Appendix B: Graph API Endpoints Quick Reference

| Tool | Method | Endpoint |
|---|---|---|
| `list-notebooks` | GET | `/me/onenote/notebooks` |
| `get-notebook` | GET | `/me/onenote/notebooks/{id}` |
| `list-section-groups` | GET | `/me/onenote/sectionGroups` or `/me/onenote/notebooks/{id}/sectionGroups` |
| `get-section-group` | GET | `/me/onenote/sectionGroups/{id}` |
| `list-sections` | GET | `/me/onenote/sections` or `.../notebooks/{id}/sections` or `.../sectionGroups/{id}/sections` |
| `get-section` | GET | `/me/onenote/sections/{id}` |
| `create-section` | POST | `/me/onenote/notebooks/{id}/sections` or `/me/onenote/sectionGroups/{id}/sections` |
| `list-pages` | GET | `/me/onenote/sections/{id}/pages` |
| `get-page` | GET | `/me/onenote/pages/{id}` |
| `get-page-content` | GET | `/me/onenote/pages/{id}/content` |
| `get-page-preview` | GET | `/me/onenote/pages/{id}/preview` |
| `create-page` | POST | `/me/onenote/sections/{id}/pages` |
| `update-page` | PATCH | `/me/onenote/pages/{id}/content` |
| `delete-page` | DELETE | `/me/onenote/pages/{id}` |
| `search-pages` | GET | `/me/onenote/pages?search={q}` or `/me/onenote/sections/{id}/pages?search={q}` |
| `get-notebook-hierarchy` | GET | `/me/onenote/notebooks?$expand=...` |
