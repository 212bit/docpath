# R-281 Analysis: Detailed major change gate failure message

## Requirements

When uncommitted changes trigger a major change signal, the quality check blocks execution if the spec has not confirmed the major change gate. Currently, the failure message `formatMajorChangeGateFailure` is too brief. It only tells the user to fill in the Decision Brief, but does not explain:
1. That checking "No" (or leaving `required: false`) is invalid when uncommitted strategic files are present (which will always fail quality checks).
2. The two valid outlets/resolutions for the user:
   - **Path A (Confirm as Major Change)**: Select "Yes", write a proper Decision Brief, and record a valid `user_confirmed` entry in the spec.
   - **Path B (Not a Major Change)**: Clean up or commit the uncommitted strategic/config files to clear the active signals.
3. The specific uncommitted files triggering the gate block.

## Proposed Output Message Format

The updated `formatMajorChangeGateFailure` will print a much more descriptive output:

```text
❌  检测到未提交的重大变更，但当前 spec 尚未通过重大变更门禁。

🚨  触发信号的未提交文件:
- [Label]: [Files]

💡  重大变更门禁有两种合法出路：

  👉  出路一：如果本次开发确属重大变更（将变更类型、设计、或工作流）
      1. 在 spec.md 的 "## 4.1 重大变更门禁" 中填写详细的 Decision Brief（问题、目标、方案、风险等）；
      2. 将门禁选择勾选为：[x] 是，需要用户确认；
      3. 在 "用户确认:" 填写具体的确认依据（不能为 "待确认"、"无"、"N/A" 或空）。
      （这允许您带着未提交的重大资产文件通过 check/review）

  👉  出路二：如果本次开发不属重大变更（例如：仅为遗留改动、本地调试，或属于其他任务的变更）
      - 请先通过 git commit 提交这些信号文件，或通过 git restore 撤销无关改动；
      - 只要 Git 工作区中没有这些未提交的信号文件，重大变更门禁就不会被触发（即使 spec 勾选 "否" 也能直接通过）。

⚠️  注意：在存在未提交信号文件时，仅仅在 spec.md 中勾选 "否" 是无法通过门禁的。
```

---

## Technical Implementation Plan

1. **Update `formatMajorChangeGateFailure`**:
   In `src/utils/major-change.ts`, update `formatMajorChangeGateFailure(signals: MajorDecisionSignal[])` to return the new formatted string above.

2. **Verify via Tests**:
   Modify or add tests in `tests/major-change-gate.test.mjs` (or similar check-review tests) to verify the new detailed error message is emitted and contains key phrases.
