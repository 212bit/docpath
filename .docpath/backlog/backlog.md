# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-09-06T17:18:16.208Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-318 | P0: go --step 顺序失效重试环 — 失败率 33%(49/147)，43/49 为步骤顺序不匹配；修失败消息直送合法 step id | proposed | P0 | 2 |  |
| R-319 | P0: 会话隔离失效 — trace 最近 200 条 session 键全为 session-default，逼出 14.3% 重复确认 turn | proposed | P0 | 2 |  |
| R-259 | High-value reliability optimizations | dropped | P1 | 2 |  |
| R-316 | 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属 | proposed | P1 | 3 |  |
| R-317 | Agent token 效率修复: 门禁指引/next 输出瘦身/批量补账/check 环境分类 | active | P1 | 1 | T-20260906-agent-token-next-check |
| R-320 | P1: next --agent 状态哈希去重 — 无变化时返回单行，砍掉零信息增量确认 turn (R-317/S2 延伸) | proposed | P1 | 2 |  |
| R-230 | Design UI for DocPath workflow dashboard | dropped | P2 | 2 | T-20260621-design-ui-for-docpath-workflow-dashboard |
| R-292 | plan 命令写盘先于 FSM 校验, completed 任务 plan.json 被改写后才报非法转移 | dropped | P2 | 2 |  |
| R-296 | R-293 残余: stale 夺锁的判定-执行 TOCTOU, rename 可误夺判定后新获取的活锁(全量套件 4/5 实测) | dropped | P2 | 2 |  |
| R-312 | 非 force install 静默跳过差异文件仍输出完成庆祝, 无跳过清单 (SynapBuddy 实测: 三份陈旧协议副本被掩盖) | dropped | P2 | 2 |  |
| R-315 | 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中) | proposed | P2 | 2 |  |
| R-249 | go/promote 的 dirty worktree 拒绝未区分 DocPath 自身产物，频繁误拦 | dropped | P3 | 1 |  |
| R-306 | 比例刻度加陡: level-1 任务 S 步骤仪式压缩 (评估: 虚构仪式占三四成) | dropped | P3 | 2 |  |
| R-307 | 小 diff skill 证据豁免/自动化 (评估: 证据动作一半是仪式) | dropped | P3 | 2 |  |
| R-308 | 三处重复记录收敛: note/commit/journal 单一来源化 | dropped | P3 | 2 |  |
| R-309 | lease/handoff 层数据裁决式去留 (评估: 24 任务零使用恒空) | dropped | P3 | 2 |  |
| R-310 | quick 通道可发现性: next/promote 主动建议轻量路径 | dropped | P3 | 2 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中
