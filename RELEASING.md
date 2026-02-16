# Releasing `onenote-mcp`

This repo uses git tags to drive releases and publishes to npm under `onenote-mcp`.

## Versioning + Tags

- Source of truth: `package.json` `version`
- Tag format: `v${version}`
- Release workflow validates tag/version match.

## Prerelease (RC)

```bash
git switch main
git pull --ff-only
pnpm version 0.1.0-rc.1 -m "chore(release): v%s"
git push origin main
git push origin v0.1.0-rc.1
```

CI publishes prereleases with `--tag rc`.

## Stable Release

```bash
git switch main
git pull --ff-only
pnpm version 0.1.0 -m "chore(release): v%s"
git push origin main
git push origin v0.1.0
```

## Local Validation

```bash
pnpm install
pnpm run check
pnpm run build
npm pack --dry-run
```

## CI Publish

Triggered by tags matching `v*.*.*`.

Workflow: `.github/workflows/release.yml`

Behavior:

- Installs dependencies with scripts disabled
- Rebuilds required native tooling (`esbuild`)
- Runs tests and build
- Generates `sbom.cyclonedx.json`
- Publishes to npm via Trusted Publishing (OIDC)
- Creates GitHub Release and attaches SBOM

## If a Release Fails

- Do not reuse version numbers.
- Bump to next prerelease and push a new tag.

## Safety Notes

- Never commit `.env` or tokens.
- If an OAuth client secret is exposed, rotate it immediately.
