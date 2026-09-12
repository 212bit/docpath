# DocPath Codex Protocol

> This file is a thin proxy. Prefer `AGENTS.md`, which is the authoritative
> single source of truth for DocPath agent protocols.

## Protocol Reference

See @AGENTS.md for complete access models, command boundaries, lifecycle
commands, token economy guidelines, and required quality gates.

## Codex Instructions

- Read and follow all instructions in @AGENTS.md.
- Codex CLI reads `.codex/config.toml` for tool and skill mappings.
- Use `docpath next --agent` as the primary entry point for any task.
- Use `docpath go --step <id>` to claim and execute steps.
