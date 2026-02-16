# MCP SDK Patterns: Tools, Resources, and Prompts Registration

> **Spike Research Document**
> SDK: `@modelcontextprotocol/sdk` v1.26.0
> Zod: `zod` v4.3.6
> Date: 2026-02-16

---

## Table of Contents

1. [Codebase Architecture Overview](#1-codebase-architecture-overview)
2. [Tools Registration](#2-tools-registration)
3. [Resources Registration](#3-resources-registration)
4. [Prompts Registration](#4-prompts-registration)
5. [Error Handling](#5-error-handling)
6. [Existing Codebase Patterns](#6-existing-codebase-patterns)
7. [Recommended Implementation Plan](#7-recommended-implementation-plan)

---

## 1. Codebase Architecture Overview

The OneNote MCP server follows a clean modular architecture:

```
src/
  index.ts                    # Server bootstrap, transport, signal handling
  constants.ts                # Shared constants (URLs, timeouts, OAuth config)
  tools/index.ts              # registerTools(server) -- empty scaffold
  resources/index.ts          # registerResources(server) -- empty scaffold
  prompts/index.ts            # registerPrompts(server) -- empty scaffold
  onenote/
    client.ts                 # OneNoteClient -- authenticated HTTP wrapper for MS Graph
    client-factory.ts         # getOneNoteClient() / getOneNoteClientOrThrow() helpers
    types.ts                  # OneNoteClientError, OneNoteResult<T>, error codes
    auth.ts                   # Token resolution chain (env -> cache -> refresh -> interactive)
    oauth.ts                  # OAuth utilities (URL builders, token exchange)
    token-store.ts            # Disk-persisted token storage
  utils/
    html.ts                   # escapeHtml utility
```

The server is created in `src/index.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer(
  { name: "onenote-mcp", version: SERVER_VERSION },
  {
    instructions:
      "OneNote MCP scaffold server. Stage 1 includes OAuth/auth foundations ...",
  }
);

registerTools(server);
registerResources(server);
registerPrompts(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Each registrar function receives the `McpServer` instance and registers its capabilities.

---

## 2. Tools Registration

### 2.1 API Overview

The SDK provides two APIs for tool registration. The **v1 variadic API** (`server.tool()`) is deprecated. The **v2 config-based API** (`server.registerTool()`) is the current recommended approach.

**Use `server.registerTool()` for all new tool implementations.**

### 2.2 `server.registerTool()` Signature

```typescript
server.registerTool<OutputArgs, InputArgs>(
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: InputArgs;       // Zod schema or raw shape
    outputSchema?: OutputArgs;     // Zod schema or raw shape
    annotations?: ToolAnnotations;
    _meta?: Record<string, unknown>;
  },
  callback: ToolCallback<InputArgs>
): RegisteredTool;
```

### 2.3 Basic Tool (No Parameters)

```typescript
import { z } from "zod";

server.registerTool(
  "list-notebooks",
  {
    title: "List Notebooks",
    description: "List all OneNote notebooks accessible to the authenticated user",
  },
  async (extra) => {
    // No input args -- `extra` is the only parameter
    const client = await getOneNoteClientOrThrow(extra);
    const result = await client.request<NotebooksResponse>({
      path: "/me/onenote/notebooks",
    });

    if (!result.success) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
    };
  }
);
```

### 2.4 Tool with Input Schema (Zod)

The `inputSchema` field accepts either a raw Zod shape (object of Zod types) or a full `z.object()`. SDK v1.26.0 supports both; raw shapes are the most concise.

```typescript
import { z } from "zod";

server.registerTool(
  "get-page-content",
  {
    title: "Get Page Content",
    description: "Retrieve the content of a specific OneNote page by its ID",
    inputSchema: {
      pageId: z.string().describe("The unique identifier of the OneNote page"),
    },
  },
  async ({ pageId }, extra) => {
    const client = await getOneNoteClientOrThrow(extra);
    const result = await client.request<PageContent>({
      path: `/me/onenote/pages/${pageId}/content`,
    });

    if (!result.success) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
    };
  }
);
```

Alternatively, using `z.object()` for the input schema (required if using `outputSchema`):

```typescript
server.registerTool(
  "search-pages",
  {
    title: "Search Pages",
    description: "Search OneNote pages by keyword",
    inputSchema: z.object({
      query: z.string().describe("Search query string"),
      maxResults: z.number().optional().describe("Maximum results to return"),
    }),
  },
  async ({ query, maxResults }, extra) => {
    // ...handler implementation
  }
);
```

### 2.5 Tool with Output Schema (Structured Content)

When an `outputSchema` is defined, the tool should return `structuredContent` matching that schema. The SDK validates the output.

```typescript
server.registerTool(
  "count-notebooks",
  {
    title: "Count Notebooks",
    description: "Count the number of accessible OneNote notebooks",
    outputSchema: z.object({
      count: z.number(),
      names: z.array(z.string()),
    }),
  },
  async (extra) => {
    const client = await getOneNoteClientOrThrow(extra);
    // ...fetch notebooks...
    return {
      content: [{ type: "text", text: `Found ${count} notebooks` }],
      structuredContent: { count, names },
    };
  }
);
```

### 2.6 Tool Return Format

Tools return a `CallToolResult`:

```typescript
interface CallToolResult {
  content: ContentBlock[];        // Array of text, image, audio, or resource_link blocks
  structuredContent?: unknown;    // Must match outputSchema if defined
  isError?: boolean;              // true indicates a tool-level error
}
```

**Content block types:**

```typescript
// Text content (most common)
{ type: "text", text: "Some result text" }

// Image content
{ type: "image", data: "<base64-encoded>", mimeType: "image/png" }

// Resource link (points to an MCP resource)
{
  type: "resource_link",
  uri: "onenote://notebook/abc123",
  name: "My Notebook",
  description: "A OneNote notebook",
  mimeType: "application/json"
}
```

### 2.7 Tool Annotations

Annotations provide metadata hints to clients about tool behavior:

```typescript
server.registerTool(
  "delete-page",
  {
    title: "Delete Page",
    description: "Permanently delete a OneNote page",
    inputSchema: {
      pageId: z.string().describe("ID of the page to delete"),
    },
    annotations: {
      title: "Delete Page",
      readOnlyHint: false,       // This tool modifies data
      destructiveHint: true,     // This tool destroys data
      idempotentHint: true,      // Calling multiple times has same effect
      openWorldHint: false,      // Operates only on known OneNote data
    },
  },
  async ({ pageId }, extra) => {
    // ...
  }
);
```

**ToolAnnotations fields:**

| Field             | Type      | Description                                          |
|-------------------|-----------|------------------------------------------------------|
| `title`           | `string?` | Human-readable display title                         |
| `readOnlyHint`    | `bool?`   | If true, tool does not modify any state              |
| `destructiveHint` | `bool?`   | If true, tool may irreversibly destroy data          |
| `idempotentHint`  | `bool?`   | If true, calling repeatedly with same args is safe   |
| `openWorldHint`   | `bool?`   | If true, tool interacts with external/open systems   |

### 2.8 Tool Naming Best Practices

- Use lowercase kebab-case: `list-notebooks`, `get-page-content`, `search-pages`
- Use verb-noun format: `create-page`, `delete-section`, `move-page`
- Be specific: prefer `get-notebook-sections` over `get-sections`
- Keep names concise but descriptive
- Group related tools with consistent prefixes: `notebook-list`, `notebook-get`, `notebook-create`

### 2.9 Registered Tool Object

`server.registerTool()` returns a `RegisteredTool` object that allows dynamic management:

```typescript
const tool = server.registerTool("my-tool", { /* config */ }, callback);

tool.disable();   // Temporarily hide the tool from clients
tool.enable();    // Re-enable the tool
tool.remove();    // Permanently unregister the tool
tool.update({     // Update tool properties
  description: "Updated description",
  callback: newCallback,
});

// After mutation, notify clients:
server.sendToolListChanged();
```

---

## 3. Resources Registration

### 3.1 API Overview

Resources expose data to clients via URIs. There are two kinds:
- **Static resources**: Fixed URIs (e.g., `onenote://notebooks`)
- **Resource templates**: Parameterized URIs using URI Template syntax (e.g., `onenote://notebook/{notebookId}`)

**Use `server.registerResource()` for all new resource implementations.**

### 3.2 `server.registerResource()` Signatures

```typescript
// Static resource (fixed URI)
server.registerResource(
  name: string,
  uri: string,
  config: ResourceMetadata,
  readCallback: ReadResourceCallback
): RegisteredResource;

// Template resource (parameterized URI)
server.registerResource(
  name: string,
  template: ResourceTemplate,
  config: ResourceMetadata,
  readCallback: ReadResourceTemplateCallback
): RegisteredResourceTemplate;
```

### 3.3 `ResourceMetadata` Type

`ResourceMetadata` is `Omit<Resource, 'uri' | 'name'>`, which includes:

```typescript
interface ResourceMetadata {
  title?: string;
  description?: string;
  mimeType?: string;        // e.g., "application/json", "text/plain", "text/html"
  annotations?: {
    audience?: ("user" | "assistant")[];
    priority?: number;       // 0-1 hint for ordering
  };
}
```

### 3.4 Static Resource Registration

A static resource has a fixed URI and always returns the same type of content.

```typescript
server.registerResource(
  "notebooks-list",
  "onenote://notebooks",
  {
    title: "OneNote Notebooks",
    description: "List of all accessible OneNote notebooks",
    mimeType: "application/json",
  },
  async (uri, extra) => {
    const client = await getOneNoteClientOrThrow(extra);
    const result = await client.request<NotebooksResponse>({
      path: "/me/onenote/notebooks",
    });

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return {
      contents: [
        {
          uri: uri.href,             // Must echo back the request URI
          mimeType: "application/json",
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }
);
```

### 3.5 Resource Template Registration

Resource templates use URI Template syntax (RFC 6570) to define parameterized URIs. The `ResourceTemplate` class requires a `list` callback (or `undefined`) for enumeration.

```typescript
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

server.registerResource(
  "notebook",
  new ResourceTemplate("onenote://notebook/{notebookId}", {
    list: async (extra) => {
      // Return all concrete resources matching this template
      const client = await getOneNoteClientOrThrow(extra);
      const result = await client.request<NotebooksResponse>({
        path: "/me/onenote/notebooks",
      });

      if (!result.success) {
        return { resources: [] };
      }

      return {
        resources: result.data.value.map((nb) => ({
          uri: `onenote://notebook/${nb.id}`,
          name: nb.displayName,
          mimeType: "application/json",
        })),
      };
    },
    complete: {
      // Optional: autocomplete for the notebookId variable
      notebookId: async (value) => {
        // Return suggestions matching the partial value
        return ["notebook-id-1", "notebook-id-2"].filter((id) =>
          id.startsWith(value)
        );
      },
    },
  }),
  {
    title: "OneNote Notebook",
    description: "A specific OneNote notebook by ID",
    mimeType: "application/json",
  },
  async (uri, variables, extra) => {
    // `variables` contains the resolved URI template variables
    const notebookId = variables.notebookId as string;
    const client = await getOneNoteClientOrThrow(extra);
    const result = await client.request<Notebook>({
      path: `/me/onenote/notebooks/${notebookId}`,
    });

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }
);
```

### 3.6 Resource Content Formats

Resources return content in `ReadResourceResult`:

```typescript
interface ReadResourceResult {
  contents: Array<{
    uri: string;          // The resource URI
    mimeType?: string;    // Content type
    text?: string;        // Text content (for text-based resources)
    blob?: string;        // Base64-encoded binary content (for binary resources)
  }>;
}
```

**Text content** (JSON, HTML, plain text):

```typescript
return {
  contents: [{
    uri: uri.href,
    mimeType: "application/json",
    text: JSON.stringify(data, null, 2),
  }],
};
```

**Binary content** (images, files):

```typescript
return {
  contents: [{
    uri: uri.href,
    mimeType: "image/png",
    blob: base64EncodedImageData,
  }],
};
```

### 3.7 URI Scheme Design

For this project, a custom `onenote://` scheme is recommended:

