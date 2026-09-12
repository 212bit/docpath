---
id: R-332
title: 全局安装与仓库开发版漂移提示：PATH 旧版无感知，双轨易踩行为差异
status: done
priority: P3
level: 2
source: docpath backlog capture
readiness: confirmed
evidence:
  brainstorm: 2026-09-12 会话 brainstorm dry-run：方案 a+c；b（npm link
    自动化）因写全局环境超出免确认边界排除；warn 走 install --doctor 全量输出 + next --agent nag-once
    advisory
  analysis: 会话分析定稿：挂载点=install-core.checkGlobalVersionDrift→buildInstallDoctorReportFromContext
    issues（warn 级，errors 才 flip passed 故不污染 doctor 退出码）；next 可见性经
    agent-output.ts:186 install_health（compact 仅 passed，故用 formatters 内 R-287 式
    nag-once console.warn，同版本对不重复）；检测门=package.json name==docpath +
    bin/docpath.js 存在 + PATH which realpath 回溯 package.json
    版本差，三场景（非本仓/无全局/版本一致）短路零噪音；排除 b（npm link 写全局）
  spec: tasks/T-20260912-path/spec.md
  decision_brief: >-
    - 当前问题: 本机 PATH 的 docpath 为全局旧安装（~/.npm-global），本仓库开发必须 node
    bin/docpath.js；开发者在仓库目录误用全局旧版时无任何提示，新功能验证易踩旧行为。方向：(a) bin 入口（仓库 checkout
    内启动时）检测 PATH docpath 版本差并在 doctor/next 输出提示；(b) 或提供 npm link/落 shim 的引导；(c)
    文档明示双轨事实。

    - 目标: 全局安装与仓库开发版漂移提示：PATH 旧版无感知，双轨易踩行为差异

    - 背景: 来自 backlog R-332

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
  task: T-20260912-path
  spec: tasks/T-20260912-path/spec.md
created_at: 2026-09-11
---

## 背景

本机 PATH 的 docpath 为全局旧安装（~/.npm-global），本仓库开发必须 node bin/docpath.js；开发者在仓库目录误用全局旧版时无任何提示，新功能验证易踩旧行为。方向：(a) bin 入口（仓库 checkout 内启动时）检测 PATH docpath 版本差并在 doctor/next 输出提示；(b) 或提供 npm link/落 shim 的引导；(c) 文档明示双轨事实。

## 验收

1) install-core 新增 checkGlobalVersionDrift（warn 级）：docpath 源码 checkout 内 PATH docpath 版本与仓库 package.json 版本不一致时产出 global-version-drift issue，install --doctor 可见；2) next --agent 首次检测到新漂移状态给一行 advisory 提示（nag-once，同版本对不重复），指明 node bin/docpath.js 正确调用；3) getting-started 补双轨说明；4) 非 docpath 项目/无全局安装/版本一致三种场景零噪音；5) 回归测试锁定
