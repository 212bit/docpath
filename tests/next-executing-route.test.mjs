// R-364 回归：executing 期 next 应推荐 go --step（而非一次性会话入口 agent enter）
//
// 背景：原实现把 agent enter（会话入口，加载状态+写 pending-done 哨兵）当作 executing 期
// 的「下一步」，与自身 exit_criteria 矛盾（哨兵生成后 next 不再走该分支），且真正推进任务
// 的是 go --step <id>。
//
// 覆盖：
//   1. executing + plan 有未完成步骤 → recommended_command = docpath go --step <id>
//   2. 无 plan / plan 不可解析 → 保守降级（仍给出可执行命令，不误导）
//   3. plan 全部完成 → 不再给执行期提示（R-363 已覆盖，此处防回归）

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function run(args, cwd) {
  return execFileSync('node', [BIN, ...args.split(/\s+/)], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** 建真实 git 仓 + active 任务；plan 传 null 表示不写 plan.md。 */
function mkRepo({ taskId = 'T-R364', plan }) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-r364-'));
  const dp = join(cwd, '.docpath');
  const taskDir = join(dp, 'tasks', taskId);
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: r364-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: taskId,
    task_title: 'R364 next routing',
    phase: 'executing',
    gate: 'none',
    current_step: '',
    workflow_profile: 'standard',
    started_at: '2026-09-23T00:00:00.000Z',
    updated_at: '2026-09-23T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(taskDir, 'spec.md'), `# ${taskId}\n\n## 3. 范围界定\n\n### 包含\n- x\n\n### 不包含\n- y\n`);
  if (plan !== null) writeFileSync(join(taskDir, 'plan.md'), plan);
  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', 'init']);
  return cwd;
}

describe('R-364: executing 期 next 路由', () => {
  it('有未完成步骤时推荐 go --step <id>，而非 agent enter', () => {
    // 注意：plan 勾选项必须与 breadcrumb 一致，否则会先命中 plan/breadcrumb 漂移分支。
    // 这里用「全部未勾选」构造干净的执行期。
    const cwd = mkRepo({ plan: '# Plan\n\n- [ ] S1: todo\n- [ ] S2: todo\n' });

    const out = run('next --agent', cwd);

    assert.match(
      out,
      /recommended_command:\s*"?docpath go --step S1/,
      `应推荐第一个未完成步骤 S1，实际:\n${out}`,
    );
    assert.doesNotMatch(
      out,
      /recommended_command:\s*"?docpath agent enter/,
      `不应把一次性会话入口 agent enter 当下一步，实际:\n${out}`,
    );
  });

  it('无 plan 时保守降级且不误导为已完成', () => {
    const cwd = mkRepo({ plan: null });

    const out = run('next --agent', cwd);

    // 降级路径允许推荐 agent enter，但必须仍可执行（不得退化为空/不存在命令）
    const cmd = out.match(/recommended_command:\s*"?([^\n"]+)/)?.[1]?.trim() ?? '';
    assert.ok(cmd.length > 0, `必须给出可执行的 recommended_command，实际:\n${out}`);
    assert.match(cmd, /^docpath /, `推荐命令应是合法 docpath 命令，实际: ${cmd}`);
  });

  it('plan 全部完成时不给执行期提示（防 R-363 回归）', () => {
    // plan 全勾选时需有对应 breadcrumb 记录，否则先命中漂移分支；
    // 这里直接验证：即便在干净的全完成态，也不得推荐 agent enter。
    const cwd = mkRepo({ plan: '# Plan\n\n- [x] S1: done\n' });
    writeFileSync(
      join(cwd, '.docpath', 'workspace', 'breadcrumb.md'),
      ['# Breadcrumb', '', '### ✅ S1 [T-R364] — 2026-09-23T00:00:00.000Z', '', '---', 'taskId: T-R364', 'step: S1', 'status: done', 'timestamp: 2026-09-23T00:00:00.000Z', '---', '', '- **状态**: done', '- **上下文**: done', ''].join('\n'),
    );

    const out = run('next --agent', cwd);

    assert.doesNotMatch(
      out,
      /recommended_command:\s*"?docpath agent enter/,
      `plan 全完成时不应推荐 agent enter，实际:\n${out}`,
    );
    assert.doesNotMatch(
      out,
      /开始或恢复任务执行/,
      `plan 全完成时不应给执行期提示，实际:\n${out}`,
    );
  });
});
