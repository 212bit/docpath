## 执行计划

### S1: 梳理 Codex Skill 适配边界
- [x] S1: 梳理 增加 Codex Skill 适配器封装 DocPath 专家团入口
- **描述**: 根据 spec 明确 增加 Codex Skill 适配器封装 DocPath 专家团入口 的实现边界和验收口径。
- **验收条件**: spec 写明 Skill 只作为平台适配层，依赖 roles/deliverables，不新增专家团自动编排。
- **依赖**: 无

### S2: 实现 Codex Skill 安装与 health 校验
- [x] S2: 实现 Codex Skill 安装与 health 校验
- **描述**: 增加 Codex Skill 模板，接入 install manifest、默认不覆盖、check-only 漂移检测与 doctor frontmatter 校验。
- **验收条件**: `docpath install --target codex` 可安装 `.codex/skills/docpath*/SKILL.md`，并能检测缺失、漂移和 frontmatter name 错误。
- **依赖**: S1

### S3: 验证门禁并归档
- [x] S3: 验证门禁并归档
- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。
- **验收条件**: 安装测试、构建、类型检查和 DocPath 质量门禁通过，任务状态进入 completed。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
