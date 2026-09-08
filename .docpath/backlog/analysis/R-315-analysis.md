# R-315 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions

## 1. 分析与裁决结论

### 1.1 命令清理清单 (零使用 & 无内部耦合)
1. **`onboard`** (399 LOC): 交互式入门向导，Agent 侧由 `next --agent` 覆盖，人类用户走 README / 文档。彻底删除。
2. **`help-me`** (15 LOC): 状态相关帮助，完全被 `next --agent` 路由替代。彻底删除。
3. **`continue`** (161 LOC): 断线重连工作流，现代长会话 Agent 从不使用。彻底删除。
4. **`debug`** (109 LOC): 调试工作流编排，Agent 自主调试，从不走 CLI 步骤编排。彻底删除。
5. **`diff`** (122 LOC): 步骤间差异查看，零使用，由 git / changes 替代。彻底删除。
6. **`gc-decisions`** (39 LOC): 历史决策月轮转命令，已在 journal / gc 中统一处理，独立命令零使用。彻底删除。

### 1.2 清理范围 (六维清理)
- 实现文件: `src/commands/{onboard,help-me,continue,debug,diff,gc-decisions}.ts`
- 注册入口: `src/commands/register/*.ts`
- 元数据: `src/commands/register/command-metadata.ts`
- 协议文档: `AGENTS.md`、`templates/`
- 相关测试与路由适配
