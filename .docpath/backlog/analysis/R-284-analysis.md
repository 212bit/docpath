# R-284 Analysis: Promote Scaffolding Quality Improvements

## Problem Description

During task promotion (`backlog promote`), three quality issues were observed:
1. **AC Double Prefix**: The generated spec.md AC lines get double-prefixed if the backlog acceptance line already had `AC-` (e.g., `- [ ] AC-1: AC-1: check...`).
2. **Decision Brief Garbage parsing**: The first non-empty line of the backlog body (which is usually the heading `## 背景`) is parsed as the `problem` value under Decision Brief.
3. **Change Type False Positives**: Naive keyword matching checks incorrect boxes for major change types (e.g. Workflows, permissions) even when no such changes are intended, making it look like a decision has already been made.

## Proposed Solution

1. **AC Deduplication**: Strip any existing `AC-\d+\s*:\s*` prefix from the start of clean acceptance lines in `renderPromotedSpec`.
2. **Decision Brief Cleanup**: Parse the first actual line of text from the `背景` section (excluding the heading and list markers). If none is found or if it is a placeholder, fallback to task title.
3. **Change Type defaults**: Default all change types to unchecked (`[ ]`) when git worktree is clean, preventing false positive boxes from being ticked.
