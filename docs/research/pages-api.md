# Microsoft Graph API - OneNote Pages: Research Spike

> **Date:** 2026-02-16
> **API Version:** v1.0 (stable)
> **Base URL:** `https://graph.microsoft.com/v1.0`
> **Important:** As of March 31, 2025, the Microsoft Graph OneNote API no longer supports app-only (application) authentication. All solutions must use delegated authentication.

---

## Table of Contents

1. [Service Root URLs](#1-service-root-urls)
2. [Page Resource Type](#2-page-resource-type)
3. [Pages Endpoints](#3-pages-endpoints)
   - [List Pages](#31-list-pages)
   - [Get Page Metadata](#32-get-page-metadata)
   - [Get Page Content (HTML)](#33-get-page-content-html)
   - [Get Page Preview](#34-get-page-preview)
   - [Create Page](#35-create-page)
   - [Update Page (PATCH)](#36-update-page-patch)
   - [Delete Page](#37-delete-page)
   - [Copy Page to Section](#38-copy-page-to-section)
4. [HTML Content Model](#4-html-content-model)
   - [Input HTML vs Output HTML](#41-input-html-vs-output-html)
   - [Supported HTML Elements](#42-supported-html-elements)
   - [Supported CSS Properties](#43-supported-css-properties)
   - [Element-Specific Details](#44-element-specific-details)
   - [Image Handling](#45-image-handling)
   - [Multipart Requests](#46-multipart-requests)
5. [Page Update (PATCH) Operations In-Depth](#5-page-update-patch-operations-in-depth)
   - [JSON Patch Format](#51-json-patch-format)
   - [Target Identifiers](#52-target-identifiers)
   - [Supported Actions](#53-supported-actions)
   - [Supported Elements and Actions Matrix](#54-supported-elements-and-actions-matrix)
   - [PATCH Examples](#55-patch-examples)
6. [Search and Querying](#6-search-and-querying)
   - [OData Query Parameters](#61-odata-query-parameters)
   - [Searching Page Content](#62-searching-page-content)
   - [Filtering Examples](#63-filtering-examples)
7. [Permissions and Scopes](#7-permissions-and-scopes)
8. [Best Practices](#8-best-practices)
9. [Rate Limits and Constraints](#9-rate-limits-and-constraints)
10. [Sources](#10-sources)

---

## 1. Service Root URLs

The OneNote API supports multiple contexts (user, group, SharePoint site):

```
# User notebooks (current user)
https://graph.microsoft.com/v1.0/me/onenote/{notebooks|sections|sectionGroups|pages}

# User notebooks (specific user)
https://graph.microsoft.com/v1.0/users/{id|userPrincipalName}/onenote/{notebooks|sections|sectionGroups|pages}

# Group notebooks
https://graph.microsoft.com/v1.0/groups/{id}/onenote/{notebooks|sections|sectionGroups|pages}

# SharePoint site notebooks
https://graph.microsoft.com/v1.0/sites/{id}/onenote/{notebooks|sections|sectionGroups|pages}
```

**National cloud availability:**
- Global service: Supported
- US Government L4: Not supported
- US Government L5 (DOD): Not supported
- China operated by 21Vianet: Not supported

---

## 2. Page Resource Type

**Namespace:** `microsoft.graph`

### Properties

| Property              | Type              | Description                                                                                                                  |
|-----------------------|-------------------|------------------------------------------------------------------------------------------------------------------------------|
| `id`                  | String            | Unique identifier for the page. Read-only.                                                                                   |
| `title`               | String            | The title of the page.                                                                                                       |
| `content`             | Stream            | The page's HTML content.                                                                                                     |
| `contentUrl`          | String            | The URL for the page's HTML content. Read-only.                                                                              |
| `createdByAppId`      | String            | The unique identifier of the application that created the page. Read-only.                                                   |
| `createdDateTime`     | DateTimeOffset    | The date and time when the page was created (ISO 8601, always UTC). Read-only.                                               |
| `lastModifiedDateTime`| DateTimeOffset    | The date and time when the page was last modified (ISO 8601, always UTC). Read-only.                                         |
| `level`               | Int32             | The indentation level of the page. Read-only.                                                                                |
| `order`               | Int32             | The order of the page within its parent section. Read-only.                                                                  |
| `self`                | String            | The endpoint where you can get details about the page. Read-only.                                                            |
| `links`               | PageLinks         | Links for opening the page. Contains `oneNoteClientUrl` and `oneNoteWebUrl`. Read-only.                                     |

### Relationships

| Relationship     | Type            | Description                                          |
|------------------|-----------------|------------------------------------------------------|
| `parentNotebook` | Notebook        | The notebook that contains the page. Read-only.      |
| `parentSection`  | OnenoteSection  | The section that contains the page. Read-only.       |

### JSON Representation

```json
{
  "content": "stream",
  "contentUrl": "string",
  "createdByAppId": "string",
  "createdDateTime": "String (timestamp)",
  "id": "string (identifier)",
  "lastModifiedDateTime": "String (timestamp)",
  "level": 1024,
  "links": {"@odata.type": "microsoft.graph.pageLinks"},
  "order": 1024,
  "self": "string",
  "title": "string"
}
```

---

## 3. Pages Endpoints

### 3.1 List Pages

Retrieve a list of page objects (metadata only).

**Endpoints:**

```http
GET /me/onenote/pages
GET /me/onenote/sections/{section-id}/pages
GET /users/{id|userPrincipalName}/onenote/pages
GET /users/{id|userPrincipalName}/onenote/sections/{section-id}/pages
GET /groups/{id}/onenote/pages
GET /groups/{id}/onenote/sections/{section-id}/pages
GET /sites/{id}/onenote/pages
GET /sites/{id}/onenote/sections/{section-id}/pages
```

**Query Parameters:**
- `$filter`, `$orderby`, `$select`, `$expand`, `$top`, `$skip`, `$count`
- `pagelevel` (boolean) - returns the indentation level and order of pages within a section. Only valid when querying pages in a specific section.

**Default behavior:**
- Returns top 20 pages ordered by `lastModifiedTime desc`
- Maximum of 100 pages per request (via `$top`)
- If more than 20 entries, response includes `@odata.nextLink` for pagination
- Default expands `parentSection` and selects the section's `id`, `displayName`, and `self` properties

**Valid `$expand` values:** `parentNotebook`, `parentSection`

**Request Headers:**

| Header          | Value                      |
|-----------------|----------------------------|
| Authorization   | `Bearer {token}` (required)|
| Accept          | `application/json`         |

**Response:** `200 OK` with a collection of `onenotePage` objects.

**Example Response:**

```json
{
  "value": [
    {
      "title": "title-value",
      "createdByAppId": "createdByAppId-value",
      "links": {
        "oneNoteClientUrl": { "href": "href-value" },
        "oneNoteWebUrl": { "href": "href-value" }
      },
      "contentUrl": "contentUrl-value",
      "lastModifiedDateTime": "2016-10-19T10:37:00Z"
    }
  ]
}
```

**Permissions:**

| Permission type                        | Least privileged       | Higher privileged                                |
|----------------------------------------|------------------------|--------------------------------------------------|
| Delegated (work or school account)     | Notes.Read             | Notes.Read.All, Notes.ReadWrite, Notes.ReadWrite.All |
| Delegated (personal Microsoft account) | Notes.Read             | Notes.ReadWrite                                  |
| Application                            | Notes.Read.All         | Notes.ReadWrite.All                              |

---

### 3.2 Get Page Metadata

Retrieve properties and relationships of a specific page.

**Endpoints:**

```http
GET /me/onenote/pages/{page-id}
GET /users/{id|userPrincipalName}/onenote/pages/{page-id}
GET /groups/{id}/onenote/pages/{page-id}
GET /sites/{id}/onenote/pages/{page-id}
```

**Query Parameters:** `$select`, `$expand`, `pagelevel`

**Default behavior:**
- Expands `parentSection` and selects the section's `id`, `name`, and `self` properties

**Response:** `200 OK` with a `onenotePage` object.

**Permissions:** Same as List Pages (Notes.Read minimum).

---

### 3.3 Get Page Content (HTML)

Retrieve the full HTML content of a page.

**Endpoints:**

```http
GET /me/onenote/pages/{page-id}/content[?includeIDs=true]
GET /me/onenote/pages/{page-id}/$value[?includeIDs=true]
```

**Key parameter: `includeIDs=true`**
- Returns generated `id` values on all elements that can be updated
- These IDs are required for PATCH (update) operations
- IDs may change after page updates, so always re-fetch before building a PATCH request

**Request Headers:**

| Header          | Value                      |
|-----------------|----------------------------|
| Authorization   | `Bearer {token}` (required)|
| Accept          | `text/html`                |

**Response:** `200 OK` with HTML content as the body.

**Permissions:** Notes.Read (minimum).

---

### 3.4 Get Page Preview

Get a text and image preview of a page.

**Endpoint:**

```http
GET /me/onenote/pages/{page-id}/preview
```

**Response:**

```json
{
  "@odata.context": "https://www.onenote.com/api/v1.0/$metadata#Microsoft.OneNote.Api.PagePreview",
  "previewText": "text-snippet"
}
```

The `previewText` property contains a text snippet from the page (complete phrases, up to 300 characters maximum).

---

### 3.5 Create Page

Create a new page in a section.

**Endpoints:**

```http
POST /me/onenote/sections/{section-id}/pages
POST /me/onenote/pages?sectionName=DefaultSection
POST /me/onenote/pages
POST /users/{id|userPrincipalName}/onenote/sections/{section-id}/pages
POST /groups/{id}/onenote/sections/{section-id}/pages
POST /sites/{id}/onenote/sections/{section-id}/pages
```

**Using `sectionName` parameter:**
- Creates a page in a named section of the default notebook
- If the section does not exist, it is created automatically
- Only top-level sections (not in section groups) can be referenced
- Section names are case-insensitive for matching, but case is preserved on creation
- Forbidden characters in section names: `? * \ / : < > | & # " % ~`
- Only valid with the `.../pages` route (not `.../sections/{id}/pages`)

**Request Headers:**

| Header          | Value                                                                         |
|-----------------|-------------------------------------------------------------------------------|
| Authorization   | `Bearer {token}` (required)                                                   |
| Content-Type    | `text/html` or `application/xhtml+xml` (simple) or `multipart/form-data; boundary={boundary}` (multipart) |
| Accept          | `application/json`                                                            |

**Simple HTML Request Body:**

```http
POST https://graph.microsoft.com/v1.0/me/onenote/sections/{section-id}/pages
Authorization: Bearer {token}
Content-Type: application/xhtml+xml

<!DOCTYPE html>
<html>
  <head>
    <title>A page with a block of HTML</title>
    <meta name="created" content="2015-07-22T09:00:00-08:00" />
  </head>
  <body>
    <p>This page contains some <i>formatted</i> <b>text</b> and an image.</p>
    <img src="https://..." alt="an image on the page" width="500" />
  </body>
</html>
```

**Head element support:**
- `<title>` - sets the page title
- `<meta name="created" content="...">` - sets the creation date (ISO 8601 format)

**Input HTML requirements:**
- Must be UTF-8 encoded and well-formed XHTML
- All container start tags require matching closing tags
- All attribute values must be surrounded by double or single quotes
- JavaScript, included files, and CSS are removed
- HTML forms are removed entirely

**Response:** `201 Created` with the new `onenotePage` object in JSON format.

**Response Headers:**
- `Location` header contains the resource URL for the new page

**Permissions:**

| Permission type                        | Least privileged | Higher privileged                   |
|----------------------------------------|------------------|-------------------------------------|
| Delegated (work or school account)     | Notes.Create     | Notes.ReadWrite, Notes.ReadWrite.All|
| Delegated (personal Microsoft account) | Notes.Create     | Notes.ReadWrite                     |
| Application                            | Notes.ReadWrite.All | Not available                    |

---

### 3.6 Update Page (PATCH)

Update the content of an existing OneNote page using JSON patch commands.

**Endpoints:**

```http
PATCH /me/onenote/pages/{page-id}/content
PATCH /users/{id|userPrincipalName}/onenote/pages/{page-id}/content
PATCH /groups/{id}/onenote/pages/{page-id}/content
PATCH /sites/{id}/onenote/pages/{page-id}/content
```

**Request Headers:**

| Header          | Value                                                                        |
|-----------------|------------------------------------------------------------------------------|
| Authorization   | `Bearer {token}` (required)                                                  |
| Content-Type    | `application/json` (simple) or `multipart/form-data; boundary={boundary}` (with binary) |

**Response:** `204 No Content` (no response body on success).

**Permissions:**

| Permission type                        | Least privileged   | Higher privileged       |
|----------------------------------------|--------------------|-------------------------|
| Delegated (work or school account)     | Notes.ReadWrite    | Notes.ReadWrite.All     |
| Delegated (personal Microsoft account) | Notes.ReadWrite    | Not available           |
| Application                            | Notes.ReadWrite.All| Not available           |

See [Section 5](#5-page-update-patch-operations-in-depth) for detailed PATCH documentation.

---

### 3.7 Delete Page

Delete a OneNote page.

**Endpoints:**

```http
DELETE /me/onenote/pages/{page-id}
DELETE /users/{id|userPrincipalName}/onenote/pages/{page-id}
DELETE /groups/{id}/onenote/pages/{page-id}
DELETE /sites/{id}/onenote/pages/{page-id}
```

**Request Headers:**

| Header        | Value                       |
|---------------|-----------------------------|
| Authorization | `Bearer {token}` (required) |

**Response:** `204 No Content` (no response body).

**Permissions:**

| Permission type                        | Least privileged   | Higher privileged       |
|----------------------------------------|--------------------|-------------------------|
| Delegated (work or school account)     | Notes.ReadWrite    | Notes.ReadWrite.All     |
| Delegated (personal Microsoft account) | Notes.ReadWrite    | Not available           |
| Application                            | Notes.ReadWrite.All| Not available           |

---

### 3.8 Copy Page to Section

Copy a page to a specific section. This is an asynchronous operation.

**Endpoints:**

```http
POST /me/onenote/pages/{page-id}/copyToSection
POST /users/{id|userPrincipalName}/onenote/pages/{page-id}/copyToSection
POST /groups/{id}/onenote/pages/{page-id}/copyToSection
```

**Request Headers:**

| Header          | Value                       |
|-----------------|-----------------------------|
| Authorization   | `Bearer {token}` (required) |
| Content-Type    | `application/json`          |

**Request Body:**

```json
{
  "id": "destination-section-id",
  "groupId": "optional-group-id"
}
```

| Parameter | Type   | Required | Description                                                      |
|-----------|--------|----------|------------------------------------------------------------------|
| `id`      | String | Yes      | The ID of the destination section.                               |
| `groupId` | String | No       | The ID of the group to copy to. Only when copying to a M365 group.|

**Response:** `202 Accepted` with an `Operation-Location` header.

**Asynchronous pattern:**
1. Send the POST request
2. Get `202 Accepted` with `Operation-Location` header URL
3. Poll the `Operation-Location` endpoint to check the copy status

**Permissions:**

| Permission type                        | Least privileged | Higher privileged                      |
|----------------------------------------|------------------|----------------------------------------|
| Delegated (work or school account)     | Notes.Create     | Notes.ReadWrite, Notes.ReadWrite.All   |
| Delegated (personal Microsoft account) | Notes.Create     | Notes.ReadWrite                        |
| Application                            | Notes.ReadWrite.All | Not available                       |

---

## 4. HTML Content Model

### 4.1 Input HTML vs Output HTML

**Input HTML** is the HTML you send when creating or updating a page.

**Output HTML** is the HTML returned when you GET page content.

**Key differences:**
- The API preserves semantic content and basic structure but converts input to a set of supported HTML elements and CSS properties
- The API adds custom attributes (e.g., `data-id`, `data-fullres-src`)
- All body content is wrapped in at least one `<div>`
- A default div (with `data-id="_default"`) is created to contain body content when `data-absolute-enabled` is not set to `true`
- Bold `<b>` tags become `<span style="font-weight:bold">`
- Italic `<i>` tags become `<span style="font-style:italic">`
- Inline styles on parent elements may be redistributed to child `<span>` elements
- Non-contributing divs (those without semantic info like `data-id`) are flattened -- their content moves to the parent
- The API discards all `id` values sent in input HTML
- Images from external URLs are downloaded, stored, and returned as Graph resource endpoints

### 4.2 Supported HTML Elements

| Element Category | Supported Elements |
|------------------|--------------------|
| Structure        | `<html>`, `<head>`, `<body>`, `<div>` |
| Metadata         | `<title>`, `<meta>` (for page title and creation date) |
| Headings         | `<h1>` through `<h6>` |
| Paragraphs       | `<p>` |
| Lists            | `<ul>`, `<ol>`, `<li>` |
| Tables           | `<table>`, `<tr>`, `<td>` (nested tables supported; `rowspan`/`colspan` NOT supported) |
| Preformatted     | `<pre>` (preserves whitespace and line breaks) |
| Images           | `<img>` |
| Videos           | `<iframe>` (with `data-original-src` attribute) |
| Files            | `<object>` (for file attachments) |
| Links            | `<a>` |
| Character styles | `<b>`, `<i>`, `<u>`, `<em>`, `<strong>`, `<strike>`, `<del>`, `<sup>`, `<sub>`, `<cite>` |
| Line break       | `<br>` |

**Elements that are ignored or removed:**
- JavaScript and `<script>` tags
- CSS `<style>` tags and external stylesheets
- `<form>` elements
- Any `id` attributes in input HTML

### 4.3 Supported CSS Properties

| CSS Property       | Example                                    | Notes                                                    |
|--------------------|--------------------------------------------|----------------------------------------------------------|
| background-color   | `style="background-color:#66cc66"`         | Hex and named colors. Not supported on `<body>`.         |
| color              | `style="color:#ffffff"`                    | Defaults to black.                                       |
| font-family        | `style="font-family:Courier"`              | Defaults to Calibri.                                     |
| font-size          | `style="font-size:10pt"`                   | Accepts pt and px (px converted to pt). Defaults to 11pt. Rounded to nearest n.0pt or n.5pt. |
| font-style         | `style="font-style:italic"`               | `normal` or `italic` only.                               |
| font-weight        | `style="font-weight:bold"`                 | `normal` or `bold` only.                                 |
| text-decoration    | `style="text-decoration:underline"`        | `none` or `underline` only.                              |
| text-decoration    | `style="text-decoration:line-through"`     | Strikethrough.                                           |
| text-align         | `style="text-align:center"`               | Block elements only.                                     |

**Position and size properties (for absolute positioned elements):**
- `position: absolute` (only value supported)
- `left`, `top`, `width` (height is auto-configured for divs)
- Absolute positioning only works when element is a direct child of `<body>` and `data-absolute-enabled="true"` is set on the body

### 4.4 Element-Specific Details

#### Body Element

**Input attributes:**
- `data-absolute-enabled` - enables absolute positioned elements
- `style` - CSS style properties

**Output attributes:**
- `data-absolute-enabled` - always `true`
- `style` - `font-family` and `font-size`

#### Div Elements

**Input attributes:**
- `data-id` - reference for updates
- `data-render-fallback` - fallback action if extraction fails (`render` or `none`)
- `data-render-method` - extraction method (e.g., `extract.businesscard`, `extract.recipe`)
- `data-render-src` - content source for extraction
- `style` - position, size, font, color properties

**Output attributes:**
- `data-id` - reference for updates
- `id` - generated ID (returned when `includeIDs=true`)
- `style` - position and size properties

**Default div behavior:** The API wraps all body content in at least one div. A default div with `data-id="_default"` is created when `data-absolute-enabled` is omitted/false, or when direct children are not absolute-positioned.

#### Paragraphs and Headings (p, h1-h6)

**Input attributes:**
- `data-id` - reference for updates
- `data-tag` - note tag on the element
- `style` - CSS style properties

**Output attributes:**
- `data-id`, `id`, `data-tag`, `style`

#### Lists (ol, ul, li)

**Supported ordered list styles:** `none`, `decimal` (default), `lower-alpha`, `lower-roman`, `upper-alpha`, `upper-roman`

**Supported unordered list styles:** `none`, `disc` (default), `circle`, `square`

#### Tables

- Support `<table>`, `<tr>`, `<td>`
- Nested tables are supported
- `rowspan` and `colspan` are NOT supported
- `border`, `width`, `bgcolor` attributes supported on input
- The `border` property in the `style` attribute is NOT supported in input HTML

### 4.5 Image Handling

Images on OneNote pages are represented by `<img>` elements. There are several ways to include images:

#### From a public URL

```html
<img src="https://example.com/image.png" alt="description" width="500" />
```

#### From binary data in a multipart request

```html
<img src="name:imageBlock1" alt="description" width="300" />
```

Where `imageBlock1` is the name of a part in the multipart request containing the binary image data.

#### Rendered webpage as image

```html
<img data-render-src="https://example.com/page-to-render" alt="rendered page" />
```

This renders the specified webpage as a bitmap image on the page.

#### Output image attributes

In output HTML, images contain Graph resource endpoints:

```html
<img
    src="https://graph.microsoft.com/v1.0/me/onenote/resources/{image-id}/$value"
    data-src-type="image/png"
    data-fullres-src="https://graph.microsoft.com/v1.0/me/onenote/resources/{image-id}/$value"
    data-fullres-src-type="image/png"
    data-id="{image-id}"
    width="345" height="180" />
```

| Output Attribute          | Description                                                    |
|---------------------------|----------------------------------------------------------------|
| `src`                     | Endpoint for optimized (web-ready) image                       |
| `data-src-type`           | Media type of the optimized image                              |
| `data-fullres-src`        | Endpoint for full-resolution image                             |
| `data-fullres-src-type`   | Media type of the full-resolution image                        |
| `data-render-original-src`| Original source URL (if from public internet via data-render-src) |
| `data-index`              | Position index for split images                                |
| `data-options`            | `printout` (PDF) or `splitimage` (other split images)          |

#### Retrieving image binary data

```http
GET https://graph.microsoft.com/v1.0/me/onenote/resources/{resource-id}/$value
```

No `Accept` header is required when fetching file resources.

#### Split images

Large images created via `data-render-src` (from webpage URLs or named parts) may be split into multiple component images for performance. All components share the same `data-id` and have a zero-based `data-index` attribute for ordering.

#### Important note for PATCH updates

When updating an image on a OneNote page via PATCH, you cannot use `www` links. The image must be part of the request, either as a data URL or as a named part in a multipart request.

### 4.6 Multipart Requests

Multipart requests are **required** when sending binary data (images, files). They are also recommended for all page creation for consistency.

#### Create page with multipart request

```http
POST https://graph.microsoft.com/v1.0/me/onenote/sections/{section-id}/pages
Authorization: Bearer {token}
Content-Type: multipart/form-data; boundary=MyPartBoundary198374

--MyPartBoundary198374
Content-Disposition:form-data; name="Presentation"
Content-Type:text/html

<!DOCTYPE html>
<html>
  <head>
    <title>A page with rendered images and an attached file</title>
    <meta name="created" content="2015-07-22T09:00:00-08:00" />
  </head>
  <body>
    <p>Here's an image from an online source:</p>
    <img src="https://..." alt="an image on the page" width="500" />
    <p>Here's an image uploaded as binary data:</p>
    <img src="name:imageBlock1" alt="an image on the page" width="300" />
    <p>Here's a file attachment:</p>
    <object data-attachment="FileName.pdf" data="name:fileBlock1" type="application/pdf" />
  </body>
</html>

--MyPartBoundary198374
Content-Disposition:form-data; name="imageBlock1"
Content-Type:image/jpeg

... binary image data ...

--MyPartBoundary198374
Content-Disposition:form-data; name="fileBlock1"
Content-Type:application/pdf

... binary file data ...

--MyPartBoundary198374--
```

**Multipart structure:**
- **Presentation part** (required): Contains the input HTML with `Content-Type: text/html`
- **Data parts**: Contain binary data (images, files) with appropriate Content-Type
- Part names referenced in HTML via `src="name:partName"` (for images) or `data="name:partName"` (for objects)

**Important:** Microsoft Graph is strict about CRLF newlines in multipart bodies. Use a library to construct multipart messages to avoid malformed payloads.

#### File attachments via object elements

```html
<object data-attachment="FileName.pdf" data="name:fileBlock1" type="application/pdf" />
```

| Attribute         | Required | Description                                          |
|-------------------|----------|------------------------------------------------------|
| `data`            | Yes      | Name of the part in the multipart request            |
| `data-attachment` | Yes      | The file name to display                             |
| `type`            | Yes      | Standard MIME type of the file                       |
| `data-id`         | No       | Reference for updates                                |

#### Video embedding via iframe

```html
<iframe data-original-src="https://www.youtube.com/watch?v=3Ztr44aKmQ8" width="340" height="280" />
```

The `data-original-src` attribute is required and must be a supported video source URL.

---

## 5. Page Update (PATCH) Operations In-Depth

### 5.1 JSON Patch Format

Updates are sent as an array of JSON change objects in the request body. Each object specifies a target, an action, and (usually) content.

```json
[
  {
    "target": "#element-data-id",
    "action": "append",
    "position": "after",
    "content": "<p>New content</p>"
  }
]
```

### 5.2 Target Identifiers

| Identifier      | Format              | Description                                                                                    |
|-----------------|---------------------|-----------------------------------------------------------------------------------------------|
| `#{data-id}`    | `#intro`            | Custom data-id set on elements during create/update. Prefix with `#`.                          |
| `{generated-id}`| `div:{guid}{index}` | Generated ID from Microsoft Graph (from `includeIDs=true`). Do NOT prefix with `#`.           |
| `body`          | `body`              | Keyword targeting the first div on the page. Do NOT prefix with `#`.                           |
| `title`         | `title`             | Keyword targeting the page title. Do NOT prefix with `#`.                                      |

**Important notes on IDs:**
- All `id` values sent in input HTML are discarded by the API
- Generated `id` values may change after a page update; always re-fetch before building a PATCH request
- For `append` and `insert` actions, you can use either `data-id` or generated `id`
- For `replace` actions, you must use the generated `id` for all elements EXCEPT:
  - Page title (use `title` keyword)
  - Images and objects within a div (can use either `data-id` or `id`)

### 5.3 Supported Actions

| Action    | Description                                                                                    | Position Values            |
|-----------|-----------------------------------------------------------------------------------------------|----------------------------|
| `append`  | Adds content as a child of the target element (first or last child based on position).        | `before` (first child), `after` (last child, default) |
| `prepend` | Shortcut for `append` + `position: before`. Adds content as the first child.                  | N/A                        |
| `insert`  | Adds content as a sibling of the target element (before or after based on position).          | `before`, `after` (default)|
| `replace` | Replaces the target element entirely with the supplied content.                                | N/A                        |

**Note:** There is no explicit `delete` action in the PATCH API. To remove content, use `replace` with alternative content, or delete the entire page.

### 5.4 Supported Elements and Actions Matrix

| Element                          | Replace               | Append Child | Insert Sibling |
|----------------------------------|-----------------------|--------------|----------------|
| `body` (first div on page)       | No                    | **Yes**      | No             |
| `div` (absolute positioned)      | No                    | **Yes**      | No             |
| `div` (within a div)             | **Yes** (id only)     | **Yes**      | **Yes**        |
| `img`, `object` (within a div)   | **Yes**               | No           | **Yes**        |
| `ol`, `ul`                       | **Yes** (id only)     | **Yes**      | **Yes**        |
| `table`                          | **Yes** (id only)     | No           | **Yes**        |
| `p`, `li`, `h1`-`h6`            | **Yes** (id only)     | No           | **Yes**        |
| `title`                          | **Yes**               | No           | No             |

**Elements that do NOT support any update actions:**
- `img` (absolute positioned)
- `object` (absolute positioned)
- `tr`, `td`
- `meta`
- `head`
- `span`
- `a`
- `style` tags

### 5.5 PATCH Examples

#### Append to a div

```json
[
  {
    "target": "#div1",
    "action": "append",
    "position": "before",
    "content": "<img data-id=\"first-child\" src=\"image-url-or-part-name\" />"
  },
  {
    "target": "#div1",
    "action": "append",
    "content": "<p data-id=\"last-child\">New paragraph appended to the div</p>"
  }
]
```

#### Prepend and append to body

```json
[
  {
    "target": "body",
    "action": "prepend",
    "content": "<p data-id=\"first-child\">New paragraph as first child</p>"
  },
  {
    "target": "body",
    "action": "append",
    "content": "<p data-id=\"last-child\">New paragraph as last child</p>"
  }
]
```

#### Insert siblings

```json
[
  {
    "target": "#para1",
    "action": "insert",
    "position": "before",
    "content": "<img src=\"image-data-url-or-part-name\" alt=\"Image above target\" />"
  },
  {
    "target": "#para2",
    "action": "insert",
    "content": "<p data-id=\"next-sibling\">Paragraph below target</p>"
  }
]
```

#### Replace an image

```json
[
  {
    "target": "#img1",
    "action": "replace",
    "content": "<div data-id=\"new-div\"><p>This div replaces the image</p></div>"
  }
]
```

#### Replace a table (using generated ID)

```json
[
  {
    "target": "table:{de3e0977-94e4-4bb0-8fee-0379eaf47486}{11}",
    "action": "replace",
    "content": "<table data-id=\"football\"><tr><td><p><b>Brazil</b></p></td><td><p>Germany</p></td></tr></table>"
  }
]
```

#### Change the page title

```json
[
  {
    "target": "title",
    "action": "replace",
    "content": "New title"
  }
]
```

#### Update a to-do item

```json
[
  {
    "target": "p:{33f8a242-7c33-4bb2-90c5-8425a68cc5bf}{40}",
    "action": "replace",
    "content": "<p data-tag=\"to-do:completed\" data-id=\"task1\">First task</p>"
  }
]
```

#### Append to a list

```json
[
  {
    "target": "#circle-ul",
    "action": "append",
    "content": "<li style=\"list-style-type:circle\">Item at the end of the list</li>"
  }
]
```

#### Complete PATCH request with text content

```http
PATCH https://graph.microsoft.com/v1.0/me/onenote/pages/{page-id}/content
Content-Type: application/json
Authorization: Bearer {token}

[
  {
    "target": "#para-id",
    "action": "insert",
    "position": "before",
    "content": "<img src=\"image-data-url\" alt=\"New image from a URL\" />"
  },
  {
    "target": "#list-id",
    "action": "append",
    "content": "<li>Item at the bottom of the list</li>"
  }
]
```

#### Multipart PATCH request with binary content

```http
PATCH https://graph.microsoft.com/v1.0/me/onenote/pages/{page-id}/content
Content-Type: multipart/form-data; boundary=PartBoundary123
Authorization: Bearer {token}

--PartBoundary123
Content-Disposition: form-data; name="Commands"
Content-Type: application/json

[
  {
    "target": "img:{2998967e-69b3-413f-a221-c1a3b5cbe0fc}{42}",
    "action": "replace",
    "content": "<img src=\"name:image-part-name\" alt=\"New binary image\" />"
  },
  {
    "target": "#list-id",
    "action": "append",
    "content": "<li>Item at the bottom of the list</li>"
  }
]

--PartBoundary123
Content-Disposition: form-data; name="image-part-name"
Content-Type: image/png

... binary image data ...

--PartBoundary123--
```

**Note:** In multipart PATCH requests, the JSON array goes in a part named `"Commands"` with content type `application/json`.

---

## 6. Search and Querying

### 6.1 OData Query Parameters

The OneNote API supports standard OData query parameters for filtering and pagination:

| Parameter  | Description                                                                                          | Example                                           |
|------------|------------------------------------------------------------------------------------------------------|---------------------------------------------------|
| `$filter`  | Boolean expression for filtering results                                                              | `$filter=createdTime ge 2015-01-01`               |
| `$orderby` | Property to sort by, with optional `asc`/`desc`                                                       | `$orderby=title asc`                              |
| `$select`  | Properties to return                                                                                  | `$select=id,title,createdDateTime`                |
| `$expand`  | Navigation properties to include inline                                                               | `$expand=parentSection,parentNotebook`             |
| `$top`     | Number of entries to return (max 100, default 20)                                                     | `$top=50`                                         |
| `$skip`    | Number of entries to skip                                                                             | `$skip=20`                                        |
| `$count`   | Include count of entities in the response                                                             | `$count=true`                                     |

#### Supported filter operators

| Operator | Description           | Example                                    |
|----------|-----------------------|--------------------------------------------|
| `eq`     | Equal to              | `createdByAppId eq '{app-id}'`             |
| `ne`     | Not equal to          | `userRole ne 'Owner'`                      |
| `gt`     | Greater than          | `createdTime gt 2014-02-23`                |
| `ge`     | Greater than or equal | `lastModifiedTime ge 2014-05-05T07:00:00Z`|
| `lt`     | Less than             | `createdTime lt 2014-02-23`                |
| `le`     | Less than or equal    | `lastModifiedTime le 2014-02-23`           |

#### Supported logical operators

| Operator | Example                                                     |
|----------|-------------------------------------------------------------|
| `and`    | `createdTime le 2014-01-30 and createdTime gt 2014-01-23`  |
| `or`     | `createdByAppId eq '{id1}' or createdByAppId eq '{id2}'`   |
| `not`    | `not contains(tolower(title),'school')`                     |

#### Supported string functions

| Function    | Example                                        |
|-------------|------------------------------------------------|
| `contains`  | `contains(tolower(title),'spring')`            |
| `endswith`  | `endswith(tolower(title),'spring')`             |
| `startswith`| `startswith(tolower(title),'spring')`           |
| `length`    | `length(title) eq 19`                          |
| `indexof`   | `indexof(tolower(title),'spring') eq 1`        |
| `substring` | `substring(tolower(title),1) eq 'spring'`      |
| `tolower`   | `tolower(title) eq 'spring'`                   |
| `toupper`   | `toupper(title) eq 'SPRING'`                   |
| `trim`      | `trim(tolower(title)) eq 'spring'`             |
| `concat`    | `concat(title,'- by App') eq 'Title - by App'` |

**Important:** Property names and OData string comparisons are case-sensitive. Use `tolower()` for string comparisons as a best practice.

### 6.2 Searching Page Content

The OneNote API supports **full-text search** through the `search` query parameter. However, this is primarily a **filter-like** mechanism on page metadata, not a direct content search endpoint.

**Approach 1: Use `$filter` with string functions on metadata**

```http
GET /me/onenote/pages?$filter=contains(tolower(title),'search-term')
```

This searches page titles only.

**Approach 2: Use the `search` query parameter (available on pages endpoint)**

```http
GET /me/onenote/pages?search=term
```

The OneNote APIs in Microsoft Graph run OCR on images and support full-text search. When you use the search parameter, the API returns pages whose content (including OCR-extracted text from images) matches the search term.

**Approach 3: Get page content and search client-side**

For more complex content searching:
1. Retrieve page HTML content via `GET /me/onenote/pages/{id}/content`
2. Parse and search the HTML on the client side

**Approach 4: Filter pages by section then search**

```http
GET /me/onenote/sections/{section-id}/pages?$filter=contains(tolower(title),'term')
```

### 6.3 Filtering Examples

```http
# Pages created by a specific app
GET /me/onenote/pages?$filter=createdByAppId eq 'WLID-000000004C12821A'

# Pages created after a specific date, limited to 5
GET /me/onenote/pages?$filter=createdTime ge 2015-01-01&$top=5

# Sections containing 'spring' in the name, ordered by last modified
GET /me/onenote/sections?$filter=contains(tolower(name),'spring')&$select=name,pagesUrl&$orderby=lastModifiedTime desc

# All pages with title and parent info
GET /me/onenote/pages?$select=id,title&$expand=parentSection(select=name),parentNotebook(select=name)

# Pagination: pages 51-100
GET /me/onenote/pages?$skip=50&$top=50&$select=title,self&$orderby=title

# Sections in a specific notebook with 'school' in the name
GET /me/onenote/notebooks?$filter=tolower(name) eq 'school'&$expand=sections(select=name,pagesUrl)

# Hierarchical notebook structure in one call
GET /me/onenote/notebooks?$expand=sections,sectionGroups($expand=sections,sectionGroups(levels=max;expand=sections))
```

---

## 7. Permissions and Scopes

### Summary by Operation

| Operation                | Minimum Scope (Delegated) | Minimum Scope (Application) |
|--------------------------|---------------------------|------------------------------|
| List pages               | `Notes.Read`              | `Notes.Read.All`             |
| Get page metadata        | `Notes.Read`              | `Notes.Read.All`             |
| Get page content (HTML)  | `Notes.Read`              | `Notes.Read.All`             |
| Create page              | `Notes.Create`            | `Notes.ReadWrite.All`        |
| Update page (PATCH)      | `Notes.ReadWrite`         | `Notes.ReadWrite.All`        |
| Delete page              | `Notes.ReadWrite`         | `Notes.ReadWrite.All`        |
| Copy page to section     | `Notes.Create`            | `Notes.ReadWrite.All`        |

### Available Scopes

| Scope                  | Description                                                                                    |
|------------------------|-----------------------------------------------------------------------------------------------|
| `Notes.Read`           | Read the user's OneNote notebooks, sections, and pages.                                        |
| `Notes.Create`         | Create new OneNote pages (but not read existing ones beyond what is returned in the response).  |
| `Notes.ReadWrite`      | Read and write the user's OneNote notebooks, sections, and pages.                              |
| `Notes.Read.All`       | Read all OneNote notebooks in the organization (delegated) or all users' notebooks (application).|
| `Notes.ReadWrite.All`  | Read and write all OneNote notebooks in the organization or for all users.                     |

### Authentication Warning

> **As of March 31, 2025:** The Microsoft Graph OneNote API no longer supports app-only authentication. All solutions must migrate to delegated authentication. This means the Application permission types (`Notes.Read.All`, `Notes.ReadWrite.All`) may have restricted functionality. Confirm current support at the official documentation.

---

## 8. Best Practices

### Use `$select` to minimize payload

```http
GET /me/onenote/sections/{id}/pages?$select=id,title,createdDateTime
```

Only request the properties you need.

### Use `$expand` instead of multiple API calls

Instead of making separate calls for notebooks, sections, and section groups:

```http
GET /me/onenote/notebooks?$expand=sections,sectionGroups($expand=sections)
```

This returns the full hierarchy in a single network roundtrip.

### Get pages by section, not all at once

The global `/me/onenote/pages` endpoint can fail with HTTP `400` if the user has too many sections (error: "The maximum number of sections is exceeded for this request"). Instead:

```http
GET /me/onenote/sections/{section-id}/pages
```

### Override default ordering for performance

When you do not need `lastModifiedDateTime` ordering, sort by another property for faster responses:

```http
GET /me/onenote/sections/{id}/pages?$select=id,title,createdDateTime&$orderby=createdDateTime
```

### Use `data-id` attributes for reliable update targeting

When creating pages, assign `data-id` attributes to elements you plan to update later. This avoids reliance on generated IDs which change after every update.

### Always re-fetch IDs before PATCH

Generated `id` values change after page updates. Always call `GET /pages/{id}/content?includeIDs=true` immediately before building a PATCH request.

### Use a library for multipart messages

Microsoft Graph is strict about CRLF newlines in multipart message bodies. Always use an HTTP library to construct multipart requests rather than building them manually.

### Encode spaces in query strings

Use `%20` for spaces in URL query strings. Example: `$filter=title%20eq%20'biology'`.

---

## 9. Rate Limits and Constraints

| Constraint                              | Value / Description                                                           |
|-----------------------------------------|-------------------------------------------------------------------------------|
| Default page list size                  | 20 entries per request                                                        |
| Maximum page list size (`$top`)         | 100 entries per request                                                       |
| Section page limit                      | There is a maximum number of pages per section. Exceeding it returns HTTP `507`. |
| Page preview text                       | Up to 300 characters                                                          |
| Input HTML encoding                     | Must be UTF-8                                                                 |
| Image handling                          | API auto-detects image type                                                   |
| Multipart request format                | CRLF line endings required; use a library                                     |
| Section name forbidden characters       | `? * \ / : < > \| & # " % ~`                                                 |
| App-only authentication                 | No longer supported (as of March 31, 2025)                                    |

**Error codes to watch for:**
- `400 Bad Request` - malformed payload or too many sections in a global pages query
- `401 Unauthorized` - missing or invalid token
- `404 Not Found` - page or section does not exist
- `507 Insufficient Storage` - section has reached maximum number of pages

---

## 10. Sources

- [OneNote API overview](https://learn.microsoft.com/en-us/graph/integrate-with-onenote)
- [Use the OneNote REST API](https://learn.microsoft.com/en-us/graph/api/resources/onenote-api-overview?view=graph-rest-1.0)
- [Create OneNote pages](https://learn.microsoft.com/en-us/graph/onenote-create-page)
- [Get OneNote content and structure](https://learn.microsoft.com/en-us/graph/onenote-get-content)
- [Update OneNote page content](https://learn.microsoft.com/en-us/graph/onenote-update-page)
- [Input and output HTML on OneNote pages](https://learn.microsoft.com/en-us/graph/onenote-input-output-html)
- [List onenotePages](https://learn.microsoft.com/en-us/graph/api/onenote-list-pages?view=graph-rest-1.0)
- [Get page](https://learn.microsoft.com/en-us/graph/api/page-get?view=graph-rest-1.0)
- [Delete page](https://learn.microsoft.com/en-us/graph/api/page-delete?view=graph-rest-1.0)
- [page: copyToSection](https://learn.microsoft.com/en-us/graph/api/page-copytosection?view=graph-rest-1.0)
- [Create page in section](https://learn.microsoft.com/en-us/graph/api/section-post-pages?view=graph-rest-1.0)
- [onenotePage resource type](https://learn.microsoft.com/en-us/graph/api/resources/page?view=graph-rest-1.0)
- [Best practices for the OneNote API](https://learn.microsoft.com/en-us/graph/onenote-best-practices)
