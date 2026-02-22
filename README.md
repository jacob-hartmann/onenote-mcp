# OneNote MCP Server

[![CI](https://github.com/jacob-hartmann/onenote-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/jacob-hartmann/onenote-mcp/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/jacob-hartmann/onenote-mcp/badge.svg?branch=main)](https://coveralls.io/github/jacob-hartmann/onenote-mcp?branch=main)
[![CodeQL](https://github.com/jacob-hartmann/onenote-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/jacob-hartmann/onenote-mcp/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/onenote-mcp)](https://www.npmjs.com/package/onenote-mcp)
[![npm downloads](https://img.shields.io/npm/dm/onenote-mcp)](https://www.npmjs.com/package/onenote-mcp)
[![License](https://img.shields.io/github/license/jacob-hartmann/onenote-mcp)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for Microsoft OneNote, authenticated via OAuth. Provides full read/write access to notebooks, sections, and pages through 16 tools, 5 resources, and 3 prompt templates.

## Quick Start

### Prerequisites

- Node.js v22 or higher
- A Microsoft Entra app registration with OAuth enabled
- Client ID and client secret for your app registration

### Step 1: Register an OAuth App

1. Open Microsoft Entra App registrations in Azure Portal
2. Create (or select) an application
3. Add a redirect URI: `http://localhost:3000/callback`
4. Create a client secret
5. Copy **Application (client) ID** and **client secret**

### Step 2: Configure Your MCP Client

#### Claude Desktop (Recommended)

Add to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "onenote": {
      "command": "npx",
      "args": ["-y", "onenote-mcp"],
      "env": {
        "ONENOTE_OAUTH_CLIENT_ID": "your-client-id",
        "ONENOTE_OAUTH_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

#### Claude Code (CLI)

```json
{
  "mcpServers": {
    "onenote": {
      "command": "npx",
      "args": ["-y", "onenote-mcp"],
      "env": {
        "ONENOTE_OAUTH_CLIENT_ID": "your-client-id",
        "ONENOTE_OAUTH_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

#### Cursor

```json
{
  "mcpServers": {
    "onenote": {
      "command": "npx",
      "args": ["-y", "onenote-mcp"],
      "env": {
        "ONENOTE_OAUTH_CLIENT_ID": "your-client-id",
        "ONENOTE_OAUTH_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Step 3: First-Time Authorization

On first use, the server will:

1. Print an OAuth authorization URL to stderr
2. Wait for you to open the URL in your browser
3. Receive the callback at localhost
4. Cache tokens locally for reuse and refresh

## Transport Mode

This server uses **STDIO** transport exclusively.

## Tools

The server exposes 16 tools for interacting with OneNote:

| Tool                     | Description                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| `list-notebooks`         | List all notebooks accessible to the authenticated user             |
| `get-notebook`           | Get detailed information about a specific notebook                  |
| `list-section-groups`    | List section groups in a notebook or across all notebooks           |
| `get-section-group`      | Get details of a specific section group including its sections      |
| `list-sections`          | List sections in a notebook, section group, or across all notebooks |
| `get-section`            | Get detailed information about a specific section                   |
| `create-section`         | Create a new section in a notebook or section group                 |
| `list-pages`             | List pages in a specific section                                    |
| `get-page`               | Get metadata for a specific page (title, timestamps, parent info)   |
| `get-page-content`       | Get the full HTML content of a page                                 |
| `get-page-preview`       | Get a short text preview of a page (up to 300 characters)           |
| `create-page`            | Create a new page in a section with HTML content                    |
| `update-page`            | Update page content using JSON patch commands                       |
| `delete-page`            | Permanently delete a page                                           |
| `search-pages`           | Search pages by keyword across titles and content                   |
| `get-notebook-hierarchy` | Get the complete notebook/section-group/section tree in one call    |

## Resources

The server exposes 5 resources for direct data access:

| Resource            | URI                                         | Description                                              |
| ------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `notebooks-list`    | `onenote://notebooks`                       | List of all notebooks                                    |
| `notebook`          | `onenote://notebooks/{notebookId}`          | A specific notebook with its sections and section groups |
| `notebook-sections` | `onenote://notebooks/{notebookId}/sections` | Sections in a specific notebook                          |
| `section-pages`     | `onenote://sections/{sectionId}/pages`      | Pages in a specific section                              |
| `page-content`      | `onenote://pages/{pageId}`                  | The HTML content of a specific page                      |

## Prompts

The server includes 3 prompt templates for common workflows:

| Prompt           | Description                                                         |
| ---------------- | ------------------------------------------------------------------- |
| `summarize-page` | Fetch and summarize the content of a specific OneNote page          |
| `search-notes`   | Guide through a search workflow across OneNote notes                |
| `create-note`    | Guide through creating a new page in the right notebook and section |

## Configuration Reference

| Variable                           | Required | Default                                                   | Description                            |
| ---------------------------------- | -------- | --------------------------------------------------------- | -------------------------------------- |
| `ONENOTE_OAUTH_CLIENT_ID`          | Yes\*    | -                                                         | OAuth client ID                        |
| `ONENOTE_OAUTH_CLIENT_SECRET`      | Yes\*    | -                                                         | OAuth client secret                    |
| `ONENOTE_ACCESS_TOKEN`             | No       | -                                                         | Manual token override (bypasses OAuth) |
| `ONENOTE_OAUTH_TENANT`             | No       | `common`                                                  | OAuth tenant selector                  |
| `ONENOTE_OAUTH_REDIRECT_URI`       | No       | `http://localhost:3000/callback`                          | OAuth callback URI                     |
| `ONENOTE_OAUTH_SCOPES`             | No       | `offline_access openid profile User.Read Notes.ReadWrite` | Space-delimited OAuth scopes           |
| `ONENOTE_TOKEN_STORE_PATH`         | No       | platform default                                          | Token cache file path                  |
| `ONENOTE_OAUTH_AUTHORITY_BASE_URL` | No       | `https://login.microsoftonline.com`                       | OAuth authority base override          |
| `ONENOTE_GRAPH_BASE_URL`           | No       | `https://graph.microsoft.com/v1.0`                        | Graph API base override                |

\* Required unless `ONENOTE_ACCESS_TOKEN` is set.

## Features

- 16 MCP tools for full OneNote read/write access (notebooks, sections, pages)
- 5 MCP resources for direct data access via URI templates
- 3 MCP prompt templates for common workflows (summarize, search, create)
- OAuth authorization code flow with automatic token refresh
- Secure token cache with platform-specific default locations
- Microsoft Graph API client with error handling and pagination
- Security hardening (CodeQL, dependency review, Scorecard, SBOM)
- CI/CD with automated release and npm trusted publishing

## Development

### Setup

```bash
# Clone the repo
git clone https://github.com/jacob-hartmann/onenote-mcp.git
cd onenote-mcp

# Use Node.js 22
# (macOS/Linux nvm): nvm install && nvm use
# (Windows nvm-windows): nvm install 22 && nvm use 22

# Install dependencies
pnpm install

# Copy env template
cp .env.example .env
```

### Running Locally

```bash
# Development mode (auto-reload)
pnpm dev

# Production build
pnpm build

# Production run
pnpm start
```

### Debugging

```bash
# Run from source
pnpm inspect

# Run from built output
pnpm inspect:dist
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md).

## Support

See [SUPPORT.md](./SUPPORT.md).

## License

MIT © Jacob Hartmann
