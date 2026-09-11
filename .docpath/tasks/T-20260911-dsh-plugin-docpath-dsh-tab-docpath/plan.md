## 执行计划

### S1: 梳理 设计 dsh-plugin-docpath：在 DSH 侧边栏以 Tab 形式可视化 DocPath 工作流全景（工作流/耗时/文档/事件流）
- **描述**: 根据 spec 明确 FR-1: 设计 dsh-plugin-docpath：在 DSH 侧边栏以 Tab 形式可视化 DocPath 工作流全景（工作流/耗时/文档/事件流） 的实现边界和验收口径。
- **验收条件**: AC-1: 设计文档产出**：`.docpath/tasks/<task>/` 下产出完整设计，覆盖 —— 分层架构（host/client/kernel）、数据契约（每个 Tab 消费哪些文件、字段、兜底策略）、侧边栏 Tab 版式、里程碑拆分、风险与不做的事。
- **依赖**: 无

### S2: 实现 设计 dsh-plugin-docpath：在 DSH 侧边栏以 Tab 形式可视化 DocPath 工作流全景（工作流/耗时/文档/事件流）
- **描述**: 在现有架构内完成 FR-1: 设计 dsh-plugin-docpath：在 DSH 侧边栏以 Tab 形式可视化 DocPath 工作流全景（工作流/耗时/文档/事件流） 的代码与文档更新。
- **验收条件**: FR-1 设计 dsh-plugin-docpath：在 DSH 侧边栏以 Tab 形式可视化 DocPath 工作流全景（工作流/耗时/文档/事件流） 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 设计文档产出**：`.docpath/tasks/<task>/` 下产出完整设计，覆盖 —— 分层架构（host/client/kernel）、数据契约（每个 Tab 消费哪些文件、字段、兜底策略）、侧边栏 Tab 版式、里程碑拆分、风险与不做的事。；AC-2: 架构合规**：分层遵循 DSH 插件开发预设——`host` 只做文件 IO 与 `ctx.provide` 桥、`kernel` 是零 IO 纯函数且可单测、`client` 只做 UI 渲染；明确写出 cordis 三项契约检查（client.inject 声明 / cordis.patch.yml / host.provide 桥）的落地方式。；AC-3: 数据契约可验证**：每个 Tab 的数据来源必须标注到具体文件路径与字段，并给出 `schema_version` 不匹配或文件缺失时的降级策略；不得凭空设计未实测过的字段。；AC-4: 性能约束明确**：直读 JSON（不起子进程拉 CLI），首屏数据 < 200ms；`docs-index.json` 必须给出减载方案（实测去 `content_terms` 后 1026KB→390KB），不得整包传输。；AC-5: 只读边界**：设计明确插件为只读可观测，不写 `.docpath/`、不绕过 CLI 门禁、不替代 `docpath check` 的权威性。；AC-6: 里程碑可交付**：拆分到「一次验证能验收」的粒度，M0 必须能证明链路通（插件可加载 + 侧边栏可见真实状态）。；AC-7: 本次为**设计交付**，不产出可运行代码；设计经用户确认后再进入实现。；AC-8: - [ ] AC-9: 生成的 spec 可直接进入 `docpath plan`；AC-10: backlog 条目 R-328 与任务 T-20260911-dsh-plugin-docpath-dsh-tab-docpath 建立双向关联
- **验收条件**: AC-1: 设计文档产出**：`.docpath/tasks/<task>/` 下产出完整设计，覆盖 —— 分层架构（host/client/kernel）、数据契约（每个 Tab 消费哪些文件、字段、兜底策略）、侧边栏 Tab 版式、里程碑拆分、风险与不做的事。；AC-2: 架构合规**：分层遵循 DSH 插件开发预设——`host` 只做文件 IO 与 `ctx.provide` 桥、`kernel` 是零 IO 纯函数且可单测、`client` 只做 UI 渲染；明确写出 cordis 三项契约检查（client.inject 声明 / cordis.patch.yml / host.provide 桥）的落地方式。；AC-3: 数据契约可验证**：每个 Tab 的数据来源必须标注到具体文件路径与字段，并给出 `schema_version` 不匹配或文件缺失时的降级策略；不得凭空设计未实测过的字段。；AC-4: 性能约束明确**：直读 JSON（不起子进程拉 CLI），首屏数据 < 200ms；`docs-index.json` 必须给出减载方案（实测去 `content_terms` 后 1026KB→390KB），不得整包传输。；AC-5: 只读边界**：设计明确插件为只读可观测，不写 `.docpath/`、不绕过 CLI 门禁、不替代 `docpath check` 的权威性。；AC-6: 里程碑可交付**：拆分到「一次验证能验收」的粒度，M0 必须能证明链路通（插件可加载 + 侧边栏可见真实状态）。；AC-7: 本次为**设计交付**，不产出可运行代码；设计经用户确认后再进入实现。；AC-8: - [ ] AC-9: 生成的 spec 可直接进入 `docpath plan`；AC-10: backlog 条目 R-328 与任务 T-20260911-dsh-plugin-docpath-dsh-tab-docpath 建立双向关联
- **依赖**: S2

## Checklist
- [ ] S1
- [ ] S2
- [ ] S3

## 依赖关系图
S1 → S2 → S3
