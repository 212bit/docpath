# Workflow: Debug

> 调试/排查流程

## 阶段

### 1. Observe (观察)
- 收集症状 (日志、指标、复现步骤)
- 明确期望 vs 实际

### 2. Hypothesize (假设)
```bash
docpath journal "假设 1: ..."
```
- 提出可能原因

### 3. Test (验证)
```bash
docpath go
docpath continue
```
- 逐一排除假设

### 4. Fix (修复)
- 实施修复
- 验证修复

### 5. Done
```bash
docpath done
```
