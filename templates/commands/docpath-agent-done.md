# docpath-agent-done

Close an agent task with gates.

```bash
docpath agent done --step "<task>"
```

By default this runs `docpath check` and `docpath review`, then records completion and prints next action.
Use `--skip-check` or `--skip-review` only when explicitly justified.
