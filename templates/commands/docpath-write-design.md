# /docpath-write-design — 写入 UI/UX 设计证据

## 用途
为 UI/UX、dashboard、page、layout、navigation、visual、responsive、Figma、Stitch、v0、Framer 等界面任务写入当前任务的设计证据。

强约束流程：

```text
UI Prompt Brief
→ External Design Handoff
→ Design Preview
→ Design Approval
→ Implementation
→ Visual Acceptance
```

用户同意采用这套流程，不等于批准某个具体视觉方案。只有 `design-approval.md` 中 `approval.state: approved`，并记录批准来源、批准时间、批准说明与禁止方向后，才允许进入产品 UI 实现。

## 命令
```bash
if [ -x ./.docpath/bin/docpath ]; then
  ./.docpath/bin/docpath write-design $ARGUMENTS
elif command -v docpath >/dev/null 2>&1; then
  docpath write-design $ARGUMENTS
elif [ -x ./node_modules/.bin/docpath ]; then
  ./node_modules/.bin/docpath write-design $ARGUMENTS
elif [ -f ./bin/docpath.js ]; then
  node ./bin/docpath.js write-design $ARGUMENTS
elif [ -f ./dist/index.js ]; then
  node ./dist/index.js write-design $ARGUMENTS
else
  echo "DocPath CLI not found. Install it or run from the DocPath project root."
  exit 127
fi
```

## kind
- `brief` / `ui-brief` / `ui-prompt-brief`: 写入 `ui-brief.md`。
- `handoff` / `external-design-handoff` / `design-handoff`: 写入 `external-design-handoff.md`。
- `preview` / `design-preview`: 写入 `design-preview.md`。
- `approval` / `design-approval`: 写入 `design-approval.md`。
- `acceptance` / `visual-acceptance`: 写入 `visual-acceptance.md`。

## 推荐顺序
```bash
docpath write-design --kind brief --stdin
docpath write-design --kind handoff --stdin
docpath write-design --kind preview --stdin
docpath write-design --kind approval --stdin
docpath write-design --kind acceptance --stdin
```

## 外部设计工具交接
`external-design-handoff.md` 应记录 Stitch、Figma、v0、Framer 或其他设计工具的 prompt、输出链接或快照、选定方向、拒绝方向和实现约束。没有外部工具时，也要记录等价的设计输入、候选方向和拒绝方向，避免实现阶段只凭口头偏好编码。

## Check Gate
`docpath check` 会在 UI/UX 任务存在实现步骤或产品 UI 文件改动时检查：

- `ui-brief.md`
- `external-design-handoff.md`
- `design-preview.md`
- `visual-acceptance.md`
- `design-approval.md`，且 `approval.state` 必须是 `approved`

approval 为 `pending`、`rejected`、缺少批准来源、缺少批准时间或缺少禁止方向时，必须停止实现并请求用户审批具体视觉方案。
