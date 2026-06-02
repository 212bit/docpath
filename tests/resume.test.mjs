import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({
  phase = 'drafting',
  gate = 'none',
  taskId = 'T-RESUME',
  taskTitle = 'Resume Routing',
  plan = '# Plan\n\n- [ ] S1: draft spec\n',
  writePlan = true,
  breadcrumb,
} = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-resume-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: resume-test\n');
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
    `### ✅ S1 [${taskId}] — 2026-05-31T00:00:00.000Z`,
    '',
    '---',
    `taskId: ${taskId}`,
    'step: S1',
    'status: done',
    'timestamp: 2026-05-31T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    '- **上下文**: done',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'workspace', 'last-check.md'), '# Last Check Evidence\n\n**结果**: ✅ PASS\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), `# ${taskId} - ${taskTitle}\n`);
  if (writePlan) {
    writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), plan);
  }

  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('resume command', () => {
  it('shows router-aligned recommendation for drafting task', () => {
    const cwd = mkWorkspace({
      phase: 'drafting',
      gate: 'none',
      writePlan: false,
      breadcrumb: '# Breadcrumb\n',
    });

    const output = run(`resume --cwd ${cwd}`, cwd);

    assert.match(output, /推荐命令: docpath plan/);
    assert.match(output, /spec 已就绪，生成执行计划/);
    assert.doesNotMatch(output, /docpath:go|docpath:review|docpath:journal/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('shows router-aligned recommendation for completed task', () => {
    const cwd = mkWorkspace({
      phase: 'completed',
      gate: 'review_pass',
      taskId: 'T-DONE',
      taskTitle: 'Done Resume',
      plan: '# Plan\n\n- [x] S1: archived\n',
    });

    const output = run(`resume --cwd ${cwd} --verbose`, cwd);

    assert.match(output, /推荐命令: docpath backlog add/);
    assert.match(output, /任务已完成，可启动新任务/);
    assert.match(output, /建议先读文件:/);
    assert.doesNotMatch(output, /docpath:go|docpath:review|docpath:journal/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
