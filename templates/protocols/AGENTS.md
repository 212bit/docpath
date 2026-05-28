# DocPath — Agent Workflow Protocol

> This project uses **DocPath** as the development workflow engine.
> **Document as FSM** — all task states are stored as YAML frontmatter in Markdown.

## Quick Start

```bash
docpath init          # Initialize .docpath directory
docpath go <task>     # Start a new task
docpath continue      # Continue current task
docpath status        # Check current state
docpath context       # View full context
docpath check         # Pre-task check
```

## Workflow

1. **Start task**: `docpath go "description"` → read `.docpath/workspace/current.md`
2. **During execution**: update state + current_step after each step
3. **State transitions**: planning → spec_ready → executing → done/blocked
4. **Complete**: `docpath archive` to move to tasks/

## Key Rules

- **MUST read current.md** before any action
- Update state + current_step after every operation
- Log all changes to breadcrumb.md
- Record failures to journal/ for analysis
