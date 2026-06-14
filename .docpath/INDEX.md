# DocPath 文档索引

> **此文件为唯一入口索引。docs.md 为历史遗留，已废弃。**
>
> **索引优先原则**: 不要尝试一次性读取所有文档。优先读 context-index trunk,按需调用 reveal 展开。

---

## 核心文档 (Agent 必读)

### 状态机
- **workspace/current.md** — 当前任务状态摘要
- **workspace/state.json** — 状态机原始数据
- **workspace/breadcrumb.md** — 执行历史面包屑

### 任务上下文
- **tasks/current/spec.md** — 任务规约
- **tasks/current/plan.md** — 执行计划
- **tasks/current/context-index.json** — 任务级索引 (trunk/leaves)

### 全局规范
- **rules/architecture.md** — 架构规范
- **rules/style.md** — 代码风格

### 需求池
- **backlog/backlog.md** — 需求索引 (108 条)
- **backlog/R-*.md** — 需求条目

---

## 按主题查询 (按需展开)

使用渐进披露命令,不要直接读文件:

### 工作流文档
```bash
docpath reveal --topic workflow --level 2
```

### 命令文档
```bash
docpath reveal --topic commands --level 1
```

### 技能文档
```bash
docpath reveal --topic skills --level 2
```

### 历史任务
```bash
docpath reveal --task-id T-20260612-cli --level 2
```

### 决策历史
```bash
docpath reveal --topic decisions --level 1
# 注意: decisions.md 很大,优先读索引
```

---

## 渐进披露工具

### status --agent
输出 context-index trunk/leaves 摘要:
```bash
docpath status --agent
```

**输出包含**:
- context_index_trunk: 目标/范围/验收 (稳定,必读)
- context_index_leaves: plan/breadcrumb/evidence (动态,索引)
- 推荐的下一步命令

### reveal (按主题展开)
```bash
docpath reveal --topic <keyword> --level <0-3>
```

**level 说明**:
- 0: micro (只标题)
- 1: brief (摘要)
- 2: standard (标准,推荐)
- 3: full (全量)

**示例**:
```bash
# 查看 plan 当前步骤
docpath reveal --topic plan --level 2

# 查看架构规范
docpath reveal --topic architecture --level 2

# 查看最近的 check 结果
docpath reveal --topic check --level 1
```

### context (智能预算)
```bash
docpath context --max-tokens 5000 --topic <keyword>
```

**智能预算分配**:优先级排序后,在 token 预算内展开最相关的文档。

---

## 文档分层说明

### Trunk (稳定,不常变)
- 任务目标、范围、验收标准
- 架构决策、关键约束
- **Agent 每次 enter 必读**

### Leaves (动态,执行中变化)
- plan 进度、breadcrumb 历史
- check/review 结果
- **按需展开,优先读索引**

### Archive (历史归档)
- tasks/done/ (已完成任务)
- decisions-YYYY-MM.md (历史决策)
- **需要时显式查询,不默认加载**

---

## 避免事项

❌ **不要** 直接读取 docs-index.json (322KB, 401 条,机器内部用)  
❌ **不要** 一次性读 tasks/done/ 全部归档  
❌ **不要** 加载完整 decisions.md (230KB, 用 reveal --topic decisions)  
❌ **不要** 读取 backlog/ 全部 108 个条目 (用 backlog.md 索引)

✅ **应该** 优先读 context-index trunk  
✅ **应该** 按需调用 reveal/context 展开  
✅ **应该** 信任 status --agent 的路由推荐

---

## 更新记录

- 2026-06-13: 创建,替代自动生成的 docs.md
