# Workflow: Refactor

> 重构流程 (不改变外部行为)

## 阶段

### 1. Assess (评估)
- 识别重构范围
- 确认测试覆盖度

### 2. Plan
```bash
docpath plan
```
- 小步重构计划

### 3. Execute
```bash
docpath go
docpath continue
```
- 每步重构后运行测试
- 保持绿灯

### 4. Review
```bash
docpath diff
docpath review
```
- 对比前后行为一致性

### 5. Done
```bash
docpath done
```
