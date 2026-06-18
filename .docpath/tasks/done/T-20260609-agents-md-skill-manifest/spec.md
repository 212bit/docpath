# T-20260609-agents-md-skill-manifest - 允许 AGENTS.md 定制但继续校验 Skill manifest 漂移

> backlog_id: R-152
> backlog_source: docpath backlog add

## 1. 背景与动机

# 允许 AGENTS.md 项目定制但继续校验 Skill manifest 漂移

## 背景
上一轮 AGENTS.md 已瘦身为项目级入口，详细 DocPath 工作流由 Codex Skill 承担。但 install health 仍把根 AGENTS.md 与模板差异视为 install-manifest-drift，导致项目定制 AGENTS.md 后持续报错。

## 目标
- install/manifest 校验允许项目根 AGENTS.md 定制。
- 仍校验 `.codex/skills/docpath/SKILL.md` 与模板/manifest 一致性。
- 保持 CODEX.md、`.docpath/protocols/*` 等安装管理文件的漂移检测。

## 验收
- 根 AGENTS.md 定制不会导致 status install_health 报 install-manifest-drift。
- 篡改 `.codex/skills/docpath/SKILL.md` 后 check-only/status health 仍能报告漂移。
- 有测试覆盖 AGENTS.md 豁免与 Skill 漂移仍检测。
- build/test/install doctor 通过。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 允许 AGENTS.md 定制但继续校验 Skill manifest 漂移
  - 来源 backlog: R-152

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 允许 AGENTS.md 定制但继续校验 Skill manifest 漂移

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: AGENTS.md 已被设计为项目级入口，但 install manifest 仍把 AGENTS.md 与模板差异视为失败。
- 目标: 允许 AGENTS.md 项目定制，同时继续严格校验 Codex Skill 和其他协议资产。
- 背景: DocPath Skill 是 Agent 操作手册权威来源，AGENTS.md 只保留项目级入口与链接。
- 可选方案: A 继续严格校验所有资产；B 仅豁免 AGENTS.md；C 移除 AGENTS.md 安装管理。
- 推荐方案: B，仅豁免 AGENTS.md 的模板漂移、本地修改和缺失统计，Skill/CODEX/.docpath 协议资产继续检测。
- 不做什么: 不放宽 `.codex/skills/docpath*/SKILL.md`、CODEX.md、.codex/config.toml 的漂移校验。
- 成本: 需要维护一条 install asset customization 规则和对应测试。
- 风险: AGENTS.md 可能被项目过度定制；通过保留 Skill/CODEX 严格校验和项目审查降低风险。
- 回滚方案: 删除 AGENTS.md 豁免逻辑，恢复所有 manifest 资产严格校验。
- 用户确认: 2026-06-09 用户明确要求“另开任务修改 install/manifest 校验逻辑，让它允许‘AGENTS.md 项目定制，只要求 Skill 文件一致’”。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-152 与任务 T-20260609-agents-md-skill-manifest 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
