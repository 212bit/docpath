import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

let deliverablesModule;

before(async () => {
  deliverablesModule = await import('../dist/utils/deliverables.js');
});

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-deliverables-'));
  const dp = join(cwd, '.docpath');
  const workspace = join(dp, 'workspace');
  const task = join(dp, 'tasks', 'current');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(task, { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: deliverables-test\n');
  writeFileSync(join(workspace, 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-DELIVERABLES',
    task_title: 'Deliverables',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-06-09T00:00:00.000Z',
    updated_at: '2026-06-09T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(workspace, 'current.md'), '# Current\n');
  writeFileSync(join(workspace, 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(task, 'spec.md'), '# Spec\n');
  writeFileSync(join(task, 'plan.md'), '# Plan\n');
  return cwd;
}

function run(args, cwd) {
  try {
    return {
      code: 0,
      out: execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }),
    };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('deliverables templates', () => {
  it('lists and renders core templates', () => {
    const templates = deliverablesModule.listDeliverableTemplates();
    assert.deepEqual(
      templates.map((template) => template.id),
      ['prd', 'competitive-analysis', 'architecture-brief', 'prototype-review', 'qa-report', 'stakeholder-update'],
    );
    const rendered = deliverablesModule.renderDeliverableTemplate('prd');
    assert.match(rendered, /^# PRD/m);
    assert.match(rendered, /^## TL;DR/m);
    assert.match(rendered, /^## Non-goals \/ Assumptions/m);
  });

  it('renders to a file and records the task deliverables index', () => {
    const cwd = mkWorkspace();
    const result = run('deliverables render --template prd --output deliverables/product-strategy/prd.md', cwd);
    assert.equal(result.code, 0);

    const output = readFileSync(join(cwd, 'deliverables', 'product-strategy', 'prd.md'), 'utf-8');
    const index = JSON.parse(readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'deliverables.json'), 'utf-8'));
    assert.match(output, /^## 核心结论/m);
    assert.equal(index.entries.length, 1);
    assert.equal(index.entries[0].template, 'prd');
    assert.equal(index.entries[0].path, 'deliverables/product-strategy/prd.md');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('fails loud when an indexed deliverable misses required sections', () => {
    const cwd = mkWorkspace();
    run('deliverables render --template qa-report --output deliverables/qa/qa-report.md', cwd);
    writeFileSync(join(cwd, 'deliverables', 'qa', 'qa-report.md'), '# QA Report\n\n## TL;DR\n\nok\n');

    const deliverablesCheck = run('deliverables check', cwd);
    assert.equal(deliverablesCheck.code, 1);
    assert.match(deliverablesCheck.out, /missing_sections/);
    assert.match(deliverablesCheck.out, /核心结论/);

    const docpathCheck = run('check --skip-tests --cwd ' + cwd, cwd);
    assert.equal(docpathCheck.code, 1);
    assert.match(docpathCheck.out, /Deliverables 必填章节校验/);
    assert.match(docpathCheck.out, /deliverables\/qa\/qa-report\.md/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('initializes lifecycle profiles and generates stage artifacts', () => {
    const cwd = mkWorkspace();

    const init = run('deliverables init --profile regulated', cwd);
    assert.equal(init.code, 0);
    assert.match(init.out, /lifecycle profile initialized: regulated/);
    assert.ok(existsSync(join(cwd, '.docpath', 'lifecycle.yaml')));
    assert.ok(existsSync(join(cwd, '.docpath', 'lifecycle-registry.json')));

    const status = run('deliverables status', cwd);
    assert.equal(status.code, 0);
    assert.match(status.out, /user_stories/);
    assert.match(status.out, /sources not declared/);

    const generated = run('deliverables generate user-stories', cwd);
    assert.equal(generated.code, 0);
    assert.ok(existsSync(join(cwd, 'docs', 'deliverables', '01-user-stories.md')));

    const check = run('deliverables check', cwd);
    assert.equal(check.code, 1);
    assert.match(check.out, /lifecycle_issues/);
    assert.match(check.out, /user_requirements/);
    assert.match(check.out, /warnings/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('generates and checks a trace matrix from lifecycle artifacts', () => {
    const cwd = mkWorkspace();
    assert.equal(run('deliverables init --profile regulated', cwd).code, 0);
    assert.equal(run('deliverables generate user-stories', cwd).code, 0);
    writeFileSync(join(cwd, 'docs', 'deliverables', '01-user-stories.md'), [
      '# User Stories',
      '',
      '- US-001 Signing flow maps to REQ-SIGNING, RA-Signing, S3, R-007, T-signing, DD-Signing.',
      '- Code: src/commands/signing.ts',
      '- Test: tests/signing.test.mjs',
      '',
    ].join('\n'));

    const status = run('trace matrix status', cwd);
    assert.equal(status.code, 0);
    assert.match(status.out, /Trace matrix: 1 entries, 0 gaps/);

    const generate = run('trace matrix generate', cwd);
    assert.equal(generate.code, 0);
    assert.match(generate.out, /trace matrix generated/);
    const matrix = readFileSync(join(cwd, 'docs', 'deliverables', 'trace-matrix.md'), 'utf-8');
    assert.match(matrix, /US-001/);
    assert.match(matrix, /REQ-SIGNING/);

    const check = run('trace matrix check', cwd);
    assert.equal(check.code, 0);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('keeps trace matrix references scoped to each story row', () => {
    const cwd = mkWorkspace();
    assert.equal(run('deliverables init --profile regulated', cwd).code, 0);
    assert.equal(run('deliverables generate user-stories', cwd).code, 0);
    writeFileSync(join(cwd, 'docs', 'deliverables', '01-user-stories.md'), [
      '# User Stories',
      '',
      '- US-001 Signing flow maps to REQ-SIGNING, RA-Signing, S3, R-007, T-signing, DD-Signing, src/commands/signing.ts, tests/signing.test.mjs.',
      '- US-002 Receipt flow maps to REQ-RECEIPT, RA-Receipt, S6, R-005, T-receipt, DD-Receipt, src/commands/receipt.ts, tests/receipt.test.mjs.',
      '',
    ].join('\n'));

    const generate = run('trace matrix generate', cwd);
    assert.equal(generate.code, 0);
    const matrix = readFileSync(join(cwd, 'docs', 'deliverables', 'trace-matrix.md'), 'utf-8');
    assert.match(matrix, /US-001 .*REQ-SIGNING .*R-007 .*T-signing .*DD-Signing .*src\/commands\/signing\.ts .*tests\/signing\.test\.mjs/);
    assert.match(matrix, /US-002 .*REQ-RECEIPT .*R-005 .*T-receipt .*DD-Receipt .*src\/commands\/receipt\.ts .*tests\/receipt\.test\.mjs/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('fails loud when generating trace matrix without lifecycle config', () => {
    const cwd = mkWorkspace();
    const result = run('trace matrix generate', cwd);

    assert.equal(result.code, 1);
    assert.match(result.out, /Trace matrix requires lifecycle profile/);

    rmSync(cwd, { recursive: true, force: true });
  });
});
