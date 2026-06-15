import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function mkJsonOnlyWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-render-'));
  const dp = join(cwd, '.docpath');
  const workspace = join(dp, 'workspace');
  const currentTask = join(dp, 'tasks', 'current');
  const canonicalTask = join(dp, 'tasks', 'T-RENDER');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(currentTask, { recursive: true });
  mkdirSync(canonicalTask, { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: render-test\n');

  writeJson(join(workspace, 'state.json'), {
    level: 2,
    task_id: 'T-RENDER',
    task_title: 'Render Views',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  });
  writeFileSync(join(workspace, 'breadcrumb.jsonl'), `${JSON.stringify({
    schema_version: 1,
    kind: 'breadcrumb',
    taskId: 'T-RENDER',
    step: 'S1',
    status: 'done',
    context: 'JSONL breadcrumb',
    timestamp: '2026-06-01T00:00:00.000Z',
  })}\n`);
  writeJson(join(workspace, 'last-check.json'), {
    schema_version: 1,
    kind: 'last-check',
    timestamp: '2026-06-01T00:10:00.000Z',
    passed: true,
    check_count: 1,
    checks: [{ name: 'JSON check', passed: true, output: '' }],
  });
  writeJson(join(workspace, 'review.json'), {
    schema_version: 1,
    kind: 'review',
    timestamp: '2026-06-01T00:20:00.000Z',
    files: ['src/render.ts'],
    findings: [],
    errors: 0,
    warnings: 0,
    infos: 0,
    approved: true,
  });

  const specJson = {
    schema_version: 1,
    kind: 'spec',
    source: {
      kind: 'markdown',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
    task_id: 'T-RENDER',
    backlog_id: 'R-RENDER',
    title: 'T-RENDER - Render Views',
    markdown: '',
    generated_at: '2026-06-01T00:00:00.000Z',
    scope: {
      included: ['render command'],
      excluded: ['manual Markdown maintenance'],
    },
    major_change_gate: {
      required: false,
      types: [],
      user_confirmed: 'confirmed in test',
      decision_brief_markdown: '- 用户确认: confirmed in test',
    },
    ui_gate: {
      state: 'exempt',
    },
    functional_requirements: [{ id: 'FR-1', text: 'render spec from JSON', done: false }],
    non_functional_requirements: [{ id: 'NFR-1', text: 'preserve JSON truth', done: false }],
    acceptance_criteria: [{ id: 'AC-1', text: 'Markdown views regenerate', done: false }],
  };
  const planJson = {
    schema_version: 1,
    kind: 'plan',
    source: {
      kind: 'markdown',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
    title: 'Render plan',
    markdown: '',
    generated_at: '2026-06-01T00:00:00.000Z',
    steps: [{
      id: 'S1',
      name: 'Render JSON views',
      description: 'Regenerate Markdown from JSON',
      acceptance: 'render --all writes views',
      dependencies: 'none',
      status: 'done',
    }],
  };
  for (const dir of [currentTask, canonicalTask]) {
    writeJson(join(dir, 'spec.json'), specJson);
    writeJson(join(dir, 'plan.json'), planJson);
  }

  return { cwd, workspace, currentTask, canonicalTask };
}

describe('render command', () => {
  it('regenerates all Markdown views from JSON and JSONL truth files', () => {
    const { cwd, workspace, currentTask, canonicalTask } = mkJsonOnlyWorkspace();

    const out = run(`render --cwd ${cwd} --all`, cwd);

    assert.match(out, /current/);
    assert.match(out, /spec/);
    assert.match(out, /plan/);
    assert.match(out, /breadcrumb/);
    assert.match(out, /check/);
    assert.match(out, /review/);
    for (const file of [
      join(workspace, 'current.md'),
      join(workspace, 'breadcrumb.md'),
      join(workspace, 'last-check.md'),
      join(workspace, 'review.md'),
      join(currentTask, 'spec.md'),
      join(currentTask, 'plan.md'),
      join(canonicalTask, 'spec.md'),
      join(canonicalTask, 'plan.md'),
    ]) {
      assert.equal(existsSync(file), true, `${file} should be rendered`);
    }
    assert.match(readFileSync(join(workspace, 'current.md'), 'utf-8'), /JSONL breadcrumb/);
    assert.match(readFileSync(join(workspace, 'last-check.md'), 'utf-8'), /JSON check/);
    assert.match(readFileSync(join(workspace, 'review.md'), 'utf-8'), /代码审查: 0 错误, 0 警告, 0 提示/);
    assert.match(readFileSync(join(currentTask, 'spec.md'), 'utf-8'), /FR-1: render spec from JSON/);
    assert.match(readFileSync(join(canonicalTask, 'plan.md'), 'utf-8'), /S1: Render JSON views/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('prints a single rendered view', () => {
    const { cwd } = mkJsonOnlyWorkspace();

    const out = run(`render --cwd ${cwd} --view check`, cwd);

    assert.match(out, /# Last Check Evidence/);
    assert.match(out, /\*\*结果\*\*: ✅ PASS/);
    assert.match(out, /JSON check/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
