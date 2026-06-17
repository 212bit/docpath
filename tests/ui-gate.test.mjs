/**
 * ui-gate 单元判定测试（plan.md S5：ui-gate 单元判定覆盖）。
 *
 * 覆盖 go 与 check 共享的判定真源 src/utils/ui-gate.ts：
 * - parseExplicitUiDeclaration: spec 4.1 显式框 → required / exempt / unknown，同勾从严
 * - resolveUiDesignRequirement: 显式框优先于关键词；未勾选时关键词回退；
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
} = await import(new URL('../dist/utils/ui-gate.js', import.meta.url).href);

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

  it('未勾选 + 命中 UI 关键词 → required（关键词回退）', async () => {
    writeSpec('# T-UIGATE - 页面重构\n## 背景\n本任务重做 layout 与 navigation 视觉设计。');
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
