---
id: R-357
title: check scope 缓存命中时输出明确提示而非静默复用
status: proposed
priority: P1
level: 1
source: docpath backlog add
readiness: shaped
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-23
---

## 背景

## 问题\n改过代码后跑 docpath check，scope 缓存命中直接给 ✅，不告诉你没真跑。必须手动 --no-cache 才强制全量。\n\n## 复现\nR-056 S8：改过 agent/Cargo.toml、shared/src/staged_tool.rs 之后跑 docpath check，报「scope 缓存命中：代码范围自上次绿色 check 无变更，判定复用」并直接给 ✅。\n\n## 期望行为\n缓存命中时在输出中明确标注「⚠️ scope 缓存命中，本次未实际执行检查」，或提供 --verbose-cache 标志显示缓存决策过程。复用出来的绿与真跑出来的绿是两件事，前者不应伪装成后者。\n\n## 证据来源\nferrum 项目 R-056 实操（2026-09-22）

## 验收

- 待补充
