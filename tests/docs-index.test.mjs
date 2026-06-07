import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-docs-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-DOCS'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done', 'T-OLD'), { recursive: true });
  mkdirSync(join(dp, 'spec', 'backend'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: docs-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-DOCS',
    task_title: 'Docs index',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n\nCurrent task state.\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(dp, 'workspace', 'last-check.md'), '# Last Check Evidence\n\n**结果**: ✅ PASS\n');
  writeFileSync(join(dp, 'spec', 'style.md'), '# Legacy Style\n\nLegacy style fallback rule.\n');
  writeFileSync(join(dp, 'spec', 'architecture.md'), '# Legacy Architecture\n\nLegacy architecture fallback rule.\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Current Task Spec\n\nCurrent task summary should be prioritized.\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '# Current Task Plan\n\n- [ ] S1: Build structured docs index\n');
  writeFileSync(join(dp, 'tasks', 'T-DOCS', 'spec.md'), '# Current Task Spec\n\nCurrent task summary should be prioritized.\n');
  writeFileSync(join(dp, 'tasks', 'T-DOCS', 'plan.md'), '# Current Task Plan\n\n- [ ] S1: Build structured docs index\n');
  writeFileSync(join(dp, 'tasks', 'done', 'T-OLD', 'notes.md'), '# Old Task Notes\n\nOld archived notes should be lower priority.\n');
  writeFileSync(join(dp, 'spec', 'backend', 'api.md'), '# Backend API\n\nBackend API reference summary.\n');
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('structured docs index', () => {
  it('docs scan writes a machine-readable index with required fields', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);

    const indexPath = join(cwd, '.docpath', 'docs-index.json');
    assert.equal(existsSync(indexPath), true);
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    assert.ok(Array.isArray(index.entries));

    const specEntry = index.entries.find((entry) => entry.path === 'tasks/T-DOCS/spec.md');
    assert.ok(specEntry, 'canonical task spec should be indexed');
    assert.equal(specEntry.type, 'runbook');
    assert.equal(specEntry.scope, 'task');
    assert.equal(specEntry.title, 'Current Task Spec');
    assert.match(specEntry.summary, /Current task summary/);
    assert.match(specEntry.updated_at, /^\d{4}-\d{2}-\d{2}T/);

    const docsMd = readFileSync(join(cwd, '.docpath', 'docs.md'), 'utf-8');
    assert.match(docsMd, /\| 路径 \| type \| scope \| level \| 标题 \| 摘要 \| 更新时间 \| 大小 \|/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('docs scan refreshes the index when new documents are added', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);
    writeFileSync(join(cwd, '.docpath', 'spec', 'backend', 'new-api.md'), '# New Backend API\n\nNew backend summary.\n');
    run(`docs scan --cwd ${cwd}`, cwd);

    const index = JSON.parse(readFileSync(join(cwd, '.docpath', 'docs-index.json'), 'utf-8'));
    const added = index.entries.find((entry) => entry.path === 'spec/backend/new-api.md');
    assert.ok(added, 'new document should be indexed after rescan');
    assert.equal(added.scope, 'backend');
    assert.equal(added.title, 'New Backend API');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('context uses docs-index to include current task documents first under a small budget', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);

    const output = run(`context --cwd ${cwd} --format raw --max-tokens 500`, cwd);
    const currentIdx = output.indexOf('path: tasks/T-DOCS/spec.md');
    const oldIdx = output.indexOf('path: tasks/done/T-OLD/notes.md');

    assert.notEqual(currentIdx, -1, 'canonical task spec should be included from docs-index');
    assert.match(output, /相关文档: Current Task Spec/);
    if (oldIdx !== -1) assert.ok(currentIdx < oldIdx, 'current task docs should appear before old task docs');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reveal filters structured docs index by level and topic', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);

    const output = run(`reveal --cwd ${cwd} --level 2 --topic backend --format raw`, cwd);

    assert.match(output, /文档索引 \(docs-index: backend\)/);
    assert.match(output, /path: spec\/backend\/api.md/);
    assert.match(output, /Backend API reference summary/);
    assert.doesNotMatch(output, /path: tasks\/current\/spec.md/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('context and reveal read legacy spec rules when rules directory is absent', () => {
    const cwd = mkWorkspace();

    const contextOutput = run(`context --cwd ${cwd} --format raw --max-tokens 500`, cwd);
    const revealOutput = run(`reveal --cwd ${cwd} --level 2 --format raw`, cwd);

    assert.match(contextOutput, /全局规则: 编码规范 \(\.docpath\/spec\/style\.md\)/);
    assert.match(contextOutput, /Legacy style fallback rule/);
    assert.match(revealOutput, /全局规则: 编码规范 \(\.docpath\/spec\/style\.md\)/);
    assert.match(revealOutput, /Legacy architecture fallback rule/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
