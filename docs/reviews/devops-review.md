# DevOps & Platform Engineering Review

**Project:** `onenote-mcp` (OneNote MCP Server)
**Reviewer:** DevOps/Platform Engineering
**Date:** 2026-02-16
**Scope:** CI/CD pipelines, release process, security posture, package configuration, documentation, operational readiness, build artifacts

---

## Executive Summary

The project demonstrates strong security hygiene and a well-structured CI/CD foundation. GitHub Actions are pinned to SHA, permissions follow least privilege, and the security tooling (CodeQL, Scorecard, dependency review, harden-runner) is comprehensive. However, there are several issues ranging from critical release pipeline gaps to medium-severity documentation drift that should be addressed before production use.

---

## 1. CI Pipeline

### CRITICAL: CI Triggers on All Pushes Including Tags -- Redundant Execution with Release

**File:** `.github/workflows/ci.yml` (lines 3-5)

```yaml
on:
  push:
  pull_request:
```

The CI workflow triggers on every push, including tag pushes. When a release tag `v*.*.*` is pushed, both `ci.yml` and `release.yml` trigger simultaneously. The release workflow runs its own test and build steps independently, but the CI workflow also runs a full quality/test/build cycle on the same commit. This wastes runner minutes and can cause confusing status checks.

**Recommendation:** Exclude tag pushes from CI:

```yaml
on:
  push:
    branches: ["**"]
    tags-ignore: ["v*.*.*"]
  pull_request:
```

### HIGH: No Node.js Version Matrix in CI

**File:** `.github/workflows/ci.yml`

The CI pipeline only tests against a single Node.js version (22, from `.nvmrc`). The `package.json` declares `"engines": { "node": ">=22" }`, which means users could run this on Node 22, 23, or later. There is no matrix build to verify compatibility across Node versions.

**Recommendation:** Add a strategy matrix for at minimum Node 22 (LTS) and the current latest (e.g., 23):

```yaml
strategy:
  matrix:
    node-version: [22, 23]
```

### HIGH: Coverage Thresholds Not Enforced in CI

**File:** `vitest.config.ts` (lines 19-24), `.github/workflows/ci.yml` (line 85)

The vitest config defines coverage thresholds (95% statements, 85% branches, 95% functions, 95% lines), but the CI workflow runs `pnpm run test:coverage`. Whether vitest actually _fails_ the process when thresholds are not met depends on the vitest version's default behavior. In modern vitest, thresholds in the config _do_ fail the run by default, so this is likely working correctly, but the review notes there is no explicit validation step in CI that independently checks coverage output or threshold enforcement.

**Risk:** If the vitest behavior ever changes or a config override is introduced, coverage regressions could slip through silently.

**Recommendation:** Add an explicit step after tests to verify the threshold was enforced, or add a comment confirming the enforcement mechanism.

### MEDIUM: Dependency Audit Could Block on False Positives

**File:** `.github/workflows/ci.yml` (line 43)

```yaml
- name: Dependency audit (high+ only)
  run: pnpm audit --audit-level=high
```

`pnpm audit` can produce false positives or flag transitive dev dependencies that have no production impact. There is no mechanism to ignore known false positives (e.g., via `.nsprc` or `pnpm audit --ignore-advisories`). A single false positive in a transitive dev dependency will block all PRs.

**Recommendation:** Consider adding an allow-list mechanism for known false positives or using `--production` flag to audit only production dependencies.

### LOW: Duplicate Setup Steps Across Jobs

**File:** `.github/workflows/ci.yml` (lines 30-40, 70-79, 112-118)

The `quality`, `test`, and `build` jobs each independently install pnpm, Node.js, and dependencies. While this is the correct approach for isolated jobs, consider whether quality and test could be combined into a single job to reduce runner time. The build job is correctly gated with `needs: [quality, test]`.

### POSITIVE: Build Artifact Verification

**File:** `.github/workflows/ci.yml` (lines 131-134)

