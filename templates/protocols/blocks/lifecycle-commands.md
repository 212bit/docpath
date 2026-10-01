```bash
# Core 3+1 Loop (日常高频核心闭环):
docpath quick "Fix typo in docs"   # 极简: < 50 行微小改动单行直达 (post-hoc: --adopt)
docpath start "<title>" --draft    # 起手: 1-shot 任务拉起 (promote + plan + go S1)
docpath go --step S1               # 推进: 认领或切换到指定步骤
docpath step-pass --commit         # 步骤收尾 + 终步自动收口提交 (或 step-pass 接力推进)
docpath done --commit              # 复合收口: 1-shot 执行全量门禁 (check -> review -> journal -> commit)

# Advanced / Transitions (辅助与任务调度):
docpath step-skip S2 --reason ".." # 步骤跳过/废弃记录
docpath task stash "WIP msg"       # 暂存当前任务状态与代码变更 (pop 恢复 / switch 切换)
docpath arch check                 # 架构分层防腐检查
docpath gc                         # 工作区历史任务清理
```
