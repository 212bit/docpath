import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { traceDocAndCode, renderDocTraceReport } from '../dist/engine/doc-trace.js';
import { detectDocDrift, renderDocDriftReport } from '../dist/engine/doc-drift.js';
import { createBacklogItem } from '../dist/engine/backlog.js';
import { refreshProjectDocumentIndex } from '../dist/utils/document-index.js';

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-trace-drift-'));
  const dp = join(cwd, '.docpath');
  const docs = join(cwd, 'docs', 'features');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(docs, { recursive: true });

  writeFileSync(
    join(dp, 'config.yaml'),
    'project:\n  name: trace-drift-test\ndocument_scan_paths:\n  - README.md\n  - docs\n',
  );
  writeFileSync(join(cwd, 'README.md'), '# Main Readme\n\nProject overview.\n');

  // Write a feature document
  writeFileSync(
    join(docs, 'milestone-lifecycle.md'),
    `---
title: Milestone Lifecycle & Management
type: reference
scope: engine
topic_tags:
  - milestone
  - lifecycle
  - release
---
# Milestone Lifecycle & Management

DocPath 里程碑引擎负责宏观目标规划与大盘跟踪。
核心实现位于 \`src/engine/milestone.ts\`，暴露 \`getMilestoneProgress\` 进度计算函数。
`,
  );

  // Write a rule file
  writeFileSync(
    join(dp, 'rules', 'architecture.md'),
    `# 系统架构规范

## 1. 引擎层防腐红线
所有核心状态流转必须由 \`src/engine/milestone.ts\` 负责，禁止 CLI 层违规篡改。
`,
  );

  // Write a decision record
  writeFileSync(
    join(dp, 'workspace', 'decisions.jsonl'),
    JSON.stringify({
      schema_version: 1,
      kind: 'decision',
      id: 'ADR-20261006-004',
      taskId: 'T-20261006-milestone',
      createdAt: '2026-10-06',
      category: 'Architecture',
      context: '增强里程碑生命周期',
      decision: '全量增强 decompose、status/track、release、edit 与 doctor 能力',
      impact: '里程碑全生命周期闭环',
      alternatives: [],
      relatedFiles: ['src/engine/milestone.ts', 'src/commands/milestone.ts'],
    }) + '\n',
  );

  return cwd;
}

describe('doc trace & doc drift engine tests', () => {
  it('traces code file to living docs, ADRs, backlog, and rules', async () => {
    const cwd = mkWorkspace();
    try {
      const dp = join(cwd, '.docpath');
      await refreshProjectDocumentIndex(dp, cwd);

      // Create a backlog item
      await createBacklogItem(cwd, {
        title: '里程碑全生命周期增强',
        status: 'done',
        priority: 'P0',
        level: 1,
        source: 'manual',
        readiness: 'shaped',
        evidence: { brainstorm: null, analysis: null, spec: null, decision_brief: null, user_confirmed: null },
        links: { task: 'T-20261006-milestone', spec: null },
        created_at: '2026-10-06',
        body: '重构 src/engine/milestone.ts 核心计算',
      });

      const res = await traceDocAndCode(cwd, 'src/engine/milestone.ts');
      assert.equal(res.target, 'src/engine/milestone.ts');
      assert.equal(res.target_type, 'file');

      // 1. Matched living doc
      assert.ok(res.living_docs.length >= 1);
      assert.equal(res.living_docs[0].path, 'docs/features/milestone-lifecycle.md');
      assert.ok(res.living_docs[0].score >= 0.8);
      assert.ok(res.living_docs[0].match_reason.includes('正文直接引用目标'));

      // 2. Matched ADR
      assert.ok(res.decisions.length >= 1);
      assert.equal(res.decisions[0].id, 'ADR-20261006-004');
      assert.ok(res.decisions[0].conclusion.includes('全量增强 decompose'));

      // 3. Matched Backlog
      assert.ok(res.backlog_lineage.length >= 1);
      assert.ok(res.backlog_lineage[0].title.includes('里程碑全生命周期增强'));

      // 4. Matched Rules
      assert.ok(res.rules.length >= 1);
      assert.ok(res.rules.some((r) => r.name.includes('architecture')));

      // 5. Render report
      const report = renderDocTraceReport(res);
      assert.ok(report.includes('DocPath 代码-文档双向架构透视'));
      assert.ok(report.includes('docs/features/milestone-lifecycle.md'));
      assert.ok(report.includes('ADR-20261006-004'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('traces symbol name accurately', async () => {
    const cwd = mkWorkspace();
    try {
      const dp = join(cwd, '.docpath');
      await refreshProjectDocumentIndex(dp, cwd);

      const res = await traceDocAndCode(cwd, 'getMilestoneProgress');
      assert.equal(res.target, 'getMilestoneProgress');
      assert.equal(res.target_type, 'symbol');
      assert.ok(res.living_docs.length >= 1);
      assert.equal(res.living_docs[0].path, 'docs/features/milestone-lifecycle.md');
      assert.ok(res.living_docs[0].match_reason.includes('getMilestoneProgress'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('detects doc drift when code changed without doc update', async () => {
    const cwd = mkWorkspace();
    try {
      const dp = join(cwd, '.docpath');
      await refreshProjectDocumentIndex(dp, cwd);

      // Case 1: code file changed without doc update -> drift detected
      const report1 = await detectDocDrift(cwd, {
        files: ['src/engine/milestone.ts'],
      });

      assert.equal(report1.passed, false);
      assert.equal(report1.drifts.length, 1);
      assert.equal(report1.drifts[0].code_file, 'src/engine/milestone.ts');
      assert.equal(report1.drifts[0].risk, 'high');
      assert.ok(report1.drifts[0].suggested_docs.some((s) => s.path === 'docs/features/milestone-lifecycle.md'));

      // Case 2: code file AND its living doc both changed -> passed
      const report2 = await detectDocDrift(cwd, {
        files: ['src/engine/milestone.ts', 'docs/features/milestone-lifecycle.md'],
      });

      assert.equal(report2.passed, true);
      assert.equal(report2.drifts.length, 0);

      const rendered = renderDocDriftReport(report1);
      assert.ok(rendered.includes('代码变更与活文档漂移检测'));
      assert.ok(rendered.includes('src/engine/milestone.ts'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
