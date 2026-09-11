/**
 * R-335 并发开发收口测试
 *
 * FR-1 merge 预检收窄：由真实收口 dogfooding 覆盖（主仓 dirty 场景）
 * FR-2 docs-index merge-driver / FR-3 docs 幂等 / FR-4 版本漂移 / FR-5 list --agent 在此覆盖
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;
const REPO_ROOT = new URL('..', import.meta.url).pathname;

/* ─── FR-2: docs-index merge-driver take-current 策略 ─── */

describe('merge-driver docs-index (FR-2)', async () => {
  const { resolveDocpathMerge, isDocsIndexPath, isSupportedDocpathMergePath } = await import('../dist/utils/merge-driver.js');

  it('isDocsIndexPath matches docs.md and docs-index.json', () => {
    assert.equal(isDocsIndexPath('.docpath/docs.md'), true);
    assert.equal(isDocsIndexPath('.docpath/docs-index.json'), true);
    assert.equal(isDocsIndexPath('sub/.docpath/docs.md'), true);
    assert.equal(isDocsIndexPath('.docpath/backlog/backlog.md'), false);
  });

  it('isSupportedDocpathMergePath includes docs index files', () => {
    assert.equal(isSupportedDocpathMergePath('.docpath/docs.md'), true);
    assert.equal(isSupportedDocpathMergePath('.docpath/docs-index.json'), true);
  });

  it('docs-index conflict resolves take-current (no exception, strategy docs-index)', () => {
    const result = resolveDocpathMerge({
      ancestor: '# DocPath 文档索引\n\n> 扫描时间: old\n',
      current: '# DocPath 文档索引\n\nworktree-side\n',
      other: '# DocPath 文档索引\n\nmain-side-conflicting\n<<<<<<< ours\n',
      path: '.docpath/docs.md',
    });
    assert.equal(result.strategy, 'docs-index');
    assert.equal(result.content, '# DocPath 文档索引\n\nworktree-side\n');
  });

  it('docs-index.json conflict also resolves take-current', () => {
    const result = resolveDocpathMerge({
      ancestor: '{"generated_at":"a"}',
      current: '{"generated_at":"b"}',
      other: '{"generated_at":"c","diverged":true}',
      path: '.docpath/docs-index.json',
    });
    assert.equal(result.strategy, 'docs-index');
    assert.equal(result.content, '{"generated_at":"b"}');
  });
});

/* ─── FR-3: docs.md 生成幂等 ─── */

describe('docs scan idempotency (FR-3)', () => {
  function initTmpRepo() {
    const cwd = mkdtempSync(join(tmpdir(), 'r335-docs-'));
    execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 't'], { cwd, stdio: 'ignore' });
    mkdirSync(join(cwd, '.docpath'), { recursive: true });
    writeFileSync(join(cwd, '.docpath/config.yaml'), 'default_level: 1\n');
    writeFileSync(join(cwd, '.docpath/guide.md'), '# 指南\n');
    execFileSync('git', ['add', '-A'], { cwd, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd, stdio: 'ignore' });
    return cwd;
  }

  it('two consecutive docs scans produce byte-identical docs.md', () => {
    const cwd = initTmpRepo();
    const run = () => spawnSync('node', [BIN, 'docs', 'scan'], { cwd, encoding: 'utf-8' });
    run();
    const first = readFileSync(join(cwd, '.docpath/docs.md'), 'utf-8');
    // 间隔 50ms 保证若仍内嵌时间戳必然不同
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    run();
    const second = readFileSync(join(cwd, '.docpath/docs.md'), 'utf-8');
    assert.equal(first, second, 'docs.md must be byte-identical across scans of unchanged state');
    assert.ok(!first.includes('扫描时间'), 'docs.md must not embed scan timestamp');
    rmSync(cwd, { recursive: true, force: true });
  });
});

/* ─── FR-4: 版本漂移检测 ─── */

describe('detectBinaryDrift (FR-4)', async () => {
  const { detectBinaryDrift } = await import('../dist/utils/version-drift.js');

  it('returns null in a non-docpath user repo (global install is correct there)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'r335-user-'));
    execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'user-app' }));
    const report = await detectBinaryDrift(cwd);
    assert.equal(report, null);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('flags drift when binary runs from outside the docpath repo', async () => {
    // 子进程 argv[1] 指向仓库外脚本 → 必须 drifted
    const fixture = join(mkdtempSync(join(tmpdir(), 'r335-fixture-')), 'fake-bin.mjs');
    writeFileSync(fixture, `
      const { detectBinaryDrift } = await import(${JSON.stringify(join(REPO_ROOT, 'dist/utils/version-drift.js'))});
      const r = await detectBinaryDrift(${JSON.stringify(REPO_ROOT)});
      console.log(JSON.stringify(r));
    `);
    const out = JSON.parse(execFileSync('node', [fixture], { encoding: 'utf-8' }));
    assert.equal(out.drifted, true, `expected drift for out-of-repo binary, got ${JSON.stringify(out)}`);
    assert.ok(out.repo_local_build && out.repo_local_build.endsWith('dist/index.js'));
    rmSync(join(fixture, '..'), { recursive: true, force: true });
  });
});

/* ─── FR-5: worktree list --agent ─── */

describe('worktree list --agent (FR-5)', () => {
  it('outputs aggregated YAML with main role and suggested actions', () => {
    const out = execFileSync('node', [BIN, 'worktree', 'list', '--agent'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    assert.ok(out.includes('worktrees:'), 'must output YAML list');
    assert.ok(out.includes('role: main'), 'main worktree must be marked');
    assert.ok(out.includes('suggested_action:'), 'each entry must carry a suggested action');
  });
});
