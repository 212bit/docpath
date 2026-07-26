# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-07-26T19:55:35.538Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-259 | High-value reliability optimizations | dropped | P1 | 2 |  |
| R-230 | Design UI for DocPath workflow dashboard | dropped | P2 | 2 | T-20260621-design-ui-for-docpath-workflow-dashboard |
| R-292 | plan 命令写盘先于 FSM 校验, completed 任务 plan.json 被改写后才报非法转移 | dropped | P2 | 2 |  |
| R-296 | R-293 残余: stale 夺锁的判定-执行 TOCTOU, rename 可误夺判定后新获取的活锁(全量套件 4/5 实测) | dropped | P2 | 2 |  |
| R-311 | install --check 不读安装元数据 target 默认 universal, 非 universal 项目产生跨 target 假漂移 (SynapBuddy 实测) | proposed | P2 | 1 |  |
| R-312 | 非 force install 静默跳过差异文件仍输出完成庆祝, 无跳过清单 (SynapBuddy 实测: 三份陈旧协议副本被掩盖) | proposed | P2 | 2 |  |
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