| URI Pattern                                           | Description                     |
|-------------------------------------------------------|---------------------------------|
| `onenote://notebooks`                                 | All notebooks (static)          |
| `onenote://notebook/{notebookId}`                     | A specific notebook (template)  |
| `onenote://notebook/{notebookId}/sections`            | Sections in a notebook          |
| `onenote://section/{sectionId}`                       | A specific section              |
| `onenote://section/{sectionId}/pages`                 | Pages in a section              |
| `onenote://page/{pageId}`                             | A specific page                 |
| `onenote://page/{pageId}/content`                     | Page content (HTML)             |

### 3.8 Registered Resource Object

```typescript
const resource = server.registerResource("name", "uri://...", {}, callback);

resource.disable();
resource.enable();
resource.remove();
resource.update({
  name: "new-name",
  uri: "new://uri",
  metadata: { description: "Updated" },
  callback: newCallback,
});

// After mutation, notify clients:
server.sendResourceListChanged();
```

---

## 4. Prompts Registration

### 4.1 API Overview

Prompts are reusable message templates that clients can invoke. They accept structured arguments and return pre-formatted messages for the LLM.

**Use `server.registerPrompt()` for all new prompt implementations.**

### 4.2 `server.registerPrompt()` Signature

```typescript
server.registerPrompt<Args extends PromptArgsRawShape>(
  name: string,
  config: {
    title?: string;
    description?: string;
    argsSchema?: Args;         // Zod raw shape (keys mapped to z.ZodString)
  },
  callback: PromptCallback<Args>
): RegisteredPrompt;
```

