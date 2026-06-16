## 执行计划

### S1: Phase 1 - 归档 decisions.md
- **描述**: 运行 docpath journal 触发按月归档，验证 workspace/decisions.md 按月分割生成 decisions-YYYY-MM.md
- **验收条件**: 
  - decisions-2026-06.md（或当前月）生成
  - workspace/decisions.md 保持轻量（< 50K）
  - 归档逻辑正常工作
- **依赖**: 无

### S2: Phase 1 - 清理 workspace 临时视图
- **描述**: 删除 compact-context.md, worktree-analysis.md, worktree-decision.md，保留 current.md, last-check.md, review.md
- **验收条件**:
  - 临时视图文件已删除
  - 必要视图文件保留
  - docpath render 可按需重建已删除的视图
- **依赖**: 无

### S3: Phase 2 - 创建 artifact-policy.md
- **描述**: 在 docs/workflows/ 创建 artifact-policy.md，定义必需/可选文件、特殊文档触发条件、配置参数
- **验收条件**:
  - artifact-policy.md 存在
  - 包含必需文件清单（JSON 真值源）
  - 包含可选文件清单（MD 渲染视图）
  - 包含特殊文档触发条件（output-contract.md 等）
  - 包含配置参数说明
- **依赖**: S1, S2

### S4: Phase 2 - 添加配置类型定义
- **描述**: 在 src/types/ 定义 ArtifactConfig 接口，添加到 workspace config schema
- **验收条件**:
  - ArtifactConfig 接口定义完整
  - 包含 generate_md_views: boolean 字段
  - 默认值为 false
  - 类型系统验证通过
- **依赖**: S3

### S5: Phase 2 - 修改 writeStructuredTaskJson 支持配置
- **描述**: 修改 src/utils/structured-docs.ts 的 writeStructuredTaskJson，读取配置，条件化生成 .md 文件
- **验收条件**:
  - 函数读取 artifacts.generate_md_views 配置
  - 当配置为 false 时，只写 .json，不写 .md
  - 当配置为 true 时，保持现有行为
  - 已存在 .md 文件不报错（向后兼容）
- **依赖**: S4

### S6: Phase 2 - 添加测试覆盖
- **描述**: 为配置开关、按需渲染、向后兼容添加单元测试
- **验收条件**:
  - 测试覆盖：generate_md_views=false 不生成 MD
  - 测试覆盖：docpath render 从 JSON 正确生成 MD
  - 测试覆盖：已存在 MD 时不报错
  - 所有测试通过
- **依赖**: S5

### S7: Phase 2 - 运行 check 和 review
- **描述**: 运行 docpath check 和 docpath review 验证质量门禁
- **验收条件**:
  - check 通过所有检查项
  - review 通过或只有可接受的警告
  - 无破坏性变更
- **依赖**: S6

## Checklist
- [x] S1: Phase 1 - 归档 decisions.md
- [x] S2: Phase 1 - 清理 workspace 临时视图
- [x] S3: Phase 2 - 创建 artifact-policy.md
- [x] S4: Phase 2 - 添加配置类型定义
- [x] S5: Phase 2 - 修改 writeStructuredTaskJson 支持配置
- [x] S6: Phase 2 - 添加测试覆盖
- [x] S7: Phase 2 - 运行 check 和 review

## 依赖关系图
S1 → S3
S2 → S3
S3 → S4 → S5 → S6 → S7

