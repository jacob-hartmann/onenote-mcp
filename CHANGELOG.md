# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

- Initial Stage 1 repository scaffold
- STDIO server entrypoint and MCP registration boundaries
- OAuth, token-store, auth, and client foundations for OneNote
- CI/CD, security workflows, and release automation

## [0.1.0] - 2026-02-16

### Added

- Initial project bootstrap
