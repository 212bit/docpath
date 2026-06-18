## 1. 用户价值与成功指标

用户价值：降低首次使用 DocPath 的理解成本，让用户在初始化阶段就知道项目识别结果、复杂度级别含义、是否安装 Agent 协议，以及下一步如何创建并推进任务。

成功指标：
- 新用户可按 getting started 在 5 分钟内完成 init、backlog add、promote/plan/go 的最小路径。
- `init --interactive` 的输出不要求阅读 README 即可理解下一步。
- 初始化相关失败输出包含明确修复命令。
- 现有 `init --level`、`init --link`、`init` 已存在项目路径行为保持兼容。

## 2. 核心用户旅程

1. 用户在项目根目录运行 `docpath init --interactive`。
2. CLI 检测项目类型、框架、语言并展示摘要。
3. 用户确认或选择复杂度 level。
4. 如果 `.docpath` 已存在，CLI 解释现状并询问是否只注册项目或强制重建。
5. CLI 初始化目录并输出下一步：`docpath status --agent`、`docpath backlog add`、可选 `docpath install --target codex`。
6. 用户打开 getting started 文档，按示例创建第一个任务。

## 3. 业务规则与运营约束

- interactive 是产品化增强，不替代非交互命令。
- 对覆盖型操作从严：已有 `.docpath` 时默认不覆盖，除非用户明确选择。
- Agent 协议安装可能写入项目协议文件，interactive 可以提示建议但 MVP 可以只打印后续命令，避免把 init 和 install 的写边界合并过大。
- 文档示例必须遵循当前项目推荐路径：backlog -> accept/promote -> analyze/spec/plan/go/check/review/journal。

## 4. 竞品/替代方案与取舍

- 方案 A：只写 getting started，不加 interactive。成本低，但不能解决初始化当场的决策负担。
- 方案 B：`docpath init --interactive` 只做 level 选择和下一步提示。MVP 推荐，范围小且可测试。
- 方案 C：全局 wizard 覆盖 backlog/spec/plan。体验完整但范围过大，会触碰工作流状态机。

推荐 MVP 采用 B，并补充 getting started。

## 5. 发布策略与灰度/回滚

发布策略：以追加参数方式发布，默认行为不变；文档标记 interactive 为推荐给新用户的路径。

回滚方式：移除/隐藏 `--interactive` 参数或让其转为打印非交互命令建议；普通 `init` 不受影响。
