```bash
docpath quick "Fix typo in docs"   # mandatory for tiny low-risk changes (< 50 lines diff)
docpath go --step S1
docpath step-pass                  # compound (R-340): finish current step + auto-start next
docpath agent step --step "S1" --status done
docpath check                      # targeted quality check during iteration
docpath done                       # compound: full gate sequence (check -> review -> journal) in one shot
docpath quick-done                 # compound (R-340): done gate sequence + commit-readiness in one call
```
