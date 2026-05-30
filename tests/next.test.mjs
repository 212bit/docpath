import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse } from 'yaml';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({ phase = 'idle', gate = 'none', plan = '', lastCheck = '', breadcrumb = '# Breadcrumb\n' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-next-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: next-test\n');
  writeFileSync(join(dp, 'spec', 'architecture.md'), '# Architecture\n');
  writeFileSync(join(dp, 'spec', 'style.md'), '# Style\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-NEXT',
    task_title: 'Next routing',
    phase,
    gate,
    current_step: 'routing',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), breadcrumb);
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), plan);
  if (lastCheck) writeFileSync(join(dp, 'workspace', 'last-check.md'), lastCheck);
  return cwd;
}

function nextAgent(cwd) {
  const output = execSync(`node ${BIN} next --cwd ${cwd} --agent`, { encoding: 'utf-8' });
  return parse(output);
}

describe('next --agent routing', () => {
  it('recommends task creation for a newly initialized project', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath brainstorm');
    assert.match(output.next_action, /创建|导入/);
    assert.ok(output.required_files.includes('.docpath/workspace/current.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('recommends the next incomplete plan step', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: '# Plan\n\n- [x] S1: done\n- [ ] S2: implement routing\n',
      breadcrumb: [
        '# Breadcrumb',
        '',
        '### ✅ S1 [T-NEXT] — 2026-05-29T00:00:00.000Z',
        '',
        '---',
        'taskId: T-NEXT',
        'step: S1',
        'status: done',
        'timestamp: 2026-05-29T00:00:00.000Z',
        '---',
        '',
        '- **状态**: done',
        '- **上下文**: done',
        '',
      ].join('\n'),
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath go --step S2');
    assert.match(output.next_action, /S2/);
    assert.ok(output.required_files.includes('.docpath/tasks/current/plan.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes check failures into debug', () => {
    const cwd = mkWorkspace({
      phase: 'checking',
      gate: 'check_fail',
      lastCheck: '# Last Check Evidence\n\n**结果**: ❌ FAIL\n',
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath debug reproduce');
    assert.match(output.next_action, /修复质量检查失败/);
    assert.ok(output.required_files.includes('.docpath/workspace/last-check.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes review_pass into journal', () => {
    const cwd = mkWorkspace({
      phase: 'reviewing',
      gate: 'review_pass',
      lastCheck: '# Last Check Evidence\n\n**结果**: ✅ PASS\n',
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath journal');
    assert.match(output.next_action, /知识归档/);
    assert.ok(output.required_files.includes('.docpath/workspace/review.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes plan/breadcrumb drift into check', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: '# Plan\n\n- [x] S1: implemented without breadcrumb\n',
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath check');
    assert.match(output.next_action, /漂移/);
    assert.ok(output.must_update.includes('.docpath/workspace/breadcrumb.md'));
    assert.ok(output.must_update.includes('.docpath/tasks/current/plan.md'));
    rmSync(cwd, { recursive: true, force: true });
  });
});