```yaml
- name: Verify build artifacts
  run: |
    test -f dist/index.js
    test -f dist/index.d.ts
```

Explicitly verifying that expected build outputs exist is good practice and prevents silent build failures.

### POSITIVE: Concurrency Control

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

This prevents stacking multiple CI runs for rapid pushes. Well done.

---

## 2. Release Pipeline

### CRITICAL: Release Workflow Can Be Triggered via `workflow_dispatch` Without a Tag

**File:** `.github/workflows/release.yml` (line 7)

```yaml
workflow_dispatch: {}
```

The workflow can be manually triggered from any branch without a tag. The version validation step (line 46-49) uses `GITHUB_REF_NAME` to compare against `package.json` version, but when triggered via `workflow_dispatch` on a branch, `GITHUB_REF_NAME` will be the branch name (e.g., `main`), not a tag. This means the validation `"v${PKG_VERSION}" != "${GITHUB_REF_NAME}"` will always fail for manual dispatches unless the branch is literally named `v0.1.0`.

However, this means manual dispatch is effectively non-functional, not that a bad release can slip through. The bigger concern is that someone might remove the validation step to "fix" the manual dispatch, and then a bad release could be published from any branch.

**Recommendation:** Either remove `workflow_dispatch` entirely (since it cannot work with the current validation logic), or add branch/tag input parameters:

```yaml
workflow_dispatch:
  inputs:
    tag:
      description: "Tag to release (e.g., v1.0.0)"
      required: true
```

### HIGH: Release Does Not Gate on CI Passing

**File:** `.github/workflows/release.yml`

The release workflow runs its own test and build steps, but it does not require that the CI workflow has passed on the same commit. If someone pushes a tag on a commit where CI failed (or was skipped), the release workflow will run its own tests but does not benefit from the full CI quality checks (linting, formatting, type checking).

The release workflow runs `pnpm test` (line 59) but not `pnpm typecheck`, `pnpm lint`, or `pnpm format:check`. A release could be published with type errors that were caught by CI but not by the release workflow.

**Recommendation:** Either:
1. Add the quality checks to the release workflow, or
2. Add a step to verify the CI workflow passed on this commit using the GitHub API, or
3. Use a `workflow_run` trigger gated on CI success.

### HIGH: No Rollback or Unpublish Guidance for Partial Failures

**File:** `RELEASING.md` (lines 57-60)

The RELEASING guide says:

```
## If a Release Fails

- Do not reuse version numbers.
- Bump to next prerelease and push a new tag.
```

This is insufficient. If the npm publish succeeds but the GitHub Release creation fails, you have a published npm package without a GitHub release or SBOM attached. Conversely, if npm publish fails partway, the package might be in a partial state.

**Recommendation:** Add guidance for:
- How to check if the npm package was actually published (`npm view onenote-mcp@<version>`)
- How to unpublish within the 72-hour npm window if needed (`npm unpublish onenote-mcp@<version>`)
- How to manually create a GitHub release if only that step failed
- How to deprecate a bad version (`npm deprecate onenote-mcp@<version> "reason"`)

### MEDIUM: SBOM Generated on Full Repository, Not Just Published Package

**File:** `.github/workflows/release.yml` (lines 64-71)

```yaml
- name: Generate SBOM (CycloneDX JSON)
  uses: anchore/sbom-action@28d71544de8eaf1b958d335707167c5f783590ad
  with:
    path: .
    format: cyclonedx-json
```

The SBOM is generated from the full repository (including devDependencies), not from the actual published artifact. The `files` field in `package.json` only includes `dist/`, so the published package is much smaller than what the SBOM describes. This could mislead consumers about what dependencies are actually shipped.

**Recommendation:** Consider generating the SBOM from the packed tarball or at minimum from only production dependencies. Alternatively, document that the SBOM covers the build environment, not just the runtime artifact.

### MEDIUM: npm Publish Uses `--ignore-scripts` but `prepublishOnly` Script Exists

