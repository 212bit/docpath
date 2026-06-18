# T-20260609-codex-skill-docpath - 增加 Codex Skill 适配器封装 DocPath 专家团入口

> backlog_id: R-145
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景
ExpertTeam-Codex 的 $expert-* 使用体验简单，适合 Codex CLI / Codex App；DocPath 当前已有 install health，但更偏协议文件安装。若能生成 Codex Skill 入口，可把 DocPath 状态机能力包装成低门槛专家团体验。

## 目标
新增 DocPath Codex Skill 适配器，生成项目级 `$docpath`、`$docpath-product`、`$docpath-design`、`$docpath-software` 入口，把 Codex 的 Skill 使用体验映射到 DocPath CLI、Role Profile 与 deliverables，但不引入独立专家团调度状态。

## 范围
- 通过 `docpath install --target codex` 与 `--target universal` 生成项目级 `.codex/skills/<name>/SKILL.md`。
- Skill 文案包含：先 `docpath status --agent` / `docpath next --agent`，非平凡任务遵守 `spec -> plan -> go -> check -> review -> journal`，代码修改前运行 `docpath agent enter`，完成后运行 `docpath agent done`。
- Skill 复用 `docpath roles list`、`docpath roles context --role <id>` 和 `docpath deliverables list/render/check`。
- 安装资产进入 manifest；`install --check-only` 检测缺失/漂移；`install --doctor` 检测 Codex Skill frontmatter name 错误。
- 默认不覆盖用户已有 `.codex` 文件，除非显式 `--force`。

## 验收
- docpath install --target codex 或等价命令可安装/验证 skill 文件。
- install health 能检测缺失、漂移、frontmatter name 错误。
- 不覆盖用户已有 Codex 配置，除非明确 --force。
- 文档包含 Codex CLI/App 调用示例。

## 2. 需求清单

### 功能需求
- [ ] FR-1: Codex target 安装 `.codex/skills/docpath*/SKILL.md` 并纳入 manifest。
- [ ] FR-2: Skill 内容显式映射到 DocPath 状态机、roles context 与 deliverables。
- [ ] FR-3: install doctor 能发现 Codex Skill frontmatter name 缺失或与目录名不一致。
- [ ] FR-4: 安装默认不覆盖已有 Codex Skill，`--force` 才覆盖。
- [ ] FR-5: 文档给出 Codex CLI/App 调用示例和状态机边界说明。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容，不新增独立专家团调度状态。
- [ ] NFR-2: 不引入新的外部依赖或 Agent 平台核心绑定。

## 3. 范围界定

### 包含
- Codex Skill 安装资产、manifest/drift 覆盖、doctor health 校验、安装测试和使用文档。

### 不包含
- 不安装到用户全局 `~/.codex`。
- 不新增自动专家团编排、Lead 分配、并行执行或 worktree 隔离。
- 不新增独立于 `check/review/journal` 的质量门禁。

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
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: Codex 用户可以通过 `$skill` 获得低门槛入口，但如果 Skill 内部形成独立专家团流程，会绕过 DocPath 的状态机和证据闭环。
- 目标: 提供 Codex Skill 适配层，把 `$docpath*` 调用引导到 `status/next/roles/deliverables/check/review/journal`，并由 install health 校验资产健康。
- 背景: R-146 已判定 Codex Skill 只能作为平台适配层；R-142/R-144 已提供 Role Profile 与 deliverables 基础能力。
- 可选方案:
  - 方案 A: 只更新 `AGENTS.md/CODEX.md`，不提供 Skill。成本低，但无法满足 `$docpath*` 入口体验。
  - 方案 B: 安装项目级 `.codex/skills/<name>/SKILL.md`。成本中等，符合 Codex 使用体验，且可由 manifest/doctor 校验。
  - 方案 C: 实现专家团自动调度。体验强，但会新增隐式流程和长期维护风险。
- 推荐方案: 采用方案 B，仅安装项目级 Codex Skill 资产，并让 Skill 调用现有 DocPath CLI 能力。
- 不做什么: 不写入 `~/.codex`，不做专家团自动编排，不新增平行状态或质量门禁。
- 成本: 维护 4 个 Skill 模板、安装 manifest、doctor 检查和测试用例。
- 风险: Codex Skill frontmatter 规范变更或用户已有 Skill 被误覆盖；通过项目级安装、默认不覆盖、manifest/doctor 检查降低风险。
- 回滚方案: 移除 `.codex/skills/docpath*` 模板与安装逻辑，重新运行 `docpath install --target codex --force` 恢复旧安装资产。
- 用户确认: 用户要求按 R-146 结论继续处理 R-145，本任务按“适配层、不进入核心状态机”的边界实施。

## 5. 验收标准

- [ ] AC-1: `docpath install --target codex` 安装 `AGENTS.md`、`CODEX.md`、`.codex/config.toml` 和 `.codex/skills/docpath*/SKILL.md`。
- [ ] AC-2: `.docpath/.install-meta.json` 记录 Codex Skill 资产，`install --check-only` 能检测缺失和漂移。
- [ ] AC-3: `install --doctor` 能检测 Codex Skill frontmatter `name` 缺失或与目录名不一致。
- [ ] AC-4: 既有 `.codex/skills/<name>/SKILL.md` 默认不被覆盖，`--force` 可覆盖。
- [ ] AC-5: 文档包含 Codex CLI/App 使用示例，并说明 Skill 不替代 DocPath 状态机。

---

*此文件由 `docpath backlog promote` 生成。*
