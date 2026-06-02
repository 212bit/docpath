import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({
  phase = 'completed',
  gate = 'review_pass',
  taskId = 'T-CONT',
  taskTitle = 'Continue Routing',
  plan = '',
  breadcrumb,
} = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-continue-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: continue-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: taskId,
    task_title: taskTitle,
    phase,
    gate,
    current_step: 'S1',
    started_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), breadcrumb || [
    '# Breadcrumb',
    '',
    `### ✅ review [${taskId}] — 2026-05-31T00:00:00.000Z`,
    '',
    '---',
    `taskId: ${taskId}`,
    'step: review',
    'status: done',
    'timestamp: 2026-05-31T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    '- **上下文**: 审查通过',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'workspace', 'last-check.md'), '# Last Check Evidence\n\n**结果**: ✅ PASS\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), `# ${taskId} - ${taskTitle}\n`);
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), plan);

  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('continue command', () => {
  it('shows router-aligned recommendation for completed task', () => {
    const cwd = mkWorkspace({
      phase: 'completed',
      gate: 'review_pass',
    });

    const output = run(`continue --cwd ${cwd}`, cwd);

    assert.match(output, /推荐命令: docpath backlog add/);
    assert.match(output, /任务已完成，可启动新任务/);
    assert.doesNotMatch(output, /docpath:/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('shows next-step recommendation for active executing task', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      taskId: 'T-ACTIVE',
      taskTitle: 'Active Continue',
      plan: '# Plan\n\n- [x] S1: done\n- [ ] S2: implement continue\n',
      breadcrumb: [
        '# Breadcrumb',
        '',
        '### ✅ S1 [T-ACTIVE] — 2026-05-31T00:00:00.000Z',
        '',
        '---',
        'taskId: T-ACTIVE',
        'step: S1',
        'status: done',
        'timestamp: 2026-05-31T00:00:00.000Z',
        '---',
        '',
        '- **状态**: done',
        '- **上下文**: done',
        '',
      ].join('\n'),
    });

    const output = run(`continue --cwd ${cwd} --verbose`, cwd);

    assert.match(output, /推荐命令: docpath go --step S2/);
    assert.match(output, /执行下一个未完成步骤: S2/);
    assert.match(output, /建议先读文件:/);
    assert.doesNotMatch(output, /docpath:continue/);
    assert.doesNotMatch(output, /planning_done|build_pass|review_pass/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
