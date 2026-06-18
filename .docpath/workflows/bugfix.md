# Workflow: Bug Fix

> 缺陷修复流程

## 阶段

### 1. Reproduce (复现)
- 收集错误信息 (日志、截图、复现步骤)
- 明确影响范围

### 2. Diagnose (诊断)
```bash
docpath debug
```
- 产出: debug-notes.md
- 定位根因

### 3. Fix (修复)
```bash
docpath go
```
- 最小化修改
- 修复 + 测试用例

### 4. Verify (验证)
```bash
docpath check
docpath review
```
- 确认修复 + 无回归

### 5. Done
```bash
docpath done
```