**File:** `.github/workflows/release.yml` (line 79-83), `package.json` (line 28)

```json
"prepublishOnly": "pnpm run check && pnpm run build"
```

The release workflow runs `npm publish --ignore-scripts`, which correctly prevents the `prepublishOnly` script from running during publish (since the workflow already ran tests and build). However, this means a local `npm publish` by a maintainer _would_ run `prepublishOnly`, creating different behavior between CI and local publishing.

This is actually a reasonable design -- `--ignore-scripts` in CI avoids redundant checks, while local `prepublishOnly` serves as a safety net. Just ensure this is documented.

### POSITIVE: npm Trusted Publishing (OIDC)

The release workflow uses `id-token: write` and npm OIDC trusted publishing instead of long-lived npm tokens. This is the current best practice and eliminates the risk of leaked npm tokens.

### POSITIVE: Prerelease Dist-Tag Handling

```yaml
case "${PKG_VERSION}" in
  *-*)
    npm publish --ignore-scripts --tag rc
    ;;
```

Correctly publishes prereleases under the `rc` dist-tag to avoid polluting the `latest` tag.

### POSITIVE: Tag-Version Validation

The release workflow validates that the git tag matches the `package.json` version, preventing mismatched releases.

---

## 3. Security Posture

### POSITIVE: All GitHub Actions Pinned to SHA

Every action in every workflow is pinned to a full SHA with a version comment:

```yaml
uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
```

This is the gold standard for supply chain security. Tags can be repointed; SHAs cannot.

### POSITIVE: Harden-Runner on Every Workflow

Every workflow includes `step-security/harden-runner` with egress auditing. This provides visibility into unexpected outbound network calls from CI jobs.

### POSITIVE: Comprehensive Security Tooling Stack

- CodeQL for static analysis (JavaScript/TypeScript correctly configured)
- OpenSSF Scorecard for supply chain metrics
- Dependency review for PR-time vulnerability scanning
- Dependabot for automated dependency updates
- Gitleaks in pre-commit for secret scanning

### POSITIVE: Permissions Follow Least Privilege

Each workflow declares the minimum permissions needed. The CI workflow uses `contents: read`, the test job adds `pull-requests: write` (for coverage comments), and the release workflow adds `contents: write` and `id-token: write`.

### MEDIUM: Dependabot Groups May Delay Critical Security Updates

**File:** `.github/dependabot.yml` (lines 8-12)

```yaml
groups:
  dev-dependencies:
    dependency-type: "development"
  prod-dependencies:
    dependency-type: "production"
```

Grouping all production dependencies into a single PR means a critical security fix in one dependency waits for all other production dependency updates to be compatible. If one update in the group breaks the build, the security fix is blocked.

**Recommendation:** Consider excluding security updates from groups:

```yaml
groups:
  prod-dependencies:
    dependency-type: "production"
    update-types: ["minor", "patch"]
```

Or add `open-pull-requests-limit: 20` to allow individual security PRs alongside grouped updates.

### MEDIUM: Dependency Review Action Missing `persist-credentials: false`

**File:** `.github/workflows/dependency-review.yml` (line 25)

```yaml
- name: "Checkout Repository"
  uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
```

Unlike all other workflows, the dependency-review checkout does not include `persist-credentials: false`. While this workflow only has `contents: read` permissions and runs on PRs, it is inconsistent with the security posture of the other workflows.

**Recommendation:** Add `persist-credentials: false` for consistency.

### LOW: Pre-Commit Hook Versions Are Old

**File:** `.pre-commit-config.yaml`

```yaml
- repo: https://github.com/gitleaks/gitleaks
  rev: v8.16.3
- repo: https://github.com/pre-commit/pre-commit-hooks
  rev: v4.4.0
```

Gitleaks v8.16.3 and pre-commit-hooks v4.4.0 are not current. While Dependabot does not manage pre-commit hook versions, these should be periodically updated.

