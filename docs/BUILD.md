# Build Guide

## Commands

```bash
# Standard build (production)
pnpm run build

# Build without cleaning dist/ first
pnpm run build:test

# Build dashboard UI
pnpm run build:dashboard

# Development watch mode
pnpm run dev

# Type checking
pnpm typecheck

# Run tests
pnpm test
```

## Common Issues

### `--filter` flag error

**Error:** `CACError: Unknown option '--filter'`

**Cause:** DocPath is not a pnpm workspace/monorepo. The `--filter` flag is a workspace-specific feature and should not be used.

**Solution:** Use `pnpm run build` directly without `--filter`. If you need to build from a monorepo that includes DocPath as a package, use:

```bash
# From monorepo root
pnpm --filter docpath run build

# Or cd into the package first
cd packages/docpath
pnpm run build
```

## CI/CD

The GitHub Actions CI pipeline runs:
1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm run build:test`
4. `pnpm test`

See `.github/workflows/ci.yml` for details.
