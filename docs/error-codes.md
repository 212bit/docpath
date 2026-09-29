---
related:
  - getting-started.md
  - design/command-boundaries.md
---

# DocPath 错误码参考

本文档列出所有 DocPath 错误码及其含义、原因和解决方案。

## 错误码结构

- **E001-E099**: 初始化和配置错误
- **E100-E199**: 任务和工作流错误
- **E200-E299**: 文件和数据错误
- **E300-E399**: Git 和版本控制错误
- **E400-E499**: 系统和权限错误

## 退出码

- **0**: 成功
- **1**: 用户错误（参数错误、工作流状态不对）
- **2**: 系统错误（文件 I/O、权限问题）
- **3**: 配置错误（schema 不匹配、配置文件损坏）

## DEBUG 模式

设置环境变量 `DOCPATH_DEBUG=1` 可查看详细错误堆栈和调试信息：

```bash
DOCPATH_DEBUG=1 docpath <command>
```

---

## 错误目录

### E001: 未找到 .docpath/ 目录

**原因**:
- 当前目录未初始化 DocPath

**解决方案**:
1. 运行 docpath init 初始化项目
2. 或 cd 到已初始化的 DocPath 项目目录

**退出码**: 1 (用户错误)

---

### E002: 未知命令

**原因**:
- 命令拼写错误
- 命令不存在

**解决方案**:
1. 运行 docpath --help 查看所有可用命令
2. 运行 docpath help advanced 查看高级命令

**退出码**: 1 (用户错误)

---

### E003: 当前没有活跃任务

**原因**:
- state.json 中 task_id 为空
- 任务已完成或被重置

**解决方案**:
1. 创建新任务：docpath backlog capture --title "任务标题"
2. 恢复现有任务：docpath backlog promote R-xxx
3. 查看所有任务：docpath backlog list

**退出码**: 1 (用户错误)

---

### E004: 未找到 plan.md

**原因**:
- 任务尚未生成执行计划
- plan.md 文件被删除

**解决方案**:
1. 运行 docpath plan 生成执行计划
2. 或运行 docpath next --agent 查看推荐命令

**退出码**: 1 (用户错误)

---

### E005: 未找到 spec.md

**原因**:
- 任务尚未编写需求规格
- spec.md 文件被删除

**解决方案**:
1. 运行 docpath brainstorm 澄清需求
2. 运行 docpath write-spec 写入需求规格

**退出码**: 1 (用户错误)

---

### E006: Git worktree 存在未提交变更

**原因**:
- 有未暂存或未提交的文件
- 工作区不干净

**解决方案**:
1. 运行 docpath changes --agent 查看变更详情
2. 提交变更：git add . && git commit
3. 或创建隔离 worktree：docpath worktree create <name>

**退出码**: 1 (用户错误)

---

### E007: 参数缺失或格式错误

**原因**:
- 必需参数未提供
- 参数值不符合预期格式

**解决方案**:
1. 运行 docpath <command> --help 查看用法
2. 检查参数拼写和格式

**退出码**: 1 (用户错误)

---

### E008: 文件读取失败

**原因**:
- 文件不存在
- 权限不足
- 文件损坏

**解决方案**:
1. 检查文件路径是否正确
2. 检查文件权限：ls -la <path>
3. 如果文件损坏，从备份恢复或重新生成

**退出码**: 2 (系统错误)

---

### E009: JSON 解析失败

**原因**:
- JSON 格式错误
- 文件编码问题
- 文件损坏

**解决方案**:
1. 运行 cat <file> | jq 验证 JSON 格式
2. 检查文件是否被手动编辑破坏
3. 从 Git 历史恢复：git checkout HEAD -- <file>

**退出码**: 3 (配置错误)

---

### E010: Schema 校验失败

**原因**:
- 数据结构不符合预期
- 必需字段缺失
- 字段类型错误

