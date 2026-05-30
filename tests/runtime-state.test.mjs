import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLI = '/Users/mac/project/docpath/dist/index.js';

function mkExecWorkspace() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-runtime-'));
  fs.mkdirSync(path.join(tmp, '.docpath', 'workspace'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.docpath', 'tasks', 'current'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'state.json'), JSON.stringify({ phase: 'executing', gate: 'none', state: 'step_started' }));
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'current.md'), '# current.md\n## 当前任务\nrun test');
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'breadcrumb.md'), '# breadcrumb.md\n');
  fs.writeFileSync(path.join(tmp, '.docpath', 'tasks', 'current', 'plan.md'), '# Plan\n## 1. Run Step\n- [ ] subtask\n');
  return tmp;
}
function run(args, cwd) {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return ((e.stdout || '') + (e.stderr || '')).toString().trim();
  }
}

describe('docpath runtime lifecycle', () => {
  let tmpDir;
  before(() => { tmpDir = mkExecWorkspace(); });
  after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('run start marks execution start', () => {
    const out = run('run start', tmpDir);
    assert.match(out, /run-start|执行开始/i, `got: ${out.slice(0, 100)}`);
  });

  it('run end marks execution done', () => {
    const out = run('run end', tmpDir);
    assert.match(out, /run-end|执行结束|done/i, `got: ${out.slice(0, 100)}`);
  });

  it('compact produces context file', () => {
    const out = run('compact', tmpDir);
    assert.match(out, /compact|压缩|saved/i, `got: ${out.slice(0, 100)}`);
  });

  it('discover finds context files', () => {
    const out = run('discover', tmpDir);
    assert.match(out, /Discovery|state\.json|current\.md/i, `got: ${out.slice(0, 100)}`);
  });

  it('next suggests next command', () => {
    const out = run('next', tmpDir);
    assert.match(out, /下一步|建议|next/i, `got: ${out.slice(0, 100)}`);
  });
});
