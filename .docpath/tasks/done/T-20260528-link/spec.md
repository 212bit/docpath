# T-20260528-link: docpath init --link 关联项目功能

## 目标
支持 `docpath init --link <path>` 命令，允许当前项目关联另一个项目的 `.docpath/` 目录。

## 用例
1. Monorepo 场景：frontend/ 和 backend/ 共享同一个 DocPath 状态
2. 微服务场景：多个服务共享同一个工作流状态
3. 代码库拆分：将一个大项目的 DocPath 状态迁移到新项目

## 设计约束
- 不复制 .docpath/ 目录，而是创建引用/链接
- 支持相对路径和绝对路径
- 链接后，当前项目的 DocPath 命令应透明访问目标项目的 .docpath/
- 支持解除链接 (`docpath unlink`)

## 验收标准
- [ ] `docpath init --link ../other-project` 创建链接
- [ ] `docpath status` 显示链接状态
- [ ] `docpath unlink` 解除链接
- [ ] 链接后，所有 DocPath 命令正常工作
