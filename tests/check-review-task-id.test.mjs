import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';
import { readReviewEvidence, readLastCheckEvidence } from '../dist/utils/workspace-evidence.js';

describe('check and review task ID isolation', () => {
  it('isolates review and check evidence across different task IDs', async () => {
    const { dir } = mkExecWorkspace();
    try {
      const statePath = join(dir, '.docpath', 'workspace', 'state.json');
      const reviewJsonPath = join(dir, '.docpath', 'workspace', 'review.json');
      const lastCheckJsonPath = join(dir, '.docpath', 'workspace', 'last-check.json');

      // Write check evidence for task T-AGENT
      writeFileSync(lastCheckJsonPath, JSON.stringify({
        schema_version: 1,
        kind: 'last-check',
        task_id: 'T-AGENT',
        timestamp: new Date().toISOString(),
        passed: true,
        check_count: 5,
        checks: [],
      }, null, 2));

      // Write review evidence for task T-AGENT
      writeFileSync(reviewJsonPath, JSON.stringify({
        schema_version: 1,
        kind: 'review',
        task_id: 'T-AGENT',
        timestamp: new Date().toISOString(),
        files: [],
        findings: [],
        errors: 0,
        warnings: 0,
        infos: 0,
        approved: true,
      }, null, 2));

      // Verify that when task ID is T-AGENT, reading them returns the correct object
      const reviewAgent = await readReviewEvidence(join(dir, '.docpath'));
      const checkAgent = await readLastCheckEvidence(join(dir, '.docpath'));
      assert.ok(reviewAgent);
      assert.equal(reviewAgent.task_id, 'T-AGENT');
      assert.ok(checkAgent);
      assert.equal(checkAgent.task_id, 'T-AGENT');

      // Now change active task ID to T-NEW in state.json
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      state.task_id = 'T-NEW';
      writeFileSync(statePath, JSON.stringify(state, null, 2));

      // Verify that the old T-AGENT evidence is ignored and returns null
      const reviewNew = await readReviewEvidence(join(dir, '.docpath'));
      const checkNew = await readLastCheckEvidence(join(dir, '.docpath'));
      assert.equal(reviewNew, null);
      assert.equal(checkNew, null);

    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
