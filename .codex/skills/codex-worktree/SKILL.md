---
name: codex-worktree
description: Parallel development with DocPath worktrees for isolated state and zero collision across Codex, Claude Code, OpenCode, and compatible agents
---

# Agent-neutral DocPath Worktree

Use this skill to orchestrate parallel coding agents in DocPath worktrees for concurrent feature development. Codex is one supported adapter; the worktree protocol itself is agent-neutral.

## Core Concept

DocPath worktrees provide **true isolation** for parallel agent development:
- Each worktree has independent `.docpath/workspace/` and `tasks/`
- Shared `backlog/` and `rules/` via symlinks
- Zero state collision between agents
- Each agent tracks its own breadcrumb

## Prerequisites

- At least one compatible coding agent installed and configured, such as Codex CLI, Claude Code, or OpenCode
- DocPath project (with `.docpath/` directory)
- Git repository

## Creating Worktrees

```bash
# Create worktrees for parallel features
docpath worktree create feature-auth
docpath worktree create feature-payment
docpath worktree create feature-notifications

# List all worktrees with DocPath status
docpath worktree list
```

## Launching Parallel Agents

```bash
# Launch each tool in its own worktree with unique session IDs
cd .worktrees/feature-auth
export DOCPATH_SESSION=codex-R-101-feature-auth
codex exec --sandbox workspace-write 'Implement authentication feature per spec' &

cd .worktrees/feature-payment
export DOCPATH_SESSION=claude-R-102-feature-payment
claude 'Implement payment integration per spec' &

cd .worktrees/feature-notifications
export DOCPATH_SESSION=opencode-R-103-feature-notifications
opencode 'Implement notification system per spec' &
```

Adapter-specific commands vary by tool. The stable DocPath contract is one worktree, one active agent session, and one explicit `DOCPATH_SESSION`.

```bash
# Codex adapter example
cd .worktrees/feature-payment
export DOCPATH_SESSION=codex-R-102-feature-payment
codex exec --sandbox workspace-write 'Implement payment integration per spec' &
```

**Key points:**
- Use unique `DOCPATH_SESSION` per agent (recommended: `<tool>-<backlog-id>-<slug>`, e.g. `codex-R-101-auth`, `claude-R-102-payment`)
- Each agent follows its own DocPath workflow independently
- Run in background with `&` for true parallelism

## Monitoring Progress

```bash
# Check all worktree states
docpath worktree list

# Monitor specific agent's breadcrumb
tail -f .worktrees/feature-auth/.docpath/workspace/breadcrumb.md
```

## Merging and Cleanup

Standard procedure:

- Run `docpath worktree doctor` before development and again before closeout.
- Commit worktree changes on the worktree branch before merging.
- Run `docpath changes --agent` and stage only `worktree_isolation.commit_relevant_files` plus exact canonical evidence paths from `ignored_evidence.add_command` when evidence is required.
- Do not stage `worktree_isolation.expected_noise_files`; those are expected `.docpath` isolation artifacts.
- Do not merge into a dirty main checkout. Commit, stash, or intentionally account for main changes first.
- After merging, run `npm link` from main if the global `docpath` binary was linked from the worktree for validation.

```bash
# In the feature worktree
cd /path/to/project/.worktrees/feature-auth
export DOCPATH_SESSION=agent-feature-auth
docpath worktree doctor
docpath check
docpath review
docpath journal
docpath changes --agent

# Stage implementation files from worktree_isolation.commit_relevant_files
git add <commit_relevant_files...>

# If evidence is required, run the exact add command from ignored_evidence.add_command
# git add -f .docpath/tasks/done/<task>/spec.md ...

git commit -m "feat: implement feature-auth"

# Prepare main
cd /path/to/project
git status --short
# If dirty for unrelated reasons:
git stash push -m "pre-merge local main changes"

# Merge
git merge feature-auth
npm link

# Restore unrelated local main changes only after the merge is known good
git stash pop

# Clean up worktree
docpath worktree remove feature-auth
```

## Worktree Structure

```
project/
├─ .docpath/
│  ├─ backlog/              ← SHARED (all worktrees)
│  ├─ rules/                ← SHARED (all worktrees)
│  └─ workspace/            ← main worktree state
├─ .worktrees/
│  ├─ feature-auth/
│  │  ├─ .docpath/
│  │  │  ├─ backlog -> ../../.docpath/backlog/  ← symlink
│  │  │  ├─ rules -> ../../.docpath/rules/      ← symlink
│  │  │  ├─ workspace/      ← ISOLATED (feature-auth state)
│  │  │  └─ tasks/          ← ISOLATED (feature-auth tasks)
│  │  └─ src/               ← feature-auth code
│  └─ feature-payment/
│     ├─ .docpath/
│     │  ├─ backlog -> ../../.docpath/backlog/
│     │  ├─ rules -> ../../.docpath/rules/
│     │  ├─ workspace/      ← ISOLATED (feature-payment state)
│     │  └─ tasks/          ← ISOLATED (feature-payment tasks)
│     └─ src/               ← feature-payment code
```

## Session ID Strategy

**Per-agent unique IDs:**
```bash
DOCPATH_SESSION=agent-<feature-name>
DOCPATH_SESSION=<tool>-<backlog-id>-<feature-name>
DOCPATH_SESSION=<tool>-<issue-number>
```

**Benefits:**
- Track which agent made each breadcrumb entry
- Debug concurrent operations
- Audit parallel development history

## Codex Sandbox Modes

