# Microsoft Graph API Cross-Cutting Concerns

> **Research Spike** -- Patterns and best practices that apply across all Microsoft Graph API
> endpoints, with specific attention to OneNote API behaviors.
>
> Last updated: 2026-02-16

---

## Table of Contents

1. [OData Query Parameters](#1-odata-query-parameters)
2. [Pagination](#2-pagination)
3. [Error Handling](#3-error-handling)
4. [Batch Requests](#4-batch-requests)
5. [Permissions Model](#5-permissions-model)
6. [Best Practices](#6-best-practices)
7. [References](#7-references)

---

## 1. OData Query Parameters

Microsoft Graph APIs support OData v4.0 system query options to customize responses. These
parameters are only supported in GET operations. On the `beta` endpoint the `$` prefix is
optional, but on `v1.0` the `$` prefix should always be used for consistency.

> **Important:** Support for specific query parameters varies between API operations and can
> differ between the `v1.0` and `beta` endpoints. Always consult the specific API reference
> page to confirm support.

### 1.1 `$select` -- Selecting Specific Properties

Returns a subset of properties for a resource, reducing response payload size.

```http
GET https://graph.microsoft.com/v1.0/me/messages?$select=from,subject
```

**OneNote support:** Fully supported on all OneNote collection and entity endpoints (pages,
sections, section groups, notebooks).

```http
GET https://graph.microsoft.com/v1.0/me/onenote/sections?$select=id,displayName
GET https://graph.microsoft.com/v1.0/me/onenote/pages?$select=id,title,createdDateTime
```

**Key behavior:**
- Property names are case-sensitive.
- When `$select` is not used, Microsoft Graph returns a `@microsoft.graph.tips` property
  recommending its use.
- Using `$select` is one of the most impactful performance optimizations; always use it in
  production code.

### 1.2 `$filter` -- Filtering Results

Returns a subset of rows matching a Boolean expression.

```http
GET https://graph.microsoft.com/v1.0/users?$filter=startswith(givenName,'J')
```

**OneNote support:** Supported on collection endpoints (pages, sections, section groups,
notebooks).

```http
GET https://graph.microsoft.com/v1.0/me/onenote/sections?$filter=createdTime ge 2015-01-01
GET https://graph.microsoft.com/v1.0/me/onenote/pages?$filter=createdByAppId eq '{app-id}'
```

**Supported comparison operators:** `eq`, `ne`, `gt`, `ge`, `lt`, `le`

**Supported logical operators:** `and`, `or`, `not`

**Supported string functions:** `contains`, `endswith`, `startswith`, `length`, `indexof`,
`substring`, `tolower`, `toupper`, `trim`, `concat`

**Key behavior:**
- Property names and OData string comparisons are case-sensitive.
- Always use the `tolower()` function for case-insensitive string comparisons:
  `$filter=tolower(name) eq 'spring'`
- Spaces in query strings must be percent-encoded as `%20`.
- Single quotes in values must be double-escaped: `'let''s meet'`.

### 1.3 `$expand` -- Expanding Navigation Properties

Returns related resources inline in the response, eliminating the need for additional
round-trip requests.

```http
GET https://graph.microsoft.com/v1.0/groups?$expand=members
```

**OneNote support:** Supported with specific navigation properties per entity type:

| Entity Type     | Expandable Navigation Properties                                       |
|-----------------|------------------------------------------------------------------------|
| Pages           | `parentNotebook`, `parentSection`                                      |
| Sections        | `parentNotebook`, `parentSectionGroup`                                 |
| Section Groups  | `sections`, `sectionGroups`, `parentNotebook`, `parentSectionGroup`    |
| Notebooks       | `sections`, `sectionGroups`                                            |

**Multi-level expand:**

```http
GET https://graph.microsoft.com/v1.0/me/onenote/notebooks?$expand=sections,sectionGroups($expand=sections)
```

**Expand with select:**

```http
GET https://graph.microsoft.com/v1.0/me/onenote/sectionGroups/{id}?$expand=sections($select=name,self)&$select=name,self
```

**Key behavior:**
- By default, GET requests for pages expand `parentSection` and select `id`, `name`, and
  `self`.
- By default, GET requests for sections and section groups expand both `parentNotebook` and
  `parentSectionGroup`.
- Circular references (expanding parents of child entities or children of parent entities)
  are not supported.
- The `levels=max` option can retrieve deeply nested structures:
  ```http
  GET ~/notebooks?$expand=sections,sectionGroups($expand=sections,sectionGroups(levels=max;expand=sections))
  ```

### 1.4 `$top` -- Limiting Results Count

Specifies the number of items to include in the result set (page size).

```http
GET https://graph.microsoft.com/v1.0/me/messages?$top=5
```

**OneNote support:** Supported. The default value is **20** entries for pages. The maximum
value for OneNote page queries is **100**.

```http
GET https://graph.microsoft.com/v1.0/me/onenote/pages?$top=50
GET https://graph.microsoft.com/v1.0/me/onenote/sections/{id}/pages?$top=100
```

**Key behavior:**
- The minimum value is 1; the maximum depends on the API.
- For OneNote pages, the maximum is **100** and the default is **20**.
- If more results remain, an `@odata.nextLink` URL is returned for the next page.
- Exceeding the maximum returns error code **20129**.

### 1.5 `$skip` -- Skipping Results for Pagination

Sets the number of items to skip at the start of a collection. Used for client-side
pagination.

```http
GET https://graph.microsoft.com/v1.0/me/events?$orderby=createdDateTime&$skip=20
```

**OneNote support:** Supported on collection endpoints.

```http
GET https://graph.microsoft.com/v1.0/me/onenote/pages?$filter=createdTime ge 2015-01-01&$top=5&$skip=5
```

**Key behavior:**
- Typically used in combination with `$top` for manual pagination.
- Some APIs use `$skip` in the `@odata.nextLink` URL for server-driven paging.
- Not all APIs support `$skip` (e.g., directory objects do not).

### 1.6 `$orderby` -- Ordering Results

Specifies the sort order of items. Default is ascending.

```http
GET https://graph.microsoft.com/v1.0/users?$orderby=displayName desc
```

**OneNote support:** Supported on collection endpoints.

| Entity Type     | Default Sort Order             |
|-----------------|--------------------------------|
| Notebooks       | `name asc`                     |
| Section Groups  | `name asc`                     |
| Sections        | `name asc`                     |
| Pages           | `lastModifiedTime desc`        |

```http
GET https://graph.microsoft.com/v1.0/me/onenote/sections?$orderby=lastModifiedTime desc
GET https://graph.microsoft.com/v1.0/me/onenote/sections/{id}/pages?$orderby=createdDateTime
```

**Key behavior:**
- Append `asc` or `desc` separated by a space: `$orderby=name%20desc`.
- Multiple sort properties are comma-separated: `$orderby=createdByAppId,createdTime desc`.
- Property names are case-sensitive.
- For OneNote pages, overriding the default `lastModifiedTime` ordering improves
  performance.

### 1.7 `$count` -- Getting Total Count

Returns the total count of matching resources in the collection.

**As a query parameter:**
```http
GET https://graph.microsoft.com/v1.0/me/contacts?$count=true
```
Returns the `@odata.count` property in the response alongside the data.

**As a URL segment:**
```http
GET https://graph.microsoft.com/v1.0/users/$count
```
Returns only the integer total.

**OneNote support:** Supported on collection endpoints (pages, sections, section groups,
notebooks).

```http
GET https://graph.microsoft.com/v1.0/me/onenote/pages?$count=true
```

**Key behavior:**
- When used as a query parameter (`$count=true`), the count appears in `@odata.count` in
  the first page of results only.
- On directory objects, `$count` requires the `ConsistencyLevel: eventual` header (advanced
  query).
- OneNote endpoints do not require `ConsistencyLevel`.

### 1.8 `$search` -- Full-Text Search

Returns results based on search criteria.

```http
GET https://graph.microsoft.com/v1.0/me/messages?$search=pizza
```

**OneNote support:** `$search` is **not supported** on OneNote endpoints. Use `$filter` with
string functions (`contains`, `startswith`, `endswith`) as an alternative:

```http
GET https://graph.microsoft.com/v1.0/me/onenote/sections?$filter=contains(tolower(name),'spring')
```

### 1.9 OneNote Query Parameter Support Matrix

| Parameter   | Notebooks | Section Groups | Sections | Pages | Notes                                    |
|-------------|-----------|----------------|----------|-------|------------------------------------------|
| `$select`   | Yes       | Yes            | Yes      | Yes   |                                          |
| `$filter`   | Yes       | Yes            | Yes      | Yes   |                                          |
| `$expand`   | Yes       | Yes            | Yes      | Yes   | Limited to specific navigation properties|
| `$top`      | Yes       | Yes            | Yes      | Yes   | Max 100 for pages, default 20            |
| `$skip`     | Yes       | Yes            | Yes      | Yes   |                                          |
| `$orderby`  | Yes       | Yes            | Yes      | Yes   | Default varies by entity type            |
| `$count`    | Yes       | Yes            | Yes      | Yes   |                                          |
| `$search`   | No        | No             | No       | No    | Use `$filter` with string functions      |

**OneNote-specific parameter -- `pagelevel`:**

The `pagelevel=true` query parameter returns the indentation level and order of pages within
their parent section. Only available on:
- Page collections within a specific section: `GET ~/sections/{id}/pages?pagelevel=true`
- Individual page entities: `GET ~/pages/{id}?pagelevel=true`

### 1.10 Encoding Query Parameters

Query parameter values must be percent-encoded per RFC 3986. Many HTTP clients handle this
automatically.

- Unencoded: `$filter=startswith(givenName, 'J')`
- Encoded: `$filter=startswith(givenName%2C+'J')`
- Spaces: always encode as `%20`
- Single quotes in values: escape by doubling (`''`)

---

## 2. Pagination

Microsoft Graph uses both server-side and client-side paging to manage large result sets.

### 2.1 `@odata.nextLink` Pattern

When more results are available beyond the current page, the response includes an
`@odata.nextLink` property containing a URL to fetch the next page.

```json
{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users",
  "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?$top=5&$skiptoken=RFNwdAIAAQAAAD8...",
  "value": [ ... ]
}
```

**How to iterate through all pages:**

```typescript
async function getAllPages<T>(client: GraphClient, url: string): Promise<T[]> {
  const allItems: T[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const response = await client.get(nextUrl);
    allItems.push(...response.value);
    nextUrl = response['@odata.nextLink'];
  }

  return allItems;
}
```

**Key rules:**
1. Use the **entire** `@odata.nextLink` URL as-is; do not modify or extract parts of it.
2. Continue fetching until `@odata.nextLink` is no longer present in the response.
3. A page of results may contain zero or more items.
4. The `@odata.nextLink` URL may contain either `$skiptoken` or `$skip` depending on the API.
5. Do not try to extract or reuse `$skiptoken` values in other requests.

### 2.2 Server-Side Paging

The server returns a default number of results without the client specifying `$top`. For
example, `GET /users` returns 100 results by default. When more results exist, the response
includes `@odata.nextLink`.

### 2.3 Client-Side Paging

The client controls page size using `$top`, `$skip`, or `$skiptoken`.

```http
GET https://graph.microsoft.com/v1.0/me/onenote/pages?$top=50
GET https://graph.microsoft.com/v1.0/me/onenote/pages?$top=50&$skip=50
```

### 2.4 Default and Maximum Page Sizes

| Resource           | Default Page Size | Maximum Page Size |
|--------------------|-------------------|-------------------|
| OneNote Pages      | 20                | 100               |
| OneNote Sections   | 20                | 100               |
| OneNote Notebooks  | 20                | 100               |
| Users              | 100               | 999               |
| Messages           | 10                | 1000              |

> **Note:** Different APIs may have different default and maximum page sizes. If you specify
> a `$top` value exceeding the maximum, the behavior varies: some APIs silently cap it, some
> return an error.

### 2.5 OneNote Pagination Specifics

- For **pages**, the default sort order is `lastModifiedTime desc`. Requests without `$top`
  return the first 20 entries and include `@odata.nextLink` if more exist.
- For best performance, get pages **per section** rather than across all notebooks, to avoid
  hitting error code `20266` (maximum number of sections exceeded).
- Override the default `lastModifiedDateTime` ordering when you do not need it, as the
  server is faster without sorting by `lastModifiedTime`.

### 2.6 ConsistencyLevel Header in Pagination

When paging through directory resources that require the `ConsistencyLevel: eventual` header,
this header is **not automatically included** in subsequent page requests. It must be set
explicitly on each request. This does not apply to OneNote endpoints.

---

## 3. Error Handling

### 3.1 Standard Error Response Format

All Microsoft Graph errors follow a consistent JSON structure:

```json
{
  "error": {
    "code": "badRequest",
    "message": "Uploaded fragment overlaps with existing data.",
    "innerError": {
      "code": "invalidRange",
      "request-id": "94fb3b52-452a-4535-a601-69e0a90e3aa2",
      "date": "2020-08-18T12:51:51"
    }
  }
}
```

**Error object properties:**

| Property     | Type          | Description                                                              |
|--------------|---------------|--------------------------------------------------------------------------|
| `code`       | string        | Machine-readable error code string. Rely on this in code.                |
| `message`    | string        | Human-readable message for developers. Do not display to users or depend on in code. |
| `innerError` | error object  | Optional. More specific nested error. May recursively contain more `innerError` objects. |
| `details`    | error array   | Optional. Breakdown of multiple errors (e.g., in batch operations).      |

**Best practice:** Loop through all nested `innerError` objects and use the most specific
error code your application understands.

### 3.2 Common HTTP Status Codes

| Code | Name                   | Description                                                                                   | Retry? |
|------|------------------------|-----------------------------------------------------------------------------------------------|--------|
| 400  | Bad Request            | Malformed or incorrect request.                                                               | No     |
| 401  | Unauthorized           | Missing or invalid authentication.                                                            | No*    |
| 403  | Forbidden              | Insufficient permissions or license.                                                          | No     |
| 404  | Not Found              | Requested resource does not exist.                                                            | No     |
| 409  | Conflict               | Conflict with current state (e.g., concurrency violation). Retry with exponential backoff.    | Yes    |
| 429  | Too Many Requests      | Throttled. Respect `Retry-After` header.                                                      | Yes    |
| 500  | Internal Server Error  | Server-side error during processing.                                                          | Yes    |
| 503  | Service Unavailable    | Service temporarily unavailable. Respect `Retry-After` header.                                | Yes    |

*\* 401 can be retried after refreshing the access token.*

### 3.3 Throttling (429 Too Many Requests)

When a throttling threshold is exceeded, the API returns:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 10

{
  "error": {
    "code": "TooManyRequests",
    "innerError": {
      "code": "429",
      "date": "2020-08-18T12:51:51",
      "message": "Please retry after",
      "request-id": "94fb3b52-452a-4535-a601-69e0a90e3aa2",
      "status": "429"
    },
    "message": "Please retry again later."
  }
}
```

**Retry strategy:**
1. Wait the number of seconds specified in the `Retry-After` header.
2. Retry the request.
3. If it fails again with 429, continue respecting `Retry-After` with each attempt.
4. If no `Retry-After` header is present, use exponential backoff.

### 3.4 OneNote-Specific Error Codes

The OneNote API returns numeric error codes in the `error.code` field. Key categories:

#### Service Errors (10001--19999)

| Code  | Description                                                                  |
|-------|------------------------------------------------------------------------------|
| 10001 | Unexpected error; request failed.                                            |
| 10002 | Service currently unavailable.                                               |
| 10003 | User exceeded maximum number of active requests (throttling).                |
| 10004 | Cannot create page in password-protected section.                            |
| 10006 | Cannot create page; section is corrupt.                                      |
| 10007 | Server too busy; try again later.                                            |
| 10008 | Document library contains more than 5,000 OneNote items; cannot query via API.|
| 10013 | Document library contains more than 20,000 items; cannot be indexed.         |

#### Client Errors (20001--29999)

| Code  | Description                                                                  |
|-------|------------------------------------------------------------------------------|
| 20001 | Missing required "Presentation" part.                                        |
| 20005 | Request URI too long (max 16 KB).                                            |
| 20008 | Request size too large.                                                      |
| 20100 | Syntax error in request.                                                     |
| 20101 | Requested property does not exist.                                           |
| 20102 | Requested resource does not exist.                                           |
| 20103 | `$expand` query not supported for this request.                              |
| 20108 | Unsupported OData query parameters.                                          |
| 20112 | Invalid entity ID.                                                           |
| 20113 | Resource has been deleted.                                                   |
| 20129 | `$top` value too high (max 100 for pages, default 20).                       |
| 20166 | Application issued too many requests on behalf of a user (429 throttling).   |
| 20266 | Maximum number of sections exceeded; get pages per section instead.          |

#### Account Errors (30001--39999)

| Code  | Description                                                                  |
|-------|------------------------------------------------------------------------------|
| 30101 | User account exceeded OneDrive quota.                                        |
| 30102 | Section reached maximum size.                                                |
| 30103 | Resource consumption too high for the request.                               |
| 30104 | User account suspended.                                                      |
| 30105 | User's OneDrive for Business site not provisioned.                           |

#### Permission Errors (40001--49999)

| Code  | Description                                                                  |
|-------|------------------------------------------------------------------------------|
| 40001 | Request does not contain a valid OAuth token.                                |
| 40002 | User lacks write permission.                                                 |
| 40003 | User lacks read permission for the resource.                                 |
| 40004 | OAuth token missing required scopes.                                         |

### 3.5 Error Handling Strategy for Implementation

```typescript
interface GraphError {
  error: {
    code: string;
    message: string;
    innerError?: {
      code: string;
      'request-id': string;
      date: string;
    };
  };
}

async function handleGraphRequest<T>(requestFn: () => Promise<T>): Promise<T> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      const status = error.statusCode;
      const retryAfter = error.headers?.['retry-after'];

      if (status === 429 || status === 503 || status === 500) {
        if (attempt === MAX_RETRIES) throw error;

        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt) * 1000; // Exponential backoff

        await sleep(delay);
        continue;
      }

      // Non-retryable errors
      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}
```

---

## 4. Batch Requests

### 4.1 Overview

JSON batching combines up to **20 individual requests** into a single HTTP call to reduce
network round trips.

**Endpoint:**
```
POST https://graph.microsoft.com/v1.0/$batch
```

### 4.2 Request Format

```http
POST https://graph.microsoft.com/v1.0/$batch
Accept: application/json
Content-Type: application/json

{
  "requests": [
    {
      "id": "1",
      "method": "GET",
      "url": "/me/onenote/notebooks"
    },
    {
      "id": "2",
      "method": "GET",
      "url": "/me/onenote/sections?$select=id,displayName"
    },
    {
      "id": "3",
      "method": "GET",
      "url": "/me/onenote/pages?$top=10&$select=id,title"
    }
  ]
}
```

**Individual request properties:**

| Property  | Required | Description                                                           |
|-----------|----------|-----------------------------------------------------------------------|
| `id`      | Yes      | String correlation ID. Must be unique within the batch. Not case-sensitive. |
| `method`  | Yes      | HTTP method (GET, POST, PATCH, DELETE, PUT).                          |
| `url`     | Yes      | Relative resource URL (e.g., `/me/onenote/notebooks`).                |
| `headers` | No*      | JSON object of key-value header pairs. Required when body is present. |
| `body`    | No       | JSON object or base64 URL-encoded value.                              |

*\* Required if `body` is specified (must include `Content-Type`).*

### 4.3 Response Format

The batch response always returns HTTP 200 (if the batch itself is parseable). Each
individual response has its own status code.

```json
{
  "responses": [
    {
      "id": "1",
      "status": 200,
      "headers": { "Content-Type": "application/json" },
      "body": { "value": [ ... ] }
    },
    {
      "id": "2",
      "status": 200,
      "headers": { "Content-Type": "application/json" },
      "body": { "value": [ ... ] }
    },
    {
      "id": "3",
      "status": 429,
      "headers": { "Retry-After": "10" },
      "body": {
        "error": { "code": "TooManyRequests", "message": "Please retry again later." }
      }
    }
  ]
}
```

**Key behaviors:**
- Individual responses may arrive in a different order than the requests.
- A `200` status on the batch envelope does not mean all individual requests succeeded.
- Each individual request is evaluated against throttling limits independently.

### 4.4 Sequencing with `dependsOn`

The `dependsOn` property specifies execution order:

```json
{
  "requests": [
    { "id": "1", "method": "POST", "url": "/me/onenote/notebooks", "body": {...}, "headers": {...} },
    { "id": "2", "dependsOn": ["1"], "method": "GET", "url": "/me/onenote/notebooks" }
  ]
}
```

If a request fails, all dependent requests fail with status code **424 (Failed Dependency)**.
A batch should be either fully sequential or fully parallel.

### 4.5 Limitations

- Maximum of **20 individual requests** per batch.
- Each request is evaluated individually against throttling limits.
- Throttled requests within a batch are **not automatically retried** by SDKs.
- The batch itself can be malformed (returning 400) independent of individual request
  validity.

### 4.6 Applicability to OneNote

Batch requests are useful for OneNote operations in several scenarios:

| Scenario                                        | Benefit                                          |
|-------------------------------------------------|--------------------------------------------------|
| Fetching notebooks, sections, and pages at once | Single network round trip instead of three       |
| Creating pages in multiple sections             | Reduces latency for bulk creation                |
| Retrieving metadata for multiple specific pages | Combines individual GET requests                 |
| Listing sections from multiple notebooks        | Parallelizes independent queries                 |

**Considerations:**
- Page content retrieval (`GET ~/pages/{id}/content`) returns HTML, which works within
  batches but results in larger payloads.
- Batch requests do not help with the `$expand` use case since that already fetches related
  resources in a single call.
- Each OneNote request within a batch still counts toward OneNote-specific throttling limits.

---

## 5. Permissions Model

### 5.1 Delegated vs. Application Permissions

Microsoft Graph supports two permission types:

| Type        | Description                                                                    |
|-------------|--------------------------------------------------------------------------------|
| Delegated   | App acts on behalf of a signed-in user. Requires user consent or admin consent.|
| Application | App acts without a signed-in user (service/daemon). Requires admin consent.    |

> **Critical:** The Microsoft Graph OneNote API **does not support app-only (application)
> authentication**. All OneNote operations require delegated permissions with a signed-in
> user context.

### 5.2 OneNote-Specific Permissions

| Permission           | Type      | Description                                                          |
|----------------------|-----------|----------------------------------------------------------------------|
| `Notes.Create`       | Delegated | Create new OneNote notebooks (cannot read or modify existing ones).  |
| `Notes.Read`         | Delegated | Read OneNote notebooks owned by or shared with the signed-in user.   |
| `Notes.ReadWrite`    | Delegated | Read and write OneNote notebooks owned by or shared with the signed-in user. |
| `Notes.Read.All`     | Delegated | Read all OneNote notebooks that the signed-in user has access to in the organization. |
| `Notes.ReadWrite.All`| Delegated | Read, share, and modify all OneNote notebooks that the signed-in user has access to in the organization. |

### 5.3 When Each Scope Is Needed

| Operation                          | Minimum Permission Required |
|------------------------------------|-----------------------------|
| List notebooks                     | `Notes.Read`                |
| Get notebook metadata              | `Notes.Read`                |
| List sections                      | `Notes.Read`                |
| List section groups                | `Notes.Read`                |
| List pages (metadata)              | `Notes.Read`                |
| Get page HTML content              | `Notes.Read`                |
| Get page preview                   | `Notes.Read`                |
| Create a new notebook              | `Notes.Create` or `Notes.ReadWrite` |
| Create a new section               | `Notes.ReadWrite`           |
| Create a new page                  | `Notes.ReadWrite`           |
| Update page content (PATCH)        | `Notes.ReadWrite`           |
| Delete a page                      | `Notes.ReadWrite`           |
| Copy a notebook                    | `Notes.ReadWrite`           |
| Copy a section                     | `Notes.ReadWrite`           |
| Access notebooks across the org    | `Notes.Read.All` or `Notes.ReadWrite.All` |
| Write to notebooks across the org  | `Notes.ReadWrite.All`       |

### 5.4 Permission Selection Guidance

- **Principle of least privilege:** Request only the permissions your app needs.
- For read-only scenarios: Use `Notes.Read`.
- For read/write scenarios on the user's own notebooks: Use `Notes.ReadWrite`.
- For cross-user/organizational access (e.g., admin tools): Use `Notes.Read.All` or
  `Notes.ReadWrite.All`.
- `Notes.Create` is a narrow scope only for creating notebooks; it cannot read or modify.
- The `.All` variants still operate in the context of a signed-in user and respect the
  user's access rights within the organization.

### 5.5 Authentication Flow

All requests require the `Authorization` header:

```http
Authorization: Bearer {access-token}
```

- Tokens are obtained via OAuth 2.0 authorization code flow (interactive user sign-in) or
  on-behalf-of flow.
- Tokens must include the appropriate `Notes.*` scopes.
- Missing or invalid tokens result in HTTP 401.
- Insufficient scopes result in HTTP 403 or OneNote error codes 40001/40004.

---

## 6. Best Practices

### 6.1 Rate Limiting / Throttling Best Practices

1. **Respect `Retry-After`:** Always honor the `Retry-After` header value before retrying
   throttled requests.

2. **Implement exponential backoff:** When no `Retry-After` header is present, use
   exponential backoff with jitter:
   ```
   delay = base_delay * 2^attempt + random_jitter
   ```

3. **Limit concurrent requests:** Use connection pooling with bounded concurrency (e.g.,
   max 10-20 concurrent connections).

4. **Avoid polling patterns:** Instead of continuously polling for changes, use
   [change notifications](https://learn.microsoft.com/en-us/graph/change-notifications-overview)
   or [delta queries](https://learn.microsoft.com/en-us/graph/delta-query-overview) where
   available (note: these are limited for OneNote).

5. **OneNote-specific guidance:**
   - Error code `20166` / HTTP 429 indicates per-user throttling for a specific app.
   - Error code `10003` indicates the user's account exceeded the maximum active requests.
   - Error code `10007` indicates the server is too busy.
   - Space out requests when operating on behalf of a single user.
   - If your app is a background service, consider processing users sequentially rather than
     in parallel.

### 6.2 Efficient Data Retrieval

1. **Always use `$select`:** Only request the properties your app needs.
   ```http
   GET ~/sections?$select=id,displayName,createdTime
   ```

2. **Use `$expand` instead of multiple calls:** Fetch related resources in a single request.
   ```http
   GET ~/notebooks?$expand=sections($select=id,displayName)
   ```

3. **Get pages per section, not globally:** Avoid `GET ~/pages` when the user has many
   sections. Instead:
   ```http
   GET ~/sections/{section-id}/pages?$select=id,title
   ```

4. **Override default ordering when unneeded:** The default `lastModifiedTime desc` sort for
   pages is expensive. Use a different sort when possible:
   ```http
   GET ~/sections/{id}/pages?$select=id,title,createdDateTime&$orderby=createdDateTime
   ```

5. **Use `$top` to control payload size:** Fetch only as many items as your UI displays at
   once.

6. **Use batching for independent requests:** Combine unrelated queries into a single
   `$batch` call.

### 6.3 Error Retry Strategies

| HTTP Status | Strategy                                                                 |
|-------------|--------------------------------------------------------------------------|
| 400         | Do not retry. Fix the request.                                           |
| 401         | Refresh the access token, then retry once.                               |
| 403         | Do not retry. Check permissions / scopes.                                |
| 404         | Do not retry. The resource does not exist.                               |
| 409         | Retry with exponential backoff. Use `Retry-After` if provided.           |
| 429         | Wait for `Retry-After` duration, then retry. Max 3-5 retries.           |
| 500         | Retry with exponential backoff. Max 3 retries.                           |
| 503         | Wait for `Retry-After` duration, then retry. Max 3-5 retries.           |

**Recommended retry implementation:**

```typescript
const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

async function retryableRequest<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error.statusCode ?? error.status;

      if (!RETRY_STATUS_CODES.has(status) || attempt === maxRetries) {
        throw error;
      }

      const retryAfter = error.headers?.['retry-after'];
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : baseDelay * Math.pow(2, attempt) + Math.random() * 1000;

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}
```

### 6.4 General API Usage Guidelines

1. **Use v1.0 for production code.** The `beta` endpoint is for development and testing;
   features may change without notice.

2. **Always include `Authorization` header** with a valid Bearer token.

3. **Set `Accept: application/json`** for entity and collection requests, and
   `Accept: text/html` for page content requests.

4. **Include `Content-Type` header** on POST/PATCH requests.

5. **Use the `X-CorrelationId` header** from responses when troubleshooting issues with
   Microsoft support.

6. **Percent-encode query parameters** per RFC 3986.

7. **Do not build `@odata.nextLink` URLs manually.** Always use the URL returned by the
   server.

---

## 7. References

### Official Microsoft Documentation

- [Query Parameters](https://learn.microsoft.com/en-us/graph/query-parameters) -- OData
  query parameter reference
- [Paging](https://learn.microsoft.com/en-us/graph/paging) -- Pagination guidance
- [Throttling](https://learn.microsoft.com/en-us/graph/throttling) -- Throttling overview
  and best practices
- [Throttling Limits](https://learn.microsoft.com/en-us/graph/throttling-limits) --
  Service-specific throttling limits
- [JSON Batching](https://learn.microsoft.com/en-us/graph/json-batching) -- Batch request
  documentation
- [Error Responses](https://learn.microsoft.com/en-us/graph/errors) -- Standard error
  format
- [Permissions Reference](https://learn.microsoft.com/en-us/graph/permissions-reference) --
  Full permissions listing

### OneNote-Specific Documentation

- [OneNote API Overview](https://learn.microsoft.com/en-us/graph/api/resources/onenote-api-overview?view=graph-rest-1.0)
  -- Root URL, supported operations, permissions
- [Get OneNote Content](https://learn.microsoft.com/en-us/graph/onenote-get-content) --
  Query parameters, OData support, entity properties
- [OneNote Error Codes](https://learn.microsoft.com/en-us/graph/onenote-error-codes) --
  Complete error code listing
- [OneNote Best Practices](https://learn.microsoft.com/en-us/graph/onenote-best-practices)
  -- Performance and usage recommendations
- [$filter Query Parameter](https://learn.microsoft.com/en-us/graph/filter-query-parameter)
  -- Detailed filter syntax
- [$search Query Parameter](https://learn.microsoft.com/en-us/graph/search-query-parameter)
  -- Search syntax and behavior

### API Endpoint Quick Reference

| Resource        | List Endpoint                                           | Get Endpoint                        |
|-----------------|---------------------------------------------------------|-------------------------------------|
| Notebooks       | `GET /me/onenote/notebooks`                             | `GET /me/onenote/notebooks/{id}`    |
| Sections        | `GET /me/onenote/sections`                              | `GET /me/onenote/sections/{id}`     |
|                 | `GET /me/onenote/notebooks/{id}/sections`               |                                     |
| Section Groups  | `GET /me/onenote/sectionGroups`                         | `GET /me/onenote/sectionGroups/{id}`|
|                 | `GET /me/onenote/notebooks/{id}/sectionGroups`          |                                     |
| Pages           | `GET /me/onenote/pages`                                 | `GET /me/onenote/pages/{id}`        |
|                 | `GET /me/onenote/sections/{id}/pages`                   |                                     |
| Page Content    |                                                         | `GET /me/onenote/pages/{id}/content`|
| Page Preview    |                                                         | `GET /me/onenote/pages/{id}/preview`|

> **Note:** Replace `/me/` with `/users/{id}/` for other users, `/groups/{id}/` for group
> notebooks, or `/sites/{id}/` for SharePoint site notebooks.
