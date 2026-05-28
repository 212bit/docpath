# Workflow: Feature Development

> 新功能开发标准流程

## 阶段

### 1. Brainstorm (头脑风暴)
```bash
docpath brainstorm "功能描述"
```
- 产出: brainstorm.md
- 目标: 明确需求边界、技术方案

### 2. Plan (计划)
```bash
docpath plan
```
- 产出: plan.md (含 DAG 依赖图)
- 目标: 分解步骤、识别依赖

### 3. Execute (执行)
```bash
docpath go         # 执行当前步骤
docpath continue   # 完成后推进
```
- 每步: 实现 → 测试 → 提交
- 产出: 实现代码

### 4. Review (审查)
```bash
docpath check      # 自动检查
docpath review     # 变更摘要
```
- 产出: review.md
- 目标: 质量保证

### 5. Done (收尾)
```bash
docpath done
```
- 更新状态为 done
- 归档任务
