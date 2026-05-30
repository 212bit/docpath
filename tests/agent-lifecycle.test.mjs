import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLI = '/Users/mac/project/docpath/dist/index.js';

function mkExecWorkspace() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-agent-'));
  fs.mkdirSync(path.join(tmp, '.docpath', 'workspace'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.docpath', 'tasks', 'current'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'state.json'), JSON.stringify({ phase: 'executing', gate: 'none', state: 'step_started' }));
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'current.md'), '# current.md\n## 当前任务\ntest');
  fs.writeFileSync(path.join(tmp, '.docpath', 'workspace', 'breadcrumb.md'), '# breadcrumb.md\n');
  fs.writeFileSync(path.join(tmp, '.docpath', 'tasks', 'current', 'plan.md'), '# Plan\n## 1. Step\n- [ ] subtask\n');
  return tmp;
}
function run(args, cwd) {
  try {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return ((e.stdout || '') + (e.stderr || '')).toString().trim();
  }
}

describe('docpath agent lifecycle', () => {
  let tmpDir;
  before(() => { tmpDir = mkExecWorkspace(); });
  after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('agent enter returns context', () => {
    const out = run('agent enter', tmpDir);
    assert.match(out, /agent_context|state|phase/i, `agent enter should return context, got: ${out.slice(0, 120)}`);
  });

  it('agent step records progress', () => {
    const out = run('agent step', tmpDir);
    assert.match(out, /step|progress|记录/i, `got: ${out.slice(0, 100)}`);
  });

  it('agent done completes task', () => {
    const out = run('agent done', tmpDir);
    assert.match(out, /done|完成|归档/i, `got: ${out.slice(0, 100)}`);
  });
});
