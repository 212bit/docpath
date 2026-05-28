# DocPath Harness Rules

## Pre-flight

### 关键文件读取
- [ ] 读取 current.md 确认当前状态
- [ ] 读取 plan.md 确认任务分解
- [ ] 读取 spec/README.md 确认规范文档

### 环境检查
- [ ] 确认 Node.js 版本 >= 18
- [ ] 确认 TypeScript 已安装

## Boundary

### 文件路径
- ✅ ALLOW: src/**/*.ts
- ✅ ALLOW: .docpath/**/*.md
- ❌ DENY: node_modules/**
- ❌ DENY: dist/** (由构建工具管理)
- ❌ DENY: .git/**

### 命令执行
- ✅ ALLOW: npm run build
- ✅ ALLOW: npm test
- ❌ DENY: rm -rf
- ❌ DENY: sudo

## Pattern

### 每次编辑前
1. 读取 current.md
2. 读取 plan.md
3. 执行 `docpath check --harness`

### 提交前
1. 执行 `docpath check --harness`
2. 更新 plan.md
3. 更新 current.md
4. 执行 `docpath journal`
