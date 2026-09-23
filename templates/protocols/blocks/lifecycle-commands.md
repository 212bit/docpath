```bash
docpath quick "Fix typo in docs"   # mandatory for tiny low-risk changes (< 50 lines diff)
docpath start R-101 --draft        # compound: 1-shot start from backlog (promote + plan + go S1)
docpath go --step S1
docpath step-pass                  # compound (R-340): finish current step + auto-start next (or --all)
docpath agent step --step "S1" --status done
docpath check                      # targeted quality check during iteration
docpath done --commit              # compound: full gate sequence (check -> review -> journal -> commit) in 1-shot
docpath quick-done --commit        # compound (R-340): quick gate sequence + commit in 1-shot
```
