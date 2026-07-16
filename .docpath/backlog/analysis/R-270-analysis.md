# R-270: atomic closeout for docs-index dirty chain

## Fix
`isCurrentTaskExecutionPath` now treats `.docpath/docs-index.json` and `.docpath/docs.md` as closeout-owned paths. `check` already auto-refreshes stale docs-index; go/agent enter no longer block on those artifacts alone (R-249 single-path guard preserved for non-DocPath files).

## AC
- AC-1: dirty docs-index/docs.md alone do not fail execution-start dirty guard
- AC-2: non-DocPath dirty files still blocked
- AC-3: test coverage in dirty-worktree-guard.test.mjs
