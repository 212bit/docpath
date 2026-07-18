# R-285 Analysis: 跨任务陈旧 skill 证据隔离与失效

## 背景与问题定义

在 DocPath 的 Code Review 流程中，`review.json` 中保存的语言级 `skill_reviews`（例如 TypeScript 语言级审查通过证据）是工作区级持久的。
当上一任务（如 R-276，包含 6 个 TS 文件）完成后，其审查通过证据残留在 `review.json` 中。
在新任务（如 R-279，仅 2 个 TS 文件）中执行 `docpath review` 时：
1. 语言级别审查对比当前文件集（2 个 TS 文件）与证据文件集（6 个 TS 文件），检测到 `file set mismatch`。
2. 按照设计，`file set mismatch` 为了支持同任务内的增量修改，被降级为 warning，不阻断门禁（`approved=true`）。
3. 导致新任务未做实际语言级审查即可直接通过 review 门禁，形成了跨任务陈旧证据的非法复用（泄露）。

## 解决方案

1. **绑定 task_id**：在 `ReviewEvidence` 和 `LastCheckEvidence` 结构中引入 `task_id` 属性。
2. **生成时写入**：在生成 review 证据 (`writeReviewEvidence`) 或检查证据 (`writeLastCheckEvidence`) 时，动态读取 `state.json` 中的当前 `task_id`（未处于活跃任务时默认为 `review` / `check`）并写入 JSON 及 Markdown 证据中。
3. **读取时校验与失效**：
   - 读取证据文件 (`readReviewEvidence` / `readLastCheckEvidence`) 时，解析当前的 `state.json` 获得活跃 `task_id`。
   - 如果证据文件中的 `task_id` 与当前的活跃 `task_id` 不一致，则直接将其判定为失效（返回 `null`），从而彻底杜绝跨任务证据复用。
   - 为兼容历史旧证据及测试用例中的 mock 夹具，如果 `task_id` 属性不存在（`undefined`），则不进行强制失效。

## 验证计划

1. 增加针对 task_id 隔离的端到端集成测试，修改 `state.json` 中的 `task_id` 后验证历史检查/审查证据是否正确失效返回 `null`。
2. 执行全量测试套件保证零回归。
