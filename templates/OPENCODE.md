# DocPath OpenCode Protocol

## Overview
This file provides OpenCode-specific integration with DocPath's workflow engine. OpenCode is an AI coding agent that operates in your terminal.

## Project Structure
- `.docpath/` — DocPath workspace (state, breadcrumb, tasks)
- `.docpath/workspace/current.md` — Current task context
- `.docpath/workspace/breadcrumb.md` — Execution trace
- `.docpath/tasks/current/plan.md` — Task plan with sub-tasks

## Commands

```bash
docpath status --agent   # Show current state + next recommended action
docpath next --agent     # Get next recommended command
docpath go               # Load next sub-task from plan
docpath agent step --step S1 --auto-next  # Mark step done, auto-advance
docpath agent done       # Run quality gates, mark completion
docpath check            # Quality gate (compile + test + lint)
docpath review           # Code review (static analysis)
docpath agent handoff    # Persist compact context for session transfer
docpath continue         # Resume from breadcrumb after disconnect
```

## Workflow Protocol

### 1. Task Start
```bash
docpath agent enter --step S1
```

### 2. Per Sub-task
```bash
docpath go               # Load next sub-task context
# ... do work ...
docpath agent step --step S1 --status done --auto-next
```

### 3. Task Complete
```bash
docpath agent done
```

### 4. Session Resume (after disconnect)
```bash
docpath continue
```

## Quality Gates

`docpath agent done` runs:
1. **check** — compile + test + lint (block on failure)
2. **review** — static code analysis (block on failure)
3. **journal** — archive knowledge on success

Use `--enforce` to require all gates pass (no skip allowed):
```bash
docpath agent done --enforce
```

## Config
Config: `.docpath/config.yaml`
