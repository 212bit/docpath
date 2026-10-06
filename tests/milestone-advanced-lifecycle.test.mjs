import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createMilestoneItem,
  readMilestoneItem,
  writeMilestoneItem,
  decomposeMilestone,
  getMilestoneProgress,
  releaseMilestone,
  editMilestoneItem,
  auditMilestonesHygiene,
} from '../dist/engine/milestone.js';
import { createBacklogItem, writeBacklogItem } from '../dist/engine/backlog.js';
import { milestoneCommand } from '../dist/commands/milestone.js';

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-m-adv-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'milestones'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: adv-test\n');
  return cwd;
}

describe('milestone advanced lifecycle engine & command tests', () => {
  it('decomposes milestone from markdown body items', async () => {
    const cwd = mkWorkspace();
    try {
      const m = await createMilestoneItem(cwd, {
        title: '微服务网关改造',
        body: [
          '## 核心拆解项',
          '- [ ] [feature] [P0] 动态路由配置引擎',
          '- [ ] [infra] [P1] 限流与熔断中间件',
          '3. [bug] [P2] 修复长连接超时断开问题',
        ].join('\n'),
      });

      const res = await decomposeMilestone(cwd, m.id);
      assert.equal(res.createdBacklogs.length, 3);
      assert.equal(res.createdBacklogs[0].title, '动态路由配置引擎');
      assert.equal(res.createdBacklogs[0].kind, 'feature');
      assert.equal(res.createdBacklogs[0].priority, 'P0');
      assert.equal(res.createdBacklogs[1].title, '限流与熔断中间件');
      assert.equal(res.createdBacklogs[1].kind, 'infra');
      assert.equal(res.createdBacklogs[1].priority, 'P1');
      assert.equal(res.createdBacklogs[2].title, '修复长连接超时断开问题');
      assert.equal(res.createdBacklogs[2].kind, 'bug');
      assert.equal(res.createdBacklogs[2].priority, 'P2');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('calculates health status and top blockers chain analysis', async () => {
    const cwd = mkWorkspace();
    try {
      // Create milestone with future target date (30 days ahead)
      const futureDate = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const m = await createMilestoneItem(cwd, {
        title: '支付通道集成',
        target_date: futureDate,
      });

      // Create 3 backlogs: B1 blocks B2 and B3
      const b1 = await createBacklogItem(cwd, {
        title: '基础支付 SDK 封装',
        status: 'proposed',
        priority: 'P0',
        level: 1,
        source: 'manual',
        readiness: 'raw',
        evidence: { brainstorm: null, analysis: null, spec: null, decision_brief: null, user_confirmed: null },
        links: { task: null, spec: null, milestone: m.id },
        created_at: '2026-10-06',
        body: 'sdk',
      });
      const b2 = await createBacklogItem(cwd, {
        title: '微信支付接入',
        status: 'proposed',
        priority: 'P1',
        level: 1,
        source: 'manual',
        readiness: 'raw',
        evidence: { brainstorm: null, analysis: null, spec: null, decision_brief: null, user_confirmed: null },
        links: { task: null, spec: null, milestone: m.id, depends_on: [b1.id] },
        created_at: '2026-10-06',
        body: 'wechat',
      });
      const b3 = await createBacklogItem(cwd, {
        title: '支付宝接入',
        status: 'proposed',
        priority: 'P1',
        level: 1,
        source: 'manual',
        readiness: 'raw',
        evidence: { brainstorm: null, analysis: null, spec: null, decision_brief: null, user_confirmed: null },
        links: { task: null, spec: null, milestone: m.id, depends_on: [b1.id] },
        created_at: '2026-10-06',
        body: 'alipay',
      });

      m.backlog_ids = [b1.id, b2.id, b3.id];
      await writeMilestoneItem(cwd, m);

      // Progress check: b1 should be identified as top blocker (blocking 2 items)
      const progress = await getMilestoneProgress(cwd, m.id);
      assert.equal(progress.health.status, 'on_track');
      assert.ok(progress.health.days_remaining >= 25);
      assert.equal(progress.top_blockers.length, 1);
      assert.equal(progress.top_blockers[0].id, b1.id);
      assert.equal(progress.top_blockers[0].blocked_count, 2);

      // Test overdue detection
      m.target_date = '2020-01-01';
      m.status = 'active';
      await writeMilestoneItem(cwd, m);

      const overdueProgress = await getMilestoneProgress(cwd, m.id);
      assert.equal(overdueProgress.health.status, 'overdue');
      assert.ok(overdueProgress.health.risk_reasons.some((r) => r.includes('已逾期')));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('releases milestone with ADR aggregation and git tag suggestion', async () => {
    const cwd = mkWorkspace();
    try {
      // Mock decisions.jsonl with full schema
      const workspaceDir = join(cwd, '.docpath', 'workspace');
      writeFileSync(
        join(workspaceDir, 'decisions.jsonl'),
        JSON.stringify({
          schema_version: 1,
          kind: 'decision',
          id: 'ADR-010',
          taskId: 'T-20261006-event',
          createdAt: '2026-10-06',
          category: 'Architecture',
          context: '事件模型重构',
          decision: '采用统一事件分发驱动模型',
          impact: '提高解耦度',
          alternatives: [],
          relatedFiles: [],
        }) + '\n',
      );

      const m = await createMilestoneItem(cwd, {
        title: '事件总线架构重构',
        version_target: 'v3.0.0',
      });

      const res = await releaseMilestone(cwd, m.id, { title: '事件总线架构重构' });
      assert.equal(res.milestone.status, 'released');
      assert.ok(res.releaseDocPath);

      // Verify release doc markdown contains ADR and Git Tag
      const fs = await import('fs/promises');
      const docContent = await fs.readFile(res.releaseDocPath, 'utf-8');
      assert.ok(docContent.includes('## 2. 🏛️ 架构决策与设计演进 (ADRs)'));
      assert.ok(docContent.includes('ADR-010'));
      assert.ok(docContent.includes('采用统一事件分发驱动模型'));
      assert.ok(docContent.includes('## 5. 🏷️ 版本切签与发布建议 (Git Tag)'));
      assert.ok(docContent.includes('git tag -a v3.0.0 -m "事件总线架构重构"'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('edits milestone item attributes', async () => {
    const cwd = mkWorkspace();
    try {
      const m = await createMilestoneItem(cwd, {
        title: '旧标题',
        priority: 'P2',
      });

      const updated = await editMilestoneItem(cwd, m.id, {
        title: '新标题',
        priority: 'P0',
        target_date: '2026-11-15',
        version_target: 'v1.5.0',
        owner: 'Core Team',
        status: 'active',
      });

      assert.equal(updated.title, '新标题');
      assert.equal(updated.priority, 'P0');
      assert.equal(updated.target_date, '2026-11-15');
      assert.equal(updated.version_target, 'v1.5.0');
      assert.equal(updated.owner, 'Core Team');
      assert.equal(updated.status, 'active');

      const reloaded = await readMilestoneItem(cwd, m.id);
      assert.equal(reloaded?.title, '新标题');
      assert.equal(reloaded?.priority, 'P0');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('audits milestones hygiene with doctor', async () => {
    const cwd = mkWorkspace();
    try {
      // 1. Create empty milestone
      const m1 = await createMilestoneItem(cwd, {
        title: '空里程碑',
      });

      // 2. Create milestone with dangling backlog ID and overdue date
      const m2 = await createMilestoneItem(cwd, {
        title: '逾期且含悬空需求里程碑',
        target_date: '2020-01-01',
      });
      m2.backlog_ids = ['R-999'];
      m2.status = 'active';
      await writeMilestoneItem(cwd, m2);

      // 3. Create backlog referencing non-existent milestone
      await createBacklogItem(cwd, {
        title: '孤儿需求',
        status: 'proposed',
        priority: 'P1',
        level: 1,
        source: 'manual',
        readiness: 'raw',
        evidence: { brainstorm: null, analysis: null, spec: null, decision_brief: null, user_confirmed: null },
        links: { task: null, spec: null, milestone: 'M-999' },
        created_at: '2026-10-06',
        body: 'orphan',
      });

      const audit = await auditMilestonesHygiene(cwd);
      assert.equal(audit.passed, false);
      assert.ok(audit.issues.length >= 2); // dangling R-999 and non-existent M-999
      assert.ok(audit.issues.some((i) => i.field === 'backlog_ids' && i.message.includes('R-999')));
      assert.ok(audit.issues.some((i) => i.field === 'links.milestone' && i.message.includes('M-999')));
      assert.ok(audit.warnings.some((w) => w.id === m1.id && w.field === 'backlog_ids'));
      assert.ok(audit.warnings.some((w) => w.id === m2.id && w.field === 'target_date'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('runs milestoneCommand with edit, doctor, and status actions', async () => {
    const cwd = mkWorkspace();
    try {
      // Add milestone via command
      await milestoneCommand({
        cwd,
        action: 'add',
        title: 'CLI 驱动测试里程碑',
        priority: 'P1',
        json: true,
      });

      // Edit milestone
      await milestoneCommand({
        cwd,
        action: 'edit',
        version: 'M-001',
        title: 'CLI 驱动更新标题',
        priority: 'P0',
        status: 'active',
        json: true,
      });

      const item = await readMilestoneItem(cwd, 'M-001');
      assert.equal(item?.title, 'CLI 驱动更新标题');
      assert.equal(item?.priority, 'P0');
      assert.equal(item?.status, 'active');

      // Status query
      await milestoneCommand({
        cwd,
        action: 'status',
        version: 'M-001',
        json: true,
      });

      // Doctor query (will have warning about empty backlog, but passed=true since no hard errors)
      await milestoneCommand({
        cwd,
        action: 'doctor',
        json: true,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
