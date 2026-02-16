# Contributing to OneNote MCP

Thank you for your interest in contributing to the OneNote MCP server.

## Development Setup

### Prerequisites

- **Node.js**: v22 LTS or higher
- **pnpm**: v10 or higher
- **Microsoft Entra app registration** with OAuth credentials

### Initial Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/jacob-hartmann/onenote-mcp.git
   cd onenote-mcp
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Configure environment**:

   ```bash
   cp .env.example .env
   ```

   Add OAuth credentials:

   ```text
   ONENOTE_OAUTH_CLIENT_ID=your-client-id
   ONENOTE_OAUTH_CLIENT_SECRET=your-client-secret
   ```

## Development Workflow

### Scripts

- `pnpm dev`: Watch mode for development.
- `pnpm build`: Build for production.
- `pnpm test`: Run tests.
- `pnpm test:watch`: Run tests in watch mode.
- `pnpm lint`: Run ESLint.
- `pnpm format`: Format code with Prettier.
- `pnpm check`: Run all quality checks.

### Project Structure

- `src/`: Source code
  - `onenote/`: OAuth, token store, auth, client, and related types
  - `tools/`: MCP tools registration (currently scaffolded)
  - `resources/`: MCP resources registration (currently scaffolded)
  - `prompts/`: MCP prompts registration (currently scaffolded)
- `dist/`: Compiled output

## Coding Standards

1. **TypeScript**: Strict mode; avoid `any`.
2. **Logging**: Use `stderr` (`console.error`/`console.warn`) only. `stdout` is reserved for MCP JSON-RPC.
3. **Security**: Never commit secrets or tokens.
4. **Tests**: Add/update tests for behavior changes.

## Pull Request Process

1. Create a branch from `main`.
2. Implement changes and tests.
3. Run `pnpm check`.
4. Update `CHANGELOG.md` for user-facing changes.
5. Submit a PR using the template.

## License

By contributing, you agree your contributions are licensed under [MIT](./LICENSE).
