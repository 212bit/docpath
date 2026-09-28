# Quick Task: T-20260923-quick-step-pass-all-quick-standard

- title: 生命周期体验增强：支持 step-pass --all 一键批量收尾，并在 quick 升级 standard 时自动闭环执行计划
- workflow_profile: quick
- created_by: docpath quick
- gates:
  - check: required
  - review: skipped by quick profile unless escalated
  - journal: minimal

## Boundaries

Quick is intended for typo fixes, one-line bugs, comments, and small low-risk adjustments.
Escalate to the standard lifecycle for architecture, protocol, permission, migration, CI/CD, UI workflow, or broad multi-file changes.
