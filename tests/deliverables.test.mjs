import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
});
