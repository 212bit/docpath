import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function mkRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-smart-plan-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: smart-plan-test\n');

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
    timeout: 20000,
  }).trim();
}

describe('smart spec extraction & module-driven plan generation', () => {
  it('extracts multi-FR spec and generates per-FR module steps from compound title', () => {
    const cwd = mkRepo();

    // 1. 一键拉起复合标题任务
    const title = 'HTTP C2 优化：握手合并 + Poll 精简 + Session Resumption + HTTP/2';
    run(['start', title, '--draft'], cwd);

    // 2. 验证生成的 spec.md 具备结构化 FR-1..4
    const spec = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8');
    assert.match(spec, /FR-1:\s*握手合并/);
    assert.match(spec, /FR-2:\s*Poll 精简/);
    assert.match(spec, /FR-3:\s*Session Resumption/);
    assert.match(spec, /FR-4:\s*HTTP\/2/);
    assert.match(spec, /AC-1:\s*握手合并/);

    // 3. 验证生成的 plan.md 为每个模块生成精准步骤，无“梳理”与“验证”等形式主义步骤
    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    assert.match(plan, /### S1:\s*实现并验证 FR-1 握手合并/);
    assert.match(plan, /### S2:\s*实现并验证 FR-2 Poll 精简/);
    assert.match(plan, /### S3:\s*实现并验证 FR-3 Session Resumption/);
    assert.match(plan, /### S4:\s*实现并验证 FR-4 HTTP\/2/);
    assert.doesNotMatch(plan, /### S1:\s*梳理/);
    assert.doesNotMatch(plan, /验证验收标准/);

    // 4. 依赖拓扑校验
    assert.match(plan, /S1 → S2 → S3 → S4/);
  });

  it('generates clean single-step plan for single-goal task', () => {
    const cwd = mkRepo();

    const title = '修复状态机并发竞争锁释放异常';
    run(['start', title, '--draft'], cwd);

    const plan = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.md'), 'utf-8');
    assert.match(plan, /### S1:\s*实现并验证 修复状态机并发竞争锁释放异常/);
    assert.doesNotMatch(plan, /### S2:/);
  });
});
