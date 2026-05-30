import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from '/tmp/docpath-test-helpers.mjs';

const CLI = '/Users/mac/project/docpath/dist/index.js';
const run = (args, cwd) => {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || '');
  }
};

describe('check and review commands', () => {
  let tmpdir_path;
  before(() => {
    tmpdir_path = mkdtempSync(join(tmpdir(), 'docpath-check-'));
    mkExecWorkspace(tmpdir_path);
  });
  after(() => rmSync(tmpdir_path, { recursive: true, force: true }));

  it('check --dry-run produces output', () => {
    const out = run('check --dry-run', tmpdir_path);
    assert.ok(out.length > 0, 'dry-run should produce output');
  });

  it('check --skip-tests --skip-lint runs without errors', () => {
    const out = run('check --skip-tests --skip-lint', tmpdir_path);
    assert.ok(out.length > 0, 'should produce output');
  });

  it('review --dry-run produces output', () => {
    const out = run('review --dry-run', tmpdir_path);
    assert.ok(out.length > 0, 'dry-run should produce output');
  });
});
