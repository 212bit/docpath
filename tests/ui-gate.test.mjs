/**
 * ui-gate 单元判定测试（plan.md S5：ui-gate 单元判定覆盖）。
 *
 * 覆盖 go 与 check 共享的判定真源 src/utils/ui-gate.ts：
 * - parseExplicitUiDeclaration: spec 4.1 显式框 → required / exempt / unknown，同勾从严
 * - resolveUiDesignRequirement: 显式框优先；未勾选时只有明确设计意图触发 required；
 *   workflow-only（讲门禁/模板但声明不做产品 UI）回退为 exempt
 * - approvalState: frontmatter 嵌套 / 直写 state / markdown 行三种解析
 * - missingDesignArtifacts: design-preview 缺失、approval 未 approved 的产物缺口
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {
  parseExplicitUiDeclaration,
  resolveUiDesignRequirement,
  approvalState,
  missingDesignArtifacts,
  missingFrameworkDecision,
  missingDesignPreviewDepth,
} = await import(new URL('../dist/utils/ui-gate.js', import.meta.url).href);

// 一份 8 维度齐全、全部填具体值的合格设计稿。
const FULL_PREVIEW = [
  '# Design Preview',
  '## 1. 布局与栅格',
  '栅格 12 列，gutter 24px，断点 640px / 1024px；区域 Header / Sidebar / Main。',
  '## 2. 尺寸规格',
  'Header 高 64px；Sidebar 宽 240px；主按钮 高 40px。',
  '## 3. 间距标度',
  '标度（base 4px）: 4px / 8px / 16px / 24px / 32px。',
  '## 4. 图标系统',
  '图标库 lucide，默认 24px，描边 1.5px；新增=plus，删除=trash。',
  '## 5. 颜色与 Tokens',
  '--bg #FFFFFF；--text #1A1D23；--primary #2563EB；--error #DC2626。',
  '## 6. 动效规格',
  '时长 fast 120ms / base 200ms；缓动 cubic-bezier(0.16, 1, 0.3, 1)。',
  '## 7. 交互逻辑',
  '主操作 hover 高亮，focus 焦点环 2px，loading 占位，error 行内提示。',
  '## 8. 技术约束',
  '绑定 frontend-stack；对比度 ≥ 4.5:1；首屏预算 150KB；支持最近两版浏览器。',
].join('\n');

// spec 4.1 模板里的两行原文，确保测试与真实模板措辞对齐。
const EXEMPT_LINE = '- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）';
const REQUIRED_LINE = '- [x] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）';
const UNCHECKED = [
  '- [ ] 本任务不涉及产品 UI 实现（豁免设计五件套）',
  '- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）',
].join('\n');

describe('parseExplicitUiDeclaration', () => {
  it('勾选「涉及产品 UI」→ required', () => {
    assert.equal(parseExplicitUiDeclaration(`## 4.2 UI 设计门禁\n${REQUIRED_LINE}`), 'required');
  });

  it('勾选「不涉及产品 UI」→ exempt', () => {
    assert.equal(parseExplicitUiDeclaration(`## 4.2 UI 设计门禁\n${EXEMPT_LINE}`), 'exempt');
  });

  it('两框都未勾 → unknown', () => {
    assert.equal(parseExplicitUiDeclaration(`## 4.2 UI 设计门禁\n${UNCHECKED}`), 'unknown');
  });

  it('两框同时勾选 → 从严判 required（不放行）', () => {
    assert.equal(parseExplicitUiDeclaration(`${EXEMPT_LINE}\n${REQUIRED_LINE}`), 'required');
  });

  it('「不涉及」是「涉及」的超串，勾「不涉及」不得误命中 required', () => {
    // 仅勾选 exempt 行，结果必须是 exempt 而非 required。
    assert.equal(parseExplicitUiDeclaration(EXEMPT_LINE), 'exempt');
  });
});

describe('approvalState', () => {
  it('frontmatter 嵌套 approval.state', () => {
    const content = ['---', 'approval:', '  state: approved', '---', '正文'].join('\n');
    assert.equal(approvalState(content), 'approved');
  });

  it('直写 state 字段', () => {
    assert.equal(approvalState('state: pending\n其它'), 'pending');
  });

  it('markdown 行 - State:', () => {
    assert.equal(approvalState('# 批准\n- State: Approved\n'), 'approved');
  });

  it('无任何状态标记 → missing', () => {
    assert.equal(approvalState('# 一份没有状态字段的文档\n正文'), 'missing');
  });
});

describe('resolveUiDesignRequirement（端到端：读 spec/plan 文本）', () => {
  let root, tasks;
  const writeSpec = (specBody) => writeFileSync(join(tasks, 'spec.md'), specBody);

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'dp-uigate-'));
    const workspace = join(root, '.docpath', 'workspace');
    tasks = join(root, '.docpath', 'tasks', 'current');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(tasks, { recursive: true });
    writeFileSync(join(workspace, 'state.json'), JSON.stringify({
      level: 2, task_id: 'T-UIGATE', task_title: '判定测试',
      phase: 'executing', gate: 'none', state: 'executing', current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z',
    }));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('显式勾「涉及」→ required（优先于关键词）', async () => {
    writeSpec(`# T-UIGATE - 判定\n## 4.2 UI 设计门禁\n${REQUIRED_LINE}`);
    assert.equal(await resolveUiDesignRequirement(root), 'required');
  });

  it('显式勾「不涉及」→ exempt（即使正文含 UI 关键词也优先豁免）', async () => {
    writeSpec(`# T-UIGATE - 页面重构 layout visual\n## 4.2 UI 设计门禁\n${EXEMPT_LINE}`);
    assert.equal(await resolveUiDesignRequirement(root), 'exempt');
  });

  it('未勾选 + 泛 UI/前端关键词 → exempt（不自动触发设计门禁）', async () => {
    writeSpec('# T-UIGATE - 页面重构\n## 背景\n本任务重做 page layout、navigation、dashboard CSS 与 frontend component。');
    assert.equal(await resolveUiDesignRequirement(root), 'exempt');
  });

  it('未勾选 + 明确设计意图 → required（显式 opt-in 回退）', async () => {
    writeSpec('# T-UIGATE - 视觉方案\n## 背景\n先设计 UI 设计稿，输出 Figma / design-preview 并完成设计审批。');
    assert.equal(await resolveUiDesignRequirement(root), 'required');
  });

  it('未勾选 + 无 UI 关键词 → exempt', async () => {
    writeSpec('# T-UIGATE - CLI 重构\n## 背景\n仅改后端命令解析逻辑，无界面改动。');
    assert.equal(await resolveUiDesignRequirement(root), 'exempt');
  });

  it('未勾选的 UI gate 模板本身不会触发 UI 关键词回退', async () => {
    writeSpec([
      '# T-UIGATE - Maven wrapper script',
      '## 背景',
      '仅改命令行打包脚本。',
      '## 4.1 重大变更门禁',
      '### UI 设计门禁',
      UNCHECKED,
    ].join('\n'));
    assert.equal(await resolveUiDesignRequirement(root), 'exempt');
  });

  it('未勾选 + workflow-only（讲门禁但声明不做产品 UI）→ exempt', async () => {
    writeSpec([
      '# T-UIGATE - UI 设计门禁逻辑',
      '## 背景',
      '本任务实现 check gate 与 write-design 模板流程。',
      '## 范围',
      '不包含实际产品 UI 页面实现，仅工作流与门禁逻辑。',
    ].join('\n'));
    assert.equal(await resolveUiDesignRequirement(root), 'exempt');
  });
});

describe('missingDesignArtifacts', () => {
  let root, tasks;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'dp-uigap-'));
    const workspace = join(root, '.docpath', 'workspace');
    tasks = join(root, '.docpath', 'tasks', 'current');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(tasks, { recursive: true });
    writeFileSync(join(workspace, 'state.json'), JSON.stringify({
      level: 2, task_id: 'T-UIGAP', task_title: '产物缺口',
      phase: 'executing', gate: 'none', state: 'executing', current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z',
    }));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('preview 与 approval 都缺 → missing 含两者', async () => {
    const gap = await missingDesignArtifacts(root);
    assert.ok(gap.missing.some((m) => m.includes('design-preview.md')), 'should report missing preview');
    assert.ok(gap.missing.some((m) => m.includes('design-approval.md')), 'should report missing approval');
  });

  it('preview 在、approval 未 approved → 仍缺 approval', async () => {
    writeFileSync(join(tasks, 'design-preview.md'), '# 预览\n布局/状态/响应式/边界');
    writeFileSync(join(tasks, 'design-approval.md'), '---\napproval:\n  state: pending\n---\n');
    const gap = await missingDesignArtifacts(root);
    assert.ok(!gap.missing.some((m) => m.startsWith('design-preview.md')), 'preview present');
    assert.ok(gap.missing.some((m) => m.includes('approval')), 'approval not approved → still missing');
    assert.equal(gap.approval, 'pending');
  });

  it('preview 在、approval=approved → 无缺口', async () => {
    writeFileSync(join(tasks, 'design-preview.md'), '# 预览\n布局/状态/响应式/边界');
    writeFileSync(join(tasks, 'design-approval.md'), '---\napproval:\n  state: approved\n---\n');
    const gap = await missingDesignArtifacts(root);
    assert.equal(gap.missing.length, 0, 'no gap when approved');
    assert.equal(gap.approval, 'approved');
  });
});

describe('missingFrameworkDecision', () => {
  let root, tasks;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'dp-framework-gap-'));
    const workspace = join(root, '.docpath', 'workspace');
    tasks = join(root, '.docpath', 'tasks', 'current');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(tasks, { recursive: true });
    writeFileSync(join(workspace, 'state.json'), JSON.stringify({
      level: 2, task_id: 'T-FRAMEWORK', task_title: '框架决策缺口',
      phase: 'executing', gate: 'none', state: 'executing', current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z',
    }));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('frontend-stack.md 缺失 → missing 含文件名', async () => {
    const gap = await missingFrameworkDecision(root);
    assert.ok(gap.missing.includes('frontend-stack.md'));
    assert.equal(gap.rejectedCount, 0);
  });

  it('选定 JS 仍是占位且无合格被否决备选 → 同时报两个缺口', async () => {
    writeFileSync(join(tasks, 'frontend-stack.md'), [
      '# Frontend Stack',
      '',
      '## 选定栈',
      '- JS 框架: <待定>',
      '',
      '## 被否决备选',
      '- React - 理由: <待补充>',
      '',
    ].join('\n'));

    const gap = await missingFrameworkDecision(root);
    assert.ok(gap.missing.some((item) => item.includes('JS 框架')));
    assert.ok(gap.missing.some((item) => item.includes('被否决备选')));
    assert.equal(gap.rejectedCount, 0);
  });

  it('选定 JS 非占位且至少一个被否决备选带理由 → 无缺口', async () => {
    writeFileSync(join(tasks, 'frontend-stack.md'), [
      '# Frontend Stack',
      '',
      '## 选定栈',
      '- JS 框架: 纯静态',
      '- CSS: 原生 CSS',
      '',
      '## 被否决备选',
      '- React - 理由: 当前页面不需要组件状态模型，增加构建和运行复杂度',
      '',
    ].join('\n'));

    const gap = await missingFrameworkDecision(root);
    assert.deepEqual(gap.missing, []);
    assert.equal(gap.rejectedCount, 1);
  });

  it('选定纯静态时必须说明为什么不用框架', async () => {
    writeFileSync(join(tasks, 'frontend-stack.md'), [
      '# Frontend Stack',
      '',
      '## 选定栈',
      '- JS 框架: 纯静态',
      '- CSS: 原生 CSS',
      '',
      '## 被否决备选',
      '- CSS Modules - 理由: 当前页面不需要模块化 CSS 构建',
      '',
    ].join('\n'));

    const gap = await missingFrameworkDecision(root);
    assert.ok(gap.missing.some((item) => item.includes('为什么不用框架')));
    assert.equal(gap.rejectedCount, 1);
  });
});

describe('missingDesignPreviewDepth（设计稿 8 维度 + 具体值）', () => {
  let root, tasks;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'dp-preview-depth-'));
    const workspace = join(root, '.docpath', 'workspace');
    tasks = join(root, '.docpath', 'tasks', 'current');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(tasks, { recursive: true });
    writeFileSync(join(workspace, 'state.json'), JSON.stringify({
      level: 2, task_id: 'T-PREVIEW', task_title: '设计稿深度',
      phase: 'executing', gate: 'none', state: 'executing', current_step: 'S1',
      started_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z',
    }));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('design-preview.md 缺失 → missing 含文件名', async () => {
    const gap = await missingDesignPreviewDepth(root);
    assert.ok(gap.missing.includes('design-preview.md'));
  });

  it('8 维度齐全且填具体值 → 无缺口', async () => {
    writeFileSync(join(tasks, 'design-preview.md'), FULL_PREVIEW);
    const gap = await missingDesignPreviewDepth(root);
    assert.deepEqual(gap.missing, [], `unexpected missing: ${gap.missing.join(' | ')}`);
    assert.deepEqual(gap.weak, [], `unexpected weak: ${gap.weak.join(' | ')}`);
  });

  it('维度章节缺失 → 计入 missing', async () => {
    const partial = FULL_PREVIEW.split('## 6. 动效规格')[0]; // 砍掉动效及之后维度
    writeFileSync(join(tasks, 'design-preview.md'), partial);
    const gap = await missingDesignPreviewDepth(root);
    assert.ok(gap.missing.some((m) => m.includes('动效规格')), 'should flag missing 动效规格');
    assert.ok(gap.missing.some((m) => m.includes('技术约束')), 'should flag missing 技术约束');
  });

  it('章节在但只填「方向」占位 → 计入 weak（具体值缺失）', async () => {
    const directionOnly = [
      '## 1. 布局与栅格',
      '栅格 12 列，断点 640px / 1024px，区域 Header/Main。',
      '## 2. 尺寸规格',
      'Header 64px；Sidebar 240px。',
      '## 3. 间距标度',
      '标度 8px / 16px。',
      '## 4. 图标系统',
      '图标库 lucide，默认 24px。',
      '## 5. 颜色与 Tokens',
      '色彩偏冷的蓝，整体高对比。', // 无精确色值 → weak
      '## 6. 动效规格',
      '加一点平滑的过渡动画。', // 无 ms/缓动 → weak
      '## 7. 交互逻辑',
      'hover 高亮，loading 占位。',
      '## 8. 技术约束',
      '绑定 frontend-stack；对比度 ≥ 4.5:1；预算 150KB。',
    ].join('\n');
    writeFileSync(join(tasks, 'design-preview.md'), directionOnly);
    const gap = await missingDesignPreviewDepth(root);
    assert.deepEqual(gap.missing, [], `unexpected missing: ${gap.missing.join(' | ')}`);
    assert.ok(gap.weak.some((w) => w.includes('颜色')), 'should flag 颜色 lacks concrete values');
    assert.ok(gap.weak.some((w) => w.includes('动效')), 'should flag 动效 lacks duration/easing');
  });

  it('全部为 <...> 占位（未填模板）→ 计入 missing（仅占位）', async () => {
    const placeholderOnly = [
      '## 1. 布局与栅格', '- 栅格：<12 列>',
      '## 2. 尺寸规格', '- <Header>: <64px>',
      '## 3. 间距标度', '- <4 / 8 / 16px>',
      '## 4. 图标系统', '- 图标库：<lucide>',
      '## 5. 颜色与 Tokens', '- <--bg>: <#FFFFFF>',
      '## 6. 动效规格', '- 时长：<200ms>',
      '## 7. 交互逻辑', '- <hover 高亮>',
      '## 8. 技术约束', '- <对比度 4.5:1>',
    ].join('\n');
    writeFileSync(join(tasks, 'design-preview.md'), placeholderOnly);
    const gap = await missingDesignPreviewDepth(root);
    assert.ok(gap.missing.length >= 6, `placeholder-only should be mostly empty: ${JSON.stringify(gap)}`);
  });
});
