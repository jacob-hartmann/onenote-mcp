# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.3] - 2026-11-26

Dependency and security maintenance release. No changes to the tool, resource, or prompt surface. `initialize`, `tools/list`, `resources/list`, `resources/templates/list` and `prompts/list` responses are identical to 1.0.2.

### Security

- Updated `@modelcontextprotocol/sdk` 1.27.1 → 1.32.2 and `zod` 4.3.6 → 4.6.7 to resolve published advisories (including GHSA-f897-62hf-6gxq)
- Updated `express` to ^5.3.0 and `express-rate-limit` to ^8.7.5, picking up patched `body-parser`, `path-to-regexp`, `qs`, `proxy-addr` and `ip-address`
- `pnpm audit --prod` now reports no known vulnerabilities

### Changed

- Updated `helmet` to ^8.3.0 and `dotenv` to ^17.4.2
- Tool input-validation errors are now formatted by the MCP SDK as `<message> at <path>` (for example `Invalid input: expected string, received undefined at pageId`) instead of a JSON dump of the validation issues. The error code (-32602) and `isError` are unchanged
- The stdio transport (MCP SDK) now rejects a single incoming JSON-RPC message larger than 10 MB. This is SDK hardening: the largest valid `create-page` request is still accepted
- HTTP mode: the rate limiter uses the `limit` option instead of its deprecated alias `max` (same limit: 100 requests/minute)

### Infrastructure

- Development tooling updated within current majors (eslint, typescript-eslint, prettier, tsx, vitest, @types/node, MCP Inspector); `tsup` 8 → 9 to pick up a patched `esbuild`
- GitHub Actions updated (checkout v7, setup-node v6.4, pnpm/action-setup v6, harden-runner v2.19.4, codeql-action v4.36.2, dependency-review-action v5, upload-artifact v7.0.1, action-gh-release v3); all remain pinned to commit SHAs

## [1.0.0] - 2026-02-22

### Added

- 16 MCP tools for OneNote read/write access:
  - Notebook tools: `list-notebooks`, `get-notebook`, `get-notebook-hierarchy`
  - Section group tools: `list-section-groups`, `get-section-group`
  - Section tools: `list-sections`, `get-section`, `create-section`
  - Page tools: `list-pages`, `get-page`, `get-page-content`, `get-page-preview`, `create-page`, `update-page`, `delete-page`, `search-pages`
- 5 MCP resources with URI templates:
  - `onenote://notebooks` -- list all notebooks
  - `onenote://notebooks/{notebookId}` -- single notebook with sections
  - `onenote://notebooks/{notebookId}/sections` -- sections in a notebook
  - `onenote://sections/{sectionId}/pages` -- pages in a section
  - `onenote://pages/{pageId}` -- HTML content of a page
- 3 MCP prompt templates: `summarize-page`, `search-notes`, `create-note`
- Microsoft Graph API client with error handling, pagination, and retry flags
- Graph API type definitions for notebooks, sections, section groups, and pages
- HTML utility helpers for page content processing
- Default OAuth scope updated to `Notes.ReadWrite` for write operations

### Changed

- CI workflow now excludes tag pushes to prevent duplicate runs with release workflow
- Release workflow now accepts a `tag` input for manual dispatch
- Release workflow now runs typecheck, lint, and format checks before publishing
- tsup config now injects shebang banner for Unix/macOS CLI compatibility
- package.json now includes `exports` field for proper ESM resolution

### Infrastructure

- STDIO server entrypoint and MCP registration boundaries
- OAuth, token-store, auth, and client foundations for OneNote
- CI/CD, security workflows, and release automation

## [0.1.0] - 2026-02-16

### Added

- Initial project bootstrap
