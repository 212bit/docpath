---
id: R-448
title: write-spec 前置暴露结构契约并在校验失败时附可复制最小骨架
kind: fix
status: done
priority: P1
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260930-write-spec/spec.md
  decision_brief: >-
    - 当前问题: agent 拿不到 write-spec 的结构契约，靠猜格式反复试错重写，整份 spec 正文被重复注入上下文

    - 目标: 让契约在 --help 与校验失败输出两处前置可见，agent 一次写对

    - 可选方案:
      - 方案 A: 只改帮助文本与失败输出，不动校验规则
      - 方案 B: 同时放宽校验规则，兼容裸 `- FR-1:` 写法
    - 推荐方案: 方案 A

    - 决策理由: 方案 B 会改变既有 spec 的合法性判定属行为变更，且放宽后 FR/AC 无法被 structured-docs 解析进
    spec.json 机器真源，反而制造新的静默丢失；方案 A 零行为风险且直击病灶（契约不可见）

    - 用户确认: 用户已确认走标准生命周期实施 R-448
  user_confirmed: 用户已确认走标准生命周期实施 R-448
links:
  task: T-20260930-write-spec
  spec: tasks/T-20260930-write-spec/spec.md
created_at: 2026-09-30
---

## 背景

agent+docpath 辅助开发中，write-spec --help 仅列 --cwd/--content/--stdin 三个选项，不暴露硬性结构契约（doc-parser.ts:61-101 要求 `# 任务标题`、`### 功能需求`、`## 5. 验收标准`，且 FR-*/AC-* 必须为 `- [ ] FR-1:` checkbox 形式）。R-129 会话中 agent 因拿不到契约只能猜格式，连续三次调用 write-spec：第1次以 backlog_id: 开头无 `# ` 标题、缺 `## 5. 验收标准`、缺 AC-* → 校验失败 exit 1；第2次 FR/AC 写成裸 `- FR-1:` 未用 checkbox → 校验失败 exit 1；第3次补 checkbox 才成功。前两次零副作用（校验在 write-spec.ts:117 位于写文件之前，exit 1 即无写入），但整份 spec 正文被重复注入两遍。

## 验收

1) `docpath write-spec --help` 输出含 Examples 段，给出最小可过校验的 spec 骨架，骨架内 ADR 位使用 `## 4.1 重大变更门禁 > ### Decision Brief` 规范写法；2) 校验失败时除逐条列 issue 外，额外打印可直接复制复用的最小骨架模板；3) 给定一份仅格式错误的 spec，agent 一次调用即可自行修正，不再需要第二次试错写入。
