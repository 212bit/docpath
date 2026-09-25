import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-backlog-hygiene-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: backlog-hygiene-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-HYGIENE-TEST',
    task_title: 'Backlog Hygiene Test',
    phase: 'executing',
    gate: 'none',
    current_step: 'S1',
    started_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  }, null, 2));
  return cwd;
}

function run(args, cwd) {
  const parsedArgs = Array.isArray(args)
    ? args
    : args.match(/(?:[^\s"]+|"[^"]*")+/g).map((part) => part.replace(/^"|"$/g, ''));
  return execFileSync('node', [BIN, ...parsedArgs], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
  }).trim();
}

describe('backlog kind, templates, hygiene groom, shape, and batch io', () => {
  it('supports kind in backlog add and generates structured templates', () => {
    const cwd = mkWorkspace();

    // 1. Add fix item
    run(['backlog', 'add', '--title', '修复任务崩溃问题', '--kind', 'fix', '--priority', 'P0', '--level', '1', '--background', '并发死锁', '--acceptance', '测试不再挂起', '--readiness', 'confirmed'], cwd);

    // 2. Add perf item
    run(['backlog', 'add', '--title', '优化启动速度', '--kind', 'perf', '--priority', 'P1', '--level', '2', '--background', '基准耗时 500ms', '--acceptance', '启动耗时 < 200ms', '--readiness', 'confirmed'], cwd);

    const exportYaml = run(['backlog', 'export', '--format', 'yaml'], cwd);
    assert.match(exportYaml, /kind: fix/);
    assert.match(exportYaml, /kind: perf/);
  });

  it('performs deep hygiene audit in backlog groom (broken deps, fuzzy AC, stale items)', () => {
    const cwd = mkWorkspace();

    // 1. Broken dependency
    run(['backlog', 'add', '--title', '断链前置任务', '--priority', 'P1', '--level', '1', '--background', '背景', '--acceptance', '完成', '--readiness', 'confirmed', '--depends-on', 'R-999'], cwd);

    // 2. Fuzzy AC item
    run(['backlog', 'add', '--title', '模糊验收标准任务', '--priority', 'P2', '--level', '1', '--background', 'UI调整', '--acceptance', '界面美观，性能良好，尽快完成', '--readiness', 'confirmed'], cwd);

    // 3. Level 3 Epic without decomposition
    run(['backlog', 'add', '--title', '超大核心重构', '--priority', 'P0', '--level', '3', '--background', '架构重构', '--acceptance', '全量通过并 100% 覆盖', '--readiness', 'confirmed', '--evidence-decision', 'ADR-001', '--user-confirmed', '已对齐'], cwd);

    let errorThrown = false;
    try {
      run(['backlog', 'groom'], cwd);
    } catch (err) {
      errorThrown = true;
      const stdout = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
      assert.match(stdout, /depends_on 引用的前置依赖不存在: R-999/);
      assert.match(stdout, /验收标准包含模糊\/主观词汇/);
      assert.match(stdout, /复杂度为 Level 3 的高风险需求尚未进行子需求拆解/);
    }
    assert.ok(errorThrown, 'Groom should fail due to broken dependency error');
  });

  it('shapes raw item into structured shaped item via backlog shape', () => {
    const cwd = mkWorkspace();

    // 1. Capture a raw item
    run(['backlog', 'capture', '调研新型缓存机制', '--priority', 'P2', '--level', '2'], cwd);

    // 2. Shape it with spike kind and structured details
    const shapeOut = run(['backlog', 'shape', 'R-001', '--kind', 'spike', '--background', '评估 Redis vs SQLite 作为本地缓存', '--acceptance', '输出技术评估报告并形成 ADR'], cwd);
    assert.match(shapeOut, /已将条目 R-001 规范化为 shaped 成熟度/);
    assert.match(shapeOut, /kind: spike/);

    const exportMd = run(['backlog', 'export', '--format', 'markdown'], cwd);
    assert.match(exportMd, /## \[R-001\] 调研新型缓存机制/);
    assert.match(exportMd, /调研目标与核心问题/);
    assert.match(exportMd, /评估 Redis vs SQLite/);
  });

  it('imports and exports backlog items in batch (JSON/YAML/Markdown)', () => {
    const cwd = mkWorkspace();

    const importData = [
      {
        title: '批量导入功能A',
        kind: 'feature',
        priority: 'P1',
        level: 2,
        background: '背景A',
        acceptance: '验收A',
      },
      {
        title: '批量导入修复B',
        kind: 'fix',
        priority: 'P0',
        level: 1,
        background: '缺陷B',
        acceptance: '修复B',
      },
    ];

    const importFile = join(cwd, 'import-tasks.json');
    writeFileSync(importFile, JSON.stringify(importData, null, 2));

    // 1. Dry run preview
    const dryRunOut = run(['backlog', 'import', importFile, '--dry-run'], cwd);
    assert.match(dryRunOut, /成功创建: 2 个/);

    // 2. Real import
    const realImportOut = run(['backlog', 'import', importFile], cwd);
    assert.match(realImportOut, /成功创建: 2 个/);

    // 3. Export to JSON file
    const exportFile = join(cwd, 'exported-tasks.json');
    const exportOut = run(['backlog', 'export', '--format', 'json', '--output', exportFile], cwd);
    assert.match(exportOut, /已成功导出 2 条 Backlog/);
    assert.ok(existsSync(exportFile), 'Export file should exist');

    const exportedContent = JSON.parse(readFileSync(exportFile, 'utf-8'));
    assert.equal(exportedContent.total, 2);
    assert.equal(exportedContent.items[0].kind, 'feature');
    assert.equal(exportedContent.items[1].kind, 'fix');
  });
});
