# DocPath Optimization Summary — 2026-06-23

## Completed Optimizations (P0-P1)

### ✅ P0: Install Manifest Drift
**Status:** Fixed  
**Impact:** High  

Ran `docpath install --target universal --force` to sync all agent protocol files. The Codex skill template was out of date and has been regenerated.

### ✅ P1: Decision Log Size Gate + Auto-GC
**Status:** Implemented  
**Impact:** Critical — prevents 170KB+ bloat  
**Changes:**
- Added `maxSizeKb` (default 100KB) and `maxRecords` (default 1000) to `gcDecisions`
- When limits exceeded, force-rotate oldest 50% regardless of age
- Added proactive warning in `appendDecision` when approaching limits (>80KB or >800 records)
- Enhanced `gcJournalDecisions` to check monthly archive sizes and warn at >200KB
- Test coverage: Added `gcDecisions force-rotates oldest 50% when size exceeds maxSizeKb` test

**Files Modified:**
- `src/governance/decisions.ts` — size-based gc logic
- `src/commands/journal.ts` — enhanced gc checks with archive monitoring
- `tests/decisions.test.mjs` — new size-based gc test

**Result:** Decision logs will now auto-rotate when they exceed 100KB, preventing the 170KB June bloat from recurring.

### ✅ P1: GitHub Actions CI Pipeline
**Status:** Implemented  
**Impact:** High — automated quality gate  
**Changes:**
- Created `.github/workflows/ci.yml`
- Runs on Node 18.x and 20.x
- Pipeline: install → typecheck → build → test
- Triggers on push/PR to main

**Files Created:**
- `.github/workflows/ci.yml`

### ✅ P2: Breadcrumb Rotation/GC Strategy
**Status:** Enhanced  
**Impact:** Medium — prevents breadcrumb bloat  
**Changes:**
- Added `MAX_SIZE_KB = 50` size gate
- When breadcrumb.md exceeds 50KB, force-truncate to 60% of MAX_ENTRIES (120 entries)
- Existing count-based rotation (MAX_ENTRIES = 200) remains as baseline
- Updated BREADCRUMB_HEADER to document both limits

**Files Modified:**
- `src/engine/breadcrumb.ts` — size-based truncation logic

**Result:** Breadcrumb files will now stay under 50KB through aggressive rotation when needed.

### ✅ P2: Build --filter Parameter Issue
**Status:** Documented  
**Impact:** Low — documentation fix  
**Changes:**
- Created `docs/BUILD.md` with build guide
- Documented that `--filter` is a workspace-only flag
- DocPath is not a monorepo, so `pnpm run build --filter .` fails
- Provided correct usage patterns for both standalone and monorepo contexts

**Files Created:**
- `docs/BUILD.md`

## Remaining Optimizations (P2-P3)

### P2: Refactor check.ts (1,291 lines)
**Status:** Pending  
**Scope:** Split into `check/` module with submodules for validation, report, gate-checks, evidence, etc.

### P2: Remove 4 'as any' type assertions
**Status:** Pending  
**Locations:**
- `src/commands/continue.ts`
- `src/register/tdd-debug.ts`
- `src/commands/escalation.ts`

Replace with proper type guards or narrowing.

### P3: Centralized Logging/Output Abstraction
**Status:** Pending  
**Scope:** 12 scattered `console.log/warn/error` calls should use a unified output utility for better formatting and consistency.

### P3: Agent Configuration Redundancy
**Status:** Pending  
**Scope:**
- 39 command files in `.claude/commands/`
- Triple configuration (.claude/, .codex/, .opencode/)
- .opencode/node_modules/ contains 1MB+ deps (should be gitignored)

### P3: Large Test File Splitting
**Status:** Pending  
**Files:**
- `check-review.test.mjs` (1,216 lines)
- `backlog-command.test.mjs` (1,174 lines)
- `next.test.mjs` (963 lines)
- `install.test.mjs` (758 lines)

## Verification

All completed changes build successfully:
```bash
pnpm run build:test  # ✅ 48-52ms
pnpm test tests/decisions.test.mjs  # ✅ All tests pass
pnpm typecheck  # ✅ No errors
```

## Next Steps

1. **Immediate**: Commit the P0-P1 fixes (decision/breadcrumb gc + CI)
2. **Short-term**: Refactor `check.ts` and remove `as any` (P2 items)
3. **Long-term**: Clean up agent config redundancy and split large tests (P3 items)

## Files Changed Summary

```
Modified:
  src/governance/decisions.ts
  src/commands/journal.ts
  src/engine/breadcrumb.ts
  tests/decisions.test.mjs

Created:
  .github/workflows/ci.yml
  docs/BUILD.md
  docs/OPTIMIZATION_SUMMARY.md
```

## Metrics

- Decision log bloat: 170KB → will stay <100KB with auto-gc
- Breadcrumb bloat: 64KB → will stay <50KB with size-based truncation
- CI coverage: 0 workflows → 1 workflow (Node 18/20, 4 steps)
- Test coverage: No size-based gc tests → 1 comprehensive test added
