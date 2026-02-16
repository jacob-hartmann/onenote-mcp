# QA Usability Review: OneNote MCP Server

**Reviewer**: QA Engineer
**Date**: 2026-02-16
**Scope**: All 16 tools, 5 resources, 3 prompts, helpers, pagination, client, html utils, constants

---

## CRITICAL

### C-1: `create-page` body content is not HTML-escaped, enabling malformed/broken pages

**Affected file**: `src/utils/html.ts` (`buildPageHtml`), `src/tools/create-page.ts`

**Description**: The `buildPageHtml` function escapes the `title` parameter but injects `bodyContent` directly into the HTML document without any validation or sanitization. If the LLM or user passes malformed HTML, unclosed tags, or raw text containing `<`, `>`, or `&` characters, the resulting XHTML document will be invalid and the Graph API will reject it with a cryptic error.

The tool description says "The content should be provided as HTML" and "Do not include `<html>`, `<head>`, or `<body>` tags -- only the inner body content," but there is zero server-side validation that the content is actually valid HTML/XHTML. An LLM will frequently generate content with unescaped ampersands (e.g., "Tom & Jerry"), bare `<` symbols, or non-self-closing tags like `<br>` instead of `<br/>`, all of which break XHTML.

**Reproduction scenario**:
1. Call `create-page` with `content: "Notes about Tom & Jerry"` (bare ampersand).
2. The Graph API rejects the request because `&` is not valid XHTML.
3. The error returned is a generic Graph API parse error, not actionable for the user.

Alternatively:
1. Call `create-page` with `content: "<p>Hello<br>World</p>"` (`<br>` not self-closed).
2. Same failure -- XHTML requires `<br/>`.

**Suggested fix**: Either (a) validate/sanitize the body content to be valid XHTML before wrapping, (b) convert common HTML to XHTML (self-closing tags, entity escaping), or (c) at minimum, improve the error message to explain XHTML requirements. Also consider accepting plain text content with an automatic conversion to `<p>` tags.

---

### C-2: `update-page` target format guidance is confusing and error-prone

**Affected file**: `src/tools/update-page.ts`

**Description**: The `target` field description says: "Use '#data-id' for custom IDs, generated IDs as-is (no # prefix), 'body' for the first div, or 'title' for the page title." This is confusing because the Microsoft Graph API actually requires `#` prefix for generated IDs too (e.g., `#p:{guid}` or `#div:{guid}`). The description explicitly says "no # prefix" for generated IDs, which will cause all update operations targeting generated elements to fail with a 400 error.

**Reproduction scenario**:
1. Call `get-page-content` with `includeIds=true`.
2. Get back an element with `id="div:{00000000-0000-0000-0000-000000000000}{1}"`.
3. Follow the tool description and use `target: "div:{00000000-...}"` (no `#` prefix).
4. The Graph API returns an error because the target must be `#div:{00000000-...}`.

**Suggested fix**: Correct the description to state that all element IDs require the `#` prefix when used as targets. Example: "Target element ID with '#' prefix (e.g., '#div:{id}', '#p:{id}'). Use 'body' for the page body or 'title' for the page title."

---

### C-3: `list-notebooks` and `list-section-groups` have no pagination -- silently truncate results

**Affected files**: `src/tools/list-notebooks.ts`, `src/tools/list-section-groups.ts`

**Description**: These tools make a single API call without following `@odata.nextLink` pagination. The Graph API has a default page size and will silently return only the first page of results. While most users have fewer than 20 notebooks, users with many shared notebooks or organizational accounts could have more. The response contains no indication that results were truncated.

The `list-sections` tool has the same issue. Only `list-pages` implements pagination.

**Reproduction scenario**:
1. User has 25+ notebooks (e.g., shared organizational notebooks).
2. `list-notebooks` returns only the first page (~20).
3. User asks "which notebook has X?" and the LLM says it doesn't exist, even though it's on page 2.
4. No `@odata.nextLink` or truncation warning is surfaced to the user.

**Suggested fix**: Either (a) implement `fetchAllPages` for these tools like `list-pages` does, or (b) at minimum, check for `@odata.nextLink` in the response and include a warning message when results are truncated (e.g., "Showing 20 of X notebooks. Use pagination to see more.").

---

## HIGH

