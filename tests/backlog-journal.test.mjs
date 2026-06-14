import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({ breadcrumbContext = '✅ 采用统一状态机边界，禁止命令直接写状态。' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-backlog-journal-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-20260531-alpha-promote'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: backlog-journal-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-20260531-alpha-promote',
    task_title: 'Alpha Promote',
    phase: 'reviewing',
    gate: 'review_pass',
    current_step: 'journal',
    started_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), [
    '# Breadcrumb',
    '',
    '### ✅ S1 [T-20260531-alpha-promote] — 2026-05-31T00:00:00.000Z',
    '',
    '---',
    'taskId: T-20260531-alpha-promote',
    'step: S1',
    'status: done',
    'timestamp: 2026-05-31T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    `- **上下文**: ${breadcrumbContext}`,
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'workspace', 'last-check.md'), '# Last Check\n\n**结果**: ✅ PASS\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# T-20260531-alpha-promote - Alpha Promote\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '# Plan\n\n- [x] S1: done\n');
  writeFileSync(join(dp, 'tasks', 'T-20260531-alpha-promote', 'spec.md'), '# T-20260531-alpha-promote - Alpha Promote\n');
  writeFileSync(join(dp, 'tasks', 'T-20260531-alpha-promote', 'plan.md'), '# Plan\n\n- [x] S1: done\n');
  writeFileSync(join(dp, 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: active
priority: P0
level: 2
source: test
links:
  task: T-20260531-alpha-promote
  spec: tasks/T-20260531-alpha-promote/spec.md
created_at: 2026-05-31
---

Alpha
`);
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 }).trim();
}

function decisionBlock(id, createdAt) {
  return [
    `## ${id} — architecture`,
    '',
    '- task_id: T-OLD',
    `- created_at: ${createdAt}`,
    '- category: architecture',
    '',
    '### 背景',
    '',
    '旧决策背景。',
    '',
    '### 决策',
    '',
    '旧决策。',
    '',
    '### 影响',
    '',
    '旧影响。',
    '',
    '### 替代方案',
    '',
    '- 旧方案',
    '',
    '### 相关文件',
    '',
    '- .docpath/workspace/decisions.md',
    '',
    '---',
    '',
  ].join('\n');
}

describe('backlog journal integration', () => {
  it('journal auto-completes linked backlog item', () => {
    const cwd = mkWorkspace();
    const out = run('journal --skip-ai --optional-archive skip', cwd);

    assert.match(out, /backlog 已自动回填完成: R-001/);
    const item = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /status: done/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal backfills placeholder backlog body and evidence from linked spec', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    const spec = [
      '# T-20260531-alpha-promote - Alpha Promote',
      '',
      '## 1. 背景与动机',
      '',
      '成熟后的背景说明。',
      '',
      '## 2. 需求清单',
      '',
      '### 功能需求',
      '- [ ] FR-1: Alpha',
      '',
      '## 5. 验收标准',
      '',
      '- [ ] AC-1: 完成验收',
      '',
    ].join('\n');
    writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), spec);
    writeFileSync(join(dp, 'tasks', 'T-20260531-alpha-promote', 'spec.md'), spec);
    writeFileSync(join(dp, 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: active
priority: P0
level: 2
source: test
links:
  task: T-20260531-alpha-promote
  spec: tasks/T-20260531-alpha-promote/spec.md
created_at: 2026-05-31
---

## 背景

- 待补充

## 验收

- 待补充
`);

    run('journal --skip-ai --optional-archive skip', cwd);

    const item = readFileSync(join(dp, 'backlog', 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /status: done/);
    assert.match(item, /readiness: analyzed/);
    assert.match(item, /spec: tasks\/T-20260531-alpha-promote\/spec\.md/);
    assert.match(item, /成熟后的背景说明/);
    assert.doesNotMatch(item, /- 待补充/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal also completes legacy dogfood backlog items linked to current', () => {
    const cwd = mkWorkspace();
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: active
priority: P0
level: 2
source: test
links:
  task: current
  spec: tasks/current/spec.md
created_at: 2026-05-31
---

Alpha
`);

    const out = run('journal --skip-ai --optional-archive skip', cwd);

    assert.match(out, /所有步骤已归档/);
    const item = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /status: done/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal extracts architecture decisions into decisions.md', () => {
    const cwd = mkWorkspace();
    const out = run('journal --skip-ai --optional-archive skip', cwd);

    assert.match(out, /决策日志已更新/);
    assert.match(out, /提取 1 条架构决策/);
    const decisions = readFileSync(join(cwd, '.docpath', 'workspace', 'decisions.md'), 'utf-8');
    assert.doesNotMatch(decisions, /journal\.archive/);
    assert.match(decisions, /## ADR-\d{8}-001 — architecture/);
    assert.match(decisions, /采用统一状态机边界，禁止命令直接写状态/);
    assert.match(decisions, /从 journal 关键决策自动提取/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal skips decisions.md for ordinary archive context', () => {
    const cwd = mkWorkspace({ breadcrumbContext: '质量检查通过 (14 项)' });
    const out = run('journal --skip-ai --optional-archive skip', cwd);

    assert.match(out, /未发现可复用 ADR，跳过 decisions\.md 写入/);
    assert.doesNotMatch(out, /决策日志已更新/);
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'decisions.md')), false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('journal runs decisions gc after writing archive decisions', () => {
    const cwd = mkWorkspace();
    const decisionsPath = join(cwd, '.docpath', 'workspace', 'decisions.md');
    writeFileSync(decisionsPath, [
      '# 决策日志 — DocPath ADR',
      '',
      '> test decisions',
      '',
      '---',
      '',
      decisionBlock('ADR-20260401-001', '2026-04-01T00:00:00.000Z'),
    ].join('\n'));

    const out = run('journal --skip-ai --optional-archive skip', cwd);

    assert.match(out, /decisions\.md 已老化/);
    const current = readFileSync(decisionsPath, 'utf-8');
    const archive = readFileSync(join(cwd, '.docpath', 'workspace', 'decisions-2026-04.md'), 'utf-8');
    assert.doesNotMatch(current, /ADR-20260401-001/);
    assert.doesNotMatch(current, /journal\.archive/);
    assert.match(current, /architecture/);
    assert.match(archive, /ADR-20260401-001/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