**Important:** Prompt argument values are always strings (per the MCP specification). The `argsSchema` uses `z.string()` for all arguments. Optional arguments use `z.string().optional()`.

### 4.3 Basic Prompt (No Arguments)

```typescript
server.registerPrompt(
  "summarize-notebooks",
  {
    title: "Summarize Notebooks",
    description: "Generate a summary of all accessible OneNote notebooks",
  },
  async (extra) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Please list and summarize all my OneNote notebooks, including their sections and recent pages.",
          },
        },
      ],
    };
  }
);
```

### 4.4 Prompt with Arguments

```typescript
import { z } from "zod";

server.registerPrompt(
  "review-notes",
  {
    title: "Review Notes",
    description: "Review and organize notes from a specific notebook",
    argsSchema: {
      notebookName: z.string().describe("Name of the notebook to review"),
      focus: z.string().optional().describe(
        "Optional focus area: 'completeness', 'organization', or 'action-items'"
      ),
    },
  },
  async ({ notebookName, focus }, extra) => {
    const focusInstruction = focus
      ? ` Focus specifically on ${focus}.`
      : "";

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please review the notes in my "${notebookName}" notebook.${focusInstruction} Identify key themes, suggest organizational improvements, and highlight any action items.`,
          },
        },
      ],
    };
  }
);
```

### 4.5 Prompt Return Format

Prompts return a `GetPromptResult`:

```typescript
interface GetPromptResult {
  description?: string;    // Optional description of the generated prompt
  messages: PromptMessage[];
}

