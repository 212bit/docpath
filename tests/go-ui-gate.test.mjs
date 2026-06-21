/**
 * go UI 设计门禁端到端测试（plan.md S5 覆盖项）。
 *
 * 验证 go 在进入执行前的硬门禁行为（src/commands/go.ts）：
 * - spec 显式勾选「涉及产品 UI」(required) 且缺 ui-brief/approval → fail-loud, exit 1
 * - spec 显式勾选「不涉及产品 UI」(exempt) → 放行
 * - unknown + 普通 UI/前端词 → 只提示，不阻塞
 * - dry-run → 不受门禁影响，始终可预览
 *
 * 判定真源为 src/utils/ui-gate.ts，与 check 阶段共用，避免两处标准漂移。
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args, cwd) => {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || '');
  }
};

// 在 mkExecWorkspace 的合法 spec 基础上，注入 4.1 UI 设计门禁显式勾选框。
// declaration: 'required' | 'exempt' —— 决定勾哪一个互斥框。
function specWithUiDeclaration(declaration) {
  const requiredMark = declaration === 'required' ? 'x' : ' ';
  const exemptMark = declaration === 'exempt' ? 'x' : ' ';
  return [
    '# T-AGENT - Agent Lifecycle',
    '',
    '## 1. 背景与动机',
    '',
    '测试 go UI 设计门禁。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    '- [ ] FR-1: go 门禁按显式声明拦截或放行',
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 保持测试隔离',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    '- go 门禁',
    '',
    '### 不包含',
    '- 真实外部检查',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | 测试结构 | 极简 / 标准 | 标准 | 满足结构校验 |',
    '',
    '## 4.1 重大变更门禁',
    '',
    '### UI 设计门禁',
    '',
    `- [${exemptMark}] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）`,
    `- [${requiredMark}] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）`,
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: go 门禁行为正确',
    '',
  ].join('\n');
}

function specWithGenericUiUnknown() {
  return [
    '# T-AGENT - Agent Lifecycle',
    '',
    '## 1. 背景与动机',
    '',
    'Implement dashboard page layout, frontend components, navigation, and CSS spacing.',
    '',
    '## 4.1 重大变更门禁',
    '',
    '### UI 设计门禁',
    '',
    '- [ ] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）',
    '- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: 普通前端词不触发硬门禁',
    '',
  ].join('\n');
}

function writeUiSpecJson(tasks, markdown, state) {
  writeFileSync(join(tasks, 'spec.json'), `${JSON.stringify({
    schema_version: 1,
    kind: 'spec',
    source: {
      kind: 'markdown',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
    task_id: 'T-AGENT',
    backlog_id: null,
    title: 'T-AGENT - Agent Lifecycle',
    markdown,
    generated_at: '2026-06-01T00:00:00.000Z',
    scope: {
      included: ['go 门禁'],
      excluded: ['真实外部检查'],
    },
    major_change_gate: {
      required: false,
      types: [],
      user_confirmed: null,
      decision_brief_markdown: '',
    },
    ui_gate: {
      state,
    },
    functional_requirements: [
      { id: 'FR-1', text: 'go 门禁按显式声明拦截或放行', done: false },
    ],
    non_functional_requirements: [
      { id: 'NFR-1', text: '保持测试隔离', done: false },
    ],
    acceptance_criteria: [
      { id: 'AC-1', text: 'go 门禁行为正确', done: false },
    ],
    decision_brief: '',
  }, null, 2)}\n`);
}

function writeValidFrontendStack(tasks) {
  writeFileSync(join(tasks, 'frontend-stack.md'), [
    '# Frontend Stack',
    '',
    '## 选定栈',
    '- JS 框架: 纯静态',
    '- CSS: 原生 CSS',
    '- 组件库: 无',
    '',
    '## 被否决备选',
    '- React - 理由: 当前测试场景不需要组件运行时，增加复杂度',
    '',
    '## 约束',
    '- 保持测试夹具最小化',
    '',
  ].join('\n'));
}

describe('go UI 设计门禁', () => {
  const dirs = [];
  const mkWorkspace = (declaration) => {
    const cwd = mkdtempSync(join(tmpdir(), 'docpath-go-uigate-'));
    dirs.push(cwd);
    const { tasks } = mkExecWorkspace(cwd);
    writeFileSync(join(tasks, 'spec.md'), specWithUiDeclaration(declaration));
    // plan.md 留一个未完成步骤，确保 go 会尝试进入执行（而非直接判定计划完成）。
    writeFileSync(join(tasks, 'plan.md'), [
      '## 执行计划',
      '',
      '### S1: 实现产品 UI',
      '- [ ] S1: 实现产品 UI',
      '- **描述**: 实现页面',
      '- **验收条件**: 页面可用',
      '- **依赖**: 无',
      '',
    ].join('\n'));
    return { cwd, tasks };
  };

  after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('required + 缺设计产物 → fail-loud 拒绝进入执行', () => {
    const { cwd } = mkWorkspace('required');
    const out = run('go --step S1', cwd);
    assert.match(out, /UI 设计门禁未通过/, '应明确拒绝');
    assert.match(out, /ui-brief\.md/, '应提示缺失的设计产物 ui-brief.md');
    assert.match(out, /design-approval\.md/, '应提示缺失的审批文件');
  });

  it('exempt（显式声明不涉及 UI）→ 放行进入执行', () => {
    const { cwd } = mkWorkspace('exempt');
    const out = run('go --step S1', cwd);
    assert.doesNotMatch(out, /UI 设计门禁未通过/, '显式豁免不应被门禁拦截');
  });

  it('unknown + 普通 UI/前端关键词 → 非阻塞提示并放行', () => {
    const { cwd, tasks } = mkWorkspace('exempt');
    writeFileSync(join(tasks, 'spec.md'), specWithGenericUiUnknown());
    const out = run('go --step S1', cwd);
    assert.match(out, /检测到 UI\/前端相关描述/, '应给出非阻塞提示');
    assert.doesNotMatch(out, /UI 设计门禁未通过/, '普通前端词不应触发硬门禁');
    assert.match(out, /执行子任务/, 'go 应继续进入执行上下文');
  });

  it('required + 缺产物 + dry-run → 不受门禁影响，仍可预览', () => {
    const { cwd } = mkWorkspace('required');
    const out = run('go --dry-run', cwd);
    assert.match(out, /dry-run/, 'dry-run 应预览');
    assert.doesNotMatch(out, /UI 设计门禁未通过/, 'dry-run 不应触发门禁');
  });

  it('spec.json ui_gate 优先于 spec.md 显式声明', () => {
    const { cwd, tasks } = mkWorkspace('exempt');
    writeUiSpecJson(tasks, specWithUiDeclaration('exempt'), 'required');
    const out = run('go --step S1', cwd);
    assert.match(out, /UI 设计门禁未通过/, 'JSON required 应覆盖 Markdown exempt');
    assert.match(out, /ui-brief\.md/, '应按 required 提示缺失设计产物');
  });
});