**Recommendation:** Either manually update periodically or add a tool like `pre-commit autoupdate` to a scheduled workflow.

### LOW: No Branch Protection Documentation

There is no documentation of recommended branch protection rules. For a project publishing to npm, the `main` branch should have:
- Required CI status checks
- Required reviews (via CODEOWNERS)
- No force pushes
- Signed commits (optional but recommended)

**Recommendation:** Add a section to `CONTRIBUTING.md` or a separate `GOVERNANCE.md` documenting the branch protection configuration.

---

## 4. Package Configuration

### HIGH: Missing `exports` Field in `package.json`

**File:** `package.json`

The package has `"main": "./dist/index.js"` but no `exports` field. Modern Node.js resolution strongly recommends the `exports` field for ESM packages (`"type": "module"`). Without it, subpath imports are unrestricted and resolution behavior may vary across Node versions and bundlers.

**Recommendation:** Add:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

### HIGH: `bin` Entry Missing Shebang in Built Output

**File:** `package.json` (line 8-9), `tsup.config.ts`

```json
"bin": {
  "onenote-mcp": "dist/index.js"
}
```

The source file `src/index.ts` has `#!/usr/bin/env node` on line 1, but `tsup` does not preserve shebangs by default during bundling. Without a `banner` configuration in `tsup.config.ts`, the built `dist/index.js` will lack the shebang, which means:
- On Unix/macOS: `npx onenote-mcp` will fail with a confusing "exec format error" or fall back to the default shell
- On Windows: It typically works because npm generates a `.cmd` wrapper

**Recommendation:** Add a banner to `tsup.config.ts`:

```typescript
export default defineConfig({
  // ...existing config...
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

### MEDIUM: `dotenv` Is a Production Dependency

**File:** `package.json` (line 55)

```json
"dependencies": {
  "dotenv": "^17.2.3",
}
```

The `dotenv` package is listed as a production dependency, but `src/index.ts` (the MCP server entry point) does not import it directly. It is only used via `-r dotenv/config` flags in the `dev` and `start` scripts. When the package is installed globally via `npx onenote-mcp`, `dotenv` ships as a dependency but is never loaded in the stdio transport flow.

MCP clients (Claude Desktop, Cursor) inject environment variables directly, so `dotenv` is only useful for local development.

**Recommendation:** Move `dotenv` to `devDependencies` and remove `-r dotenv/config` from the `start` script (which is the production entry point). Keep it in `dev` and `inspect` scripts via `tsx --require dotenv/config`.

### MEDIUM: Inconsistent Dependency Pinning Strategy

**File:** `package.json` (lines 53-70)

Production dependencies use a mix of exact pins and ranges:
- `"@modelcontextprotocol/sdk": "1.26.0"` (exact)
- `"dotenv": "^17.2.3"` (caret range)
- `"zod": "4.3.6"` (exact -- note: Zod 4.x uses a new versioning scheme)

Dev dependencies use a mix of exact pins and none use ranges. This is inconsistent but mostly harmless since `pnpm-lock.yaml` controls actual versions.

**Recommendation:** Standardize on exact pins for production dependencies and ranges for dev dependencies, or document the pinning strategy.

### LOW: No `types` Field in `package.json`

While `tsup` generates `dist/index.d.ts` and the CI verifies its existence, the `package.json` has no `types` field. The `main` field resolves types by convention, but explicit is better:

```json
"types": "./dist/index.d.ts"
```

### POSITIVE: `pnpm-lock.yaml` Is Committed

The lockfile is committed to the repository, ensuring reproducible builds. The `.prettierignore` correctly excludes it from formatting.

### POSITIVE: `engine-strict=true` in `.npmrc`

This ensures that `pnpm install` fails if the Node.js version does not match the `engines` field, preventing accidental development on unsupported versions.

### POSITIVE: `frozen-lockfile` in CI

All CI jobs use `pnpm install --frozen-lockfile --ignore-scripts`, preventing lockfile mutations and script execution during install.

---

## 5. Documentation

### HIGH: README Does Not Reflect Stage 2 Implementation

**File:** `README.md` (line 14)

```
This Stage 1 release provides production scaffolding, security hardening, CI/CD,
and OAuth foundations. OneNote-specific MCP tools/resources/prompts will be added in Stage 2.
```

The codebase clearly shows Stage 2 is implemented: there are 16 tools (list-notebooks, get-page-content, create-page, delete-page, search-pages, etc.), 3 resource types (notebooks, sections, pages), and 3 prompts (summarize-page, search-notes, create-note). The README still describes this as a "scaffold" and makes no mention of any actual OneNote functionality.

A user reading the README would think this package does nothing useful yet, which is wrong.

**Recommendation:** Update the README to:
- Remove "Stage 1" / "scaffold" language
- List the available tools, resources, and prompts
- Add usage examples showing what users can actually do
- Update the "Stage 1 Features" section to reflect current capabilities

### HIGH: OAuth Scopes Mismatch Between README and Code

**File:** `README.md` (line 112), `src/constants.ts` (line 26-32), `.env.example` (lines 36-37)

The README and `.env.example` document the default scopes as:
```
offline_access openid profile User.Read Notes.Read
```

But `src/constants.ts` defines the actual default scopes as:
```typescript
export const DEFAULT_OAUTH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "User.Read",
  "Notes.ReadWrite",  // <-- ReadWrite, not Read
];
```

The code uses `Notes.ReadWrite` because Stage 2 tools include write operations (create-page, update-page, delete-page, create-section). The documentation is wrong and could lead users to configure insufficient scopes.

**Recommendation:** Update README and `.env.example` to reflect `Notes.ReadWrite` as the default scope, and explain why write access is needed.

### MEDIUM: CHANGELOG Not Updated for Stage 2

**File:** `CHANGELOG.md`

The `[Unreleased]` section only mentions Stage 1 items:

```markdown
## [Unreleased]

