import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js');
const run = (args, cwd) => {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || '');
  }
};

describe('analyze command', () => {
  let cwd;
  before(() => {
    cwd = mkdtempSync(join(tmpdir(), 'docpath-analyze-'));
    mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
    mkdirSync(join(cwd, '.docpath', 'tasks', 'current'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: analyze-test\n');
    writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: 'T-ANALYZE',
      task_title: 'Analyze',
      phase: 'drafting',
      gate: 'none',
      current_step: 'drafting',
      started_at: '2026-06-09T00:00:00.000Z',
      updated_at: '2026-06-09T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(cwd, '.docpath', 'workspace', 'current.md'), '# Current\n');
    writeFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
    writeFileSync(join(cwd, 'req.md'), '# Req\n后台用户列表需要筛选、详情抽屉和空状态。\n');
  });
  after(() => rmSync(cwd, { recursive: true, force: true }));

  it('analyze --file emits a predev analysis prompt', () => {
    const out = run('analyze --file req.md', cwd);
    assert.match(out, /predev-analysis/);
    assert.match(out, /UI\/UX/);
    assert.match(out, /write-analysis/);
    assert.match(out, /recommended_writes/);
    assert.match(out, /--section ui/);
  });

  it('analyze --dry-run previews full payload without workflow side effects', () => {
    const out = run('analyze --file req.md --dry-run', cwd);
    assert.match(out, /predev-analysis/);
    assert.match(out, /"dry_run": true/);
    assert.match(out, /context_collection/);
    assert.match(out, /recommended_writes/);
    assert.match(out, /output_format/);
    assert.match(out, /不要把 dry-run 输出当作最终分析/);
    assert.doesNotMatch(out, /状态已更新/);
  });

  it('analyze without dry-run fails when there is no active task', () => {
    const idleCwd = mkdtempSync(join(tmpdir(), 'docpath-analyze-idle-'));
    mkdirSync(join(idleCwd, '.docpath', 'workspace'), { recursive: true });
    writeFileSync(join(idleCwd, '.docpath', 'config.yaml'), 'project:\n  name: analyze-idle-test\n');
    writeFileSync(join(idleCwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: '',
      task_title: '',
      phase: 'idle',
      gate: 'none',
      current_step: 'idle',
      started_at: '2026-06-09T00:00:00.000Z',
      updated_at: '2026-06-09T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(idleCwd, '.docpath', 'workspace', 'current.md'), '# Current\n');
    writeFileSync(join(idleCwd, '.docpath', 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');

    const out = run('analyze --content "new idea"', idleCwd);

    assert.match(out, /当前没有可写入 analysis 的活跃任务/);
    assert.match(out, /docpath analyze --dry-run/);
    assert.match(out, /docpath backlog capture/);
    rmSync(idleCwd, { recursive: true, force: true });
  });

  it('analyze defaults to deep mode with quality bar', () => {
    const out = run('analyze --file req.md', cwd);
    assert.match(out, /"mode": "deep"/);
    assert.match(out, /quality_bar/);
    assert.match(out, /功能需求矩阵/);
    assert.match(out, /测试策略/);
  });

  it('analyze accepts explicit quick mode while keeping structured sections', () => {
    const out = run('analyze --file req.md --mode quick', cwd);
    assert.match(out, /"mode": "quick"/);
    assert.match(out, /open-questions/);
  });

});
