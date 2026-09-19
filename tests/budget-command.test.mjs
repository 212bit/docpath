import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-budget-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(cwd, 'docs'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: budget-test\n');

  // Normal rule (< 200 lines)
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style Rules\n\n## rule 1\n- details\n');

  // Bloated rule (> 200 lines to trigger budget warning)
  const bloatedLines = ['# Architecture Rules', ''];
  for (let i = 0; i < 220; i++) {
    bloatedLines.push(`## Rule ${i}`, `- details for rule ${i}`);
  }
  writeFileSync(join(dp, 'rules', 'architecture.md'), bloatedLines.join('\n'));

  // Active task files
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), [
    '# T-20260919-budget - Test Active Task',
    '',
    '## 2. 需求清单',
    '### 功能需求',
    '- [x] FR-1: Budget analyzer',
    '',
    '## 5. 验收标准',
    '- [x] AC-1: Pass tests',
  ].join('\n'));

  writeFileSync(join(dp, 'tasks', 'current', 'plan.json'), JSON.stringify({
    schema_version: 1,
    kind: 'plan',
    title: 'Test Plan',
    steps: [
      { id: 'S1', name: 'Step 1', description: 'desc', acceptance: 'acc', dependencies: '无', status: 'done' },
    ],
  }, null, 2));

  // Workspace decisions
  writeFileSync(join(dp, 'workspace', 'decisions.md'), [
    '# Architecture Decisions',
    '',
    '## ADR-20260919-001 — R-350 环境豁免',
    '- category: design-decision',
    '- created_at: 2026-09-19T00:00:00.000Z',
    '',
    '### 决策',
    '',
    '采用 check_env_exempt',
  ].join('\n'));

  // Workspace breadcrumb
  writeFileSync(join(dp, 'workspace', 'breadcrumb.jsonl'), [
    JSON.stringify({ timestamp: '2026-09-19T00:00:00.000Z', event: 'task.start', taskId: 'T-20260919-budget' }),
    JSON.stringify({ timestamp: '2026-09-19T00:01:00.000Z', event: 'step.done', stepId: 'S1' }),
  ].join('\n'));

  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('docpath budget command', () => {
  it('displays budget overview with visual bars and table', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('budget', cwd);
      assert.match(out, /DocPath 上下文 Token 预算透视看板/);
      assert.match(out, /规则体系 \(Rules\)/);
      assert.match(out, /当前活跃任务 \(Active Task\)/);
      assert.match(out, /架构决策 \(Governance\/ADR\)/);
      assert.match(out, /执行轨迹 \(Events\/Breadcrumbs\)/);
      assert.match(out, /智能瘦身与剪枝建议/);
      assert.match(out, /architecture\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs suggestions only with --suggest', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('budget --suggest', cwd);
      assert.match(out, /上下文剪枝建议/);
      assert.match(out, /architecture\.md/);
      assert.match(out, /docpath learn --topic architecture/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs structured agent YAML with --agent', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('budget --agent', cwd);
      assert.match(out, /agent_view: budget_overview/);
      assert.match(out, /rules:/);
      assert.match(out, /top_consumers:/);
      assert.match(out, /suggestions:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs structured JSON with --json', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('budget --json', cwd);
      const parsed = JSON.parse(out);
      assert.equal(typeof parsed.totalTokens, 'number');
      assert.ok(parsed.categories.rules);
      assert.ok(parsed.categories.active_task);
      assert.ok(Array.isArray(parsed.suggestions));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports --prune to safely prune transient context artifacts', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('budget --prune', cwd);
      assert.match(out, /已完成工作区瞬态事件与历史决策安全剪枝/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
