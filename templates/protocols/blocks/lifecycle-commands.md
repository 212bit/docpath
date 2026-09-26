```bash
docpath quick "Fix typo in docs"   # mandatory for tiny low-risk changes (< 50 lines diff)
docpath start "<title>" --draft    # compound: 1-shot start by title or backlog ID (promote + plan + go S1)
docpath go --step S1
docpath step-pass --commit         # compound: pass step + auto-closeout & commit on final step (or --all)
docpath task stash "WIP msg"       # hot stash active task state, files, and git changes
docpath task pop                   # restore latest stashed task
docpath task switch <target_id>    # seamless switch: auto-stash current + restore/start target
docpath arch check                 # architecture layer & dependency guard check
docpath check                      # targeted quality check during iteration
docpath done --commit              # compound: full gate sequence (check -> review -> journal -> commit) in 1-shot
docpath quick-done --commit        # compound (R-340): quick gate sequence + commit in 1-shot
```