### H-1: `fetchAllPages` pagination can cause extremely long operations with no progress feedback

**Affected file**: `src/onenote/pagination.ts`

**Description**: When `list-pages` is called without a `top` parameter, `fetchAllPages` follows up to `ONENOTE_MAX_PAGINATION_PAGES = 50` pagination links. With a default page size of 20 items, this means up to 50 sequential HTTP requests fetching up to 1,000 pages. Each request has a 30-second timeout. In the worst case, this could take **25 minutes** of sequential API calls with no progress indicator, no cancellation support, and the resulting JSON payload could be enormous.

**Reproduction scenario**:
1. User has a section with 500+ pages (common for journal/log sections).
2. LLM calls `list-pages` for that section without specifying `top`.
3. System makes 25+ sequential API calls over potentially minutes.
4. The LLM client may time out waiting for the response.
5. If it succeeds, the response is a massive JSON array that consumes significant context window.

**Suggested fix**: (a) Set a reasonable default for `top` (e.g., 20) instead of fetching all pages when omitted. (b) Add a `skip` parameter for manual pagination. (c) Warn in the tool description about the pagination behavior. (d) Consider adding a count to the response so the LLM knows how many total pages exist.

---

### H-2: `search-pages` without `top` has no default limit and no pagination handling

**Affected file**: `src/tools/search-pages.ts`

**Description**: The `search-pages` tool description says "default 20" for the `top` parameter, but the code does NOT set a default `$top` when `top` is undefined. The description says default 20 but the code sends the request without `$top`, leaving the default entirely up to the Graph API (which may be different). Additionally, if the Graph API returns paginated results for a broad search, the `@odata.nextLink` is silently dropped.

**Reproduction scenario**:
1. User searches for a very common term like "meeting".
2. `top` is not specified.
3. The Graph API returns its default page size (which may or may not be 20).
4. If there are more results, the `@odata.nextLink` is discarded silently.
5. User has no way to know there are more results or to paginate.

**Suggested fix**: Either (a) explicitly set `$top` to 20 when not provided (matching the description), or (b) add a `skip` parameter and surface `@odata.nextLink` or total count in the response.

---

### H-3: `create-section` does not validate invalid characters in `displayName`

**Affected file**: `src/tools/create-section.ts`

**Description**: The tool description lists forbidden characters (`? * / : < > | & # ' % ~`) but the Zod schema only validates `min(1)` and `max(50)`. No regex or character validation is applied. If the LLM passes a name containing forbidden characters, the Graph API will return an error, but that error may be generic and unhelpful.

**Reproduction scenario**:
1. Call `create-section` with `displayName: "Q&A Notes"`.
2. The Graph API rejects it because `&` is forbidden.
3. The error is a generic Graph API error, not a clear "character X is not allowed" message.

**Suggested fix**: Add a Zod `.refine()` or `.regex()` validator that rejects names containing the forbidden characters, with a clear error message listing which characters are not allowed.

---

### H-4: Resources throw raw `Error` on API failure instead of returning structured error

**Affected files**: `src/resources/notebooks.ts`, `src/resources/sections.ts`, `src/resources/pages.ts`

**Description**: When an API call fails in resource handlers, the code throws `new Error(result.error.message)`. This loses all the structured error information (status code, error code, retryability) that the `OneNoteClientError` provides. The error message that reaches the user is a raw error string without context about what went wrong or what to do about it.

Contrast this with the tool handlers that use `handleApiResult` and `mapOneNoteError` to provide well-structured error responses with HTTP status codes and error codes.

**Reproduction scenario**:
1. Read `onenote://pages/invalid-id` resource.
2. Graph API returns 404.
3. Resource handler throws `new Error("Resource not found: ...")`.
4. User sees a generic error with no hint about what to do (e.g., "use list-pages to find valid page IDs").

**Suggested fix**: Create an error mapping similar to `mapOneNoteError` for resources, or use `McpError` with appropriate error codes. At minimum, include the HTTP status code and a helpful suggestion in the error message.

---

### H-5: `list-sections` silently ignores `notebookId` when both `notebookId` and `sectionGroupId` are provided

**Affected file**: `src/tools/list-sections.ts`