### Added

- Initial Stage 1 repository scaffold
- STDIO server entrypoint and MCP registration boundaries
- OAuth, token-store, auth, and client foundations for OneNote
- CI/CD, security workflows, and release automation
```

None of the 16 tools, 3 resources, 3 prompts, pagination, HTML utilities, or Graph API types are mentioned. The `[0.1.0]` release only says "Initial project bootstrap."

**Recommendation:** Update the `[Unreleased]` section with all Stage 2 additions.

### MEDIUM: CONTRIBUTING Guide Still References Scaffolds

**File:** `CONTRIBUTING.md` (lines 57-59)

```markdown
- `tools/`: MCP tools registration (currently scaffolded)
- `resources/`: MCP resources registration (currently scaffolded)
- `prompts/`: MCP prompts registration (currently scaffolded)
```

These are no longer scaffolded; they contain full implementations.

### LOW: No Operational / Troubleshooting Documentation

There is no documentation for:
- How to debug a running MCP server (e.g., stderr logging, `MCP_DEBUG` flags)
- Common error messages and their meaning
- How to verify the OAuth token is valid
- How to clear the token cache manually
- What happens on crash and how to restart

**Recommendation:** Add a "Troubleshooting" section to the README or a dedicated `TROUBLESHOOTING.md`.

---

## 6. Operational Readiness

### HIGH: No Environment Variable Validation on Startup

**File:** `src/index.ts`

The `main()` function immediately creates a server and connects to stdio without validating any environment variables. The OAuth configuration is only checked lazily when a tool or resource is invoked. If a user misconfigures their environment (e.g., sets `ONENOTE_OAUTH_CLIENT_ID` but not `ONENOTE_OAUTH_CLIENT_SECRET`), they will not know until they try to use a tool, at which point the error message may be opaque.

**Recommendation:** Add an optional startup validation step that checks for common misconfiguration patterns and emits warnings to stderr:

```typescript
function validateEnvironment(): void {
  const clientId = process.env["ONENOTE_OAUTH_CLIENT_ID"];
  const clientSecret = process.env["ONENOTE_OAUTH_CLIENT_SECRET"];
  const accessToken = process.env["ONENOTE_ACCESS_TOKEN"];

  if (!accessToken && (!clientId || !clientSecret)) {
    console.error(
      "[onenote-mcp] WARNING: No authentication configured. " +
      "Set ONENOTE_OAUTH_CLIENT_ID + ONENOTE_OAUTH_CLIENT_SECRET or ONENOTE_ACCESS_TOKEN."
    );
  }
}
```

### MEDIUM: No Structured Logging

**File:** `src/index.ts`, `src/onenote/auth.ts`

All logging uses `console.error()` with ad-hoc string formatting:

```typescript
console.error(`[${SERVER_NAME}] Server running on stdio transport`);
console.error("[onenote-mcp] Verifying cached token...");
```

There is no structured logging (JSON format), no log levels, no request correlation IDs, and no way to control verbosity. For a production tool, this makes debugging difficult because:
- Log output cannot be parsed programmatically
- There is no way to increase verbosity for debugging
- There is no way to suppress logs for quiet operation

**Recommendation:** Consider a lightweight structured logging approach:

```typescript
function log(level: "info" | "warn" | "error" | "debug", message: string, data?: Record<string, unknown>): void {
  const entry = { timestamp: new Date().toISOString(), level, message, ...data };
  console.error(JSON.stringify(entry));
}
```

Or at minimum, support a `ONENOTE_LOG_LEVEL` environment variable.

### MEDIUM: SIGTERM/SIGINT Handling Does Not Guarantee Clean Shutdown

**File:** `src/index.ts` (lines 59-64)

```typescript
process.on("SIGTERM", () => {
  void server.close();
});
process.on("SIGINT", () => {
  void server.close();
});
```

The `server.close()` promise result is voided (fire-and-forget). If `close()` is slow or throws, the process may hang or exit uncleanly. There is also no exit timeout to force-kill after a grace period.

**Recommendation:**

```typescript
process.on("SIGTERM", () => {
  void server.close().finally(() => process.exit(0));
});
```

Or add a forced exit timeout.

### MEDIUM: `NETWORK_ERROR` Marked as Not Retryable

**File:** `src/onenote/client.ts` (lines 300-305)

```typescript
return new OneNoteClientError(
  `Network error: ${error.message}`,
  "NETWORK_ERROR",
  undefined,
  false  // <-- retryable = false
);
```

Generic network errors (DNS failures, connection resets, etc.) are marked as not retryable. Many network errors are transient and should be retryable. Only a few network errors (e.g., invalid URL) are truly permanent.

**Recommendation:** Default `NETWORK_ERROR` to `retryable: true` or add heuristics to distinguish transient from permanent network errors.

### LOW: No Health Check / Status Mechanism

For an MCP server running over stdio, traditional health checks do not apply. However, there is no way for an operator to verify that the server is functioning correctly without sending an MCP request. Consider supporting a `--version` or `--health` CLI flag that exits immediately with status information.

### LOW: No Crash Recovery Guidance

The README describes how to start the server but not what happens when it crashes. MCP clients typically restart the server process automatically, but this is not documented. Users should know:
- Whether state is preserved across restarts (yes, via token cache file)
- Whether the OAuth flow needs to be repeated (no, if refresh token is cached)
- Common crash causes and solutions

---

## 7. Build Artifacts

### HIGH: tsup Does Not Preserve Shebang (Duplicate of Section 4)

See the `bin` entry finding in Section 4. The `#!/usr/bin/env node` shebang from `src/index.ts` is stripped by tsup during bundling. This will cause `npx onenote-mcp` to fail on Unix/macOS systems.

