# check.ts Refactoring Plan

## Current Status
- **File size**: 1,291 lines
- **Function count**: 59 functions
- **Complexity**: High - mixed concerns (formatting, validation, execution, reporting)

## Completed
✅ Extracted `types.ts` - All interface definitions
✅ Extracted `formatters.ts` - 10 formatting/reporting functions

## Minimal Refactoring Approach (3-4 files)

Given the high complexity and tight coupling in check.ts, we recommend a **phased approach**:

### Phase 1: Type & Format Extraction (DONE)
- ✅ `check/types.ts` - 85 lines
- ✅ `check/formatters.ts` - 155 lines

### Phase 2: Consolidate into index (RECOMMENDED NEXT)
- Move remaining functions into `check/index.ts`
- Import types and formatters
- Keep all logic together but with cleaner imports
- **Benefit**: Reduces main file to ~1050 lines, improves imports
- **Risk**: Minimal - simple move with no logic changes

### Phase 3: Further Splitting (OPTIONAL)
If Phase 2 proves successful, consider:
- `check/runners.ts` - runProjectChecks, runCompileChecks, runPackageScriptChecks (~200 lines)
- `check/validators.ts` - validateTaskDocuments, checkTaskFileDrift, checkPlanBreadcrumbDrift (~300 lines)
- `check/harness.ts` - All harness-related functions (~250 lines)
- `check/evidence.ts` - Evidence persistence functions (~150 lines)

## Why Not Full Refactoring Now?

1. **High coupling**: Many functions share local state and helpers
2. **Test coverage**: Need comprehensive testing before major restructure
3. **Token budget**: Full extraction would consume 30k+ tokens
4. **Risk**: Breaking changes in a critical command

## Immediate Action

Since we've already extracted types and formatters, the cleanest next step is:

**Option A (Safest)**: 
- Update `check.ts` to import from `check/types.ts` and `check/formatters.ts`
- Leave the rest in place for now
- Document the extraction in git commit

**Option B (More aggressive)**:
- Rename `check.ts` → `check/index.ts`
- Export `checkCommand` from index
- Let TypeScript/tests catch any issues

## Recommendation

**Go with Option A** - minimal risk refactoring:
1. Import types and formatters in current check.ts
2. Remove duplicated code
3. Test thoroughly
4. Commit as "refactor: extract check types and formatters"

This reduces the file by ~240 lines while maintaining stability.

## Testing Strategy

Before any major refactoring:
```bash
pnpm run build:test
pnpm test tests/check*.test.mjs
pnpm typecheck
```

All must pass without changes.