interface PromptMessage {
  role: "user" | "assistant";
  content: TextContent | ImageContent | AudioContent | EmbeddedResource;
}
```

**Multi-message prompt with embedded resource:**

```typescript
server.registerPrompt(
  "analyze-page",
  {
    title: "Analyze Page",
    description: "Analyze a specific OneNote page for insights",
    argsSchema: {
      pageId: z.string().describe("ID of the page to analyze"),
    },
  },
  async ({ pageId }, extra) => {
    const client = await getOneNoteClientOrThrow(extra);
    const result = await client.request<PageContent>({
      path: `/me/onenote/pages/${pageId}/content`,
    });

    const pageContent = result.success
      ? JSON.stringify(result.data)
      : "Error: could not fetch page content";

    return {
      description: `Analysis prompt for page ${pageId}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Here is the content of a OneNote page:\n\n${pageContent}\n\nPlease analyze this page and provide: 1) A summary, 2) Key topics, 3) Suggested improvements.`,
          },
        },
      ],
    };
  }
);
```

### 4.6 Registered Prompt Object

```typescript
const prompt = server.registerPrompt("name", { /* config */ }, callback);

prompt.disable();
prompt.enable();
prompt.remove();
prompt.update({
  name: "new-name",
  description: "Updated description",
  argsSchema: { newArg: z.string() },
  callback: newCallback,
});

// After mutation, notify clients:
server.sendPromptListChanged();
```

---

## 5. Error Handling

### 5.1 McpError Class

The SDK provides `McpError` for protocol-level errors:

```typescript
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

throw new McpError(ErrorCode.InvalidParams, "pageId is required");
```

### 5.2 ErrorCode Enum

```typescript
enum ErrorCode {
  ConnectionClosed  = -32000,
  RequestTimeout    = -32001,
  ParseError        = -32700,
  InvalidRequest    = -32600,
  MethodNotFound    = -32601,
  InvalidParams     = -32602,
  InternalError     = -32603,
  UrlElicitationRequired = -32042,
}
```

### 5.3 Error Handling Strategy for Tools

There are two distinct error categories:

**Protocol errors** (thrown as `McpError`) -- indicate the request itself is invalid:
```typescript
// Use for: invalid arguments, missing required params, unknown tool
throw new McpError(ErrorCode.InvalidParams, "notebookId must be a non-empty string");
throw new McpError(ErrorCode.InternalError, "Unexpected server failure");
```

**Tool execution errors** (returned via `isError: true`) -- the tool ran but encountered a problem:
```typescript
// Use for: API errors, not found, permission denied, network failures
return {
  content: [{ type: "text", text: `Error: Notebook not found (${notebookId})` }],
  isError: true,
};
```

### 5.4 Mapping OneNoteClientError to MCP Errors

The existing `OneNoteClientError` from `src/onenote/types.ts` defines these error codes:
`MISSING_TOKEN`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `SERVER_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, `UNKNOWN`.

