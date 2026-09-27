import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPlanBreadcrumbDrift } from '../dist/commands/check/validators.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeBreadcrumbLine(step, status = 'done', context = '') {
  return JSON.stringify({
    schema_version: 1,
    kind: 'breadcrumb',
    timestamp: new Date().toISOString(),
    taskId: 'T-SUGG',
    step,
    status,
    context,
  });
}

function mkWorkspace({ plan = '# Plan\n\n- [ ] S1: Step 1\n', breadcrumb = '' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-fix-sugg-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-SUGG'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: fix-sugg-test\n  type: node\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-SUGG',
    task_title: 'Fix suggestion test',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-09-27T00:00:00.000Z',
    updated_at: '2026-09-27T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.jsonl'), breadcrumb);
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Spec\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), plan);
  writeFileSync(join(dp, 'tasks', 'T-SUGG', 'plan.md'), plan);
  return cwd;
}

describe('Fix suggestions integrity and validity', () => {
  it('does not generate invalid agent step suggestions for system events like task.pop or task.stash', async () => {
    const cwd = mkWorkspace({
      plan: '## 执行计划\n\n### S1: Step 1\n- [ ] S1: Step 1\n',
      breadcrumb: `${makeBreadcrumbLine('task.pop', 'done', 'pop')}\n${makeBreadcrumbLine('task.stash', 'done', 'stash')}\n`,
    });
    try {
      const results = await checkPlanBreadcrumbDrift(cwd);
      assert.equal(results.length, 0, 'System events must never produce Plan/Breadcrumb drift');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('generates accurate fix command when real business step breadcrumb is done without plan', async () => {
    const cwd = mkWorkspace({
      plan: '## 执行计划\n\n### S1: Step 1\n- [ ] S1: Step 1\n',
      breadcrumb: `${makeBreadcrumbLine('S1', 'done', 'done')}\n`,
    });
    try {
      const results = await checkPlanBreadcrumbDrift(cwd);
      assert.equal(results.length, 1);
      assert.match(results[0].output, /docpath agent step --step S1 --status done/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('generates accurate claim command when plan is marked done without breadcrumb evidence', async () => {
    const cwd = mkWorkspace({
      plan: '## 执行计划\n\n### S1: Step 1\n- [x] S1: Step 1\n',
      breadcrumb: '',
    });
    try {
      const results = await checkPlanBreadcrumbDrift(cwd);
      assert.equal(results.length, 1);
      assert.match(results[0].output, /docpath go --step S1/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