**解决方案**:
1. 运行 docpath check 查看详细校验错误
2. 参考文档修正数据格式
3. 或运行 docpath install --force 更新 schema

**退出码**: 3 (配置错误)

---

### E011: 命令执行失败

**原因**:
- 子进程异常退出
- 命令不存在
- 权限不足

**解决方案**:
1. 运行 DOCPATH_DEBUG=1 docpath ... 查看详细错误
2. 检查系统是否安装了所需命令
3. 检查文件权限和可执行位

**退出码**: 2 (系统错误)

---

### E012: 锁文件冲突

**原因**:
- 另一个 DocPath 进程正在运行
- 上次进程异常退出未释放锁

**解决方案**:
1. 等待其他进程完成
2. 如果确认没有其他进程，删除锁文件：rm .docpath/.lock
3. 运行 ps aux | grep docpath 检查残留进程

**退出码**: 2 (系统错误)

---

### E013: Task ID 漂移

**原因**:
- spec.md 首行与 state.json 不一致
- 手动编辑破坏了一致性

**解决方案**:
1. 运行 docpath check 查看漂移详情
2. 运行 docpath next --auto-fix canonical 自动修复
3. 或手动对齐 spec.md 首行和 state.json 中的 task_id

**退出码**: 3 (配置错误)

---

### E014: Plan 与 Breadcrumb 不一致

**原因**:
- 步骤标记完成但 plan 未勾选
- plan 勾选但 breadcrumb 无记录

**解决方案**:
1. 运行 docpath check 查看不一致详情
2. 手动对齐 plan.md checklist 和 breadcrumb 记录
3. 或运行 docpath agent step --step <id> --status done 补充记录

**退出码**: 3 (配置错误)

---

### E015: Git 安全检查失败

**原因**:
- 尝试提交到保护分支
- 检测到潜在的破坏性操作

**解决方案**:
1. 切换到功能分支：git checkout -b feature/<name>
2. 运行 docpath changes --agent 确认提交范围
3. 如果确认安全，使用 --force 标志（谨慎）

**退出码**: 1 (用户错误)

---

### E016: UI 设计门禁未通过

**原因**:
- 检测到 UI 修改但未完成设计审批
- 缺少 design-approval 证据

**解决方案**:
1. 编写设计 brief：docpath write-design --brief
2. 生成设计预览：docpath write-design --preview
3. 获得审批后标记完成：docpath write-design --approval

**退出码**: 1 (用户错误)

---

### E017: Check 检查失败

**原因**:
- 代码质量不达标
- 测试未通过
- 必需文件缺失

**解决方案**:
1. 运行 docpath check 查看失败详情
2. 修复检查项后重新运行
3. 运行 pnpm run typecheck 和 pnpm test 本地验证

**退出码**: 1 (用户错误)

---

### E018: Review 未通过

**原因**:
- 代码审查发现问题
- 安全审查未通过

**解决方案**:
1. 运行 docpath review 查看审查意见
2. 修复审查意见后重新提交审查
3. 与审查者沟通确认问题

**退出码**: 1 (用户错误)

---

### E019: 权限不足

**原因**:
- 文件或目录权限不足
- 需要 root 权限

**解决方案**:
1. 检查文件权限：ls -la <path>
2. 修改权限：chmod +rw <path>
3. 使用 sudo 运行（如果需要）

**退出码**: 2 (系统错误)

---

### E020: 磁盘空间不足

**原因**:
- 磁盘已满或接近满
- 大文件占用空间

**解决方案**:
1. 检查磁盘使用：df -h
2. 清理不需要的文件
3. 运行 docpath gc --force 清理旧数据

**退出码**: 2 (系统错误)

---

## 贡献

如果遇到新的错误场景，欢迎提交 issue 或 PR 补充到错误目录中。

## 相关文档

- [DocPath 用户指南](../README.md)
- [快速上手指南](./getting-started.md)
- [产品全景图](./product-panorama.md)