**Description**: When both `notebookId` and `sectionGroupId` are provided, `sectionGroupId` takes precedence and `notebookId` is silently ignored. The description says "Takes precedence over notebookId if both are provided" but an LLM may not realize one parameter was ignored. Compare this to `create-section` which explicitly rejects the ambiguity with an error. The inconsistency between these two tools is confusing.

**Reproduction scenario**:
1. LLM calls `list-sections` with both `notebookId` and `sectionGroupId` set.
2. Results come from the section group, but the LLM may incorrectly assume they are scoped to the notebook.
3. This could lead to creating pages in the wrong location.

**Suggested fix**: Either (a) return a tool error when both are provided (consistent with `create-section`), or (b) at minimum, include a note in the response that `notebookId` was ignored.

---

### H-6: No `create-notebook` tool exists -- users cannot create new notebooks

**Affected files**: All tool files (missing capability)

**Description**: The MCP server provides `create-section` and `create-page` but no `create-notebook` tool. This is a significant gap. A user who wants to start organizing new content must already have a notebook. While the Graph API supports creating notebooks (`POST /me/onenote/notebooks`), this tool is not exposed.

**Reproduction scenario**:
1. User asks: "Create a new notebook called 'Project Alpha' with a section for meeting notes."
2. The LLM cannot create the notebook.
3. The user must manually create it in OneNote and then return.

**Suggested fix**: Add a `create-notebook` tool that accepts a `displayName` parameter.

---

### H-7: No tool to move, copy, or rename pages/sections

**Affected files**: All tool files (missing capability)

**Description**: Common OneNote operations like moving a page between sections, copying a page, or renaming a section are not supported. These are things users frequently want to do when organizing notes, and the Graph API supports them.

**Reproduction scenario**:
1. User asks: "Move all meeting notes from 'General' section to 'Meetings' section."
2. The LLM has no tool available to accomplish this.
3. The only workaround is to get page content, create a new page in the target section, and delete the old one -- losing metadata, revision history, and potentially embedded content.

**Suggested fix**: Add `copy-page` (`POST /me/onenote/pages/{id}/copyToSection`) and consider a `rename-section` or `update-section` tool.

---

## MEDIUM

### M-1: `get-page` vs `get-page-content` vs `get-page-preview` -- LLM disambiguation is fragile

**Affected files**: `src/tools/get-page.ts`, `src/tools/get-page-content.ts`, `src/tools/get-page-preview.ts`

**Description**: An LLM must choose between three tools that all involve "getting a page." While the descriptions differentiate them, a user asking "show me the contents of page X" could reasonably trigger any of the three. The descriptions help, but the tool naming is not self-evident:
- `get-page`: metadata only (no content)
- `get-page-content`: full HTML
- `get-page-preview`: text preview (300 chars)

The name `get-page` is the most intuitive name for "show me the page," but it returns the least useful data (no content). An LLM is likely to call `get-page` when the user wants `get-page-content`.

**Suggested fix**: Consider renaming `get-page` to `get-page-metadata` to make it clearer that it does not return content. Alternatively, add "Returns metadata ONLY (title, dates, parent info) -- NO page content" more prominently in the description.

---

### M-2: `update-page` has `destructiveHint: false` but `replace` action IS destructive

**Affected file**: `src/tools/update-page.ts`

**Description**: The `update-page` tool annotations mark it as `destructiveHint: false`, but the `replace` action completely replaces the content of a targeted element, which is destructive. If the LLM targets `body` with a `replace` action, it replaces the entire page content. This is arguably more destructive than `delete-page` in some ways because it silently overwrites content.

**Suggested fix**: Set `destructiveHint: true` since the `replace` action can destroy existing content. Alternatively, add a warning in the description about the `replace` action's behavior.

---

### M-3: `buildPageHtml` produces inconsistent whitespace in the body

**Affected file**: `src/utils/html.ts`

**Description**: The `buildPageHtml` function uses template literal formatting that adds leading whitespace to the body content:
```
<body>\n    ${body}\n  </body>
```
This means the body content is indented with 4 spaces, which could affect how the Graph API interprets whitespace-sensitive elements. When `body` is empty, the output is `<body>\n    \n  </body>` with spurious whitespace.

**Suggested fix**: Trim the body content insertion or don't add leading whitespace: `<body>${body}</body>`.

---

### M-4: Error messages from `mapOneNoteError` don't suggest corrective actions

