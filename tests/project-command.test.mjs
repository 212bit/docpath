import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-project-cmd-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: project-command-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    workflow_profile: 'standard',
    task_id: '',
    task_title: '',
    phase: 'idle',
    gate: 'none',
    current_step: 'ready',
    started_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  return cwd;
}

function run(args, cwd, input) {
  return execFileSync('node', [BIN, ...args.match(/(?:[^\s"]+|"[^"]*")+/g).map((part) => part.replace(/^"|"$/g, ''))], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    input,
  }).trim();
}

function runResult(args, cwd) {
  try {
    return { code: 0, out: run(args, cwd) };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('project intake commands', () => {
  it('project capture creates intake state and copies content source', () => {
    const cwd = mkWorkspace();

    const out = run('project capture --title "New CRM" --content "API docs and product notes" --source-type requirements', cwd);

    assert.match(out, /project intake 已创建: P-\d{8}-new-crm/);
    assert.match(out, /recommended_command: docpath project analyze P-\d{8}-new-crm --dry-run/);
    const intakeDir = join(cwd, '.docpath', 'project-intake');
    const statePath = join(intakeDir, out.match(/project intake 已创建: (P-\d{8}-new-crm)/)?.[1], 'intake.json');
    assert.equal(existsSync(statePath), true);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    assert.equal(state.stage, 'captured');
    assert.equal(state.sources.length, 1);
    assert.equal(state.sources[0].type, 'requirements');
    assert.match(state.sources[0].content_path, /\.docpath\/project-intake\/P-\d{8}-new-crm\/sources\/source-001\.md/);
    assert.equal(readFileSync(join(cwd, state.sources[0].content_path), 'utf-8'), 'API docs and product notes');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('project capture records source references without copying content', () => {
    const cwd = mkWorkspace();

    const out = run('project capture --title "Partner API" --source-ref "docs/api.pdf" --source-type pdf', cwd);
    const intakeId = out.match(/project intake 已创建: (P-\d{8}-partner-api)/)?.[1];
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'intake.json'), 'utf-8'));

    assert.equal(state.sources[0].original_path, 'docs/api.pdf');
    assert.equal(state.sources[0].content_path, undefined);
    assert.equal(state.sources[0].type, 'pdf');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('project capture fails without source material and validates source type', () => {
    const cwd = mkWorkspace();

    const missing = runResult('project capture --title "No Source"', cwd);
    const invalidType = runResult('project capture --title "Bad Type" --content "x" --source-type binary', cwd);

    assert.notEqual(missing.code, 0);
    assert.match(missing.out, /requires --content, --file, --stdin, or --source-ref/);
    assert.notEqual(invalidType.code, 0);
    assert.match(invalidType.out, /--source-type 参数非法/);
    rmSync(cwd, { recursive: true, force: true });
  });
});

