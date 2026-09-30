---
id: R-455
title: 真实 Token 消耗全景、DocPath 极轻量价值透视与开发摩擦诊断体系
kind: feature
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260930-token-docpath/spec.md
  decision_brief: |-
    - 当前问题: 真实 Token 消耗全景、DocPath 极轻量价值透视与开发摩擦诊断体系
    - 目标: 真实 Token 消耗全景、DocPath 极轻量价值透视与开发摩擦诊断体系
    - 背景: 来自 backlog R-455
    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A
    - 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
    - 成本: 中等，按 plan 拆分后逐步验证
    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
    - 用户确认: 待确认
  user_confirmed: 待确认
links:
  task: T-20260930-token-docpath
  spec: tasks/T-20260930-token-docpath/spec.md
created_at: 2026-09-30
---

### 背景与痛点
对于真实项目开发，度量的核心不是单步微观物理增量，而是大模型交互实际产生的**最终真实总 Token 消耗（Total Model Tokens）**。同时，监控系统需要解决两个核心诉求：
1. **证明 DocPath 的轻量化与高 ROI**：直观展示 DocPath 协议注入（spec/plan/rules）在整个模型真实消耗中占比极低（通常仅占 1%~3%），却大幅提升了一次通过率并杜绝死循环，证明其在几乎不增加 Token 负担的前提下高效辅助开发；
2. **诊断 Agent 开发中的摩擦与阻力 (Friction Points)**：自动捕获命令报错、格式校验失败、步骤重试、长会话卡点等阻碍，辅助团队持续优化 DocPath 流程与使用姿势。

### 验收标准
- [ ] AC-1: 全面统一以真实模型交互总消耗（Total Model Tokens，含多轮累计与缓存命中）作为核心统计真源
- [ ] AC-2: 实现 DocPath 轻量化价值透视（计算 DocPath 协议开销占真实总消耗的比率，量化其以极低成本换取的门禁通过率与合规收益）
- [ ] AC-3: 实现研发摩擦与阻力诊断引擎（检测命令调用失败、门禁反复拦截、步骤返工等摩擦事件，并生成 DocPath 流程优化建议）
- [ ] AC-4: 升级 `docpath monitor`（全局与 `--current` 实时看板），直观展示「总消耗与 DocPath 价值透视」及「开发摩擦与提效诊断」
- [ ] AC-5: 完成单元测试覆盖并在全量门禁中通过验证
