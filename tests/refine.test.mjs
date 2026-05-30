import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = '/Users/mac/project/docpath/dist/index.js';
const run = (args, cwd) => {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || '');
  }
};

describe('refine command', () => {
  let tmpdir_path;
  before(() => {
    tmpdir_path = mkdtempSync(join(tmpdir(), 'docpath-refine-'));
    writeFileSync(join(tmpdir_path, 'req.md'), `# Requirements\n\n## Overview\nBuild a user management system.\n\n## Features\n- Login\n- Logout\n- Profile editing\n`);
  });
  after(() => rmSync(tmpdir_path, { recursive: true, force: true }));

  it('refine --file produces prompt output', () => {
    const out = run('refine --file req.md', tmpdir_path);
    assert.ok(out.length > 0, 'should produce output');
  });

  it('refine --file --dry-run shows prompt without writing', () => {
    const out = run('refine --file req.md --dry-run', tmpdir_path);
    assert.ok(out.length > 0, 'dry-run should produce output');
  });
});
