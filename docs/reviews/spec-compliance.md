# Spec-Compliance Review

**Reviewer**: Skeptical Spec-Compliance Reviewer (automated)
**Date**: 2026-02-16
**Scope**: All 16 tools, 5 resources, 3 prompts, Graph API client, type definitions, and constants
**SDK Version**: `@modelcontextprotocol/sdk` 1.26.0, `zod` 4.3.6
**Target API**: Microsoft Graph v1.0 OneNote endpoints

---

## Methodology

This review was conducted by independently querying and verifying against:

1. **Microsoft Graph v1.0 OneNote API reference** at [learn.microsoft.com](https://learn.microsoft.com/en-us/graph/api/resources/onenote-api-overview?view=graph-rest-1.0)
2. **Microsoft Graph OneNote content guide** at [learn.microsoft.com/en-us/graph/onenote-get-content](https://learn.microsoft.com/en-us/graph/onenote-get-content)
3. **Microsoft Graph OneNote update page guide** at [learn.microsoft.com/en-us/graph/onenote-update-page](https://learn.microsoft.com/en-us/graph/onenote-update-page)
4. **MCP TypeScript SDK** source types at `node_modules/@modelcontextprotocol/sdk/dist/esm/`
5. **MCP SDK migration guide** at [github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration.md)
6. **OneNote developer blog archive** at [learn.microsoft.com/en-us/archive/blogs/onenotedev/](https://learn.microsoft.com/en-us/archive/blogs/onenotedev/)

Every finding below references the specific source used to confirm or contradict the implementation.

---

## Table of Contents

- [1. Graph API Compliance -- Endpoint Paths and HTTP Methods](#1-graph-api-compliance----endpoint-paths-and-http-methods)
- [2. Graph API Compliance -- Query Parameters](#2-graph-api-compliance----query-parameters)
- [3. Graph API Compliance -- Request Bodies and Content-Types](#3-graph-api-compliance----request-bodies-and-content-types)
- [4. Graph API Compliance -- Response Shapes and TypeScript Interfaces](#4-graph-api-compliance----response-shapes-and-typescript-interfaces)
- [5. Graph API Compliance -- OData Patterns](#5-graph-api-compliance----odata-patterns)
- [6. Graph API Compliance -- Permissions / Scopes](#6-graph-api-compliance----permissions--scopes)
- [7. NOTEBOOK_HIERARCHY_EXPAND Deep-Dive](#7-notebook_hierarchy_expand-deep-dive)
- [8. Search Pages -- The `search` Parameter](#8-search-pages----the-search-parameter)
- [9. MCP SDK Compliance -- Tool Registration](#9-mcp-sdk-compliance----tool-registration)
- [10. MCP SDK Compliance -- Tool Annotations](#10-mcp-sdk-compliance----tool-annotations)
- [11. MCP SDK Compliance -- Resource Registration](#11-mcp-sdk-compliance----resource-registration)
- [12. MCP SDK Compliance -- Prompt Registration](#12-mcp-sdk-compliance----prompt-registration)
- [13. MCP SDK Compliance -- Error Handling](#13-mcp-sdk-compliance----error-handling)
- [14. MCP SDK Compliance -- Return Types](#14-mcp-sdk-compliance----return-types)
- [15. MCP SDK Compliance -- Import Paths](#15-mcp-sdk-compliance----import-paths)
- [Summary Matrix](#summary-matrix)

---

## 1. Graph API Compliance -- Endpoint Paths and HTTP Methods

### 1.1 list-notebooks: `GET /me/onenote/notebooks`

**VERIFIED.** The [List notebooks API](https://learn.microsoft.com/en-us/graph/api/onenote-list-notebooks?view=graph-rest-1.0) documents `GET /me/onenote/notebooks`. Implementation in `src/tools/list-notebooks.ts` line 35 uses path `/me/onenote/notebooks` with method GET (default). Correct.

### 1.2 get-notebook: `GET /me/onenote/notebooks/{notebookId}`

**VERIFIED.** The [Get notebook API](https://learn.microsoft.com/en-us/graph/api/notebook-get?view=graph-rest-1.0) documents `GET /me/onenote/notebooks/{id}`. Implementation at `src/tools/get-notebook.ts` line 37 uses `/me/onenote/notebooks/${notebookId}`. Correct.

### 1.3 list-sections: Multiple paths

**VERIFIED.** Implementation at `src/tools/list-sections.ts` lines 50-56 uses:
- `/me/onenote/sectionGroups/${sectionGroupId}/sections` (for section group scope)
- `/me/onenote/notebooks/${notebookId}/sections` (for notebook scope)
- `/me/onenote/sections` (for all sections)

All three match the [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content): section collection paths include `../sections`, `../sectionGroups/{id}/sections`, and `../notebooks/{id}/sections`. Correct.

### 1.4 get-section: `GET /me/onenote/sections/{sectionId}`

**VERIFIED.** The [Get section API](https://learn.microsoft.com/en-us/graph/api/section-get?view=graph-rest-1.0) documents `GET /me/onenote/sections/{id}`. Implementation at `src/tools/get-section.ts` line 35 matches. Correct.

### 1.5 create-section: `POST .../sections`

**VERIFIED.** The [Create section API](https://learn.microsoft.com/en-us/graph/api/notebook-post-sections?view=graph-rest-1.0) documents `POST /me/onenote/notebooks/{id}/sections`. Implementation at `src/tools/create-section.ts` lines 64-66 also supports `POST /me/onenote/sectionGroups/{id}/sections`. Both paths are valid per the API. The body `{ displayName }` matches the documented `{ "displayName": "Section name" }`. Correct.

### 1.6 list-section-groups: Multiple paths

**VERIFIED.** Implementation at `src/tools/list-section-groups.ts` lines 43-45 uses:
- `/me/onenote/notebooks/${notebookId}/sectionGroups` (notebook scope)
- `/me/onenote/sectionGroups` (all)

Both match the [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content). Correct.

### 1.7 get-section-group: `GET /me/onenote/sectionGroups/{id}`

**VERIFIED.** Implementation at `src/tools/get-section-group.ts` line 37 uses `/me/onenote/sectionGroups/${sectionGroupId}`. Matches the [Get sectionGroup API](https://learn.microsoft.com/en-us/graph/api/sectiongroup-get?view=graph-rest-1.0). Correct.

### 1.8 list-pages: `GET /me/onenote/sections/{id}/pages`

**VERIFIED.** Implementation at `src/tools/list-pages.ts` line 44 uses `/me/onenote/sections/${sectionId}/pages`. This matches the [List pages (section) API](https://learn.microsoft.com/en-us/graph/api/section-list-pages?view=graph-rest-1.0). Correct.

### 1.9 get-page: `GET /me/onenote/pages/{id}`

**VERIFIED.** Implementation at `src/tools/get-page.ts` line 35 uses `/me/onenote/pages/${pageId}`. Matches [Get page API](https://learn.microsoft.com/en-us/graph/api/page-get?view=graph-rest-1.0). Correct.

### 1.10 get-page-content: `GET /me/onenote/pages/{id}/content`

**VERIFIED.** Implementation at `src/tools/get-page-content.ts` line 41 uses `/me/onenote/pages/${pageId}/content`. The [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content) document `../pages/{page-id}/content[?includeIDs]`. Correct.

### 1.11 get-page-preview: `GET /me/onenote/pages/{id}/preview`

**VERIFIED.** Implementation at `src/tools/get-page-preview.ts` line 34 uses `/me/onenote/pages/${pageId}/preview`. The [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content) document `../pages/{page-id}/preview`. Correct.

### 1.12 create-page: `POST /me/onenote/sections/{id}/pages`

**VERIFIED.** Implementation at `src/tools/create-page.ts` line 44 uses `/me/onenote/sections/${sectionId}/pages` with method POST. Matches the [Create page (section) API](https://learn.microsoft.com/en-us/graph/api/section-post-pages?view=graph-rest-1.0). Correct.

### 1.13 update-page: `PATCH /me/onenote/pages/{id}/content`

**VERIFIED.** Implementation at `src/tools/update-page.ts` line 62 uses `/me/onenote/pages/${pageId}/content` with method PATCH. The [Update page docs](https://learn.microsoft.com/en-us/graph/onenote-update-page) document `PATCH ../notes/pages/{id}/content`. Correct.

### 1.14 delete-page: `DELETE /me/onenote/pages/{id}`

**VERIFIED.** Implementation at `src/tools/delete-page.ts` line 35 uses `/me/onenote/pages/${pageId}` with method DELETE. The [Delete page API](https://learn.microsoft.com/en-us/graph/api/page-delete?view=graph-rest-1.0) documents `DELETE /me/onenote/pages/{id}`. Correct.

### 1.15 search-pages: `GET /me/onenote/pages` with `search=`

See [Section 8](#8-search-pages----the-search-parameter) for detailed analysis.

### 1.16 get-notebook-hierarchy: `GET /me/onenote/notebooks` with `$expand`

See [Section 7](#7-notebook_hierarchy_expand-deep-dive) for detailed analysis.

---

## 2. Graph API Compliance -- Query Parameters

### 2.1 `$select` usage

**VERIFIED.** The `$select` parameter is used consistently in list operations:
- `NOTEBOOK_SELECT_FIELDS` in `src/constants.ts` line 48: properties like `id,displayName,createdDateTime,...` are all valid notebook properties per the [Graph API reference](https://learn.microsoft.com/en-us/graph/api/notebook-get?view=graph-rest-1.0).
- `SECTION_SELECT_FIELDS` line 52: valid section properties.
- `SECTION_GROUP_SELECT_FIELDS` line 56: valid section group properties.
- `PAGE_SELECT_FIELDS` line 60: valid page properties.

All match documented entity properties. Correct.

### 2.2 `$expand` usage

**VERIFIED.** The `$expand` parameter is used correctly per the [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content#supported-odata-query-string-options):
- Notebooks can expand: `sections`, `sectionGroups` -- used in `get-notebook.ts` and `get-notebook-hierarchy.ts`
- Sections can expand: `parentNotebook`, `parentSectionGroup` -- used in `get-section.ts`
- Section groups can expand: `sections`, `sectionGroups`, `parentNotebook`, `parentSectionGroup` -- used in `get-section-group.ts`
- Pages can expand: `parentNotebook`, `parentSection` -- used in `get-page.ts`

All follow the documented expandable properties. Correct.

### 2.3 `$top` usage

**VERIFIED.** Used in `list-pages.ts` and `search-pages.ts` with range 1-100. The [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content) state: "The number of entries to return in the result set, up to a maximum of 100. The default value is 20." The implementation caps at 100 (`max(100)` in the Zod schema), matching the documented limit. Note: the old OneNote API blog post from 2015 mentioned a max of 500 was later reduced to 100, confirmed by a commenter getting error code 20129. Correct.

### 2.4 `pagelevel` usage

**VERIFIED.** Used in `list-pages.ts` line 47 and `get-page.ts` line 38 as `pagelevel: "true"`. The [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content) state: "Microsoft Graph also provides the `pagelevel` query string option you can use to get the level and order of pages within the parent section. Applies only to queries for pages in a specific section or queries for a specific page." Implementation applies it in both valid contexts. Correct.

### 2.5 `includeIDs` usage

**VERIFIED.** Used in `get-page-content.ts` line 45 as `includeIDs: "true"`. The [Update page docs](https://learn.microsoft.com/en-us/graph/onenote-update-page) document: "Get the page HTML, all defined data-id values, and all generated id values: `../pages/{page-id}/content?includeIDs=true`". Correct.

### 2.6 `$filter` / `$orderby` / `$skip` / `$count`

**DEVIATION.** These standard OData query parameters are supported by the OneNote API but are not exposed in any tool's input schema. This is a deliberate design choice (simplicity), not a violation. However, it means users cannot filter notebooks by `isDefault`, order sections by `lastModifiedTime`, or paginate with skip. Not blocking, but reduces API power. The `list-notebooks` tool in particular could benefit from `$filter=isDefault eq true`.

---

## 3. Graph API Compliance -- Request Bodies and Content-Types

### 3.1 create-section: JSON body with `Content-Type: application/json`

**VERIFIED.** Implementation at `src/tools/create-section.ts` line 68-71 sends `{ displayName }` via `client.request()` which sets `Content-Type: application/json` (see `src/onenote/client.ts` line 73). The [Create section API](https://learn.microsoft.com/en-us/graph/api/notebook-post-sections?view=graph-rest-1.0) expects `Content-Type: application/json` with body `{ "displayName": "Section name" }`. Correct.

### 3.2 create-page: HTML body with `Content-Type: application/xhtml+xml`

**VERIFIED.** Implementation at `src/tools/create-page.ts` line 43-47 uses `client.requestHtmlBody()` which defaults to `Content-Type: application/xhtml+xml` (see `src/onenote/client.ts` line 169). The [Create page API](https://learn.microsoft.com/en-us/graph/api/onenote-post-pages?view=graph-rest-1.0) accepts `text/html`, `application/xhtml+xml`, or `multipart/form-data`. Using `application/xhtml+xml` is valid.

**DEVIATION.** The `buildPageHtml()` function in `src/utils/html.ts` generates:
```html
<!DOCTYPE html>
<html>
  <head>
    <title>...</title>
  </head>
  <body>
    ...
  </body>
</html>
```
The `<!DOCTYPE html>` declaration is technically an HTML5 doctype, not XHTML. However, the Graph API accepts this format per the [Create page guide](https://learn.microsoft.com/en-us/graph/onenote-create-page). The Microsoft docs examples also use `<!DOCTYPE html>` with `Content-Type: text/html`. This works in practice, though strictly speaking `application/xhtml+xml` content should be well-formed XML (self-closing tags, namespace declarations). The Graph API is lenient here.

### 3.3 update-page: JSON patch array with `Content-Type: application/json`

**VERIFIED.** Implementation at `src/tools/update-page.ts` line 61-64 sends the patches array via `client.request()` which sets `Content-Type: application/json`. The [Update page docs](https://learn.microsoft.com/en-us/graph/onenote-update-page) document: "Content-Type: `application/json` for the array of JSON change objects." The implementation sends the patches array directly as the body, which is correct -- it's a JSON array of change objects. Correct.

### 3.4 delete-page: No body

**VERIFIED.** Implementation sends no body for DELETE. The [Delete page API](https://learn.microsoft.com/en-us/graph/api/page-delete?view=graph-rest-1.0) says "Don't supply a request body." Correct.

### 3.5 get-page-content: Accept header

**VERIFIED.** Implementation at `src/onenote/client.ts` line 133 uses `Accept: text/html` for `requestRaw()`. The [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content) specify: "Accept: `text/html` for page content." Correct.

---

## 4. Graph API Compliance -- Response Shapes and TypeScript Interfaces

File: `src/onenote/graph-types.ts`

### 4.1 GraphNotebook interface

**VERIFIED.** Properties match the [notebook resource type](https://learn.microsoft.com/en-us/graph/api/resources/notebook?view=graph-rest-1.0): `id`, `displayName`, `createdDateTime`, `lastModifiedDateTime`, `createdBy`, `lastModifiedBy`, `isDefault`, `isShared`, `userRole`, `links`, `sectionsUrl`, `sectionGroupsUrl`, `self`. The `userRole` enum `"Owner" | "Contributor" | "Reader" | "None"` matches the documented values. Correct.

### 4.2 GraphSection interface

**VERIFIED.** Properties match the [section resource type](https://learn.microsoft.com/en-us/graph/api/resources/section?view=graph-rest-1.0): `id`, `displayName`, `createdDateTime`, `lastModifiedDateTime`, `createdBy`, `lastModifiedBy`, `isDefault`, `links`, `pagesUrl`, `self`. Correct.

### 4.3 GraphSectionGroup interface

**VERIFIED.** Properties match the [sectionGroup resource type](https://learn.microsoft.com/en-us/graph/api/resources/sectiongroup?view=graph-rest-1.0). Correct.

### 4.4 GraphPage interface

**VERIFIED.** Properties match the [page resource type](https://learn.microsoft.com/en-us/graph/api/resources/page?view=graph-rest-1.0): `id`, `title`, `contentUrl`, `createdByAppId`, `createdDateTime`, `lastModifiedDateTime`, `level`, `order`, `self`, `links`. The `level` and `order` properties are only returned when `pagelevel=true`. Correct.

### 4.5 GraphPagePreview interface

**VERIFIED.** The `previewText` property matches the [preview endpoint response](https://learn.microsoft.com/en-us/graph/onenote-get-content): `{ "previewText": "text-snippet" }`. Correct.

### 4.6 GraphODataCollection interface

**VERIFIED.** The `value`, `@odata.context`, `@odata.nextLink`, and `@odata.count` properties match standard OData v4 collection responses. Correct.

### 4.7 Missing properties

**DEVIATION.** The `GraphPage` interface does not include the `userTags` property that appears in some beta API responses. This is acceptable since `userTags` is not in the v1.0 documentation. The `GraphNotebook` interface also does not include `name` (the property is named `displayName` in Graph API, while the old OneNote API used `name`). This is correct for v1.0.

---

## 5. Graph API Compliance -- OData Patterns

### 5.1 `@odata.nextLink` handling

**VERIFIED.** Implementation in `src/onenote/pagination.ts` lines 56-66:
1. Checks for `@odata.nextLink` in response (`result.data["@odata.nextLink"]`)
2. Parses the full URL into relative path + query params
3. Uses the new path/params for the next request
4. Has a safety limit of 50 pages (`ONENOTE_MAX_PAGINATION_PAGES`)

The [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content) state: "Requests that don't specify a top expression return an @odata.nextLink link in the response that you can use to get the next 20 entries." The implementation correctly follows this pattern.

**LIKELY ISSUE.** In `pagination.ts` line 64, the `nextLink` URL path is made relative by stripping `/v1.0`:
```typescript
currentPath = nextUrl.pathname.replace(/^\/v1\.0/, "");
```
This assumes the `@odata.nextLink` URLs always start with `/v1.0`. If Microsoft changes the URL format (e.g., to include the full `https://graph.microsoft.com/v1.0/...`), this regex would need updating. However, since the client always constructs the full URL from `MICROSOFT_GRAPH_BASE_URL + path`, this approach works as long as the nextLink paths share the same base. The `new URL(nextLink)` call on line 63 handles the case where nextLink is a full URL (extracting pathname correctly). This is adequate but fragile.

### 5.2 Collection response shape

**VERIFIED.** All list operations type-cast the response as `GraphODataCollection<T>` and extract `.value`. This matches the OData v4 standard for collection responses. Correct.

---

## 6. Graph API Compliance -- Permissions / Scopes

File: `src/constants.ts` line 26-32

```typescript
export const DEFAULT_OAUTH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "User.Read",
  "Notes.ReadWrite",
];
```

### 6.1 `Notes.ReadWrite` scope coverage

**VERIFIED.** Per the Microsoft docs:
- GET operations (list, get): Require `Notes.Read` minimum ([source](https://learn.microsoft.com/en-us/graph/onenote-get-content))
- POST/PATCH/DELETE operations (create, update, delete): Require `Notes.ReadWrite` minimum ([source](https://learn.microsoft.com/en-us/graph/onenote-update-page))

`Notes.ReadWrite` covers both read and write operations. This is sufficient for all 16 tools. Correct.

### 6.2 `Notes.ReadWrite.All` not required

**VERIFIED.** `Notes.ReadWrite.All` grants access to all users' notebooks (admin consent). Since this server uses `/me/onenote/...` paths, the `Notes.ReadWrite` delegated scope is appropriate. Using `.All` would be over-scoping. Correct.

### 6.3 `Notes.Create` not needed

**VERIFIED.** The [Create section API](https://learn.microsoft.com/en-us/graph/api/notebook-post-sections?view=graph-rest-1.0) lists `Notes.Create` as the least privileged permission, but `Notes.ReadWrite` is listed as a higher privileged permission that also works. Since the server needs both read and write access, `Notes.ReadWrite` is the correct single scope. Correct.

### 6.4 Missing `User.Read` explanation

**DEVIATION.** The `User.Read` scope is included but no tool actually calls a `/me` user profile endpoint. This scope is typically used to get the signed-in user's basic profile, which may be needed for the OAuth flow itself. Not technically needed by the OneNote operations, but it is harmless and common in Graph API OAuth flows. Minor unnecessary scope.

---

## 7. NOTEBOOK_HIERARCHY_EXPAND Deep-Dive

File: `src/constants.ts` line 63-64

```typescript
export const NOTEBOOK_HIERARCHY_EXPAND =
  "sections($select=id,displayName,isDefault,pagesUrl,self),sectionGroups($expand=sections($select=id,displayName,isDefault,pagesUrl,self),sectionGroups($levels=max;$expand=sections($select=id,displayName,isDefault,pagesUrl,self)))";
```

### 7.1 Does `$levels=max` work on v1.0?

**LIKELY ISSUE.** The `$levels=max` syntax was originally announced as a beta feature in December 2014 by the OneNote dev blog: [(BETA) Get OneNote entities in one roundtrip using $expand](https://learn.microsoft.com/en-us/archive/blogs/onenotedev/beta-get-onenote-entities-in-one-roundtrip-using-expand). The blog post was later updated to say "$expand is now available in PROD," and the [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content) include this example:

```
GET ../notebooks?expand=sections,sectionGroups(expand=sections,sectionGroups(levels=max;expand=sections))
```

This exact pattern is used in the implementation. The official documentation examples use `levels=max` without the `$` prefix in the nested context, but the implementation uses `$levels=max` with the `$` prefix. In OData, system query options use the `$` prefix, and within `$expand` subqueries, the `$` prefix is optional. Both forms should work. The documentation example in the [Get content guide](https://learn.microsoft.com/en-us/graph/onenote-get-content) uses it without `$` in the URL but context suggests both are accepted.

**Verdict**: The syntax matches the documented example closely. The `$` prefix variation should work but cannot be 100% verified without live testing. **LIKELY CORRECT but flagged for live verification.**

### 7.2 Nested `$expand` within `$expand`

**VERIFIED.** The [Get content docs](https://learn.microsoft.com/en-us/graph/onenote-get-content) explicitly show nested `$expand` examples:

```
GET ../notebooks?expand=sections,sectionGroups(expand=sections,sectionGroups(levels=max;expand=sections))
```

The implementation uses the same nesting pattern. Correct.

### 7.3 Semicolon vs comma syntax

**VERIFIED.** Within a nested `$expand`, the semicolon (`;`) separates different query options (e.g., `$levels=max;$expand=sections`), while commas separate multiple expand properties (e.g., `sections,sectionGroups`). The implementation uses:
```
sectionGroups($levels=max;$expand=sections(...))
```
This matches the documented pattern where `;` separates `$levels` from `$expand` within the parentheses. Correct.

### 7.4 Potential performance concern

**DEVIATION.** The `$levels=max` expansion can return very large payloads for users with deeply nested section group hierarchies. The [best practices guide](https://learn.microsoft.com/en-us/graph/onenote-best-practices) recommends using `$select` to minimize payload, which this implementation does by including `$select` within the nested expansions. However, for users with many notebooks and deep nesting, this single request could time out or return very large responses. No documented API limit on levels depth was found.

---

## 8. Search Pages -- The `search` Parameter

File: `src/tools/search-pages.ts`

### 8.1 The `search` query parameter (not `$search`)

**LIKELY ISSUE.** The implementation uses `search: query` as a query parameter (line 61). This is a OneNote-specific query parameter (not the standard OData `$search`), which originated from the old OneNote REST API at `www.onenote.com/api/v1.0/`.

The [OneNote developer blog post from February 2015](https://learn.microsoft.com/en-us/archive/blogs/onenotedev/page-query-and-full-text-search) announced "Page Query and Full Text Search" as a production feature, noting it uses Bing as a search technology. The [OneNote API overview](https://learn.microsoft.com/en-us/graph/integrate-with-onenote) states: "The OneNote APIs in Microsoft Graph run OCR on images, support full-text search."

However, the `search` parameter is **not explicitly documented** in the current Microsoft Graph v1.0 API reference pages for:
- [List onenotePages](https://learn.microsoft.com/en-us/graph/api/onenote-list-pages?view=graph-rest-1.0)
- [List pages (section)](https://learn.microsoft.com/en-us/graph/api/section-list-pages?view=graph-rest-1.0)

The documented query parameters for these endpoints are standard OData: `$filter`, `$select`, `$expand`, `$top`, `$skip`, `$orderby`, `$count`. The `search` parameter does not appear in the "Optional query parameters" section of any current v1.0 reference page.

This parameter was carried over from the legacy OneNote REST API and **likely still works** on the Graph API (Microsoft generally maintains backward compatibility), but it is undocumented in the current v1.0 reference. If Microsoft decides to remove it, there would be no formal deprecation notice since it is not in the v1.0 docs.

**Verdict**: This is a **LIKELY ISSUE** -- the feature likely works but relies on an undocumented/legacy parameter. The tool comment correctly notes it uses "the OneNote-specific `search` query parameter (not OData $search)."

### 8.2 Search scope with section filtering

**DEVIATION.** When `sectionId` is provided, the implementation searches within `/me/onenote/sections/${sectionId}/pages?search=...`. When omitted, it searches all pages at `/me/onenote/pages?search=...`. The [best practices guide](https://learn.microsoft.com/en-us/graph/onenote-best-practices) warns against using `GET ~/pages` for accounts with many sections (HTTP 400 error with "maximum number of sections exceeded"). The search-pages tool should ideally warn about this or recommend scoping to a section. The tool description does say "Optionally scope the search to a specific section" but does not highlight the risk.

---

## 9. MCP SDK Compliance -- Tool Registration

### 9.1 `server.registerTool()` API usage

**VERIFIED.** All 16 tools use the `server.registerTool()` method with the correct signature:
```typescript
server.registerTool(name, { title, description, inputSchema, annotations }, callback)
```

This matches the MCP SDK v1.26.0 `registerTool` type signature:
```typescript
registerTool(name: string, config: {
  title?: string;
  description?: string;
  inputSchema?: InputArgs;
  outputSchema?: OutputArgs;
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
}, cb: ToolCallback<InputArgs>): RegisteredTool;
```

All required and optional fields are used correctly. Correct.

### 9.2 `inputSchema` format

**VERIFIED.** The `inputSchema` is passed as a Zod raw shape (plain object with Zod type values), which maps to `ZodRawShapeCompat`. For example:
```typescript
inputSchema: {
  notebookId: z.string().describe("..."),
}
```
This matches the SDK expectation for input schemas. Correct.

### 9.3 Empty `inputSchema` for zero-argument tools

**VERIFIED.** Tools like `list-notebooks` and `get-notebook-hierarchy` use `inputSchema: {}` for no arguments. The SDK accepts empty objects. Correct.

---

## 10. MCP SDK Compliance -- Tool Annotations

### 10.1 Annotation fields

**VERIFIED.** All tools use the four annotation hints: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. These match the `ToolAnnotationsSchema` in the SDK types.d.ts which defines: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` (all optional booleans). The `title` field that also appears in `ToolAnnotationsSchema` is provided separately in the `config` object. Correct.

### 10.2 Annotation correctness per tool semantics

| Tool | readOnly | destructive | idempotent | openWorld | Assessment |
|------|----------|-------------|------------|-----------|------------|
| list-notebooks | true | false | true | false | **VERIFIED** |
| get-notebook | true | false | true | false | **VERIFIED** |
| list-section-groups | true | false | true | false | **VERIFIED** |
| get-section-group | true | false | true | false | **VERIFIED** |
| list-sections | true | false | true | false | **VERIFIED** |
| get-section | true | false | true | false | **VERIFIED** |
| create-section | false | false | false | false | **VERIFIED** |
| list-pages | true | false | true | false | **VERIFIED** |
| get-page | true | false | true | false | **VERIFIED** |
| get-page-content | true | false | true | false | **VERIFIED** |
| get-page-preview | true | false | true | false | **VERIFIED** |
| create-page | false | false | false | false | **VERIFIED** |
| update-page | false | false | false | false | **VERIFIED** |
| delete-page | false | true | true | false | **VERIFIED** |
| search-pages | true | false | true | false | **VERIFIED** |
| get-notebook-hierarchy | true | false | true | false | **VERIFIED** |

Notes:
- `delete-page` correctly marks `destructiveHint: true` and `idempotentHint: true` (deleting an already-deleted page returns 404 but does not change state further).
- `create-page` and `create-section` correctly mark `idempotentHint: false` (creating the same page/section twice creates duplicates).
- `update-page` correctly marks `idempotentHint: false` (appending content is not idempotent).
- All tools use `openWorldHint: false`, which is correct since they only interact with the OneNote API.

---

## 11. MCP SDK Compliance -- Resource Registration

### 11.1 Static resource registration

**VERIFIED.** The `notebooks-list` resource at `src/resources/notebooks.ts` line 26 uses:
```typescript
server.registerResource("notebooks-list", "onenote://notebooks", { ... }, callback)
```
This matches the SDK signature for static resources: `registerResource(name, uri: string, config, callback)`. Correct.

### 11.2 Template resource registration

**VERIFIED.** Dynamic resources use `ResourceTemplate` from `@modelcontextprotocol/sdk/server/mcp.js`. For example, `src/resources/notebooks.ts` line 62:
```typescript
server.registerResource("notebook", new ResourceTemplate("onenote://notebooks/{notebookId}", { list: ... }), { ... }, callback)
```
This matches the SDK signature for template resources: `registerResource(name, template: ResourceTemplate, config, callback)`. Correct.

### 11.3 URI template format

**VERIFIED.** URI templates follow RFC 6570 format:
- `onenote://notebooks/{notebookId}`
- `onenote://notebooks/{notebookId}/sections`
- `onenote://sections/{sectionId}/pages`
- `onenote://pages/{pageId}`

These are valid URI templates. The `onenote://` scheme is a custom scheme, which is acceptable for MCP resources. Correct.

### 11.4 Resource `list` method

**VERIFIED.** The `notebook` template resource provides a `list` method that returns available notebooks. Other template resources (`notebook-sections`, `section-pages`, `page-content`) use `list: undefined`, meaning they are not discoverable but can be read by URI. This is valid per the SDK -- when `list` is undefined, the resource cannot be enumerated but can still be resolved by template. Correct.

### 11.5 `ReadResourceResult` return type

**VERIFIED.** All resource callbacks return `{ contents: [{ uri, mimeType, text }] }`, which matches the `ReadResourceResult` type. Correct.

### 11.6 Error handling in resources

**DEVIATION.** Resources throw `new Error(result.error.message)` on failure (e.g., `src/resources/notebooks.ts` line 44). The SDK documentation does not prescribe a specific error type for resource handlers. Throwing a generic `Error` will result in an internal error response. Using `McpError` would provide a more structured error, but the current approach is functional. Minor deviation.

---

## 12. MCP SDK Compliance -- Prompt Registration

### 12.1 `server.registerPrompt()` usage

**VERIFIED.** All 3 prompts use the `registerPrompt` method:
```typescript
server.registerPrompt("name", { title, description, argsSchema: { ... } }, callback)
```
This matches the SDK type signature. Correct.

### 12.2 Prompt argument types

**VERIFIED.** Per the MCP specification, prompt arguments are all strings (the protocol sends them as key-value string pairs). The implementation uses:
- `z.string()` for required args
- `z.string().optional()` for optional args

All prompt arguments are correctly typed as strings. Correct.

### 12.3 `GetPromptResult` return type

**VERIFIED.** All prompts return `{ messages: [{ role: "user", content: { type: "text", text: "..." } }] }`, which matches the `GetPromptResult` type. The `role` is correctly typed as `"user"`. Correct.

### 12.4 summarize-page prompt -- async with data fetching

**DEVIATION.** The `summarize-page` prompt at `src/prompts/summarize-page.ts` performs API calls (getting page metadata and content) before returning. While technically allowed by the SDK (the callback can be async), prompts are typically intended to be lightweight template generators. Performing I/O in a prompt handler is unusual. However, this is a design choice, not a protocol violation.

### 12.5 Prompt error handling

**DEVIATION.** The `summarize-page` prompt catches auth errors and returns a user message describing the error rather than throwing. This means the client will receive a "successful" prompt response containing an error message. This is a pragmatic approach but differs from the tool pattern where auth errors throw `McpError`. Inconsistent error handling pattern.

---

## 13. MCP SDK Compliance -- Error Handling

### 13.1 `McpError` vs `isError: true`

**VERIFIED.** The implementation in `src/tools/helpers.ts` correctly distinguishes:

1. **Protocol-level errors** (auth failures): Thrown as `McpError` with `ErrorCode.InternalError` (lines 58-63). These become JSON-RPC error responses.
2. **Tool-level errors** (API failures): Returned as `{ content: [...], isError: true }` (lines 66-69). These are successful JSON-RPC responses with the error flag set.

This pattern correctly follows the MCP protocol convention:
- `McpError` = the tool *could not execute* (infrastructure/auth problem)
- `isError: true` = the tool *executed but encountered an error* (business logic failure)

Correct.

### 13.2 `ErrorCode` enum usage

**VERIFIED.** The `ErrorCode.InternalError` (-32603) is used for auth errors. This is the appropriate error code -- the tool cannot function without authentication. `ErrorCode.InvalidParams` would also be acceptable for missing tokens, but `InternalError` is more appropriate since the params are valid but the server's internal state is wrong. Correct.

### 13.3 Import paths for error types

**VERIFIED.** In SDK v1.26.0, `McpError` and `ErrorCode` are still exported from `@modelcontextprotocol/sdk/types.js`. The migration guide notes these will become `ProtocolError` and `ProtocolErrorCode` in a future version, but for v1.26.0, the current imports are correct. Correct.

---

## 14. MCP SDK Compliance -- Return Types

### 14.1 `CallToolResult` from tools

**VERIFIED.** All tool callbacks return objects matching `CallToolResult`:
```typescript
{ content: [{ type: "text", text: "..." }] }           // success
{ content: [{ type: "text", text: "..." }], isError: true }  // error
```
The `content` array contains `TextContent` objects. `isError` is an optional boolean. This matches the `CallToolResultSchema` in the SDK. Correct.

### 14.2 `ReadResourceResult` from resources

**VERIFIED.** All resource callbacks return `{ contents: [{ uri, mimeType, text }] }`. Correct.

### 14.3 `GetPromptResult` from prompts

**VERIFIED.** All prompt callbacks return `{ messages: [{ role, content }] }`. Correct.

---

## 15. MCP SDK Compliance -- Import Paths

### 15.1 Import path style

**DEVIATION.** All imports use the v1 path convention:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
```

The [migration guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration.md) shows the v2 imports as:
```typescript
import { McpServer } from "@modelcontextprotocol/server";
```

However, SDK v1.26.0 still exports from the v1 paths, and the package.json subpath exports support both styles. Using the v1 paths with `.js` extensions is correct for the current SDK version and works with the ESM module resolution. **Not a violation** since v1 paths are still supported, but these will need updating when migrating to a future breaking version.

---

## Summary Matrix

| # | Component | Finding | Severity |
|---|-----------|---------|----------|
| 1.1-1.14 | All endpoint paths and HTTP methods | Correct | **VERIFIED** |
| 2.1-2.5 | Query parameters ($select, $expand, $top, pagelevel, includeIDs) | Correct | **VERIFIED** |
| 2.6 | Missing $filter/$orderby/$skip exposure | Reduced API power | **DEVIATION** |
| 3.1 | create-section Content-Type | Correct | **VERIFIED** |
| 3.2 | create-page Content-Type + HTML format | Works but DOCTYPE mismatch with XHTML | **DEVIATION** |
| 3.3 | update-page patch format | Correct | **VERIFIED** |
| 4.1-4.6 | TypeScript interfaces | Match API response shapes | **VERIFIED** |
| 5.1 | @odata.nextLink handling | Correct but fragile regex | **VERIFIED** |
| 5.2 | Collection response shape | Correct | **VERIFIED** |
| 6.1-6.3 | OAuth scopes | Sufficient for all operations | **VERIFIED** |
| 6.4 | Unnecessary User.Read scope | Harmless but unnecessary | **DEVIATION** |
| 7.1 | `$levels=max` on v1.0 | Likely works, documented in examples | **LIKELY ISSUE** |
| 7.2-7.3 | Nested $expand syntax | Matches documentation | **VERIFIED** |
| 7.4 | Hierarchy performance | No payload limit handling | **DEVIATION** |
| 8.1 | `search` query parameter | Undocumented in v1.0 reference | **LIKELY ISSUE** |
| 8.2 | Search scope warning | Missing warning about GET ~/pages limits | **DEVIATION** |
| 9.1-9.3 | registerTool API usage | Correct | **VERIFIED** |
| 10.1-10.2 | Tool annotations | All semantically correct | **VERIFIED** |
| 11.1-11.5 | Resource registration | Correct | **VERIFIED** |
| 11.6 | Resource error handling | Uses generic Error instead of McpError | **DEVIATION** |
| 12.1-12.3 | Prompt registration | Correct | **VERIFIED** |
| 12.4 | Prompt with I/O | Unusual but not prohibited | **DEVIATION** |
| 12.5 | Prompt error handling inconsistency | Different pattern from tools | **DEVIATION** |
| 13.1-13.3 | McpError vs isError usage | Correctly follows protocol | **VERIFIED** |
| 14.1-14.3 | Return types | All match SDK types | **VERIFIED** |
| 15.1 | Import paths | v1 style, still supported | **DEVIATION** |

### Tallies

- **VERIFIED**: 32 findings
- **DEVIATION**: 10 findings (functional, non-blocking)
- **LIKELY ISSUE**: 2 findings (should be verified with live testing)
- **VIOLATION**: 0 findings

---

## Recommendations

### Priority 1: Verify with live testing
1. **`$levels=max` in hierarchy expand** -- Test the exact `NOTEBOOK_HIERARCHY_EXPAND` string against a real Graph API endpoint to confirm it works on v1.0 (not just beta).
2. **`search` query parameter** -- Test `GET /me/onenote/pages?search=...` against the Graph API to confirm it is still supported on v1.0, even though it is undocumented.

### Priority 2: Minor improvements
3. **Search scope warning** -- Add a note to the `search-pages` tool description warning that searching all pages (`GET ~/pages`) may fail with HTTP 400 on accounts with many sections, per the [best practices guide](https://learn.microsoft.com/en-us/graph/onenote-best-practices).
4. **Resource error handling** -- Consider using `McpError` in resource handlers instead of generic `Error` for consistency with tool error handling.
5. **Prompt error handling** -- Consider having the `summarize-page` prompt throw `McpError` on auth failure for consistency with tools.

### Priority 3: Future-proofing
6. **Import paths** -- When upgrading to a future MCP SDK version, update imports from `@modelcontextprotocol/sdk/server/mcp.js` to `@modelcontextprotocol/server`.
7. **XHTML content-type** -- Consider switching `create-page` to use `Content-Type: text/html` which is more accurate for the HTML5 doctype being generated, or alternatively generate valid XHTML.
8. **Additional query parameters** -- Consider exposing `$filter` and `$orderby` in list tools for power users.

---

## References

- [OneNote API Overview (v1.0)](https://learn.microsoft.com/en-us/graph/api/resources/onenote-api-overview?view=graph-rest-1.0)
- [Get OneNote Content and Structure](https://learn.microsoft.com/en-us/graph/onenote-get-content)
- [Update OneNote Page Content](https://learn.microsoft.com/en-us/graph/onenote-update-page)
- [Create OneNote Pages](https://learn.microsoft.com/en-us/graph/onenote-create-page)
- [Delete Page API](https://learn.microsoft.com/en-us/graph/api/page-delete?view=graph-rest-1.0)
- [Create Section API](https://learn.microsoft.com/en-us/graph/api/notebook-post-sections?view=graph-rest-1.0)
- [List Pages API](https://learn.microsoft.com/en-us/graph/api/onenote-list-pages?view=graph-rest-1.0)
- [List Pages (Section) API](https://learn.microsoft.com/en-us/graph/api/section-list-pages?view=graph-rest-1.0)
- [OneNote Best Practices](https://learn.microsoft.com/en-us/graph/onenote-best-practices)
- [OneNote API Overview (Concepts)](https://learn.microsoft.com/en-us/graph/integrate-with-onenote)
- [OneNote Dev Blog: $expand](https://learn.microsoft.com/en-us/archive/blogs/onenotedev/beta-get-onenote-entities-in-one-roundtrip-using-expand)
- [OneNote Dev Blog: Search](https://learn.microsoft.com/en-us/archive/blogs/onenotedev/page-query-and-full-text-search)
- [MCP TypeScript SDK Migration Guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration.md)
- [MCP TypeScript SDK Server Docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
