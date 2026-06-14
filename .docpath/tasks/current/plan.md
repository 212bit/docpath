## Execution Plan

### S1: Review Phase 1 CLI-only baseline
- **描述**: Confirm the implementation boundary and acceptance criteria for the CLI-only baseline.
- **验收条件**: CLAUDE.md and skills no longer require default reads of current.md or breadcrumb.md; agents use CLI summaries for state.
- **依赖**: 无

### S2: Implement Phase 1 CLI-only baseline
- **描述**: Update code and documentation within the existing architecture to support the CLI-only baseline.
- **验收条件**: The CLI-only baseline is implemented and remains compatible with existing DocPath workflows.
- **依赖**: S1

### S3: Converge cross-agent protocol docs in English
- **描述**: Align Codex, Claude Code, OpenCode, installed protocols, templates, and Codex skills on the JSON-first access model.
- **验收条件**: Protocol docs are written in English, default to status/next/reveal/context CLI access, and treat Markdown files as human views instead of default agent inputs.
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
