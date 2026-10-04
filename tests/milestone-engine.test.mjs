import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createMilestoneItem,
  readMilestoneItem,
  writeMilestoneItem,
  listMilestoneItems,
  bindMilestoneBacklogs,
  unbindMilestoneBacklogs,
  decomposeMilestone,
  getMilestoneProgress,
  verifyMilestone,
  acceptMilestone,
  transitionMilestone,
  canTransitionMilestone,
  parseMilestoneContent,
  serializeMilestoneItem,
} from '../dist/engine/milestone.js';
import { createBacklogItem, writeBacklogItem, readBacklogItem } from '../dist/engine/backlog.js';

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-m-engine-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'milestones'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: m-test\n');
  return cwd;
}

describe('milestone engine unit tests', () => {
  it('validates state transitions accurately', () => {
    assert.equal(canTransitionMilestone('planned', 'active'), true);
    assert.equal(canTransitionMilestone('active', 'accepted'), true);
    assert.equal(canTransitionMilestone('accepted', 'released'), true);
    assert.equal(canTransitionMilestone('released', 'archived'), true);
    assert.equal(canTransitionMilestone('planned', 'released'), false);

    assert.equal(transitionMilestone('planned', 'active'), 'active');
    assert.throws(() => transitionMilestone('planned', 'released'), /非法里程碑状态转移/);
  });

  it('parses and serializes milestone markdown content with YAML frontmatter', () => {
    const raw = [
      '---',
      'id: M-001',
      'title: 核心重构',
      'status: planned',
      'priority: P0',
      'version_target: v1.0.0',
      'target_date: 2026-12-31',
      'backlog_ids:',
      '  - R-001',
      'acceptance_criteria:',
      '  - id: MAC-1',
      '    text: 单元测试覆盖率 > 90%',
      '    done: true',
      'created_at: 2026-10-04',
      '---',
      '',
      '## 1. 🎯 里程碑核心目标 (Objective)',
      '重构系统底层架构。',
    ].join('\n');

    const parsed = parseMilestoneContent(raw);
    assert.equal(parsed.id, 'M-001');
    assert.equal(parsed.title, '核心重构');
    assert.equal(parsed.status, 'planned');
    assert.equal(parsed.priority, 'P0');
    assert.equal(parsed.version_target, 'v1.0.0');
    assert.equal(parsed.backlog_ids.length, 1);
    assert.equal(parsed.acceptance_criteria.length, 1);
    assert.equal(parsed.acceptance_criteria[0].done, true);

    const serialized = serializeMilestoneItem(parsed);
    assert.match(serialized, /id: M-001/);
    assert.match(serialized, /version_target: v1\.0\.0/);
    assert.match(serialized, /MAC-1/);
  });

  it('creates, reads, decomposes, binds and calculates progress', async () => {
    const cwd = mkWorkspace();
    try {
      // 1. Create milestone
      const m = await createMilestoneItem(cwd, {
        title: '用户认证体系升级',
        version_target: 'v2.0.0',
        priority: 'P0',
        criteria: ['所有端到端鉴权测试通过', '性能开销 < 5ms'],
      });
      assert.equal(m.id, 'M-001');
      assert.equal(m.acceptance_criteria.length, 2);

      // 2. Decompose into 2 backlogs
      const decompRes = await decomposeMilestone(cwd, 'M-001', [
        { title: 'RBAC 数据表设计', priority: 'P0' },
        { title: 'JWT 拦截器', priority: 'P1' },
      ]);
      assert.equal(decompRes.createdBacklogs.length, 2);
      const b1 = decompRes.createdBacklogs[0];
      const b2 = decompRes.createdBacklogs[1];
      assert.equal(b1.links.milestone, 'M-001');

      // 3. Bind an independent backlog
      const b3 = await createBacklogItem(cwd, {
        title: '前端登录界面改造',
        status: 'proposed',
        priority: 'P2',
        level: 1,
        source: 'manual',
        readiness: 'raw',
        evidence: { brainstorm: null, analysis: null, spec: null, decision_brief: null, user_confirmed: null },
        links: { task: null, spec: null },
        created_at: '2026-10-04',
        body: '前端表单',
      });
      await bindMilestoneBacklogs(cwd, 'M-001', [b3.id]);

      // 4. Check progress
      let progress = await getMilestoneProgress(cwd, 'M-001');
      assert.equal(progress.backlog_summary.total, 3);
      assert.equal(progress.backlog_summary.done, 0);
      assert.equal(progress.is_ready_for_acceptance, false);
      assert.ok(progress.blockers.length >= 3);

      // 5. Complete all backlogs and criteria
      b1.status = 'done';
      b2.status = 'done';
      const b3Loaded = await readBacklogItem(cwd, b3.id);
      b3Loaded.status = 'done';
      await writeBacklogItem(cwd, b1);
      await writeBacklogItem(cwd, b2);
      await writeBacklogItem(cwd, b3Loaded);

      const loadedM = await readMilestoneItem(cwd, 'M-001');
      loadedM.acceptance_criteria[0].done = true;
      loadedM.acceptance_criteria[1].done = true;
      await writeMilestoneItem(cwd, loadedM);

      // 6. Verify milestone passes
      const verifyRes = await verifyMilestone(cwd, 'M-001');
      assert.equal(verifyRes.passed, true);
      assert.equal(verifyRes.blockers.length, 0);

      // 7. Accept milestone
      const acceptedM = await acceptMilestone(cwd, 'M-001');
      assert.equal(acceptedM.status, 'accepted');

      // 8. Test unbind
      const unbindRes = await unbindMilestoneBacklogs(cwd, 'M-001', [b3.id]);
      assert.equal(unbindRes.unboundIds.includes(b3.id), true);
      const reloadedM = await readMilestoneItem(cwd, 'M-001');
      assert.equal(reloadedM.backlog_ids.includes(b3.id), false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
