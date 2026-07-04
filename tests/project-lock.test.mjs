import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exec } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-lock-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: lock-test\n');
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
  return cwd;
}

describe('project intake lock mechanism', () => {
  it('uses lock files to prevent concurrent RMW conflicts', async () => {
    const cwd = mkWorkspace();

    // Create intake
    const { stdout: capture } = await execAsync(`node ${BIN} project capture --title "Lock Test" --content "source"`, { cwd });
    const intakeId = capture.match(/project intake 已创建: (P-\d{8}-lock-test)/)?.[1];
    assert.ok(intakeId, 'Should extract intake ID');

    // Write one analysis section
    await execAsync(`node ${BIN} project analyze ${intakeId} --section requirements --stdin`, {
      cwd,
      input: '## Requirements\n'
    });

    // Verify lock file was created and cleaned up
    const lockPath = join(cwd, '.docpath', 'project-intake', `${intakeId}.lock`);
    assert.equal(existsSync(lockPath), false, 'Lock file should be cleaned up after operation');

    // Verify state was updated
    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'intake.json'), 'utf-8'));
    assert.equal(state.artifacts.length, 1);
    assert.equal(state.artifacts[0].kind, 'analysis');

    rmSync(cwd, { recursive: true, force: true });
  });

  it('sequential updates work correctly with locks', async () => {
    const cwd = mkWorkspace();

    const { stdout: capture } = await execAsync(`node ${BIN} project capture --title "Sequential" --content "src"`, { cwd });
    const intakeId = capture.match(/project intake 已创建: (P-\d{8}-sequential)/)?.[1];

    // Sequential writes
    await execAsync(`node ${BIN} project analyze ${intakeId} --section requirements --stdin`, {
      cwd,
      input: '## Req\n'
    });
    await execAsync(`node ${BIN} project analyze ${intakeId} --section product --stdin`, {
      cwd,
      input: '## Prod\n'
    });

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'project-intake', intakeId, 'intake.json'), 'utf-8'));
    assert.equal(state.artifacts.length, 2);

    rmSync(cwd, { recursive: true, force: true });
  });
});