### MEDIUM: Source Maps Included in Published Package

**File:** `tsup.config.ts` (line 10), `package.json` (line 10-12)

```typescript
sourcemap: true,
```

```json
"files": [
  "dist"
]
```

Source maps (`dist/index.js.map`) are generated and included in the published npm package (since `dist` is in the `files` array). This increases package size and exposes source code structure. For an open-source project this is not a security concern, but it adds unnecessary weight to the published package.

**Recommendation:** Either:
1. Set `sourcemap: false` for production builds, or
2. Exclude `.map` files from the `files` array, or
3. Keep source maps (valid choice for debugging production issues) and document the decision

### MEDIUM: `createRequire` Hack for `package.json` Version

**File:** `src/index.ts` (lines 15, 25-27)

```typescript
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };
```

This uses `createRequire` to import `package.json` in an ESM context. After bundling with tsup, the `require("../package.json")` resolves relative to `dist/index.js`, looking for `package.json` in the project root. This works when running from the project directory, but could break in edge cases (e.g., if the package is symlinked or installed in a non-standard location).

Since `tsup` bundles the application, a more robust approach is to inject the version at build time:

```typescript
// tsup.config.ts
import pkg from "./package.json";

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
});
```

### LOW: `dist/` Cleaning Is Handled Correctly