**Affected file**: `src/tools/helpers.ts`

**Description**: The error mapping in `mapOneNoteError` produces technical messages like `"OneNote API error [NOT_FOUND] (HTTP 404): Resource not found"`. While these are accurate, they don't help the LLM or user recover. A 404 on a page ID should suggest "Use list-pages to find valid page IDs." A 403 should suggest checking permissions. A 429 should suggest "Wait a moment and try again."

**Reproduction scenario**:
1. Call `get-page` with an invalid `pageId`.
2. Error: `"OneNote API error [NOT_FOUND] (HTTP 404): Resource not found"`.
3. The LLM may not know how to recover without a suggestion.

**Suggested fix**: Add context-specific recovery suggestions to common error codes. For example:
- 404: "The resource was not found. Verify the ID is correct using the appropriate list tool."
- 429: "Rate limit exceeded. Wait a moment before retrying."
- 403: "Access denied. Check that the authenticated account has permissions to this resource."

---

### M-5: `NOTEBOOK_HIERARCHY_EXPAND` uses `$levels=max` which may not be supported

**Affected file**: `src/constants.ts`

**Description**: The hierarchy expand string uses `$levels=max` for deeply nested section groups:
```
sectionGroups($expand=sections(...),sectionGroups($levels=max;$expand=sections(...)))
```
The `$levels=max` parameter is an OData feature that may not be fully supported by the Microsoft Graph OneNote API for all nesting depths. If the API doesn't support it or limits it, the hierarchy will be silently truncated without warning.

**Reproduction scenario**:
1. User has section groups nested 4+ levels deep.
2. `get-notebook-hierarchy` only returns 2-3 levels.
3. User thinks certain section groups don't exist.

**Suggested fix**: Document the nesting depth limitation in the tool description, or test and verify the actual depth supported by the Graph API.

---

### M-6: `escapeHtml` does not escape single quotes

**Affected file**: `src/utils/html.ts`

**Description**: The `escapeHtml` function escapes `&`, `<`, `>`, and `"` but not single quotes (`'`). In XHTML attributes that use single quotes, this could cause issues. While the current usage (only for page titles inside `<title>` tags) is unlikely to trigger this, the function name suggests it's a general-purpose utility.

**Suggested fix**: Add `'` to `&#39;` or `&apos;` replacement to the function.

---

### M-7: Resource `notebook-sections` has `list: undefined` -- cannot discover available sections

**Affected file**: `src/resources/sections.ts`

**Description**: The `notebook-sections` resource template has `list: undefined`, meaning MCP clients cannot enumerate available sections through the resource discovery mechanism. Similarly, `section-pages` and `page-content` resource templates have `list: undefined`. Only the `notebook` resource template provides a `list` callback.

This means an MCP client exploring available resources will see the notebook list but will have no way to browse deeper into sections or pages through the resource system alone -- they must use tools.

**Suggested fix**: Implement `list` callbacks for section and page resource templates, similar to how the `notebook` template lists all notebooks.

---

### M-8: `delete-page` has no confirmation or undo mechanism

**Affected file**: `src/tools/delete-page.ts`

**Description**: The `delete-page` tool permanently deletes a page with no confirmation step and no undo. While `destructiveHint: true` is correctly set, an LLM could potentially delete the wrong page if it misidentifies a page ID. The success response is just "Page deleted successfully." with no information about what was deleted (title, section, etc.).

**Suggested fix**: (a) Include the page title and section name in the success response so the user can verify the correct page was deleted. (b) Consider fetching page metadata before deletion to include in the response. (c) Add a warning in the description that this is permanent and cannot be undone.

---

### M-9: `list-pages` description says "default 20" for `top` but actual behavior is to fetch ALL pages when omitted

**Affected file**: `src/tools/list-pages.ts`

**Description**: The `top` parameter description says "Maximum number of pages to return (1-100, default 20)," but when `top` is omitted, the code calls `fetchAllPages` which follows all pagination links and can return hundreds or thousands of pages. The word "default 20" is misleading -- there is no default; omitting `top` means "fetch everything."

**Suggested fix**: Either (a) change the description to accurately explain: "If omitted, all pages in the section are returned (may be slow for large sections)" or (b) actually default to 20 when not specified.

---