| Mode | Safety | Use Case |
|------|--------|----------|
| `--sandbox read-only` | Safest | Analysis, review, planning |
| `--sandbox workspace-write` | **Recommended** | Feature development |
| `--yolo` | Dangerous | Only for isolated experiments |

**Default recommendation:** `workspace-write` for DocPath worktrees.

## Best Practices

### 1. One Feature Per Worktree
```bash
# Good: clear boundaries
docpath worktree create user-auth
docpath worktree create payment-flow

# Bad: overlapping concerns
docpath worktree create backend-work
docpath worktree create various-fixes
```

### 2. Promote Requirements Before Creating Worktree
```bash
# Promote requirement to backlog first
docpath backlog promote R-123

# Then create worktree for it
docpath worktree create feature-R-123
cd .worktrees/feature-R-123

# Agent will see R-123 in shared backlog
docpath next --agent
```

### 3. Set Session ID Immediately
```bash
cd .worktrees/feature-auth
export DOCPATH_SESSION=codex-auth  # Before any docpath commands
docpath worktree doctor
docpath agent enter
```

### 4. Don't Mix Agents in Same Worktree
```bash
# Bad: multiple agents in same worktree = state collision
cd .worktrees/feature-auth
codex exec 'do frontend' &
claude-code 'do backend' &  # Will collide!

# Good: separate worktrees for separate agents
docpath worktree create feature-auth-frontend
docpath worktree create feature-auth-backend
```

## Common Workflows

### Workflow 1: Parallel Feature Sprint

```bash
# Setup
docpath backlog promote R-101 R-102 R-103
docpath worktree create feat-101
docpath worktree create feat-102
docpath worktree create feat-103

# Launch agents
for feat in feat-101 feat-102 feat-103; do
  (
    cd .worktrees/$feat
    export DOCPATH_SESSION=codex-$feat
    codex exec --sandbox workspace-write "Implement ${feat} per backlog spec"
  ) &
done

# Wait and merge
wait
git merge feat-101 feat-102 feat-103
docpath worktree remove feat-101 feat-102 feat-103
```

### Workflow 2: Experiment + Main Development

```bash
# Main development in main repo
docpath agent enter
# ... working on main task ...

# Quick experiment in worktree (doesn't affect main state)
docpath worktree create experiment-redesign
cd .worktrees/experiment-redesign
export DOCPATH_SESSION=codex-experiment
codex exec 'Try alternative architecture approach'

# If successful, merge; if not, discard
docpath worktree remove experiment-redesign --force
```

### Workflow 3: Bug Fix Batches

```bash
# Create worktrees for multiple bugs
for issue in 234 235 236; do
  docpath worktree create fix-issue-$issue
  (
    cd .worktrees/fix-issue-$issue
    export DOCPATH_SESSION=codex-fix-$issue
    codex exec --sandbox workspace-write "Fix issue #$issue from backlog"
  ) &
done
```

## Troubleshooting

### Issue: Codex can't find backlog
**Cause:** Symlink not created properly  
**Fix:**
```bash
cd .worktrees/feature-x/.docpath
ls -la  # Check if backlog is a symlink
readlink backlog  # Should point to ../../.docpath/backlog

# Recreate if broken
rm backlog
ln -s ../../.docpath/backlog backlog
```

### Issue: Session ID not appearing in breadcrumb
**Cause:** `DOCPATH_SESSION` not exported before docpath commands  
**Fix:**
```bash
export DOCPATH_SESSION=codex-myfeature  # MUST export, not just set
docpath agent enter  # Now will record session ID
```

### Issue: Worktree removal fails
**Cause:** Uncommitted changes  
**Fix:**
```bash
# Option 1: Commit first
cd .worktrees/feature-x
git commit -am "wip: feature work"

# Option 2: Force remove (loses changes)
cd /path/to/project
docpath worktree remove feature-x --force
```

## Integration with Other Tools

### With Claude Code
```bash
# Claude Code in main repo
claude  # Main interactive session

# Codex in worktrees for parallel feature work
docpath worktree create codex-feature-a
cd .worktrees/codex-feature-a
export DOCPATH_SESSION=codex-feature-a
codex exec 'Implement feature A'
```

### With GitHub Actions
```yaml
# .github/workflows/parallel-dev.yml
jobs:
  parallel-features:
    strategy:
      matrix:
        feature: [auth, payment, notifications]
    steps:
      - run: docpath worktree create feature-${{ matrix.feature }}
      - run: |
          cd .worktrees/feature-${{ matrix.feature }}
          export DOCPATH_SESSION=ci-${{ matrix.feature }}
          codex exec "Implement ${{ matrix.feature }} per spec"
```

## Limitations

- **Manual merge conflicts:** Still need manual resolution if features overlap
- **Single active task per worktree:** Each worktree = one task focus
- **No cross-worktree coordination:** Agents don't communicate with each other

## Commands Reference

| Command | Effect |
|---------|--------|
| `docpath worktree create <name>` | Create isolated worktree with DocPath state |
| `docpath worktree doctor [name]` | Check worktree readiness and session/dependency guidance |
| `docpath worktree list` | Show all worktrees + DocPath status |
| `docpath worktree remove <name>` | Delete worktree (fails if dirty) |
| `docpath worktree remove <name> --force` | Force delete (loses changes) |

## Further Reading

- [DocPath Worktree Workflow Guide](../../../docs/features/worktree-workflow.md)
- [DocPath Session Isolation](../../../docs/features/session-isolation-mvp.md)
- [Codex CLI Documentation](https://github.com/openai/codex)
