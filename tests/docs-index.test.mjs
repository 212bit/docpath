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

function runResult(args, cwd) {
  try {
    return {
      ok: true,
      output: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }),
    };
  } catch (err) {
    return {
      ok: false,
      output: `${err.stdout?.toString('utf-8') || ''}${err.stderr?.toString('utf-8') || ''}`,
    };
  }
}

describe('structured docs index', () => {
  it('docs scan writes a machine-readable index with required fields', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);

    const indexPath = join(cwd, '.docpath', 'docs-index.json');
    assert.equal(existsSync(indexPath), true);
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    assert.ok(Array.isArray(index.entries));

    const specEntry = index.entries.find((entry) => entry.path === 'tasks/current/spec.md');
    assert.ok(specEntry, 'current task spec should be indexed');
    assert.equal(specEntry.type, 'runbook');
    assert.equal(specEntry.scope, 'task');
    assert.equal(specEntry.title, 'Current Task Spec');
    assert.match(specEntry.summary, /Current task summary/);
    assert.match(specEntry.updated_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(specEntry.default_read, true);
    assert.equal(specEntry.archive, false);
    assert.equal(specEntry.task_id, 'T-DOCS');
    assert.equal(typeof specEntry.token_estimate, 'number');
    assert.ok(Array.isArray(specEntry.topic_tags));
    const canonicalSpec = index.entries.find((entry) => entry.path === 'tasks/T-DOCS/spec.md');
    assert.equal(canonicalSpec?.task_id, 'T-DOCS');
    assert.equal(canonicalSpec?.default_read, false);

    const docsMd = readFileSync(join(cwd, '.docpath', 'docs.md'), 'utf-8');
    assert.match(docsMd, /\| 路径 \| type \| scope \| level \| default_read \| archive \| tokens \| task_id \| 标题 \| 摘要 \| 更新时间 \| 大小 \|/);
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

  it('context defaults to index-first output without reading archived task bodies', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);

    const output = run(`context --cwd ${cwd} --format raw --max-tokens 500`, cwd);
    const currentIdx = output.indexOf('path: tasks/current/spec.md');

    assert.notEqual(currentIdx, -1, 'current task spec should be listed in docs-index summary');
    assert.match(output, /文档索引摘要 \(index-first\)/);
    assert.match(output, /archive_policy: 默认不读取归档正文/);
    assert.doesNotMatch(output, /Old archived notes should be lower priority/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('context expands archived task bodies only when task-id is explicit', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);

    const output = run(`context --cwd ${cwd} --format raw --max-tokens 900 --task-id T-OLD`, cwd);

    assert.match(output, /按需展开文档片段/);
    assert.match(output, /path: tasks\/done\/T-OLD\/notes.md/);
    assert.match(output, /Old archived notes should be lower priority/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reveal filters structured docs index by level and topic', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);

    const output = run(`reveal --cwd ${cwd} --level 2 --topic backend --format raw`, cwd);

    assert.match(output, /文档索引 \(docs-index: topic=backend\)/);
    assert.match(output, /path: spec\/backend\/api.md/);
    assert.match(output, /Backend API reference summary/);
    assert.doesNotMatch(output, /path: tasks\/current\/spec.md/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reveal level 3 does not dump full history unless archive selection is explicit', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);

    const defaultOutput = run(`reveal --cwd ${cwd} --level 3 --format raw`, cwd);
    assert.doesNotMatch(defaultOutput, /完整执行历史/);
    assert.doesNotMatch(defaultOutput, /Old archived notes should be lower priority/);

    const archiveOutput = run(`reveal --cwd ${cwd} --level 3 --format raw --task-id T-OLD`, cwd);
    assert.match(archiveOutput, /按需展开文档片段/);
    assert.match(archiveOutput, /Old archived notes should be lower priority/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('fails loudly for invalid task-id and docs-index paths outside .docpath', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);

    const invalidTask = runResult(`context --cwd ${cwd} --format raw --task-id ../bad`, cwd);
    assert.equal(invalidTask.ok, false);
    assert.match(invalidTask.output, /非法 task_id/);

    const indexPath = join(cwd, '.docpath', 'docs-index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    index.entries.unshift({
      path: '../outside.md',
      type: 'reference',
      kind: 'reference',
      scope: 'project',
      level: '3',
      title: 'Outside',
      summary: 'Outside path',
      updated_at: new Date().toISOString(),
      size: 1,
      token_estimate: 1,
      default_read: false,
      archive: false,
      topic_tags: ['outside'],
    });
    writeFileSync(indexPath, JSON.stringify(index, null, 2));

    const outsidePath = runResult(`context --cwd ${cwd} --format raw --include-archive`, cwd);
    assert.equal(outsidePath.ok, false);
    assert.match(outsidePath.output, /docs-index path escapes \.docpath/);
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
