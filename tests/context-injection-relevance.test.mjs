import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadRecentDecisions } from '../dist/utils/agent-output/context-injection.js';

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-ctx-inj-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });

  const decisions = [
    {
      kind: 'decision',
      id: 'ADR-001',
      taskId: 'T-001',
      category: 'architecture',
      decision: '采用 worktree 隔离并发任务开发',
      createdAt: '2026-09-10T00:00:00.000Z',
    },
    {
      kind: 'decision',
      id: 'ADR-002',
      taskId: 'T-002',
      category: 'policy.skip',
      decision: '跳过 review 门禁',
      createdAt: '2026-09-11T00:00:00.000Z',
    },
    {
      kind: 'decision',
      id: 'ADR-003',
      taskId: 'T-003',
      category: 'architecture',
      decision: 'check 接入 Maven 编译检查 pom.xml',
      createdAt: '2026-09-12T00:00:00.000Z',
    },
  ];

  writeFileSync(
    join(dp, 'workspace', 'decisions.jsonl'),
    decisions.map((d) => JSON.stringify(d)).join('\n') + '\n',
    'utf-8',
  );
  return { cwd, dp };
}

describe('loadRecentDecisions context-relevance injection', () => {
  it('returns last N decisions when no keywords provided', async () => {
    const { cwd, dp } = mkWorkspace();
    try {
      const result = await loadRecentDecisions(dp, 2);
      assert.equal(result.length, 2);
      assert.equal(result[0].id, 'ADR-002');
      assert.equal(result[1].id, 'ADR-003');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('prioritizes keyword-matching decisions over latest irrelevant ones', async () => {
    const { cwd, dp } = mkWorkspace();
    try {
      const result = await loadRecentDecisions(dp, 2, ['worktree', '并发']);
      assert.equal(result.length, 2);
      // ADR-001 matches 'worktree' and '并发', should be prioritized
      assert.equal(result[0].id, 'ADR-001');
      assert.equal(result[0].conclusion, '采用 worktree 隔离并发任务开发');
      // ADR-003 is latest remaining
      assert.equal(result[1].id, 'ADR-003');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
