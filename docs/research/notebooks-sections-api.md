# Microsoft Graph API - OneNote Notebooks, Section Groups, and Sections

> **Research Spike** | Date: 2026-02-16
> **API Version**: v1.0 (stable)
> **Base URL**: `https://graph.microsoft.com/v1.0`
> **Source**: [Official Microsoft Graph Documentation](https://learn.microsoft.com/en-us/graph/api/resources/onenote-api-overview)

---

## Table of Contents

1. [Permissions Overview](#1-permissions-overview)
2. [Resource Types](#2-resource-types)
   - [Notebook](#21-notebook-resource)
   - [SectionGroup](#22-sectiongroup-resource)
   - [OnenoteSection](#23-onenotesection-resource)
3. [Notebooks Endpoints](#3-notebooks-endpoints)
   - [List Notebooks](#31-list-notebooks)
   - [Get Notebook](#32-get-notebook)
   - [Create Notebook](#33-create-notebook)
4. [Section Groups Endpoints](#4-section-groups-endpoints)
   - [List Section Groups (All)](#41-list-all-section-groups)
   - [List Section Groups (In Notebook)](#42-list-section-groups-in-a-notebook)
   - [Get Section Group](#43-get-section-group)
   - [Create Section Group (In Notebook)](#44-create-section-group-in-a-notebook)
   - [Create Section Group (Nested)](#45-create-nested-section-group)
5. [Sections Endpoints](#5-sections-endpoints)
   - [List Sections (All)](#51-list-all-sections)
   - [List Sections (In Notebook)](#52-list-sections-in-a-notebook)
   - [List Sections (In Section Group)](#53-list-sections-in-a-section-group)
   - [Get Section](#54-get-section)
   - [Create Section (In Notebook)](#55-create-section-in-a-notebook)
   - [Create Section (In Section Group)](#56-create-section-in-a-section-group)
6. [Common Patterns](#6-common-patterns)
   - [OData Query Parameters](#61-odata-query-parameters)
   - [Pagination](#62-pagination)
   - [Error Responses](#63-error-responses)
   - [Request Context Paths](#64-request-context-paths)
7. [Implementation Notes](#7-implementation-notes)

---

## 1. Permissions Overview

All OneNote API endpoints share a common permissions model. The permissions differ between read and write operations.

### Read Operations (GET)

| Permission Type | Least Privileged | Higher Privileged |
|---|---|---|
| Delegated (work or school) | `Notes.Create` | `Notes.Read`, `Notes.Read.All`, `Notes.ReadWrite`, `Notes.ReadWrite.All` |
| Delegated (personal Microsoft) | `Notes.Create` | `Notes.Read`, `Notes.ReadWrite` |
| Application | `Notes.Read.All` | `Notes.ReadWrite.All` |

### Write Operations (POST)

| Permission Type | Least Privileged | Higher Privileged |
|---|---|---|
| Delegated (work or school) | `Notes.Create` | `Notes.ReadWrite`, `Notes.ReadWrite.All` |
| Delegated (personal Microsoft) | `Notes.Create` | `Notes.ReadWrite` |
| Application | `Notes.ReadWrite.All` | Not available |

### Recommended Scopes for MCP Server

For a tool that needs to both read and write notebooks, sections, and section groups:

- **Delegated flow**: `Notes.ReadWrite` (covers read + write for personal and work accounts)
- **Application flow**: `Notes.ReadWrite.All` (covers all read + write operations)

### Cloud Availability

| Global Service | US Government L4 | US Government L5 (DOD) | China (21Vianet) |
|---|---|---|---|
| Yes | No | No | No |

---

## 2. Resource Types

### 2.1 Notebook Resource

**Type**: `microsoft.graph.notebook`

#### Properties

| Property | Type | Description | Writable |
|---|---|---|---|
| `id` | String | Unique identifier of the notebook. | Read-only |
| `displayName` | String | The name of the notebook. | Create only |
| `createdDateTime` | DateTimeOffset | Date and time the notebook was created (ISO 8601, always UTC). | Read-only |
| `lastModifiedDateTime` | DateTimeOffset | Date and time the notebook was last modified (ISO 8601, always UTC). | Read-only |
| `createdBy` | identitySet | Identity of the user, device, and application that created the item. | Read-only |
| `lastModifiedBy` | identitySet | Identity of the user, device, and application that last modified the item. | Read-only |
| `isDefault` | Boolean | Whether this is the user's default notebook. | Read-only |
| `isShared` | Boolean | Whether the notebook is shared with others. | Read-only |
| `userRole` | onenoteUserRole | Possible values: `Owner`, `Contributor`, `Reader`, `None`. | Read-only |
| `links` | NotebookLinks | Links for opening the notebook (`oneNoteClientUrl` and `oneNoteWebUrl`). | Read-only |
| `sectionsUrl` | String | URL for the `sections` navigation property. | Read-only |
| `sectionGroupsUrl` | String | URL for the `sectionGroups` navigation property. | Read-only |
| `self` | String | Endpoint where you can get details about the notebook. | Read-only |

#### Relationships

| Relationship | Type | Description |
|---|---|---|
| `sections` | OnenoteSection collection | Sections in the notebook. Read-only. Nullable. |
| `sectionGroups` | SectionGroup collection | Section groups in the notebook. Read-only. Nullable. |

#### JSON Representation

```json
{
  "id": "string",
  "displayName": "string",
  "createdBy": { "@odata.type": "microsoft.graph.identitySet" },
  "createdDateTime": "String (timestamp)",
  "lastModifiedBy": { "@odata.type": "microsoft.graph.identitySet" },
  "lastModifiedDateTime": "String (timestamp)",
  "isDefault": true,
  "isShared": false,
  "userRole": "Owner",
  "links": {
    "oneNoteClientUrl": { "href": "onenote:https://..." },
    "oneNoteWebUrl": { "href": "https://..." }
  },
  "sectionsUrl": "https://graph.microsoft.com/v1.0/users/{id}/onenote/notebooks/{id}/sections",
  "sectionGroupsUrl": "https://graph.microsoft.com/v1.0/users/{id}/onenote/notebooks/{id}/sectionGroups",
  "self": "https://graph.microsoft.com/v1.0/users/{id}/onenote/notebooks/{id}"
}
```

### 2.2 SectionGroup Resource

**Type**: `microsoft.graph.sectionGroup`

#### Properties

| Property | Type | Description | Writable |
|---|---|---|---|
| `id` | String | Unique identifier of the section group. | Read-only |
| `displayName` | String | The name of the section group. | Create only |
| `createdDateTime` | DateTimeOffset | Date and time the section group was created (ISO 8601, always UTC). | Read-only |
| `lastModifiedDateTime` | DateTimeOffset | Date and time the section group was last modified (ISO 8601, always UTC). | Read-only |
| `createdBy` | identitySet | Identity of the user, device, and application that created the item. | Read-only |
| `lastModifiedBy` | identitySet | Identity of the user, device, and application that last modified the item. | Read-only |
| `sectionsUrl` | String | URL for the `sections` navigation property. | Read-only |
| `sectionGroupsUrl` | String | URL for the `sectionGroups` navigation property. | Read-only |
| `self` | String | Endpoint where you can get details about the section group. | Read-only |

#### Relationships

| Relationship | Type | Description |
|---|---|---|
| `parentNotebook` | Notebook | The notebook that contains the section group. Read-only. |
| `parentSectionGroup` | SectionGroup | The section group that contains the section group (for nesting). Read-only. |
| `sectionGroups` | SectionGroup collection | Nested section groups within this section group. Read-only. Nullable. |
| `sections` | OnenoteSection collection | Sections within this section group. Read-only. Nullable. |

#### JSON Representation

```json
{
  "id": "string",
  "displayName": "string",
  "createdBy": { "@odata.type": "microsoft.graph.identitySet" },
  "createdDateTime": "String (timestamp)",
  "lastModifiedBy": { "@odata.type": "microsoft.graph.identitySet" },
  "lastModifiedDateTime": "String (timestamp)",
  "sectionsUrl": "string",
  "sectionGroupsUrl": "string",
  "self": "string"
}
```

### 2.3 OnenoteSection Resource

**Type**: `microsoft.graph.onenoteSection`

#### Properties

| Property | Type | Description | Writable |
|---|---|---|---|
| `id` | String | Unique identifier of the section. | Read-only |
| `displayName` | String | The name of the section. | Create only |
| `createdDateTime` | DateTimeOffset | Date and time the section was created (ISO 8601, always UTC). | Read-only |
| `lastModifiedDateTime` | DateTimeOffset | Date and time the section was last modified (ISO 8601, always UTC). | Read-only |
| `createdBy` | identitySet | Identity of the user, device, and application that created the item. | Read-only |
| `lastModifiedBy` | identitySet | Identity of the user, device, and application that last modified the item. | Read-only |
| `isDefault` | Boolean | Whether this is the user's default section. | Read-only |
| `links` | SectionLinks | Links for opening the section (`oneNoteClientUrl` and `oneNoteWebUrl`). | Read-only |
| `pagesUrl` | String | The `pages` endpoint for getting all pages in the section. | Read-only |
| `self` | String | Endpoint where you can get details about the section. | Read-only |

#### Relationships

| Relationship | Type | Description |
|---|---|---|
| `pages` | OnenotePage collection | Pages in the section. Read-only. Nullable. |
| `parentNotebook` | Notebook | The notebook that contains the section. Read-only. |
| `parentSectionGroup` | SectionGroup | The section group that contains the section. Read-only. |

#### JSON Representation

```json
{
  "id": "string",
  "displayName": "string",
  "createdBy": { "@odata.type": "microsoft.graph.identitySet" },
  "createdDateTime": "String (timestamp)",
  "lastModifiedBy": { "@odata.type": "microsoft.graph.identitySet" },
  "lastModifiedDateTime": "String (timestamp)",
  "isDefault": true,
  "links": {
    "oneNoteClientUrl": { "href": "onenote:..." },
    "oneNoteWebUrl": { "href": "https://..." }
  },
  "pagesUrl": "string",
  "self": "string"
}
```

---

## 3. Notebooks Endpoints

### 3.1 List Notebooks

Retrieve a list of all notebook objects owned by or accessible to the user.

```
GET /me/onenote/notebooks
GET /users/{id | userPrincipalName}/onenote/notebooks
GET /groups/{id}/onenote/notebooks
GET /sites/{id}/onenote/notebooks
```

**Query Parameters**: `$filter`, `$orderby`, `$select`, `$expand`, `$top`, `$skip`, `$count`

**Default sort order**: `name asc`

**Valid `$expand` values**: `sections`, `sectionGroups`

**Response**: `200 OK` with a collection of Notebook objects.

#### Request Headers

| Name | Type | Description |
|---|---|---|
| Authorization | string | `Bearer {token}` (Required) |
| Accept | string | `application/json` |

#### Example Request

```http
GET https://graph.microsoft.com/v1.0/me/onenote/notebooks
Authorization: Bearer {token}
```

#### Example Response

```http
HTTP/1.1 200 OK
Content-type: application/json

{
  "value": [
    {
      "id": "1-10143016-70dc-4449-b92a-3015225f800d",
      "displayName": "My Notebook",
      "isDefault": true,
      "userRole": "Owner",
      "isShared": false,
      "sectionsUrl": "https://graph.microsoft.com/v1.0/users/{user-id}/onenote/notebooks/{notebook-id}/sections",
      "sectionGroupsUrl": "https://graph.microsoft.com/v1.0/users/{user-id}/onenote/notebooks/{notebook-id}/sectionGroups",
      "createdDateTime": "2024-01-15T10:30:00Z",
      "lastModifiedDateTime": "2024-06-20T14:22:00Z",
      "createdBy": {
        "user": {
          "id": "user-id",
          "displayName": "User Name"
        }
      },
      "lastModifiedBy": {
        "user": {
          "id": "user-id",
          "displayName": "User Name"
        }
      },
      "links": {
        "oneNoteClientUrl": {
          "href": "onenote:https://contoso-my.sharepoint.com/personal/.../Notebooks/My%20Notebook"
        },
        "oneNoteWebUrl": {
          "href": "https://contoso-my.sharepoint.com/personal/.../Notebooks/My%20Notebook"
        }
      },
      "self": "https://graph.microsoft.com/v1.0/users/{user-id}/onenote/notebooks/{notebook-id}"
    }
  ]
}
```

#### JavaScript Example

```javascript
const notebooks = await client.api('/me/onenote/notebooks').get();
```

### 3.2 Get Notebook

Retrieve the properties and relationships of a specific notebook.

```
GET /me/onenote/notebooks/{notebook-id}
GET /users/{id | userPrincipalName}/onenote/notebooks/{notebook-id}
GET /groups/{id}/onenote/notebooks/{notebook-id}
GET /sites/{id}/onenote/notebooks/{notebook-id}
```

**Query Parameters**: `$select`, `$expand`

**Valid `$expand` values**: `sections`, `sectionGroups`

**Response**: `200 OK` with a single Notebook object.

#### Example Request

```http
GET https://graph.microsoft.com/v1.0/me/onenote/notebooks/1-e13f257d-78c6-46cf-ae8c-13686517ac5f
Authorization: Bearer {token}
```

#### Example Response

```http
HTTP/1.1 200 OK
Content-type: application/json

{
  "id": "1-e13f257d-78c6-46cf-ae8c-13686517ac5f",
  "displayName": "My Notebook",
  "isDefault": true,
  "userRole": "Owner",
  "isShared": true,
  "sectionsUrl": "https://graph.microsoft.com/v1.0/...",
  "sectionGroupsUrl": "https://graph.microsoft.com/v1.0/...",
  "links": {
    "oneNoteClientUrl": { "href": "onenote:..." },
    "oneNoteWebUrl": { "href": "https://..." }
  }
}
```

#### JavaScript Example

```javascript
const notebook = await client
  .api('/me/onenote/notebooks/1-e13f257d-78c6-46cf-ae8c-13686517ac5f')
  .get();
```

#### Expanding Sections and Section Groups

```javascript
const notebook = await client
  .api('/me/onenote/notebooks/{id}?$expand=sections,sectionGroups')
  .get();
```

### 3.3 Create Notebook

Create a new OneNote notebook.

```
POST /me/onenote/notebooks
POST /users/{id | userPrincipalName}/onenote/notebooks
POST /groups/{id}/onenote/notebooks
POST /sites/{id}/onenote/notebooks
```

**Response**: `201 Created` with the new Notebook object.

#### Request Headers

| Name | Type | Description |
|---|---|---|
| Authorization | string | `Bearer {token}` (Required) |
| Content-Type | string | `application/json` |

#### Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `displayName` | string | Yes | The name of the notebook. |

**Name Constraints**:
- Must be unique across the user's notebooks
- Maximum 128 characters
- Cannot contain: `? * / : < > | ' "`

#### Example Request

```http
POST https://graph.microsoft.com/v1.0/me/onenote/notebooks
Content-type: application/json
Authorization: Bearer {token}

{
  "displayName": "My Private notebook"
}
```

#### Example Response

```http
HTTP/1.1 201 Created
Content-type: application/json

{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users('...')/onenote/notebooks/$entity",
  "id": "1-10143016-70dc-4449-b92a-3015225f800d",
  "self": "https://graph.microsoft.com/v1.0/users/{user-id}/onenote/notebooks/1-10143016-70dc-4449-b92a-3015225f800d",
  "displayName": "My Private notebook",
  "userRole": "Owner",
  "isShared": false,
  "sectionsUrl": "https://graph.microsoft.com/v1.0/users/{user-id}/onenote/notebooks/1-10143016-70dc-4449-b92a-3015225f800d/sections",
  "sectionGroupsUrl": "https://graph.microsoft.com/v1.0/users/{user-id}/onenote/notebooks/1-10143016-70dc-4449-b92a-3015225f800d/sectionGroups",
  "createdDateTime": "2024-06-21T10:00:00Z",
  "lastModifiedDateTime": "2024-06-21T10:00:00Z",
  "links": {
    "oneNoteClientUrl": { "href": "onenote:https://..." },
    "oneNoteWebUrl": { "href": "https://..." }
  }
}
```

#### JavaScript Example

```javascript
const notebook = {
  displayName: 'My Private notebook',
};
const result = await client.api('/me/onenote/notebooks').post(notebook);
```

---

## 4. Section Groups Endpoints

### 4.1 List All Section Groups

Retrieve all section groups across all notebooks for the user, including nested section groups.

```
GET /me/onenote/sectionGroups
GET /users/{id | userPrincipalName}/onenote/sectionGroups
GET /groups/{id}/onenote/sectionGroups
GET /sites/{id}/onenote/sectionGroups
```

**Query Parameters**: `$filter`, `$orderby`, `$select`, `$expand`, `$top`, `$skip`, `$count`

**Default sort order**: `name asc`

**Default expansion**: Expands `parentNotebook` and selects its `id`, `displayName`, and `self` properties.

**Valid `$expand` values**: `sections`, `sectionGroups`, `parentNotebook`, `parentSectionGroup`

**Response**: `200 OK` with a collection of SectionGroup objects.

> **Important (SharePoint)**: A section group in SharePoint is a folder object. When requesting
> `sites/{id}/onenote/sectionGroups`, the result may include non-OneNote folders. To filter
> to only OneNote section groups, use: `$filter=parentNotebook ne null`

#### Example Request

```http
GET https://graph.microsoft.com/v1.0/me/onenote/sectionGroups
Authorization: Bearer {token}
```

#### JavaScript Example

```javascript
const sectionGroups = await client.api('/me/onenote/sectionGroups').get();
```

### 4.2 List Section Groups in a Notebook

Retrieve section groups from a specific notebook (top-level only, not nested).

```
GET /me/onenote/notebooks/{notebook-id}/sectionGroups
GET /users/{id | userPrincipalName}/onenote/notebooks/{notebook-id}/sectionGroups
GET /groups/{id}/onenote/notebooks/{notebook-id}/sectionGroups
GET /sites/{id}/onenote/notebooks/{notebook-id}/sectionGroups
```

**Query Parameters**: `$filter`, `$orderby`, `$select`, `$expand`, `$top`, `$skip`, `$count`

**Default sort order**: `name asc`

**Default expansion**: Expands `parentNotebook` and selects its `id`, `displayName`, and `self` properties.

**Valid `$expand` values**: `sections`, `sectionGroups`, `parentNotebook`, `parentSectionGroup`

**Response**: `200 OK` with a collection of SectionGroup objects.

#### Example Request

```http
GET https://graph.microsoft.com/v1.0/me/onenote/notebooks/{notebook-id}/sectionGroups
Authorization: Bearer {token}
```

#### Example Response

```http
HTTP/1.1 200 OK
Content-type: application/json

{
  "value": [
    {
      "id": "section-group-id",
      "displayName": "Research",
      "sectionsUrl": "https://graph.microsoft.com/v1.0/.../sectionGroups/{id}/sections",
      "sectionGroupsUrl": "https://graph.microsoft.com/v1.0/.../sectionGroups/{id}/sectionGroups",
      "self": "https://graph.microsoft.com/v1.0/.../sectionGroups/{id}",
      "createdDateTime": "2024-03-15T08:00:00Z",
      "lastModifiedDateTime": "2024-06-20T12:00:00Z",
      "createdBy": {
        "user": { "id": "user-id", "displayName": "User Name" }
      },
      "lastModifiedBy": {
        "user": { "id": "user-id", "displayName": "User Name" }
      }
    }
  ]
}
```

#### JavaScript Example

```javascript
const sectionGroups = await client
  .api('/me/onenote/notebooks/{notebook-id}/sectionGroups')
  .get();
```

### 4.3 Get Section Group

Retrieve properties and relationships of a specific section group.

```
GET /me/onenote/sectionGroups/{sectionGroup-id}
GET /users/{id | userPrincipalName}/onenote/sectionGroups/{sectionGroup-id}
GET /groups/{id}/onenote/sectionGroups/{sectionGroup-id}
GET /sites/{id}/onenote/sectionGroups/{sectionGroup-id}
```

**Query Parameters**: `$select`, `$expand`

**Default expansion**: Expands `parentNotebook` and selects its `id`, `name`, and `self` properties.

**Valid `$expand` values**: `parentNotebook`, `parentSectionGroup`

**Response**: `200 OK` with a single SectionGroup object.

#### Example Request

```http
GET https://graph.microsoft.com/v1.0/me/onenote/sectionGroups/{sectionGroup-id}
Authorization: Bearer {token}
```

#### JavaScript Example

```javascript
const sectionGroup = await client
  .api('/me/onenote/sectionGroups/{sectionGroup-id}')
  .get();
```

### 4.4 Create Section Group in a Notebook

Create a new section group in the specified notebook.

```
POST /me/onenote/notebooks/{notebook-id}/sectionGroups
POST /users/{id | userPrincipalName}/onenote/notebooks/{notebook-id}/sectionGroups
POST /groups/{id}/onenote/notebooks/{notebook-id}/sectionGroups
POST /sites/{id}/onenote/notebooks/{notebook-id}/sectionGroups
```

**Response**: `201 Created` with the new SectionGroup object.

#### Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `displayName` | string | Yes | The name of the section group. |

**Name Constraints**:
- Must be unique within the same hierarchy level
- Maximum 50 characters
- Cannot contain: `? * / : < > | & # ' ' % ~`

#### Example Request

```http
POST https://graph.microsoft.com/v1.0/me/onenote/notebooks/{notebook-id}/sectionGroups
Content-type: application/json
Authorization: Bearer {token}

{
  "displayName": "Research Notes"
}
```

#### Example Response

```http
HTTP/1.1 201 Created
Content-type: application/json

{
  "id": "new-section-group-id",
  "displayName": "Research Notes",
  "sectionsUrl": "https://graph.microsoft.com/v1.0/.../sectionGroups/{id}/sections",
  "sectionGroupsUrl": "https://graph.microsoft.com/v1.0/.../sectionGroups/{id}/sectionGroups",
  "self": "https://graph.microsoft.com/v1.0/.../sectionGroups/{id}",
  "createdBy": {
    "user": { "id": "user-id", "displayName": "User Name" }
  },
  "lastModifiedBy": {
    "user": { "id": "user-id", "displayName": "User Name" }
  }
}
```

#### JavaScript Example

```javascript
const sectionGroup = {
  displayName: 'Research Notes',
};
const result = await client
  .api('/me/onenote/notebooks/{notebook-id}/sectionGroups')
  .post(sectionGroup);
```

### 4.5 Create Nested Section Group

Create a new section group within an existing section group (nesting).

```
POST /me/onenote/sectionGroups/{sectionGroup-id}/sectionGroups
POST /users/{id | userPrincipalName}/onenote/sectionGroups/{sectionGroup-id}/sectionGroups
POST /groups/{id}/onenote/sectionGroups/{sectionGroup-id}/sectionGroups
POST /sites/{id}/onenote/sectionGroups/{sectionGroup-id}/sectionGroups
```

**Response**: `201 Created` with the new SectionGroup object.

**Request Body**: Same as [Create Section Group in a Notebook](#44-create-section-group-in-a-notebook).

**Name Constraints**: Same as above (50 chars, unique within hierarchy level).

#### Example Request

```http
POST https://graph.microsoft.com/v1.0/me/onenote/sectionGroups/{parent-sectionGroup-id}/sectionGroups
Content-type: application/json
Authorization: Bearer {token}

{
  "displayName": "Sub-group"
}
```

#### JavaScript Example

```javascript
const sectionGroup = { displayName: 'Sub-group' };
const result = await client
  .api('/me/onenote/sectionGroups/{parent-sectionGroup-id}/sectionGroups')
  .post(sectionGroup);
```

> **Note on Nesting**: Section groups support arbitrary nesting. You can navigate nested
> section groups via the `sectionGroups` relationship on each SectionGroup object. The
> `parentSectionGroup` relationship allows navigating upward in the hierarchy.

---

## 5. Sections Endpoints

### 5.1 List All Sections

Retrieve all sections from all notebooks owned by/accessible to the user, including sections within nested section groups.

```
GET /me/onenote/sections
GET /users/{id | userPrincipalName}/onenote/sections
GET /groups/{id}/onenote/sections
GET /sites/{id}/onenote/sections
```

**Query Parameters**: `$filter`, `$orderby`, `$select`, `$expand`, `$top`, `$skip`, `$count`

**Default sort order**: `name asc`

**Default expansion**: Expands `parentNotebook` and selects its `id`, `displayName`, and `self` properties.

**Valid `$expand` values**: `parentNotebook`, `parentSectionGroup`

**Response**: `200 OK` with a collection of OnenoteSection objects.

#### Example Request

```http
GET https://graph.microsoft.com/v1.0/me/onenote/sections
Authorization: Bearer {token}
```

#### JavaScript Example

```javascript
const sections = await client.api('/me/onenote/sections').get();
```

### 5.2 List Sections in a Notebook

Retrieve sections from a specific notebook (top-level sections only, not in section groups).

```
GET /me/onenote/notebooks/{notebook-id}/sections
GET /users/{id | userPrincipalName}/onenote/notebooks/{notebook-id}/sections
GET /groups/{id}/onenote/notebooks/{notebook-id}/sections
GET /sites/{id}/onenote/notebooks/{notebook-id}/sections
```

**Query Parameters**: `$filter`, `$orderby`, `$select`, `$expand`, `$top`, `$skip`, `$count`

**Default sort order**: `name asc`

**Default expansion**: Expands `parentNotebook` and selects its `id`, `displayName`, and `self` properties.

**Valid `$expand` values**: `parentNotebook`, `parentSectionGroup`

**Response**: `200 OK` with a collection of OnenoteSection objects.

#### Example Request

```http
GET https://graph.microsoft.com/v1.0/me/onenote/notebooks/{notebook-id}/sections
Authorization: Bearer {token}
```

#### Example Response

```http
HTTP/1.1 200 OK
Content-type: application/json

{
  "value": [
    {
      "id": "section-id",
      "displayName": "Quick Notes",
      "isDefault": true,
      "pagesUrl": "https://graph.microsoft.com/v1.0/.../sections/{id}/pages",
      "self": "https://graph.microsoft.com/v1.0/.../sections/{id}",
      "createdDateTime": "2024-01-20T09:00:00Z",
      "lastModifiedDateTime": "2024-06-18T16:30:00Z",
      "createdBy": {
        "user": { "id": "user-id", "displayName": "User Name" }
      },
      "lastModifiedBy": {
        "user": { "id": "user-id", "displayName": "User Name" }
      },
      "links": {
        "oneNoteClientUrl": { "href": "onenote:..." },
        "oneNoteWebUrl": { "href": "https://..." }
      }
    }
  ]
}
```

#### JavaScript Example

```javascript
const sections = await client
  .api('/me/onenote/notebooks/{notebook-id}/sections')
  .get();
```

### 5.3 List Sections in a Section Group

Retrieve sections from a specific section group.

```
GET /me/onenote/sectionGroups/{sectionGroup-id}/sections
GET /users/{id | userPrincipalName}/onenote/sectionGroups/{sectionGroup-id}/sections
GET /groups/{id}/onenote/sectionGroups/{sectionGroup-id}/sections
GET /sites/{id}/onenote/sectionGroups/{sectionGroup-id}/sections
```

**Query Parameters**: `$filter`, `$orderby`, `$select`, `$expand`, `$top`, `$skip`, `$count`

**Default sort order**: `name asc`

**Default expansion**: Expands `parentNotebook` and selects its `id`, `displayName`, and `self` properties.

**Valid `$expand` values**: `parentNotebook`, `parentSectionGroup`

**Response**: `200 OK` with a collection of OnenoteSection objects.

#### Example Request

```http
GET https://graph.microsoft.com/v1.0/me/onenote/sectionGroups/{sectionGroup-id}/sections
Authorization: Bearer {token}
```

#### JavaScript Example

```javascript
const sections = await client
  .api('/me/onenote/sectionGroups/{sectionGroup-id}/sections')
  .get();
```

### 5.4 Get Section

Retrieve properties and relationships of a specific section.

```
GET /me/onenote/sections/{section-id}
GET /users/{id | userPrincipalName}/onenote/sections/{section-id}
GET /groups/{id}/onenote/sections/{section-id}
GET /sites/{id}/onenote/sections/{section-id}
```

**Query Parameters**: `$select`, `$expand`

**Default expansion**: Expands `parentNotebook` and selects its `id`, `displayName`, and `self` properties.

**Valid `$expand` values**: `parentNotebook`, `parentSectionGroup`

**Response**: `200 OK` with a single OnenoteSection object.

#### Example Request

```http
GET https://graph.microsoft.com/v1.0/me/onenote/sections/{section-id}
Authorization: Bearer {token}
```

#### JavaScript Example

```javascript
const section = await client
  .api('/me/onenote/sections/{section-id}')
  .get();
```

### 5.5 Create Section in a Notebook

Create a new section in the specified notebook.

```
POST /me/onenote/notebooks/{notebook-id}/sections
POST /users/{id | userPrincipalName}/onenote/notebooks/{notebook-id}/sections
POST /groups/{id}/onenote/notebooks/{notebook-id}/sections
POST /sites/{id}/onenote/notebooks/{notebook-id}/sections
```

**Response**: `201 Created` with the new OnenoteSection object.

#### Request Body

| Property | Type | Required | Description |
|---|---|---|---|
| `displayName` | string | Yes | The name of the section. |

**Name Constraints**:
- Must be unique within the same hierarchy level
- Maximum 50 characters
- Cannot contain: `? * / : < > | & # ' ' % ~`

#### Example Request

```http
POST https://graph.microsoft.com/v1.0/me/onenote/notebooks/{notebook-id}/sections
Content-type: application/json
Authorization: Bearer {token}

{
  "displayName": "Meeting Notes"
}
```

#### Example Response

```http
HTTP/1.1 201 Created
Content-type: application/json

{
  "id": "new-section-id",
  "displayName": "Meeting Notes",
  "isDefault": false,
  "pagesUrl": "https://graph.microsoft.com/v1.0/.../sections/{id}/pages",
  "self": "https://graph.microsoft.com/v1.0/.../sections/{id}",
  "createdBy": {
    "user": { "id": "user-id", "displayName": "User Name" }
  },
  "lastModifiedBy": {
    "user": { "id": "user-id", "displayName": "User Name" }
  }
}
```

#### JavaScript Example

```javascript
const section = { displayName: 'Meeting Notes' };
const result = await client
  .api('/me/onenote/notebooks/{notebook-id}/sections')
  .post(section);
```

### 5.6 Create Section in a Section Group

Create a new section in the specified section group.

```
POST /me/onenote/sectionGroups/{sectionGroup-id}/sections
POST /users/{id | userPrincipalName}/onenote/sectionGroups/{sectionGroup-id}/sections
POST /groups/{id}/onenote/sectionGroups/{sectionGroup-id}/sections
POST /sites/{id}/onenote/sectionGroups/{sectionGroup-id}/sections
```

**Response**: `201 Created` with the new OnenoteSection object.

**Request Body**: Same as [Create Section in a Notebook](#55-create-section-in-a-notebook).

**Name Constraints**: Same as above (50 chars, unique within hierarchy level).

#### Example Request

```http
POST https://graph.microsoft.com/v1.0/me/onenote/sectionGroups/{sectionGroup-id}/sections
Content-type: application/json
Authorization: Bearer {token}

{
  "displayName": "Analysis"
}
```

#### JavaScript Example

```javascript
const section = { displayName: 'Analysis' };
const result = await client
  .api('/me/onenote/sectionGroups/{sectionGroup-id}/sections')
  .post(section);
```

---

## 6. Common Patterns

### 6.1 OData Query Parameters

All list (collection) endpoints support OData query parameters. The following table summarizes support across resource types.

| Parameter | Notebooks | Section Groups | Sections | Description |
|---|---|---|---|---|
| `$select` | Yes | Yes | Yes | Choose which properties to return. |
| `$filter` | Yes | Yes | Yes | Filter results using boolean expressions. |
| `$orderby` | Yes | Yes | Yes | Sort results. Default: `name asc`. |
| `$top` | Yes | Yes | Yes | Limit number of results (max 100, default 20). |
| `$skip` | Yes | Yes | Yes | Skip N entries (for pagination). |
| `$expand` | Yes | Yes | Yes | Inline navigation properties. |
| `$count` | Yes | Yes | Yes | Include count in `@odata.count`. |

#### $expand Valid Values by Resource

| Resource | Valid $expand Values |
|---|---|
| Notebooks | `sections`, `sectionGroups` |
| Section Groups | `sections`, `sectionGroups`, `parentNotebook`, `parentSectionGroup` |
| Sections | `parentNotebook`, `parentSectionGroup` |

#### $filter Operators

| Category | Operators |
|---|---|
| Comparison | `eq`, `ne`, `gt`, `ge`, `lt`, `le` |
| Logical | `and`, `or`, `not` |
| String functions | `contains`, `endswith`, `startswith`, `length`, `indexof`, `substring`, `tolower`, `toupper`, `trim`, `concat` |

> **Important**: Property names and OData string comparisons are case-sensitive. Always use
> `tolower()` for case-insensitive string comparisons.

#### Multi-Level Expand

You can expand multiple levels deep to retrieve a full notebook hierarchy in a single request:

```http
GET /me/onenote/notebooks?$expand=sections,sectionGroups($expand=sections,sectionGroups($levels=max;$expand=sections))
```

This retrieves all notebooks with their sections and section groups, recursively expanding nested section groups.

#### Selective Expand

Combine `$expand` and `$select` for targeted data retrieval:

```http
GET /me/onenote/sectionGroups/{id}?$expand=sections($select=name,self)&$select=name,self
```

#### Filter Examples

```
# Sections created in a date range
GET /me/onenote/sections?$filter=createdTime ge 2024-10-01 and createdTime le 2024-10-31

# Sections by name (case-insensitive)
GET /me/onenote/sections?$filter=contains(tolower(name),'spring')

# Notebooks that are default
GET /me/onenote/notebooks?$filter=isDefault eq true

# Section groups that belong to a notebook (SharePoint filtering)
GET /sites/{id}/onenote/sectionGroups?$filter=parentNotebook ne null
```

### 6.2 Pagination

The OneNote API uses cursor-based pagination with the `@odata.nextLink` pattern.

**Default page size**: 20 entries

**Maximum page size**: 100 entries (via `$top`)

**How it works**:
1. Make an initial request (optionally with `$top` to set page size).
2. If there are more results, the response includes an `@odata.nextLink` property.
3. Follow the `@odata.nextLink` URL to get the next page.
4. Repeat until no `@odata.nextLink` is returned.

#### Pagination Response Example

```json
{
  "value": [ ... ],
  "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/onenote/sections?$skip=20&$top=20"
}
```

#### Manual Pagination with $skip and $top

```http
# First page (items 1-5)
GET /me/onenote/sections?$top=5

# Second page (items 6-10)
GET /me/onenote/sections?$top=5&$skip=5

# Third page (items 11-15)
GET /me/onenote/sections?$top=5&$skip=10
```

#### Pagination Implementation Pattern (TypeScript)

```typescript
interface ODataCollection<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
}

async function getAllItems<T>(client: Client, initialUrl: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | undefined = initialUrl;

  while (url) {
    const response: ODataCollection<T> = await client.api(url).get();
    items.push(...response.value);
    url = response['@odata.nextLink'];
  }

  return items;
}
```

### 6.3 Error Responses

Microsoft Graph returns errors using standard HTTP status codes with a JSON error body.

#### Error Response Format

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "innerError": {
      "code": "string",
      "request-id": "string",
      "date": "string"
    }
  }
}
```

#### Error Properties

| Property | Type | Description |
|---|---|---|
| `code` | string | Machine-readable error code. Use this in code for error handling. |
| `message` | string | Human-readable error description. Do NOT depend on this in code. |
| `innerError` | object | Optional. More specific error details. Can be recursive. |
| `innerError.code` | string | More specific error code. |
| `innerError.request-id` | string | Request ID for debugging with Microsoft support. |
| `innerError.date` | string | Timestamp of the error. |

#### Common HTTP Status Codes

| Status | Description | Common OneNote Scenarios |
|---|---|---|
| 400 | Bad Request | Invalid request body, invalid displayName |
| 401 | Unauthorized | Missing or invalid access token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Notebook/section/section group does not exist |
| 409 | Conflict | Duplicate name at the same hierarchy level |
| 429 | Too Many Requests | Throttling. Check `Retry-After` header. |
| 500 | Internal Server Error | Server-side issue |
| 503 | Service Unavailable | Temporary outage. Check `Retry-After` header. |

#### Error Handling Pattern (TypeScript)

```typescript
interface GraphError {
  statusCode: number;
  code: string;
  message: string;
  requestId?: string;
  date?: Date;
  body?: {
    error: {
      code: string;
      message: string;
      innerError?: {
        code: string;
        'request-id': string;
        date: string;
      };
    };
  };
}

async function safeRequest<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const graphError = error as GraphError;

    if (graphError.statusCode === 429) {
      // Handle throttling - respect Retry-After header
      const retryAfter = graphError.headers?.['retry-after'] ?? 30;
      await delay(retryAfter * 1000);
      return fn();
    }

    if (graphError.statusCode === 404) {
      throw new NotFoundError(graphError.message);
    }

    throw error;
  }
}
```

### 6.4 Request Context Paths

All endpoints support four context paths depending on the target:

| Context | Path Prefix | Description |
|---|---|---|
| Current user | `/me/onenote/` | Notebooks for the signed-in user |
| Specific user | `/users/{id \| userPrincipalName}/onenote/` | Notebooks for a specific user |
| Group | `/groups/{id}/onenote/` | Notebooks for an M365 group |
| SharePoint site | `/sites/{id}/onenote/` | Notebooks in a SharePoint site |

**Service Root URL**: `https://graph.microsoft.com/v1.0`

The `/me` path is shorthand for `/users/{signed-in-user-id}` and requires delegated authentication. For application-only authentication, you must use `/users/{id}`.

---

## 7. Implementation Notes

### 7.1 Hierarchy Structure

```
Notebook
  +-- Section (direct child)
  +-- Section (direct child)
  +-- SectionGroup
  |     +-- Section
  |     +-- Section
  |     +-- SectionGroup (nested)
  |           +-- Section
  |           +-- SectionGroup (deeply nested)
  +-- SectionGroup
        +-- Section
```

- Notebooks contain **sections** and **section groups** at the top level.
- Section groups can contain **sections** and **nested section groups** (recursive).
- Sections contain **pages** (covered in a separate research document).
- There is no API to rename, move, or delete notebooks, section groups, or sections via the Graph v1.0 API.

### 7.2 Naming Constraints Summary

| Resource | Max Length | Uniqueness Scope | Forbidden Characters |
|---|---|---|---|
| Notebook | 128 chars | User's notebooks | `? * / : < > \| ' "` |
| Section Group | 50 chars | Same hierarchy level | `? * / : < > \| & # ' ' % ~` |
| Section | 50 chars | Same hierarchy level | `? * / : < > \| & # ' ' % ~` |

### 7.3 Read-Only vs Writable Operations

| Operation | Notebooks | Section Groups | Sections |
|---|---|---|---|
| List | Yes | Yes | Yes |
| Get by ID | Yes | Yes | Yes |
| Create | Yes | Yes | Yes |
| Update/Rename | No | No | No |
| Delete | No | No | No |
| Move | No | No | No |
| Copy | Yes (copyNotebook) | No | Yes (copyToNotebook, copyToSectionGroup) |

> **Key Limitation**: The v1.0 API does not support updating, renaming, deleting, or moving
> notebooks, section groups, or sections. Only create and read operations are available. Copy
> operations exist for notebooks and sections but not section groups.

### 7.4 Default Behaviors to Be Aware Of

1. **Default sort order**: All list endpoints default to `name asc` sort order.
2. **Default page size**: 20 entries per page (configurable up to 100 via `$top`).
3. **Default expansions**:
   - Sections and section groups: Auto-expand `parentNotebook` with `id`, `displayName`, `self`.
   - Section groups: Auto-expand `parentSectionGroup` with `id`, `name`, `self`.
4. **Circular expansion blocked**: You cannot expand parents of child entities and children of parent entities simultaneously (e.g., expanding `parentNotebook` on a section and then `sections` on that notebook).

### 7.5 Rate Limiting / Throttling

Microsoft Graph enforces per-app and per-tenant throttling limits. When throttled:

- The API returns `429 Too Many Requests`.
- A `Retry-After` header indicates how many seconds to wait.
- Use exponential backoff with jitter for retry logic.

### 7.6 Backup/Restore Limitations

> **Warning**: Microsoft explicitly states that if you are building a solution involving
> backup/restore of OneNote sections or notebooks, you will encounter OneNote API limitations.
> For such scenarios, refer to the
> [scan guidance documentation](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/scan-guidance).

### 7.7 Authentication Requirements

- All requests require SSL/TLS (HTTPS).
- Authorization header: `Bearer {token}` with a valid OAuth 2.0 access token.
- For delegated flows, the user must have access to the target notebooks.
- For application flows, admin consent is required for `Notes.Read.All` or `Notes.ReadWrite.All`.

---

## References

- [OneNote API Overview](https://learn.microsoft.com/en-us/graph/api/resources/onenote-api-overview?view=graph-rest-1.0)
- [Notebook Resource Type](https://learn.microsoft.com/en-us/graph/api/resources/notebook?view=graph-rest-1.0)
- [SectionGroup Resource Type](https://learn.microsoft.com/en-us/graph/api/resources/sectiongroup?view=graph-rest-1.0)
- [OnenoteSection Resource Type](https://learn.microsoft.com/en-us/graph/api/resources/onenotesection?view=graph-rest-1.0)
- [List Notebooks](https://learn.microsoft.com/en-us/graph/api/onenote-list-notebooks?view=graph-rest-1.0)
- [Get Notebook](https://learn.microsoft.com/en-us/graph/api/notebook-get?view=graph-rest-1.0)
- [Create Notebook](https://learn.microsoft.com/en-us/graph/api/onenote-post-notebooks?view=graph-rest-1.0)
- [List Section Groups (All)](https://learn.microsoft.com/en-us/graph/api/onenote-list-sectiongroups?view=graph-rest-1.0)
- [List Section Groups (In Notebook)](https://learn.microsoft.com/en-us/graph/api/notebook-list-sectiongroups?view=graph-rest-1.0)
- [Get Section Group](https://learn.microsoft.com/en-us/graph/api/sectiongroup-get?view=graph-rest-1.0)
- [Create Section Group (In Notebook)](https://learn.microsoft.com/en-us/graph/api/notebook-post-sectiongroups?view=graph-rest-1.0)
- [Create Section Group (Nested)](https://learn.microsoft.com/en-us/graph/api/sectiongroup-post-sectiongroups?view=graph-rest-1.0)
- [List Sections (All)](https://learn.microsoft.com/en-us/graph/api/onenote-list-sections?view=graph-rest-1.0)
- [List Sections (In Notebook)](https://learn.microsoft.com/en-us/graph/api/notebook-list-sections?view=graph-rest-1.0)
- [List Sections (In Section Group)](https://learn.microsoft.com/en-us/graph/api/sectiongroup-list-sections?view=graph-rest-1.0)
- [Get Section](https://learn.microsoft.com/en-us/graph/api/onenotesection-get?view=graph-rest-1.0)
- [Create Section (In Notebook)](https://learn.microsoft.com/en-us/graph/api/notebook-post-sections?view=graph-rest-1.0)
- [Create Section (In Section Group)](https://learn.microsoft.com/en-us/graph/api/sectiongroup-post-sections?view=graph-rest-1.0)
- [Get OneNote Content and Structure](https://learn.microsoft.com/en-us/graph/onenote-get-content)
- [Microsoft Graph Error Responses](https://learn.microsoft.com/en-us/graph/errors)
