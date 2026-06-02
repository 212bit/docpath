import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const {
  writePendingDone,
  readPendingDone,
  clearPendingDone,
  markPendingDoneWarned,
} = await import('../dist/utils/pending-done.js');

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-pending-done-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: pending-done-test\n');
  return cwd;
}

describe('pending-done helpers', () => {
  it('writes and reads pending-done record', async () => {
    const cwd = mkWorkspace();
    await writePendingDone(cwd, {
      task_id: 'T-PENDING',
      entered_at: '2026-06-01T00:00:00.000Z',
      phase: 'executing',
    });

    const record = await readPendingDone(cwd);
    assert.deepEqual(record, {
      task_id: 'T-PENDING',
      entered_at: '2026-06-01T00:00:00.000Z',
      phase: 'executing',
      warned: false,
    });
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns null when file is missing', async () => {
    const cwd = mkWorkspace();
    const record = await readPendingDone(cwd);
    assert.equal(record, null);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('marks warned flag and clears file', async () => {
    const cwd = mkWorkspace();
    await writePendingDone(cwd, {
      task_id: 'T-PENDING',
      entered_at: '2026-06-01T00:00:00.000Z',
      phase: 'executing',
    });

    await markPendingDoneWarned(cwd, true);
    const warned = await readPendingDone(cwd);
    assert.equal(warned?.warned, true);

    await clearPendingDone(cwd);
    assert.equal(await readPendingDone(cwd), null);
    rmSync(cwd, { recursive: true, force: true });
  });
});
