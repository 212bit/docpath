# R-245 Decision Brief - Formalize Requirements Shaping Intake

- 当前问题: 需求讨论阶段的项目虽然已有 project-intake 能力，但 agent 仍可能围绕大文档自由发挥，或把未拍板材料直接推成开发 backlog。
- 目标: 把需求梳理固化为正式 DocPath intake 工作流，让原始材料按 capture -> analyze -> gaps -> questions -> decisions -> requirements -> approval -> backlog guidance 的阶段推进。
- 背景: 用户在 evoucher 项目中指出真正问题不是开发入口，而是需求梳理流程没有固化。用户已确认方案 B。
- 可选方案:
  - 方案 A: 只写一份流程文档。
  - 方案 B: 做成 DocPath 正式 project-intake 工作流，落到协议、命令提示、文档和测试。
  - 方案 C: 只做 evoucher 项目专用模板。
- 推荐方案: 方案 B。
- 决策理由: 方案 B 能复用于后续项目，并能通过 agent 路由和命令提示减少自由发挥。方案 A 约束力不足；方案 C 不能沉淀为 DocPath 能力。
- 不做什么: 不直接创建开发 backlog；不绕过用户拍板；不引入外部 LLM；不为单个项目硬编码流程。
- 成本: 中等，涉及工作流/Agent 行为、协议文本、文档和测试。
- 风险: 命令提示与文档不一致会继续误导 agent；通过测试和协议同步降低风险。
- 回滚方案: 回退 project-intake 路由/文档/测试改动，保留现有 project capture/analyze/brief/backlog 行为。
- 用户确认: 用户于 2026-07-05 回复“认方案 B”。
