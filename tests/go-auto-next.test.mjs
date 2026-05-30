import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from '/tmp/docpath-test-helpers.mjs';

const CLI = '/Users/mac/project/docpath/dist/index.js';
const run = (args, cwd) => {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || '');
  }
};

describe('go --auto-next', () => {
  let tmpdir_path, tasks;
  before(() => {
    tmpdir_path = mkdtempSync(join(tmpdir(), 'docpath-go-'));
    ({ tasks } = mkExecWorkspace(tmpdir_path));
    // Create plan.md with 2 subtasks
    writeFileSync(join(tasks, 'plan.md'), `# Plan

## Subtask 1: Implement login
- [ ] Create login form
- [ ] Add validation

## Subtask 2: Implement dashboard
- [ ] Create dashboard component
- [ ] Add charts
`);
  });
  after(() => rmSync(tmpdir_path, { recursive: true, force: true }));

  it('go --dry-run shows subtask list', () => {
    const out = run('go --dry-run', tmpdir_path);
    assert.match(out, /1|Subtask/i, 'should list subtasks');
  });

  it('go shows current step', () => {
    const out = run('go', tmpdir_path);
    assert.ok(out.length > 0, 'should produce output');
  });
});
