/**
 * R-276: review 默认 task 口径 + done 复用绑定 HEAD 的验收回归
 * - AC-1: 活跃任务内树干净但有任务提交时, router 仍覆盖任务累计 diff
 * - AC-3: task 指纹同状态稳定, 新提交后变化
 * - AC-4: review 证据带 head 时, HEAD 前进拒绝复用; head 匹配/旧证据无 head 维持复用
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf-8', timeout: 30000 });
  return { code: result.status ?? 1, out: `${result.stdout || ''}${result.stderr || ''}` };
}

function git(cwd, args, env = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const STARTED_AT = '2026-06-01T00:00:00.000Z';
const BEFORE_TASK_DATE = '2026-05-01T00:00:00.000Z';

function mkTaskWorkspace(name) {
  const cwd = mkdtempSync(join(tmpdir(), name));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: r276-test\n');
  writeFileSync(join(dp, 'config.json'), JSON.stringify({ review_skill_gate: { min_diff_lines: 0 } }, null, 2));
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-R276',
    task_title: 'R-276 test task',
    phase: 'checking',
    state: 'in_progress',
    gate: 'check_pass',
    current_step: 'S1',
    started_at: STARTED_AT,
    updated_at: STARTED_AT,
  }, null, 2));
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# T-R276 - R-276 test task\n');
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  return cwd;
}

function installTypeScriptSkill(cwd) {
  const dir = join(cwd, '.docpath', 'review-skills', 'typescript');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '# TypeScript Review Skill\n\n## Scope\n\n## Review Checklist\n\n## Evidence Contract\n');
}

/** baseline 提交时间早于任务 started_at, 不应进入 task 口径。 */
function commitBaselineBeforeTask(cwd) {
  writeFileSync(join(cwd, 'baseline.ts'), 'export const baseline = true;\n');
  git(cwd, ['add', 'baseline.ts'], {});
  git(cwd, ['commit', '-m', 'baseline'], {
    GIT_AUTHOR_DATE: BEFORE_TASK_DATE,
    GIT_COMMITTER_DATE: BEFORE_TASK_DATE,
  });
}

function commitTaskChange(cwd, content) {
  writeFileSync(join(cwd, 'src', 'feature.ts'), content);
  git(cwd, ['add', 'src/feature.ts']);
  git(cwd, ['commit', '-m', 'task change']);
}

function extractFingerprint(out) {
  const match = out.match(/diff_fingerprint: (sha256:[0-9a-f]+)/);
  assert.ok(match, `expected diff_fingerprint in output:\n${out}`);
  return match[1];
}