`tsup.config.ts` sets `clean: true`, which removes stale artifacts before each build. This is correct.

### LOW: Single-File Bundle Is Appropriate

`tsup` is configured with `splitting: false` and a single entry point, producing a clean single-file ESM bundle. This is appropriate for a CLI tool / MCP server.

---

## 8. Additional Findings

### MEDIUM: `verifyToken` Swallows Network Errors as "Valid"

**File:** `src/onenote/auth.ts` (lines 52-81)

```typescript
async function verifyToken(token: string): Promise<boolean> {
  try {
    // ... fetch /me ...
    if (response.status === 401) {
      return false;
    }
    return true;
  } catch {
    return true;  // <-- Network errors treated as "token is valid"
  }
}
```

If the network is down or Microsoft Graph is unreachable, `verifyToken` returns `true` (token is valid). This is arguably a reasonable design choice (fail-open to allow offline scenarios with cached tokens), but it should be explicitly documented and logged.

### MEDIUM: OAuth Callback Server Listens on All Interfaces

**File:** `src/onenote/auth.ts` (line 317)

```typescript
server.listen(port, host);
```

Where `host` comes from the redirect URI (defaults to `localhost`). If someone sets the redirect URI to `http://0.0.0.0:3000/callback`, the OAuth callback server would listen on all network interfaces, potentially exposing the authorization code to the local network. The code correctly parses the configured hostname, so `localhost` is safe, but there is no validation against dangerous values.

**Recommendation:** Add a warning if the host is not `localhost` or `127.0.0.1`.

### LOW: `package.json` Description Still Says "Scaffold"

```json
"description": "Model Context Protocol (MCP) server scaffold for Microsoft OneNote via OAuth"
```

This should be updated to reflect that it is a functional MCP server, not a scaffold.

### LOW: `server.instructions` Still Says "Stage 1"

**File:** `src/index.ts` (lines 39-43)

```typescript
instructions:
  "OneNote MCP scaffold server. Stage 1 includes OAuth/auth foundations " +
  "and empty tool/resource/prompt registrars. OneNote-specific MCP " +
  "features will be added in Stage 2.",
```

These instructions are sent to MCP clients and tell the AI model that there are no tools/resources/prompts, which is no longer true.

---

## Summary Table

