import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-backlog-merge-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'milestones'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: backlog-merge-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-MERGE-TEST',
    task_title: 'Backlog Merge Test',
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

describe('docpath backlog merge', () => {
  it('merges multiple micro backlogs into a target backlog and archives dropped items', () => {
    const cwd = mkWorkspace();

    // 1. Create a milestone M-002
    const milestoneContent = `---
id: M-002
title: M1 数据层与契约
status: active
priority: P0
backlog_ids:
  - R-001
  - R-002
  - R-003
created_at: 2026-10-06
---

## 1. 🎯 里程碑核心目标
建立采购申请业务的数据地基。
`;
    writeFileSync(join(cwd, '.docpath', 'milestones', 'M-002-m1-数据层与契约.md'), milestoneContent);

    // 2. Add 3 micro-backlogs
    run(['backlog', 'add', '--title', '采购申请业务建表', '--priority', 'P0', '--level', '1', '--background', '建表 DDL', '--acceptance', '主表与明细表建表完成', '--readiness', 'confirmed', '--milestone', 'M-002'], cwd);
    run(['backlog', 'add', '--title', '配套 Mapper 接口与 mybatis XML 映射', '--priority', 'P0', '--level', '1', '--background', 'Mapper XML', '--acceptance', 'Mapper 接口与 XML 映射完成', '--readiness', 'confirmed', '--milestone', 'M-002'], cwd);
    run(['backlog', 'add', '--title', 'facade 采购申请 SVC 契约与 DTO 定义', '--priority', 'P0', '--level', '1', '--background', 'DTO 契约', '--acceptance', 'SVC 接口与 DTO 定义完成', '--readiness', 'confirmed', '--milestone', 'M-002'], cwd);

    // 3. Dry-run preview
    const dryRunOut = run(['backlog', 'merge', 'R-001,R-002,R-003', '--target', 'R-001', '--title', '采购申请持久层与服务契约', '--dry-run'], cwd);
    assert.match(dryRunOut, /预览模式/);
    assert.match(dryRunOut, /目标条目: R-001/);
    assert.match(dryRunOut, /已归并并废弃条目: R-002, R-003/);

    // 4. Real merge
    const mergeOut = run(['backlog', 'merge', 'R-001,R-002,R-003', '--target', 'R-001', '--title', '采购申请持久层与服务契约'], cwd);
    assert.match(mergeOut, /Backlog 智能合并完成/);
    assert.match(mergeOut, /目标条目: R-001/);

    // 5. Inspect target item
    const showTarget = run(['backlog', 'show', 'R-001'], cwd);
    assert.match(showTarget, /采购申请持久层与服务契约/);
    assert.match(showTarget, /主表与明细表建表完成/);
    assert.match(showTarget, /Mapper 接口与 XML 映射完成/);
    assert.match(showTarget, /SVC 接口与 DTO 定义完成/);

    // 6. Inspect dropped items (should be archived)
    const showDropped = run(['backlog', 'show', 'R-002'], cwd);
    assert.match(showDropped, /dropped \[已归档/);

    // 7. Verify milestone backlog_ids updated
    const updatedMs = readFileSync(join(cwd, '.docpath', 'milestones', 'M-002-m1-数据层与契约.md'), 'utf-8');
    assert.match(updatedMs, /R-001/);
    assert.doesNotMatch(updatedMs, /R-002/);
    assert.doesNotMatch(updatedMs, /R-003/);
  });

  it('supports --agent structured YAML output', () => {
    const cwd = mkWorkspace();

    run(['backlog', 'add', '--title', '需求 A', '--priority', 'P1', '--level', '1', '--background', 'A', '--acceptance', '完成 A', '--readiness', 'confirmed'], cwd);
    run(['backlog', 'add', '--title', '需求 B', '--priority', 'P1', '--level', '1', '--background', 'B', '--acceptance', '完成 B', '--readiness', 'confirmed'], cwd);

    const agentOut = run(['backlog', 'merge', 'R-001,R-002', '--target', 'R-001', '--agent'], cwd);
    assert.match(agentOut, /agent_view: backlog_merge/);
    assert.match(agentOut, /target_id: R-001/);
    assert.match(agentOut, /dropped_ids:/);
  });

  it('fails loudly when merging less than 2 items or merging done items', () => {
    const cwd = mkWorkspace();

    run(['backlog', 'add', '--title', '需求 A', '--priority', 'P1', '--level', '1', '--background', 'A', '--acceptance', '完成 A', '--readiness', 'confirmed'], cwd);

    // Less than 2 items
    assert.throws(() => {
      run(['backlog', 'merge', 'R-001'], cwd);
    });
  });
});