describe('review task scope default (R-276)', () => {
  it('router covers committed task diff on a clean tree (AC-1)', () => {
    const cwd = mkTaskWorkspace('dp-r276-ac1-');
    installTypeScriptSkill(cwd);
    commitBaselineBeforeTask(cwd);
    mkdirSync(join(cwd, 'src'), { recursive: true });
    commitTaskChange(cwd, 'export const feature = 1;\n');

    const result = run(['review', '--cwd', cwd, '--dry-run'], cwd);

    assert.equal(result.code, 0);
    assert.match(result.out, /活跃任务默认走 task 累计 diff 审查/);
    assert.match(result.out, /scope: task/);
    assert.match(result.out, /review_skill_gate: required/);
    assert.match(result.out, /files: src\/feature\.ts/);
    assert.doesNotMatch(result.out, /baseline\.ts/);
    assert.match(result.out, /--scope task --stdin/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('task fingerprint is stable per git state and moves on new commits (AC-3)', () => {
    const cwd = mkTaskWorkspace('dp-r276-ac3-');
    installTypeScriptSkill(cwd);
    commitBaselineBeforeTask(cwd);
    mkdirSync(join(cwd, 'src'), { recursive: true });
    commitTaskChange(cwd, 'export const feature = 1;\n');

    const first = extractFingerprint(run(['review', '--cwd', cwd, '--dry-run'], cwd).out);
    const second = extractFingerprint(run(['review', '--cwd', cwd, '--dry-run'], cwd).out);
    assert.equal(first, second, 'same git state must produce a stable fingerprint');

    commitTaskChange(cwd, 'export const feature = 2;\n');
    const third = extractFingerprint(run(['review', '--cwd', cwd, '--dry-run'], cwd).out);
    assert.notEqual(first, third, 'a new task commit must move the fingerprint');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('task anchor survives phase transitions that refresh state.started_at (AC-1 锚点回归)', () => {
    const cwd = mkTaskWorkspace('dp-r276-anchor-');
    installTypeScriptSkill(cwd);
    commitBaselineBeforeTask(cwd);
    mkdirSync(join(cwd, 'src'), { recursive: true });
    commitTaskChange(cwd, 'export const feature = 1;\n');

    // canonical 任务 breadcrumb 首条时间 = 真任务起点 (早于任务提交)
    const taskDir = join(cwd, '.docpath', 'tasks', 'T-R276');
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, 'breadcrumb.jsonl'), `${JSON.stringify({ timestamp: STARTED_AT, type: 'task', step: 'promote' })}\n`);

    // 模拟 phase 转移把 state.started_at 刷新到任务提交之后 (transitions.ts 行为)
    const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    state.started_at = new Date(Date.now() + 60_000).toISOString();
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    const result = run(['review', '--cwd', cwd, '--dry-run'], cwd);

    assert.equal(result.code, 0);
    assert.match(result.out, /scope: task/);
    assert.match(result.out, /review_skill_gate: required/);
    assert.match(result.out, /files: src\/feature\.ts/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('review evidence records the git HEAD at review time', () => {
    const cwd = mkTaskWorkspace('dp-r276-head-');
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    commitBaselineBeforeTask(cwd);
    mkdirSync(join(cwd, 'src'), { recursive: true });
    commitTaskChange(cwd, 'export const feature = 1;\n');

    const result = run(['review', '--cwd', cwd, '--force'], cwd);
    assert.equal(result.code, 0);

    const reviewJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), 'utf-8'));
    const head = git(cwd, ['rev-parse', 'HEAD']).trim();
    assert.equal(reviewJson.head, head);
    rmSync(cwd, { recursive: true, force: true });
  });
});

describe('review reuse HEAD binding (R-276 AC-4)', () => {
  function mkReuseWorkspace(head) {
    const cwd = mkTaskWorkspace('dp-r276-reuse-');
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    commitBaselineBeforeTask(cwd);
    const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    state.gate = 'review_pass';
    state.phase = 'reviewing';
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    const evidence = {
      schema_version: 1,
      kind: 'review',
      timestamp: new Date().toISOString(),
      files: [],
      findings: [],
      errors: 0,
      warnings: 0,
      infos: 0,
      approved: true,
    };
    if (head !== undefined) evidence.head = head;
    writeFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), JSON.stringify(evidence, null, 2));
    return cwd;
  }

  it('rejects reuse and re-reviews when HEAD moved after the review', () => {
    const cwd = mkReuseWorkspace('0000000000000000000000000000000000000000');
    const result = run(['agent', 'done', '--skip-check', '--note', 'r276 test'], cwd);
    assert.match(result.out, /review reuse rejected: HEAD moved since review evidence/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reuses fresh approved evidence when HEAD matches', () => {
    const cwd = mkTaskWorkspace('dp-r276-reuse-match-');
    writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ review_skill_gate: { enabled: false, min_diff_lines: 0 } }, null, 2));
    commitBaselineBeforeTask(cwd);
    const head = git(cwd, ['rev-parse', 'HEAD']).trim();
    const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    state.gate = 'review_pass';
    state.phase = 'reviewing';
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    writeFileSync(join(cwd, '.docpath', 'workspace', 'review.json'), JSON.stringify({
      schema_version: 1,
      kind: 'review',
      timestamp: new Date().toISOString(),
      head,
      files: [],
      findings: [],
      errors: 0,
      warnings: 0,
      infos: 0,
      approved: true,
    }, null, 2));

    const result = run(['agent', 'done', '--skip-check', '--note', 'r276 test'], cwd);
    assert.match(result.out, /review reused: fresh approved evidence and review_pass gate are present/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('legacy evidence without head still reuses within the freshness window (backward compat)', () => {
    const cwd = mkReuseWorkspace(undefined);
    const result = run(['agent', 'done', '--skip-check', '--note', 'r276 test'], cwd);
    assert.match(result.out, /review reused: fresh approved evidence and review_pass gate are present/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