Recommended mapping strategy:

```typescript
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { OneNoteClientError } from "../onenote/types.js";

function handleOneNoteError(error: OneNoteClientError): CallToolResult {
  // Auth errors should be protocol-level errors (throw)
  if (error.code === "MISSING_TOKEN" || error.code === "UNAUTHORIZED") {
    throw new McpError(
      ErrorCode.InternalError,
      `Authentication failed: ${error.message}`
    );
  }

  // All other errors are tool-level errors (return with isError)
  return {
    content: [{ type: "text", text: `OneNote API error: ${error.message}` }],
    isError: true,
  };
}
```

### 5.5 Complete Error Handling Pattern

```typescript
server.registerTool(
  "get-notebook",
  {
    title: "Get Notebook",
    description: "Retrieve a specific OneNote notebook",
    inputSchema: {
      notebookId: z.string().describe("The notebook ID"),
    },
  },
  async ({ notebookId }, extra) => {
    // Step 1: Get authenticated client (throws McpError on auth failure)
    let client: OneNoteClient;
    try {
      client = await getOneNoteClientOrThrow(extra);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 2: Call the API (return tool-level errors)
    const result = await client.request<Notebook>({
      path: `/me/onenote/notebooks/${notebookId}`,
    });

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: `Failed to retrieve notebook: ${result.error.message}`,
        }],
        isError: true,
      };
    }

    // Step 3: Return success
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result.data, null, 2),
      }],
    };
  }
);
```

---

## 6. Existing Codebase Patterns

### 6.1 Server Creation and Configuration

From `src/index.ts`:

```typescript
const server = new McpServer(
  { name: SERVER_NAME, version: SERVER_VERSION },   // Implementation info
  { instructions: "..." }                           // Server options
);
```

The `McpServer` constructor takes:
- `serverInfo: Implementation` -- `{ name: string, version: string }`
- `options?: ServerOptions` -- includes `instructions` (displayed to clients), `capabilities`, etc.

### 6.2 Registrar Pattern

Each feature area has a dedicated registrar function:

```typescript
// src/tools/index.ts
export function registerTools(server: McpServer): void {
  // Register tools here
}
```

This pattern is clean and testable. Tools, resources, and prompts are registered by calling `server.registerTool()`, `server.registerResource()`, and `server.registerPrompt()` inside these functions.

### 6.3 Client Factory Pattern

From `src/onenote/client-factory.ts`, the factory provides two ways to obtain a client:

```typescript
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";

// Returns a Result type (no throw)
async function getOneNoteClient(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<OneNoteClientResult>;

// Throws on error (convenient for tools)
async function getOneNoteClientOrThrow(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<OneNoteClient>;
```

The `extra` parameter is the second argument passed to every tool/resource/prompt callback. It contains the `RequestHandlerExtra` context from the MCP protocol.

**Usage in tools:**

```typescript
server.registerTool("my-tool", { /* config */ }, async (args, extra) => {
  const client = await getOneNoteClientOrThrow(extra);
  // Use client...
});
```

**Usage in resources:**

```typescript
server.registerResource("my-resource", "uri://...", {}, async (uri, extra) => {
  const client = await getOneNoteClientOrThrow(extra);
  // Use client...
});
```

### 6.4 Result Type Pattern

The codebase uses a discriminated union for API results (`src/onenote/types.ts`):

```typescript
type OneNoteResult<T> =
  | { success: true; data: T }
  | { success: false; error: OneNoteClientError };
```

This pattern avoids unchecked exceptions and should be used consistently in tool handlers:

```typescript
const result = await client.request<Notebook>({ path: "/me/onenote/notebooks/abc" });
if (!result.success) {
  return { content: [{ type: "text", text: result.error.message }], isError: true };
}
// result.data is safely typed as Notebook
```

### 6.5 Import Conventions