| # | Severity | Category | Finding |
|---|----------|----------|---------|
| 1 | CRITICAL | CI | CI triggers on tag pushes, duplicating release workflow execution |
| 2 | CRITICAL | Release | `workflow_dispatch` cannot work with tag validation logic |
| 3 | HIGH | CI | No Node.js version matrix |
| 4 | HIGH | CI | Coverage threshold enforcement not explicitly verified |
| 5 | HIGH | Release | Release does not gate on CI quality checks (lint, typecheck, format) |
| 6 | HIGH | Release | Insufficient rollback/partial failure guidance |
| 7 | HIGH | Package | Missing `exports` field for ESM package |
| 8 | HIGH | Package | `bin` shebang stripped by tsup -- Unix/macOS `npx` execution will fail |
| 9 | HIGH | Docs | README does not reflect Stage 2 implementation (16 tools, 3 resources, 3 prompts) |
| 10 | HIGH | Docs | OAuth scopes mismatch: README says `Notes.Read`, code uses `Notes.ReadWrite` |
| 11 | HIGH | Operations | No environment variable validation on startup |
| 12 | MEDIUM | CI | Dependency audit may block on false positives |
| 13 | MEDIUM | Security | Dependabot grouping may delay critical security updates |
| 14 | MEDIUM | Security | Dependency review missing `persist-credentials: false` |
| 15 | MEDIUM | Release | SBOM covers full repo, not published artifact |
| 16 | MEDIUM | Release | `--ignore-scripts` vs `prepublishOnly` behavior difference |
| 17 | MEDIUM | Package | `dotenv` should be a dev dependency |
| 18 | MEDIUM | Package | Inconsistent dependency pinning strategy |
| 19 | MEDIUM | Docs | CHANGELOG not updated for Stage 2 |
| 20 | MEDIUM | Docs | CONTRIBUTING guide still references scaffolds |
| 21 | MEDIUM | Operations | No structured logging |
| 22 | MEDIUM | Operations | Signal handlers void close() promise |
| 23 | MEDIUM | Operations | NETWORK_ERROR incorrectly marked as not retryable |
| 24 | MEDIUM | Build | Source maps included in published package |
| 25 | MEDIUM | Build | `createRequire` hack for version may break in edge cases |
| 26 | MEDIUM | Operations | `verifyToken` swallows network errors as valid |
| 27 | MEDIUM | Operations | OAuth callback server could listen on all interfaces |
| 28 | LOW | CI | Duplicate setup steps across jobs |
| 29 | LOW | Security | Pre-commit hook versions are stale |
| 30 | LOW | Security | No branch protection documentation |
| 31 | LOW | Package | No `types` field in `package.json` |
| 32 | LOW | Docs | No operational/troubleshooting docs |
| 33 | LOW | Operations | No health check or version flag |
| 34 | LOW | Operations | No crash recovery guidance |
| 35 | LOW | Docs | `package.json` description still says "scaffold" |
| 36 | LOW | Docs | MCP server instructions still reference "Stage 1" |

### Positive Findings

| # | Category | Finding |
|---|----------|---------|
| 1 | CI | Build artifact verification step |
| 2 | CI | Concurrency control with cancel-in-progress |
| 3 | CI | `frozen-lockfile` and `--ignore-scripts` in all CI installs |
| 4 | Security | All actions pinned to SHA |
| 5 | Security | Harden-runner on every workflow |
| 6 | Security | Comprehensive security tooling (CodeQL, Scorecard, dependency review, Dependabot, gitleaks) |
| 7 | Security | Least-privilege permissions on all workflows |
| 8 | Release | npm Trusted Publishing via OIDC |
| 9 | Release | Prerelease dist-tag handling |
| 10 | Release | Tag-version validation |
| 11 | Package | `pnpm-lock.yaml` committed |
| 12 | Package | `engine-strict=true` enforced |
| 13 | Build | Clean single-file ESM bundle with `dist/` cleaning |
| 14 | Code | Result type pattern (discriminated union) for API responses |
| 15 | Code | Proper error mapping with retryable flags and error codes |
| 16 | Code | CSRF protection with state parameter in OAuth flow |
| 17 | Code | Token expiry buffer to prevent edge-case auth failures |
| 18 | GitHub | Comprehensive PR template with security checklist |
| 19 | GitHub | Well-structured issue templates with required fields |
| 20 | GitHub | CODEOWNERS covering critical config files |
