# OneNote MCP Server

[![CI](https://github.com/jacob-hartmann/onenote-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/jacob-hartmann/onenote-mcp/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/jacob-hartmann/onenote-mcp/badge.svg?branch=main)](https://coveralls.io/github/jacob-hartmann/onenote-mcp?branch=main)
[![CodeQL](https://github.com/jacob-hartmann/onenote-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/jacob-hartmann/onenote-mcp/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/jacob-hartmann/onenote-mcp/badge)](https://securityscorecards.dev/viewer/?uri=github.com/jacob-hartmann/onenote-mcp)
[![npm version](https://img.shields.io/npm/v/onenote-mcp)](https://www.npmjs.com/package/onenote-mcp)
[![npm downloads](https://img.shields.io/npm/dm/onenote-mcp)](https://www.npmjs.com/package/onenote-mcp)
[![License](https://img.shields.io/github/license/jacob-hartmann/onenote-mcp)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server scaffold for Microsoft OneNote, authenticated via OAuth.

This Stage 1 release provides production scaffolding, security hardening, CI/CD, and OAuth foundations. OneNote-specific MCP tools/resources/prompts will be added in Stage 2.

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

This server is **STDIO-only** in Stage 1.

## Configuration Reference

| Variable                           | Required | Default                                              | Description                            |
| ---------------------------------- | -------- | ---------------------------------------------------- | -------------------------------------- |
| `ONENOTE_OAUTH_CLIENT_ID`          | Yes\*    | -                                                    | OAuth client ID                        |
| `ONENOTE_OAUTH_CLIENT_SECRET`      | Yes\*    | -                                                    | OAuth client secret                    |
| `ONENOTE_ACCESS_TOKEN`             | No       | -                                                    | Manual token override (bypasses OAuth) |
| `ONENOTE_OAUTH_TENANT`             | No       | `common`                                             | OAuth tenant selector                  |
| `ONENOTE_OAUTH_REDIRECT_URI`       | No       | `http://localhost:3000/callback`                     | OAuth callback URI                     |
| `ONENOTE_OAUTH_SCOPES`             | No       | `offline_access openid profile User.Read Notes.Read` | Space-delimited OAuth scopes           |
| `ONENOTE_TOKEN_STORE_PATH`         | No       | platform default                                     | Token cache file path                  |
| `ONENOTE_OAUTH_AUTHORITY_BASE_URL` | No       | `https://login.microsoftonline.com`                  | OAuth authority base override          |
| `ONENOTE_GRAPH_BASE_URL`           | No       | `https://graph.microsoft.com/v1.0`                   | Graph API base override                |

\* Required unless `ONENOTE_ACCESS_TOKEN` is set.

## Stage 1 Features

- Production repository scaffold and release workflows
- Security hardening (CodeQL, dependency review, Scorecard, SBOM)
- OAuth authorization code + refresh token foundations
- Token cache and client factory foundations
- Empty MCP tools/resources/prompts registrars for Stage 2 expansion

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

MIT — see [LICENSE](./LICENSE).
