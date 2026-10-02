```bash
# Core 3+1 Loop (Daily High-Frequency Workflow):
docpath quick "Fix typo in docs"   # Ultra-light: < 50 lines 1-shot fast path (post-hoc: --adopt)
docpath start "<title>" --draft    # Setup: 1-shot task bootstrapping (promote + plan + go S1)
docpath go --step S1               # Progress: atomically claim or switch to a plan step
docpath step-pass --commit         # Step closeout: finish step + auto-commit final gate (or relay next)
docpath done --commit              # Compound closeout: 1-shot full gate sequence (check -> review -> journal -> commit)

# Advanced / Transitions (Coordination & Maintenance):
docpath step-skip S2 --reason ".." # Skip or supersede step with breadcrumb evidence
docpath task stash "WIP msg"       # Stash active task state and dirty changes (pop / switch)
docpath arch check                 # Architecture boundary & anti-corruption check
docpath gc                         # Workspace historical task cleanup
```