### M-10: Empty string IDs will produce invalid API paths

**Affected files**: All tools that accept ID parameters (`get-notebook.ts`, `get-section.ts`, `get-page.ts`, etc.)

**Description**: The Zod schemas for ID parameters use `z.string()` without `.min(1)`. An empty string `""` passes validation and produces API paths like `/me/onenote/pages//content`, which will either 404 or return unexpected results. The `create-section` tool specifically handles empty strings for its optional IDs, suggesting awareness of this issue, but individual "get" tools do not guard against it.

**Suggested fix**: Add `.min(1)` to all required ID parameter Zod schemas to reject empty strings at validation time with a clear error.

---

## LOW

### L-1: `get-notebook-hierarchy` could be overwhelming for large accounts

**Affected file**: `src/tools/get-notebook-hierarchy.ts`

**Description**: For users with many notebooks, each containing many sections and section groups, the hierarchy response could be very large and consume significant LLM context window. There is no option to limit the response to a specific notebook or to control the depth.

**Suggested fix**: Add an optional `notebookId` parameter to scope the hierarchy to a single notebook.

---

### L-2: `stripHtml` function is never used in any tool or resource

**Affected file**: `src/utils/html.ts`

**Description**: The `stripHtml` function exists but is not imported or used anywhere in the tools, resources, or prompts. It could be useful for the `summarize-page` prompt to provide plain text instead of HTML, reducing token usage in the LLM context.

**Suggested fix**: Consider using `stripHtml` in the `summarize-page` prompt to convert HTML to plain text before sending to the LLM, or remove the dead code.

---

### L-3: `summarize-page` prompt sends full HTML to the LLM, wasting tokens

**Affected file**: `src/prompts/summarize-page.ts`

**Description**: The `summarize-page` prompt fetches the raw HTML content and includes it verbatim in the prompt message. HTML tags, styles, and structural markup consume significant tokens without adding value to a summary. The existing `stripHtml` utility could reduce the content size substantially.

**Suggested fix**: Use `stripHtml` to convert the HTML to plain text before including it in the prompt, or at minimum strip `<style>` and `<script>` tags and OneNote-specific markup.

---

### L-4: `search-pages` does not indicate that search scoping by notebook is not directly supported

**Affected file**: `src/tools/search-pages.ts`

**Description**: The `search-pages` tool allows scoping by `sectionId` but not by `notebookId`. The `search-notes` prompt suggests scoping by notebook name, but the search tool requires a `sectionId`. To search within a notebook, the user/LLM must first list all sections in that notebook and then search each section individually, which is cumbersome and slow.

**Suggested fix**: Either (a) add a `notebookId` parameter that searches across all sections in that notebook (by fetching sections first and searching each), or (b) make the limitation clear in the tool description.

---

### L-5: `list-pages` and `search-pages` `$select` fields don't include `parentSection` info

**Affected files**: `src/tools/list-pages.ts`, `src/tools/search-pages.ts`

**Description**: When `search-pages` returns results across all notebooks, the results include page metadata but not the parent section or notebook name. The LLM has to make additional calls to `get-page` to find out which section/notebook a search result belongs to, which is inefficient.

**Suggested fix**: Consider adding `$expand=parentSection($select=id,displayName)` to search results so the LLM can report where each result was found.

---

### L-6: `create-page` description mentions XHTML but `content` parameter says "HTML"

**Affected file**: `src/tools/create-page.ts`

**Description**: The tool description says "The HTML must be valid XHTML" but the `content` parameter description says "HTML body content." This inconsistency may confuse an LLM into generating HTML (not XHTML), which will fail (see C-1). The terms HTML and XHTML are often conflated, but the difference matters here (self-closing tags, case sensitivity, entity encoding).

**Suggested fix**: Consistently use "XHTML" in all descriptions, and ideally provide a brief example of valid content.

---

### L-7: `ONENOTE_MAX_PAGINATION_PAGES` limit of 50 is undocumented in tool descriptions

**Affected file**: `src/constants.ts`, `src/tools/list-pages.ts`

**Description**: The pagination safety limit of 50 pages (up to ~1000 items) is not mentioned in any tool description. If a section has more than ~1000 pages, results will be silently truncated with no indication.

