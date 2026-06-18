## Journal Record

### 📝 任务摘要
将 UI 设计门禁从 check 阶段的事后正则检测，前移为 go 进入执行前的硬门禁，并补齐 S5 回归测试，闭合 go/check 共享判定的单一真源。

### 🏗️ 架构决策
- go 前置门禁与 check 共用 src/utils/ui-gate.ts：避免两处判定标准漂移；判定优先级为 spec 4.1 显式勾选框 > 关键词回退（向后兼容老 spec）。
- 不设绕过 flag：合法「无需设计」走 spec「不涉及产品 UI」框，留痕可审计，而非加 --skip。
- ui-gate.ts 加入 tsup build 入口独立产出 dist/utils/ui-gate.js：作为 go/check 共享 util，与 doc-parser/payload 等同级，否则被内联进 chunk 后测试无法 import。
- 测试 CLI 路径用 new URL('../dist/index.js', import.meta.url) 相对解析，不硬编码绝对路径（review 强制）。

### 💡 经验教训
- 「grep 到符号」不等于「行为正确」：S3 门禁的正确性只能靠端到端跑 go、断言 exit 1 + breadcrumb 未写入来验证，符号存在性探针会误判。
- 照抄既有测试可能继承其缺陷：go-auto-next.test.mjs 的硬编码路径被 review 拦下，payload-context-index.test.mjs 的相对解析才是正解。
- 完成闭环时遇到的两处状态机摩擦（current/canonical spec.md 缺失漂移、review_fail 后 check.passed 非法转移）都需手动介入修复，印证状态机当前不自愈。

### 🔮 后续改进
- write-spec/agent step 写文件时应同时回写 canonical，避免 spec.md 只落 current 造成 drift。
- 状态机应允许 reviewing→checking 的合法回退，或在 check 通过后自动纠正 phase，减少手动跑 review 解卡。
