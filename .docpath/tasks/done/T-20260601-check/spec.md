# T-20260601-check - check 结构校验报错显示实际文件路径与定位

> backlog_id: R-040
> backlog_source: dogfood: 使用 DocPath 开发 R-039 时发现

## 1. 背景与动机

## 背景

- 开发 R-039 时，`docpath check` 报结构校验失败但没有清晰标出实际读取文件路径与定位。
- 用户容易误判应修改 `.docpath/tasks/<id>/*` 还是 `.docpath/tasks/current/*`。

## 验收

- 结构校验失败时输出实际检查的文件路径。
- 对缺失章节、缺失 FR/AC、缺失步骤字段等错误给出足够定位信息。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath check` 的结构校验失败信息必须显示实际检查的文件路径。
- [ ] FR-2: spec 缺失章节、缺失 FR/AC 时必须显示章节或字段定位。
- [ ] FR-3: plan 缺失步骤字段时必须显示步骤编号、字段名和可用行号。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- check 结构校验报错显示实际文件路径与定位
- write-spec / write-plan 结构校验失败输出同样显示实际目标路径与定位

### 不包含
- tasks/current 与任务目录漂移自动同步

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 结构校验范围 | 全部任务 / Level 2+ | Level 2+ | 保持轻量任务兼容，同时强化标准任务门禁 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-040 与任务 T-20260601-check 建立双向关联
- [ ] AC-3: 结构校验失败输出包含 `.docpath/tasks/current/*` 或目标任务目录的实际路径
- [ ] AC-4: 缺失 FR/AC、缺失 plan 字段的错误包含章节/字段定位

---

*此文件由 `docpath backlog promote` 生成。*
