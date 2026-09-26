import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import {
  classifyChangeItem,
  buildChangelogData,
  writeChangelogFile,
  publishMilestoneRelease,
} from '../dist/engine/changelog.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('Release & Changelog Engine', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'docpath-changelog-test-'));
    // Setup docpath structure
    await mkdir(join(tempDir, '.docpath', 'workspace'), { recursive: true });
    await mkdir(join(tempDir, '.docpath', 'tasks', 'done', 'T-2026-feat-1'), { recursive: true });
    await mkdir(join(tempDir, '.docpath', 'tasks', 'done', 'T-2026-fix-1'), { recursive: true });
    await mkdir(join(tempDir, '.docpath', 'tasks', 'done', 'T-2026-break-1'), { recursive: true });
    await mkdir(join(tempDir, '.docpath', 'backlog'), { recursive: true });
    await mkdir(join(tempDir, '.docpath', 'rules'), { recursive: true });

    // Workspace state
    await writeFile(
      join(tempDir, '.docpath', 'workspace', 'state.json'),
      JSON.stringify(
        {
          schema_version: '1.0',
          task_id: null,
          state: 'idle',
          phase: 'idle',
        },
        null,
        2,
      ),
      'utf-8',
    );

    // Mock done task 1 (feature)
    await writeFile(
      join(tempDir, '.docpath', 'tasks', 'done', 'T-2026-feat-1', 'spec.md'),
      '# T-2026-feat-1: 实现自动化发布简报引擎\n\n### 4. 架构决策简报\n- 方案: 自动聚合\n\n### 5. 功能需求 (FR)\n- [x] **FR-1**: 聚合已归档任务\n\n### 6. 验收标准 (AC)\n- [x] **AC-1**: 生成规范 Markdown\n',
      'utf-8',
    );
    await writeFile(
      join(tempDir, '.docpath', 'tasks', 'done', 'T-2026-feat-1', 'plan.md'),
      '# 执行计划\n\n- [x] **S1**: 实现引擎\n',
      'utf-8',
    );

    // Mock done task 2 (fix)
    await writeFile(
      join(tempDir, '.docpath', 'tasks', 'done', 'T-2026-fix-1', 'spec.md'),
      '# T-2026-fix-1: 修复上下文溢出导致的截断问题\n\n### 5. 功能需求 (FR)\n- [x] **FR-1**: 修复边界条件\n',
      'utf-8',
    );
    await writeFile(
      join(tempDir, '.docpath', 'tasks', 'done', 'T-2026-fix-1', 'plan.md'),
      '# 执行计划\n\n- [x] **S1**: 修复 Bug\n',
      'utf-8',
    );

    // Mock done task 3 (breaking change)
    await writeFile(
      join(tempDir, '.docpath', 'tasks', 'done', 'T-2026-break-1', 'spec.md'),
      '# T-2026-break-1: 破坏性变更：升级底层数据契约存储格式\n\n### 4. 架构决策简报\n- 方案: 迁移至统一协议\n',
      'utf-8',
    );
    await writeFile(
      join(tempDir, '.docpath', 'tasks', 'done', 'T-2026-break-1', 'plan.md'),
      '# 执行计划\n\n- [x] **S1**: 协议迁移\n',
      'utf-8',
    );

    // Mock decisions.jsonl
    const decisionRecord = {
      schema_version: 1,
      kind: 'decision',
      id: 'ADR-001',
      taskId: 'T-2026-feat-1',
      createdAt: '2026-09-26T10:00:00.000Z',
      category: 'Storage',
      context: '需要高性能事件日志存储',
      decision: '统一采用 JSONL 存储运行时事件',
      impact: '提高写入吞吐',
      alternatives: ['SQLite', 'JSON'],
      relatedFiles: ['src/engine/events.ts'],
    };
    await writeFile(
      join(tempDir, '.docpath', 'workspace', 'decisions.jsonl'),
      JSON.stringify(decisionRecord) + '\n',
      'utf-8',
    );

    // Mock rules
    await writeFile(
      join(tempDir, '.docpath', 'rules', 'style.md'),
      '# Style Rules\n\n## rule: single-test\n期望: 单用例调试。\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('correctly classifies change items by semantic heuristics', () => {
    assert.equal(classifyChangeItem('feat: add changelog generator'), 'features');
    assert.equal(classifyChangeItem('实现自动化发布简报引擎'), 'features');
    assert.equal(classifyChangeItem('fix: resolve buffer overflow'), 'fixes');
    assert.equal(classifyChangeItem('修复并发条件竞争Bug'), 'fixes');
    assert.equal(classifyChangeItem('perf: speed up check validation by 90%'), 'improvements');
    assert.equal(classifyChangeItem('优化上下文预算分配'), 'improvements');
    assert.equal(classifyChangeItem('BREAKING CHANGE: drop legacy v1 protocol'), 'breaking');
    assert.equal(classifyChangeItem('升级底层数据契约', { isMajorGate: true }), 'breaking');
  });

  it('aggregates done tasks, decisions, and rules into structured changelog data', async () => {
    const data = await buildChangelogData(tempDir, {
      version: 'v0.5.0',
      title: 'Release Engine & Doctor',
    });

    assert.equal(data.version, 'v0.5.0');
    assert.equal(data.metrics.tasksDelivered, 3);
    assert.equal(data.metrics.decisionsRecorded, 1);
    assert.ok(data.metrics.totalChanges >= 3);

    // Verify categories
    assert.ok(data.categories.breaking.length >= 1, 'Should have breaking changes');
    assert.ok(data.categories.features.length >= 1, 'Should have features');
    assert.ok(data.categories.fixes.length >= 1, 'Should have fixes');
    assert.ok(data.categories.decisions.length >= 1, 'Should have decisions');

    assert.ok(data.markdown.includes('## [v0.5.0]'));
    assert.ok(data.markdown.includes('💥 破坏性变更 (Breaking Changes)'));
    assert.ok(data.markdown.includes('✨ 新增功能 (Features)'));
    assert.ok(data.markdown.includes('🐛 缺陷修复 (Bug Fixes)'));
    assert.ok(data.markdown.includes('🏛️ 架构决策与规范 (ADRs & Decisions)'));
  });

  it('updates CHANGELOG.md idempotently and prepends new version', async () => {
    const initialContent = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n## [v0.4.0] - 2026-09-20\n- Initial release\n';
    await writeFile(join(tempDir, 'CHANGELOG.md'), initialContent, 'utf-8');

    const data = await buildChangelogData(tempDir, { version: 'v0.5.0' });
    const changelogPath = await writeChangelogFile(tempDir, data.markdown);

    const updated = await readFile(changelogPath, 'utf-8');
    assert.ok(updated.includes('## [v0.5.0]'));
    assert.ok(updated.includes('## [v0.4.0]'));
    // v0.5.0 should come before v0.4.0
    const idx5 = updated.indexOf('## [v0.5.0]');
    const idx4 = updated.indexOf('## [v0.4.0]');
    assert.ok(idx5 < idx4, 'Newer version must precede older version');
  });

  it('publishes full release doc and updates docs/releases/', async () => {
    const data = await buildChangelogData(tempDir, { version: 'v1.0.0', title: 'Grand Release' });
    const { releaseDocPath, changelogPath } = await publishMilestoneRelease(tempDir, data);

    const releaseContent = await readFile(releaseDocPath, 'utf-8');
    assert.ok(releaseContent.includes('# Release v1.0.0: Grand Release'));
    assert.ok(releaseContent.includes('演进时间线 (Milestone Timeline)'));

    const changelogContent = await readFile(changelogPath, 'utf-8');
    assert.ok(changelogContent.includes('## [v1.0.0]'));
  });

  it('supports docpath changelog CLI command with --agent', () => {
    const out = execSync(`node "${BIN}" changelog v0.5.0 --agent --cwd "${tempDir}"`, {
      encoding: 'utf-8',
    });

    const parsed = parse(out);
    assert.equal(parsed.agent_view, 'changelog');
    assert.equal(parsed.version, 'v0.5.0');
    assert.ok(parsed.metrics.tasksDelivered >= 3);
    assert.ok(parsed.markdown.length > 0);
  });

  it('supports docpath milestone draft CLI command', () => {
    const out = execSync(`node "${BIN}" milestone draft v0.5.0 --agent --cwd "${tempDir}"`, {
      encoding: 'utf-8',
    });

    const parsed = parse(out);
    assert.equal(parsed.agent_view, 'milestone_draft');
    assert.equal(parsed.version, 'v0.5.0');
    assert.ok(parsed.categories.features_count >= 1);
  });
});
