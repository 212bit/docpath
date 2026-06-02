import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { promisify } from 'node:util';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;
const execFileAsync = promisify(execFile);

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-backlog-cmd-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: backlog-command-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-BACKLOG',
    task_title: 'Backlog command',
    phase: 'executing',
    gate: 'none',
    current_step: 'S3',
    started_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  return cwd;
}

function run(args, cwd) {
  return execFileSync('node', [BIN, ...args.match(/(?:[^\s"]+|"[^"]*")+/g).map((part) => part.replace(/^"|"$/g, ''))], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
  }).trim();
}

describe('backlog commands', () => {
  it('backlog add creates a new proposed item and refreshes backlog index', () => {
    const cwd = mkWorkspace();
    const out = run('backlog add --title "实现 backlog list" --priority P1 --level 3', cwd);

    assert.match(out, /已创建 backlog 条目: R-001/);
    const backlogDir = join(cwd, '.docpath', 'backlog');
    const itemFile = readdirSync(backlogDir).find((name) => name === 'R-001.md' || /^R-001-.*\.md$/.test(name));
    assert.ok(itemFile, 'R-001 item file should exist');
    const item = readFileSync(join(backlogDir, itemFile), 'utf-8');
    assert.match(item, /title: 实现 backlog list/);
    assert.match(item, /status: proposed/);
    assert.match(item, /priority: P1/);
    assert.match(item, /level: 3/);

    const index = readFileSync(join(cwd, '.docpath', 'backlog', 'backlog.md'), 'utf-8');
    assert.match(index, /\| R-001 \| 实现 backlog list \| proposed \| P1 \| 3 \|/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog list filters by status and priority and supports agent yaml output', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: accepted
priority: P0
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Alpha
`);
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-002-beta.md'), `---
id: R-002
title: Beta
status: proposed
priority: P1
level: 1
source: test
links:
  task: T-002
  spec: null
created_at: 2026-05-31
---

Beta
`);

    const textOut = run('backlog list --status accepted --priority P0', cwd);
    assert.match(textOut, /\| R-001 \| P0 \| accepted \| 2 \| Alpha \|/);
    assert.doesNotMatch(textOut, /R-002/);

    const agentOut = parse(run('backlog list --agent', cwd));
    assert.equal(agentOut.count, 2);
    assert.equal(agentOut.items[0].id, 'R-001');
    assert.equal(agentOut.items[1].task, 'T-002');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog refresh rebuilds the generated index without changing items', () => {
    const cwd = mkWorkspace();
    const backlogDir = join(cwd, '.docpath', 'backlog');
    mkdirSync(backlogDir, { recursive: true });
    writeFileSync(join(backlogDir, 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: accepted
priority: P0
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Alpha
`);
    writeFileSync(join(backlogDir, 'backlog.md'), '# stale index\n');

    const out = run('backlog refresh', cwd);

    assert.match(out, /backlog 索引已刷新: 1 个条目/);
    const index = readFileSync(join(backlogDir, 'backlog.md'), 'utf-8');
    assert.match(index, /# DocPath Backlog Index/);
    assert.match(index, /\| R-001 \| Alpha \| accepted \| P0 \| 2 \|/);
    const item = readFileSync(join(backlogDir, 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /status: accepted/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog add rejects invalid priority or missing title', () => {
    const cwd = mkWorkspace();
    assert.throws(() => run('backlog add --priority P9 --title "bad"', cwd), /priority 非法/);
    assert.throws(() => run('backlog add --priority P1', cwd), /requires --title/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog add assigns unique ids under concurrent CLI calls', async () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-007-existing.md'), `---
id: R-007
title: Existing
status: proposed
priority: P2
level: 1
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Existing
`);

    const calls = Array.from({ length: 5 }, (_, index) => execFileAsync('node', [
      BIN,
      'backlog',
      'add',
      '--title',
      `并发条目 ${index + 1}`,
      '--priority',
      'P1',
      '--level',
      '1',
    ], { cwd, encoding: 'utf-8', timeout: 20000 }));

    const outputs = await Promise.all(calls);
    const createdIds = outputs.map(({ stdout }) => stdout.match(/已创建 backlog 条目: (R-\d+)/)?.[1]).filter(Boolean);
    assert.equal(createdIds.length, 5);
    assert.equal(new Set(createdIds).size, 5);
    assert.deepEqual([...createdIds].sort(), ['R-008', 'R-009', 'R-010', 'R-011', 'R-012']);

    const agentOut = parse(run('backlog list --agent', cwd));
    const ids = agentOut.items.map((item) => item.id);
    assert.equal(ids.length, new Set(ids).size);
    assert.deepEqual(ids.filter((id) => /^R-00[89]$|^R-01[0-2]$/.test(id)).sort(), ['R-008', 'R-009', 'R-010', 'R-011', 'R-012']);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog promote seeds current spec, updates links, and sets current task context', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: accepted
priority: P0
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

## 背景

- 来自 backlog 的正文
`);
    writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: '',
      task_title: '',
      phase: 'idle',
      gate: 'none',
      current_step: '等待下一步',
      started_at: '2026-05-31T00:00:00.000Z',
      updated_at: '2026-05-31T00:00:00.000Z',
    }, null, 2));

    const out = run('backlog promote R-001', cwd);
    assert.match(out, /已 promote backlog 条目: R-001/);

    const spec = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8');
    assert.match(spec, /^# T-\d{8}-alpha-promote - Alpha Promote/m);
    assert.match(spec, /> backlog_id: R-001/);
    assert.match(spec, /FR-1: Alpha Promote/);
    assert.match(spec, /来源 backlog: R-001/);
    assert.match(spec, /来自 backlog 的正文/);
    const taskId = spec.match(/^# (T-\d{8}-alpha-promote) - Alpha Promote/m)?.[1];
    assert.ok(taskId, 'task id should be rendered into promoted spec');
    const canonicalSpec = readFileSync(join(cwd, '.docpath', 'tasks', taskId, 'spec.md'), 'utf-8');
    assert.equal(canonicalSpec, spec);

    const item = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /status: active/);
    assert.match(item, /task: T-\d{8}-alpha-promote/);
    assert.match(item, /spec: tasks\/T-\d{8}-alpha-promote\/spec\.md/);

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.phase, 'drafting');
    assert.equal(state.task_title, 'Alpha Promote');
    assert.match(state.task_id, /^T-\d{8}-alpha-promote$/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog promote fails loudly when there is already an active task', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: accepted
priority: P0
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Alpha
`);

    assert.throws(() => run('backlog promote R-001', cwd), /已有活跃任务/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog promote allocates a unique task id when active or done dirs already exist', () => {
    const cwd = mkWorkspace();
    const dp = join(cwd, '.docpath');
    mkdirSync(join(dp, 'backlog'), { recursive: true });
    mkdirSync(join(dp, 'tasks', 'done'), { recursive: true });
    writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
      level: 2,
      task_id: '',
      task_title: '',
      phase: 'idle',
      gate: 'none',
      current_step: '等待下一步',
      started_at: '2026-05-31T00:00:00.000Z',
      updated_at: '2026-05-31T00:00:00.000Z',
    }, null, 2));
    writeFileSync(join(dp, 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: accepted
priority: P0
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Alpha
`);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const baseTaskId = `T-${date}-alpha-promote`;
    mkdirSync(join(dp, 'tasks', 'done', baseTaskId), { recursive: true });
    mkdirSync(join(dp, 'tasks', `${baseTaskId}-2`), { recursive: true });

    const out = run('backlog promote R-001', cwd);

    assert.match(out, new RegExp(`task_id: ${baseTaskId}-3`));
    assert.equal(readFileSync(join(dp, 'tasks', 'current', 'spec.md'), 'utf-8').startsWith(`# ${baseTaskId}-3 - Alpha Promote`), true);
    assert.equal(readFileSync(join(dp, 'backlog', 'R-001-alpha.md'), 'utf-8').includes(`task: ${baseTaskId}-3`), true);
    const state = JSON.parse(readFileSync(join(dp, 'workspace', 'state.json'), 'utf-8'));
    assert.equal(state.task_id, `${baseTaskId}-3`);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog done and drop update terminal statuses', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: active
priority: P0
level: 2
source: test
links:
  task: T-001
  spec: tasks/current/spec.md
created_at: 2026-05-31
---

Alpha
`);
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-002-beta.md'), `---
id: R-002
title: Beta
status: accepted
priority: P1
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Beta
`);

    const doneOut = run('backlog done R-001', cwd);
    const dropOut = run('backlog drop R-002', cwd);
    assert.match(doneOut, /R-001 → done/);
    assert.match(dropOut, /R-002 → dropped/);
    assert.match(readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), 'utf-8'), /status: done/);
    assert.match(readFileSync(join(cwd, '.docpath', 'backlog', 'R-002-beta.md'), 'utf-8'), /status: dropped/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog accept advances a proposed item to accepted', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: proposed
priority: P0
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Alpha
`);

    const out = run('backlog accept R-001', cwd);
    assert.match(out, /R-001 → accepted/);
    assert.match(readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), 'utf-8'), /status: accepted/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