**Suggested fix**: Either document this limit in the `list-pages` tool description or include a truncation warning in the response when `maxPages` is reached.

---

### L-8: `create-note` prompt doesn't handle the case where user has zero notebooks

**Affected file**: `src/prompts/create-note.ts`

**Description**: The `create-note` prompt instructs the LLM to "Use list-notebooks to show me my available notebooks" and then "Ask me which notebook to use." If the user has zero notebooks, there is no guidance for the LLM on how to handle this case (since there is also no `create-notebook` tool -- see H-6).

**Suggested fix**: Add a note in the prompt like "If no notebooks are available, inform the user they need to create one in OneNote first."

---

### L-9: `requestRaw` does not support request bodies -- cannot be used for HTML POST with params

**Affected file**: `src/onenote/client.ts`

**Description**: The `requestRaw` method destructures `body` from `options` but never uses it. If someone tried to use `requestRaw` for a POST request with a body, the body would be silently dropped. Currently this is not a problem because `requestRaw` is only used for GET requests, but it is a latent issue.

```typescript
const { path, method = "GET", params, accept } = options;
// 'body' is never used from RequestOptions
```

**Suggested fix**: Either (a) explicitly exclude `body` from the accepted options type for `requestRaw`, or (b) include body handling similar to the `request` method.

---

### L-10: `NETWORK_ERROR` is marked as `retryable: false` but network errors are often transient

**Affected file**: `src/onenote/client.ts`

**Description**: In `mapNetworkError`, non-timeout network errors (e.g., DNS failures, connection resets) are marked as `retryable: false`. Many network errors are transient and could succeed on retry. While `retryable` is just metadata and doesn't trigger automatic retries, it could be used by future retry logic.

**Suggested fix**: Set `retryable: true` for general network errors, or at least for connection-related errors.

---

### L-11: Resource error handling is inconsistent -- `notebook` list callback returns empty array on failure

**Affected file**: `src/resources/notebooks.ts`

**Description**: The `notebook` resource template's `list` callback silently returns `{ resources: [] }` when the API call fails (line 74-76). This hides errors and makes it appear the user has no notebooks when in fact the API call simply failed (e.g., due to auth issues, network problems).

**Suggested fix**: Either throw an error (consistent with the read handlers) or log a warning so the failure is not completely silent.

---

### L-12: `update-page` does not validate `action` + `position` combinations

**Affected file**: `src/tools/update-page.ts`

**Description**: The `position` parameter is described as meaningful for `append` and `insert` actions, but the schema allows it for `replace` and `prepend` too. Passing `position` with `replace` will result in a Graph API error. The tool could validate this locally and provide a clearer error.

**Suggested fix**: Add a Zod `.refine()` or runtime check that `position` is only provided when `action` is `append` or `insert`.

---

### L-13: No rate limit handling or retry logic

**Affected files**: `src/onenote/client.ts`, `src/tools/helpers.ts`

**Description**: When the Graph API returns a 429 (rate limited), the error is correctly identified and marked as `retryable: true`, but no retry is attempted. The Retry-After header from the response is not read or surfaced. The user just sees "Rate limit exceeded" with no guidance on when to retry.

**Suggested fix**: (a) Read and surface the `Retry-After` header value in the error message. (b) Consider adding automatic retry with exponential backoff for retryable errors.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| CRITICAL | 3 | Content validation gaps, incorrect documentation causing API failures, silent truncation |
| HIGH | 7 | Pagination dangers, missing validation, inconsistent error handling, missing tools |
| MEDIUM | 10 | Naming confusion, incorrect annotations, misleading defaults, missing guardrails |
| LOW | 13 | Missing features, dead code, token waste, edge cases |
| **Total** | **33** | |

### Top 5 Recommendations (by impact)

1. **Fix `update-page` target ID documentation** (C-2) -- This will cause every update attempt using generated IDs to fail.
2. **Validate or sanitize `create-page` content** (C-1) -- LLMs will routinely generate invalid XHTML.
3. **Handle pagination in list-notebooks/sections/section-groups** (C-3) -- Silent data loss for users with many notebooks.
4. **Set a real default for `list-pages` `top` parameter** (H-1/M-9) -- Prevent accidental massive fetches.
5. **Add `create-notebook` tool** (H-6) -- Fundamental CRUD gap that blocks common workflows.
