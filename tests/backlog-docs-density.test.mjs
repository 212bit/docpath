import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function mkRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-docs-density-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: docs-density-test\n');

  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', 'init']);
  return cwd;
}

function run(args, cwd) {
  const parsedArgs = typeof args === 'string'
    ? args.match(/(?:[^\s"]+|"[^"]*")+/g).map((part) => part.replace(/^"|"$/g, ''))
    : args;
  return execFileSync('node', [BIN, ...parsedArgs], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
  }).trim();
}

describe('backlog & task documentation density & backfill', () => {
  it('includes stats overview in backlog.md index', () => {
    const cwd = mkRepo();

    run(['backlog', 'add', '--title', '需求A', '--priority', 'P0', '--level', '1', '--background', '背景A', '--acceptance', '通过A'], cwd);
    run(['backlog', 'add', '--title', '需求B', '--priority', 'P1', '--level', '1', '--background', '背景B', '--acceptance', '通过B'], cwd);

    const indexContent = readFileSync(join(cwd, '.docpath', 'backlog', 'backlog.md'), 'utf-8');
    assert.match(indexContent, /# DocPath Backlog Index/);
    assert.match(indexContent, /📊 资产概览: 活跃需求 2 条 \| 优先级分布: P0: 1, P1: 1, P2: 0, P3: 0/);
  });

  it('automatically backfills FR checklist into archived backlog item on task closeout', () => {
    const cwd = mkRepo();

    // 1. 启动任务
    run(['start', '高密度资产测试：模块一 + 模块二', '--draft'], cwd);

    // 2. 执行步骤并通过
    run(['step-pass'], cwd);
    run(['step-pass'], cwd);

    // 3. 设置已通过 review 状态并执行 journal
    const stateFile = join(cwd, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    state.gate = 'review_pass';
    state.phase = 'reviewing';
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    writeFileSync(join(cwd, '.docpath', 'workspace', 'last-check.md'), '# Last Check\n\n**结果**: ✅ PASS\n');
    run(['journal'], cwd);

    // 4. 检查归档卡片中是否成功回填了结构化功能要点
    const archivedDir = join(cwd, '.docpath', 'backlog', 'archived');
    const files = readdirSync(archivedDir).filter((f) => f.startsWith('R-') && f.endsWith('.md'));
    assert.equal(files.length, 1);

    const archivedContent = readFileSync(join(archivedDir, files[0]), 'utf-8');
    assert.match(archivedContent, /## 功能要点/);
    assert.match(archivedContent, /FR-1:\s*模块一/);
    assert.match(archivedContent, /FR-2:\s*模块二/);
    assert.match(archivedContent, /## 验收/);
    assert.match(archivedContent, /status:\s*done/);
  });
});