The project uses:
- ES module syntax with `.js` extensions in imports (NodeNext resolution)
- `verbatimModuleSyntax: true` -- requires explicit `type` keyword for type-only imports
- Strict TypeScript settings throughout

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
```

### 6.6 Test Patterns

From `src/tools/index.test.ts`, the existing tests mock `McpServer`:

```typescript
import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("registerTools", () => {
  it("registers expected tools", () => {
    const mockRegisterTool = vi.fn();
    const server = {
      registerTool: mockRegisterTool,
    } as unknown as McpServer;

    registerTools(server);

    expect(mockRegisterTool).toHaveBeenCalledWith(
      "list-notebooks",
      expect.objectContaining({ description: expect.any(String) }),
      expect.any(Function)
    );
  });
});
```

---

## 7. Recommended Implementation Plan

### 7.1 Tool Implementation Template

Create individual tool files in `src/tools/`:

```
src/tools/
  index.ts                  # registerTools() -- imports and registers all tools
  list-notebooks.ts         # Individual tool definition
  get-notebook.ts
  get-page-content.ts
  search-pages.ts
  create-page.ts
```

Each tool file exports a registration function:

```typescript
// src/tools/list-notebooks.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";

export function registerListNotebooks(server: McpServer): void {
  server.registerTool(
    "list-notebooks",
    {
      title: "List Notebooks",
      description: "List all OneNote notebooks accessible to the authenticated user",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (extra) => {
      const client = await getOneNoteClientOrThrow(extra);
      // ...implementation
    }
  );
}
```

The index re-exports:

```typescript
// src/tools/index.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListNotebooks } from "./list-notebooks.js";
import { registerGetNotebook } from "./get-notebook.js";

export function registerTools(server: McpServer): void {
  registerListNotebooks(server);
  registerGetNotebook(server);
  // ...additional tools
}
```

### 7.2 Resource Implementation Template

```
src/resources/
  index.ts                  # registerResources() -- imports and registers all
  notebooks.ts              # Static + template resources for notebooks
  pages.ts                  # Template resources for pages
```

### 7.3 Prompt Implementation Template

```
src/prompts/
  index.ts                  # registerPrompts()
  summarize-notes.ts
  review-notes.ts
```

### 7.4 Shared Utilities

Consider creating a shared helper for consistent tool error responses:

```typescript
// src/tools/helpers.ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { OneNoteClientError } from "../onenote/types.js";

export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function toolSuccess(text: string): CallToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

export function toolJsonSuccess(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function handleApiError(error: OneNoteClientError): CallToolResult {
  return toolError(`OneNote API error [${error.code}]: ${error.message}`);
}
```

---

## Appendix A: Key SDK Imports Reference

```typescript
// Server and transport
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Types
import type {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult,
  Resource,
  ToolAnnotations,
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";

// Error handling
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Extra context type (for client factory)
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";

// Zod (v4)
import { z } from "zod";
```

## Appendix B: v1 (Deprecated) vs v2 (Current) API Comparison

| Feature       | v1 (Deprecated)                                      | v2 (Current)                                              |
|---------------|------------------------------------------------------|-----------------------------------------------------------|
| Tools         | `server.tool(name, schema?, cb)`                     | `server.registerTool(name, config, cb)`                   |
| Resources     | `server.resource(name, uri, cb)`                     | `server.registerResource(name, uri, metadata, cb)`        |
| Prompts       | `server.prompt(name, schema?, cb)`                   | `server.registerPrompt(name, config, cb)`                 |
| Input schema  | Raw Zod shape as positional arg                      | `config.inputSchema` (raw shape or `z.object()`)          |
| Output schema | Not supported                                        | `config.outputSchema` (raw shape or `z.object()`)         |
| Metadata      | Positional string for description                    | Config object with `title`, `description`, `annotations`  |
| Resource meta | Not supported                                        | `metadata` object (title, description, mimeType)          |

## Appendix C: MCP Specification Error Codes

| Code    | Name                    | When to Use                                    |
|---------|-------------------------|------------------------------------------------|
| -32700  | ParseError              | Invalid JSON received                          |
| -32600  | InvalidRequest          | JSON is valid but not a valid request          |
| -32601  | MethodNotFound          | Method does not exist                          |
| -32602  | InvalidParams           | Invalid method parameters                      |
| -32603  | InternalError           | Internal server error                          |
| -32000  | ConnectionClosed        | Transport connection was closed                |
| -32001  | RequestTimeout          | Request timed out                              |
| -32042  | UrlElicitationRequired  | Tool requires URL mode elicitation from client |
