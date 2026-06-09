import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

let payloadModule;
let contextIndexModule;

before(async () => {
  payloadModule = await import('../dist/utils/payload.js');
  contextIndexModule = await import('../dist/utils/context-index.js');
});

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-context-index-'));
  const dp = join(cwd, '.docpath');
  const workspace = join(dp, 'workspace');
  const task = join(dp, 'tasks', 'current');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(task, { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: context-index-test\n');
  writeFileSync(join(workspace, 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-CONTEXT',
    task_title: 'Context Index',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-06-09T00:00:00.000Z',
    updated_at: '2026-06-09T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(workspace, 'current.md'), '# Current\n');
  writeFileSync(join(workspace, 'last-check.md'), [
    '# Last Check Evidence',
    '',
    '**时间**: 2026-06-09T00:00:00.000Z',
    '**结果**: ✅ PASS',
    '',
  ].join('\n'));
  writeFileSync(join(workspace, 'review.md'), [
    '# Code Review Report',
    '',
    '**时间**: 2026-06-09T00:00:00.000Z',
    '**状态**: ✅ PASS',
    '',
  ].join('\n'));
  writeFileSync(join(workspace, 'breadcrumb.md'), [
    '# Breadcrumb',
    '',
    '### ✅ S1 [T-CONTEXT] — 2026-06-09T00:00:00.000Z',
    '',
    '---',
    'taskId: T-CONTEXT',
    'step: S1',
    'status: done',
    'timestamp: 2026-06-09T00:00:00.000Z',
    '---',
    '',
    '- **状态**: done',
    '- **上下文**: schema implemented',
    '',
  ].join('\n'));
  writeFileSync(join(task, 'spec.md'), [
    '# T-CONTEXT - Context Index',
    '',
    '## 目标',
    '生成结构化上下文索引。',
    '',
    '## 范围',
    '- Payload schema',
    '- Hybrid Context Index',
    '',
    '## 验收',
    '- status --agent 可引用 index',
    '',
    '### Decision Brief',
    '- 推荐方案: 轻量 schema/index。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    '- [ ] FR-1: 生成 context index',
    '',
    '## 5. 验收标准',
    '- [ ] AC-1: status 输出 index 摘要',
    '',
  ].join('\n'));
  writeFileSync(join(task, 'plan.md'), [
    '## 执行计划',
    '',
    '### S1: Build index',
    '- [x] S1: Build index',
    '- **描述**: 生成 index',
    '- **验收条件**: index 有 trunk 和 leaves',
    '- **依赖**: 无',
    '',
  ].join('\n'));
  return cwd;
}

describe('DocPath Payload schema', () => {
  it('parses supported payload kinds and fails loud on invalid payloads', () => {
    const payload = payloadModule.parseDocPathPayload({
      kind: 'change_summary',
      summary: 'changed files',
      source: 'test',
      created_at: '2026-06-09T00:00:00.000Z',
      changed_files: ['src/index.ts'],
    });
    assert.equal(payload.kind, 'change_summary');
    assert.deepEqual(payload.changed_files, ['src/index.ts']);

    assert.throws(
      () => payloadModule.parseDocPathPayload({ kind: 'unknown' }),
      /unsupported kind/,
    );
    assert.throws(
      () => payloadModule.parseDocPathPayload(null),
      /expected object/,
    );
  });
});

describe('Hybrid Context Index', () => {
  it('writes a task index with trunk and leaves', async () => {
    const cwd = mkWorkspace();
    const index = await contextIndexModule.writeHybridContextIndex(cwd);
    const indexPath = join(cwd, '.docpath', 'tasks', 'current', 'context-index.json');

    assert.equal(existsSync(indexPath), true);
    assert.equal(index.version, 1);
    assert.equal(index.task_id, 'T-CONTEXT');
    assert.equal(index.trunk.length, 4);
    assert.equal(index.leaves.length, 5);
    assert.match(index.trunk.find((entry) => entry.id === 'goal').summary, /结构化上下文索引/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('lets handoff generate index and status --agent expose a compact summary', () => {
    const cwd = mkWorkspace();
    execSync(`node ${BIN} agent handoff --cwd ${cwd} --max-entries 5`, { cwd, encoding: 'utf-8', timeout: 20000 });

    const indexPath = join(cwd, '.docpath', 'tasks', 'current', 'context-index.json');
    const handoff = readFileSync(join(cwd, '.docpath', 'workspace', 'compact-context.md'), 'utf-8');
    const status = execSync(`node ${BIN} status --cwd ${cwd} --agent`, { cwd, encoding: 'utf-8', timeout: 20000 });

    assert.equal(existsSync(indexPath), true);
    assert.match(handoff, /## Hybrid Context Index/);
    assert.match(status, /context_index:/);
    assert.match(status, /path: \.docpath\/tasks\/current\/context-index\.json/);
    assert.match(status, /trunk_count: 4/);
    assert.match(status, /leaf_count: 5/);

    rmSync(cwd, { recursive: true, force: true });
  });
});
