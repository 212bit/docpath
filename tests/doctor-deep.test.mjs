import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-doctor-deep-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-DOC'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: doctor-deep-test\n  type: node\n');
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style Rules\n\n- Rule 1: No any\n');
  writeFileSync(join(dp, 'rules', 'architecture.md'), '# Architecture\n\n- Layer rules\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-DOC',
    task_title: 'Doctor Deep Test',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-09-27T00:00:00.000Z',
    updated_at: '2026-09-27T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Spec\n');
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '## 执行计划\n\n### S1: Step 1\n- [ ] S1: Step 1\n');
  writeFileSync(join(dp, 'tasks', 'T-DOC', 'plan.md'), '## 执行计划\n\n### S1: Step 1\n- [ ] S1: Step 1\n');

  // init git
  execSync('git init -q && git config user.name "Test" && git config user.email "test@test.com"', { cwd });
  return cwd;
}

function run(args, cwd) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 }),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('docpath doctor --deep / --consistency', () => {
  it('runs comprehensive deep consistency check across task state, architecture, docs, rules, and budget', () => {
    const cwd = mkWorkspace();
    try {
      const res = run(`doctor --deep --cwd ${cwd}`, cwd);
      assert.equal(res.code, 0);
      assert.match(res.out, /任务状态与步骤一致性/);
      assert.match(res.out, /架构分层与依赖健康度/);
      assert.match(res.out, /活文档与索引生态/);
      assert.match(res.out, /Rules & ADR 规则体检/);
      assert.match(res.out, /上下文 Token 预算/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('outputs structured JSON when --json flag is passed with --deep', () => {
    const cwd = mkWorkspace();
    try {
      const res = run(`doctor --deep --json --cwd ${cwd}`, cwd);
      assert.equal(res.code, 0);
      const json = JSON.parse(res.out);
      assert.equal(json.passed, true);
      assert.ok(json.task_consistency);
      assert.equal(json.task_consistency.active_task, 'T-DOC');
      assert.ok(json.architecture);
      assert.ok(json.rules);
      assert.ok(json.budget);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
