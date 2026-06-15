import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, utimesSync } from 'fs';
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
    assert.equal(specEntry.topic_tags, undefined, 'generated docs-index omits inferred topic tags for compactness');
    const canonicalSpec = index.entries.find((entry) => entry.path === 'tasks/T-DOCS/spec.md');
    assert.equal(canonicalSpec?.task_id, 'T-DOCS');
    assert.equal(canonicalSpec?.default_read, false);

    const docsMd = readFileSync(join(cwd, '.docpath', 'docs.md'), 'utf-8');
    assert.match(docsMd, /\| 路径 \| type \| scope \| level \| default_read \| archive \| stale \| tokens \| task_id \| 标题 \| 摘要 \| 更新时间 \| 大小 \|/);
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

  it('docs scan keeps fresh archived tasks available for explicit task-id lookups', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);

    const index = JSON.parse(readFileSync(join(cwd, '.docpath', 'docs-index.json'), 'utf-8'));
    const archiveEntry = index.entries.find((entry) => entry.path === 'tasks/done/T-OLD/notes.md');
    assert.ok(archiveEntry, 'fresh archived task should stay in docs-index');
    assert.equal(archiveEntry.archive, true);
    assert.equal(archiveEntry.default_read, false);

    const output = run(`context --cwd ${cwd} --format raw --max-tokens 900 --task-id T-OLD`, cwd);

    assert.match(output, /按需展开文档片段/);
    assert.match(output, /path: tasks\/done\/T-OLD\/notes.md/);
    assert.match(output, /Old archived notes should be lower priority/);
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

  it('physically removes expired archived tasks and fails loudly for explicit task-id lookups', () => {
    const cwd = mkWorkspace();
    const oldNotesPath = join(cwd, '.docpath', 'tasks', 'done', 'T-OLD', 'notes.md');
    const oldDate = new Date('2025-01-01T00:00:00.000Z');
    utimesSync(oldNotesPath, oldDate, oldDate);

    run(`docs scan --cwd ${cwd}`, cwd);

    const index = JSON.parse(readFileSync(join(cwd, '.docpath', 'docs-index.json'), 'utf-8'));
    const expiredEntry = index.entries.find((entry) => entry.path === 'tasks/done/T-OLD/notes.md');
    assert.equal(expiredEntry, undefined, 'expired archived task should be physically removed from docs-index');
    const docsMd = readFileSync(join(cwd, '.docpath', 'docs.md'), 'utf-8');
    assert.doesNotMatch(docsMd, /tasks\/done\/T-OLD\/notes\.md/);

    const contextResult = runResult(`context --cwd ${cwd} --format raw --max-tokens 900 --task-id T-OLD`, cwd);
    assert.equal(contextResult.ok, false);
    assert.match(contextResult.output, /已超出 docs-index 180 天保留窗口/);
    assert.match(contextResult.output, /物理移除索引/);
    assert.doesNotMatch(contextResult.output, /索引损坏/);

    const revealResult = runResult(`reveal --cwd ${cwd} --level 2 --format raw --task-id T-OLD`, cwd);
    assert.equal(revealResult.ok, false);
    assert.match(revealResult.output, /已超出 docs-index 180 天保留窗口/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('docs scan excludes runtime workspace directories', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    for (const dir of ['commands', 'bin', 'leases', 'sessions']) {
      const nested = join(dp, 'workspace', dir, 'nested');
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(nested, 'runtime.md'), `# Runtime ${dir}\n\nRuntime file should not be indexed.\n`);
    }

    run(`docs scan --cwd ${cwd}`, cwd);

    const index = JSON.parse(readFileSync(join(cwd, '.docpath', 'docs-index.json'), 'utf-8'));
    const indexedPaths = index.entries.map((entry) => entry.path);
    for (const dir of ['commands', 'bin', 'leases', 'sessions']) {
      assert.equal(
        indexedPaths.some((path) => path.startsWith(`workspace/${dir}/`)),
        false,
        `workspace/${dir} should be excluded from docs scan`,
      );
    }
    const docsMd = readFileSync(join(cwd, '.docpath', 'docs.md'), 'utf-8');
    assert.doesNotMatch(docsMd, /workspace\/commands\/nested\/runtime\.md/);
    assert.doesNotMatch(docsMd, /workspace\/bin\/nested\/runtime\.md/);
    assert.doesNotMatch(docsMd, /workspace\/leases\/nested\/runtime\.md/);
    assert.doesNotMatch(docsMd, /workspace\/sessions\/nested\/runtime\.md/);
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

  it('reveal keeps generated index views discoverable but excludes them from selected token budget', () => {
    const cwd = mkWorkspace();
    run(`docs scan --cwd ${cwd}`, cwd);
    const indexPath = join(cwd, '.docpath', 'docs-index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    index.entries.push(
      {
        path: 'docs.md',
        type: 'index',
        kind: 'index',
        scope: 'project',
        level: '2',
        title: 'DocPath docs generated view',
        summary: 'Generated docs index view for humans.',
        updated_at: new Date().toISOString(),
        size: 180000,
        token_estimate: 60000,
        default_read: false,
        archive: false,
        topic_tags: ['docs', 'index'],
      },
      {
        path: 'archive/docs-legacy-20260613.md',
        type: 'index',
        kind: 'index',
        scope: 'project',
        level: '3',
        title: 'Legacy docs archive',
        summary: 'Legacy generated docs archive.',
        updated_at: new Date().toISOString(),
        size: 120000,
        token_estimate: 40000,
        default_read: false,
        archive: false,
        topic_tags: ['docs', 'legacy', 'archive'],
      },
    );
    writeFileSync(indexPath, JSON.stringify(index, null, 2));

    const output = run(`reveal --cwd ${cwd} --level 2 --topic docs --format raw`, cwd);
    const selectedTokens = Number(output.match(/estimated_tokens_selected: ~(\d+)/)?.[1]);

    assert.ok(selectedTokens < 10000, `expected generated views to be excluded from selected budget, got ${selectedTokens}`);
    assert.match(output, /path: docs\.md/);
    assert.match(output, /path: archive\/docs-legacy-20260613\.md/);
    assert.match(output, /selected_index_only_docs: 2/);
    assert.match(output, /estimated_tokens_index_only: ~100000/);
    assert.match(output, /budget_excluded: true/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('context does not expand generated index bodies for topic selection', () => {
    const cwd = mkWorkspace();
    const archiveDir = join(cwd, '.docpath', 'archive');
    mkdirSync(archiveDir, { recursive: true });
    writeFileSync(join(archiveDir, 'docs-legacy-20260613.md'), '# Legacy Docs\n\nLegacy generated docs summary.\n\nHidden generated docs body marker should not expand.\n');
    run(`docs scan --cwd ${cwd}`, cwd);

    const output = run(`context --cwd ${cwd} --format raw --max-tokens 1200 --topic docs`, cwd);

    assert.match(output, /path: archive\/docs-legacy-20260613\.md/);
    assert.match(output, /budget_excluded: true/);
    assert.doesNotMatch(output, /Hidden generated docs body marker should not expand/);
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
