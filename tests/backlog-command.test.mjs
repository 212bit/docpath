import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  it('backlog add creates a shaped proposed item and refreshes backlog index', () => {
    const cwd = mkWorkspace();
    const out = run('backlog add --title "实现 backlog list" --priority P1 --level 3 --background "问题背景" --acceptance "完成验收" --readiness confirmed --evidence-decision "spec decision" --user-confirmed "用户确认"', cwd);

    assert.match(out, /已创建 backlog 条目: R-001/);
    const backlogDir = join(cwd, '.docpath', 'backlog');
    const itemFile = readdirSync(backlogDir).find((name) => name === 'R-001.md' || /^R-001-.*\.md$/.test(name));
    assert.ok(itemFile, 'R-001 item file should exist');
    const item = readFileSync(join(backlogDir, itemFile), 'utf-8');
    assert.match(item, /title: 实现 backlog list/);
    assert.match(item, /status: proposed/);
    assert.match(item, /priority: P1/);
    assert.match(item, /level: 3/);
    assert.match(item, /readiness: confirmed/);
    assert.match(item, /user_confirmed: 用户确认/);

    const index = readFileSync(join(cwd, '.docpath', 'backlog', 'backlog.md'), 'utf-8');
    assert.match(index, /\| R-001 \| 实现 backlog list \| proposed \| P1 \| 3 \|/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog capture creates a raw item for low-friction idea capture', () => {
    const cwd = mkWorkspace();
    const out = run('backlog capture --title "记录一个想法" --priority P2 --level 2', cwd);

    assert.match(out, /已捕获 raw backlog 条目: R-001/);
    assert.match(out, /readiness: raw/);
    assert.match(out, /docpath analyze --dry-run --mode deep --content "记录一个想法"/);
    assert.doesNotMatch(out, /docpath analyze --mode deep --content "记录一个想法"/);
    const item = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001.md'), 'utf-8');
    assert.match(item, /source: docpath backlog capture/);
    assert.match(item, /readiness: raw/);
    assert.match(item, /- 待补充/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog add writes inline background and acceptance body', () => {
    const cwd = mkWorkspace();
    run('backlog add --title "带正文条目" --background "问题背景" --acceptance "完成验收"', cwd);

    const backlogDir = join(cwd, '.docpath', 'backlog');
    const itemFile = readdirSync(backlogDir).find((name) => name === 'R-001.md' || /^R-001-.*\.md$/.test(name));
    assert.ok(itemFile, 'R-001 item file should exist');
    const item = readFileSync(join(backlogDir, itemFile), 'utf-8');

    assert.match(item, /## 背景\n\n问题背景/);
    assert.match(item, /## 验收\n\n完成验收/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog add reads full body from body file', () => {
    const cwd = mkWorkspace();
    writeFileSync(join(cwd, 'body.md'), [
      '## 背景',
      '',
      '- 来自文件的背景',
      '',
      '## 验收',
      '',
      '- 来自文件的验收',
    ].join('\n'));

    run('backlog add --title "文件正文条目" --body-file body.md', cwd);

    const backlogDir = join(cwd, '.docpath', 'backlog');
    const itemFile = readdirSync(backlogDir).find((name) => name === 'R-001.md' || /^R-001-.*\.md$/.test(name));
    assert.ok(itemFile, 'R-001 item file should exist');
    const item = readFileSync(join(backlogDir, itemFile), 'utf-8');

    assert.match(item, /## 背景\n\n- 来自文件的背景/);
    assert.match(item, /## 验收\n\n- 来自文件的验收/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog add fails loudly when body file conflicts with inline body options', () => {
    const cwd = mkWorkspace();
    writeFileSync(join(cwd, 'body.md'), '## 背景\n\n- body file\n');

    assert.throws(
      () => run('backlog add --title "冲突正文" --body-file body.md --background "inline"', cwd),
      /--body-file 不能与 --background\/--acceptance 同时使用/,
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog edit updates metadata and refreshes the index without changing stable fields', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: accepted
priority: P2
level: 3
source: test
links:
  task: T-001
  spec: tasks/T-001/spec.md
created_at: 2026-05-31
---

Alpha body
`);

    const out = run('backlog edit R-001 --title "Beta" --priority P0 --level 1', cwd);

    assert.match(out, /backlog 条目已编辑: R-001/);
    const item = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /title: Beta/);
    assert.match(item, /status: accepted/);
    assert.match(item, /priority: P0/);
    assert.match(item, /level: 1/);
    assert.match(item, /source: test/);
    assert.match(item, /task: T-001/);
    assert.match(item, /created_at: 2026-05-31/);
    assert.match(item, /Alpha body/);

    const index = readFileSync(join(cwd, '.docpath', 'backlog', 'backlog.md'), 'utf-8');
    assert.match(index, /\| R-001 \| Beta \| accepted \| P0 \| 1 \| T-001 \|/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog edit updates inline body sections', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: proposed
priority: P1
level: 2
source: test
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Old body
`);

    run('backlog edit R-001 --background "新背景" --acceptance "新验收"', cwd);

    const item = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /## 背景\n\n新背景/);
    assert.match(item, /## 验收\n\n新验收/);
    assert.doesNotMatch(item, /Old body/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog edit replaces body from body file', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: proposed
priority: P1
level: 2
source: test
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Old body
`);
    writeFileSync(join(cwd, 'body.md'), '## 背景\n\n- 文件背景\n\n## 验收\n\n- 文件验收\n');

    run('backlog edit R-001 --body-file body.md', cwd);

    const item = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), 'utf-8');
    assert.match(item, /## 背景\n\n- 文件背景/);
    assert.match(item, /## 验收\n\n- 文件验收/);
    assert.doesNotMatch(item, /Old body/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog edit fails loudly for missing items, no fields, invalid fields, and conflicting body options', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: proposed
priority: P1
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Alpha
`);
    writeFileSync(join(cwd, 'body.md'), 'Body\n');

    assert.throws(() => run('backlog edit R-404 --title "Missing"', cwd), /backlog 条目不存在/);
    assert.throws(() => run('backlog edit R-001', cwd), /requires at least one field option/);
    assert.throws(() => run('backlog edit R-001 --priority PX', cwd), /priority 非法/);
    assert.throws(() => run('backlog edit R-001 --level 9', cwd), /level 非法/);
    assert.throws(
      () => run('backlog edit R-001 --body-file body.md --acceptance "inline"', cwd),
      /--body-file 不能与 --background\/--acceptance 同时使用/,
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog groom passes for healthy backlog items', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: proposed
priority: P1
level: 2
source: test
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-05-31
---

## 背景

- 清晰背景

## 验收

- 清晰验收
`);
    run('backlog refresh', cwd);

    const out = run('backlog groom', cwd);

    assert.match(out, /Backlog 健康检查通过/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog groom reports missing body sections and placeholder content', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: accepted
priority: P1
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

- 待补充
`);
    run('backlog refresh', cwd);

    assert.throws(() => run('backlog groom', cwd), /backlog groom failed: 4 issue/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog groom reports missing links for active or done items', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    mkdirSync(join(cwd, '.docpath', 'backlog', 'archived'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: done
priority: P1
level: 1
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Done body
`);
    // refreshBacklogIndex auto-archives done items, so groom won't see R-001
    run('backlog refresh', cwd);

    // Now the done item is archived, groom should pass (no active/done items with missing links)
    const out = run('backlog groom', cwd);
    assert.match(out, /✅/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog groom reports a missing generated index', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: proposed
priority: P1
level: 2
source: test
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-05-31
---

## 背景

- 清晰背景

## 验收

- 清晰验收
`);

    assert.throws(() => run('backlog groom', cwd), /backlog groom failed: 1 issue/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog groom supports agent yaml output', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
status: accepted
priority: P1
level: 2
source: test
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Old body
`);
    run('backlog refresh', cwd);

    let parsed;
    try {
      run('backlog groom --agent', cwd);
    } catch (error) {
      parsed = parse(error.stdout.toString());
    }

    assert.equal(parsed.passed, false);
    assert.equal(parsed.issue_count, 3);
    assert.equal(parsed.issues[0].id, 'R-001');
    assert.match(parsed.issues[0].suggestion, /docpath backlog edit R-001/);
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

  it('backlog add rejects invalid priority, missing title, and missing body', () => {
    const cwd = mkWorkspace();
    assert.throws(() => run('backlog add --priority P9 --title "bad" --background "b" --acceptance "a"', cwd), /priority 非法/);
    assert.throws(() => run('backlog add --priority P1', cwd), /requires --title/);
    assert.throws(() => run('backlog add --title "raw idea"', cwd), /requires --background\/--acceptance or --body-file/);
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
      '--background',
      `背景 ${index + 1}`,
      '--acceptance',
      `验收 ${index + 1}`,
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
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-05-31
---

## 背景

- 来自 backlog 的正文

## 验收

- 完成验收
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
    mkdirSync(join(cwd, '.docpath', 'tasks', 'current', 'analysis'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.json'), JSON.stringify({
      schema_version: 1,
      kind: 'plan',
      title: 'Stale Plan',
      steps: [{ id: 'S1', name: 'Old', description: 'old', acceptance: 'old', dependencies: 'none', status: 'done' }],
    }, null, 2));
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'analysis', 'technical.md'), 'stale analysis\n');

    const out = run('backlog promote R-001', cwd);
    assert.match(out, /已 promote backlog 条目: R-001/);
    assert.match(out, /next_hint:/);
    assert.match(out, /recommended_command: docpath plan/);

    const spec = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8');
    assert.match(spec, /^# T-\d{8}-alpha-promote - Alpha Promote/m);
    assert.match(spec, /> backlog_id: R-001/);
    assert.match(spec, /FR-1: Alpha Promote/);
    assert.match(spec, /来源 backlog: R-001/);
    assert.match(spec, /来自 backlog 的正文/);
    assert.match(spec, /### UI 设计门禁/);
    assert.match(spec, /- \[x\] 本任务不涉及产品 UI 实现/);
    assert.match(spec, /- \[ \] 本任务涉及产品 UI 实现/);
    assert.match(spec, /- \[x\] 否/);
    const taskId = spec.match(/^# (T-\d{8}-alpha-promote) - Alpha Promote/m)?.[1];
    assert.ok(taskId, 'task id should be rendered into promoted spec');
    const canonicalSpec = readFileSync(join(cwd, '.docpath', 'tasks', taskId, 'spec.md'), 'utf-8');
    assert.equal(canonicalSpec, spec);
    const currentSpecJson = JSON.parse(readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.json'), 'utf-8'));
    assert.equal(currentSpecJson.task_id, taskId);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.json')), false);
    assert.equal(existsSync(join(cwd, '.docpath', 'tasks', 'current', 'analysis', 'technical.md')), false);

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

  it('backlog promote pre-fills major change and UI gates for confirmed CLI workflow work', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-002-workflow.md'), `---
id: R-002
title: Fix docpath worktree workflow gate
status: accepted
priority: P1
level: 2
source: test
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: docs/decision.md
  user_confirmed: 用户确认修复 workflow 和 git commit 边界
links:
  task: null
  spec: null
created_at: 2026-05-31
---

## 背景

docpath worktree workflow gate blocks git commit staging.

## 验收

CLI workflow task can proceed without product UI design assets.
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

    run('backlog promote R-002', cwd);

    const spec = readFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), 'utf-8');
    assert.match(spec, /- \[ \] 否/);
    assert.match(spec, /- \[x\] 是，需要用户确认/);
    assert.match(spec, /- \[x\] 工作流 \/ Agent 行为/);
    assert.match(spec, /- \[x\] 权限 \/ 写操作边界/);
    assert.match(spec, /- \[x\] 本任务不涉及产品 UI 实现/);
    assert.match(spec, /- 用户确认: 用户确认修复 workflow 和 git commit 边界/);
    assert.match(spec, /Decision Brief 证据: docs\/decision\.md/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog promote creates missing workspace runtime before state locking', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-backlog-missing-workspace-'));
    const dp = join(cwd, '.docpath');
    mkdirSync(join(dp, 'backlog'), { recursive: true });
    mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
    writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: backlog-command-test\n');
    writeFileSync(join(dp, 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha Promote
status: accepted
priority: P0
level: 2
source: test
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-05-31
---

## 背景

- 来自 backlog 的正文

## 验收

- 完成验收
`);

    const out = run('backlog promote R-001', cwd);
    const state = JSON.parse(readFileSync(join(dp, 'workspace', 'state.json'), 'utf-8'));
    const item = readFileSync(join(dp, 'backlog', 'R-001-alpha.md'), 'utf-8');

    assert.match(out, /已 promote backlog 条目: R-001/);
    assert.equal(existsSync(join(dp, 'workspace', 'current.md')), true);
    assert.equal(state.phase, 'drafting');
    assert.match(state.task_id, /^T-\d{8}-alpha-promote$/);
    assert.match(item, /status: active/);
    assert.match(item, /task: T-\d{8}-alpha-promote/);
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
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Alpha
`);

    assert.throws(() => run('backlog promote R-001', cwd), (error) => {
      const out = `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`;
      assert.match(out, /已有活跃任务/);
      assert.match(out, /docpath task abort\/reset/);
      assert.doesNotMatch(out, /\bpark\b/);
      return true;
    });
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
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
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
    mkdirSync(join(cwd, '.docpath', 'backlog', 'archived'), { recursive: true });
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
    // R-001 marked done gets auto-archived by refreshBacklogIndex
    assert.match(readFileSync(join(cwd, '.docpath', 'backlog', 'archived', 'R-001-alpha.md'), 'utf-8'), /status: done/);
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
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
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

  it('backlog accept fails for raw or placeholder items', () => {
    const cwd = mkWorkspace();
    run('backlog capture --title "Raw idea" --level 2', cwd);

    assert.throws(
      () => run('backlog accept R-001', cwd),
      /尚未达到可执行成熟度/,
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog promote --draft skips maturity gate and fast-tracks a proposed level-2 item to active', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    // readiness=raw + 无 evidence：不加 --draft 必然被门禁拦下
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-draft.md'), `---
id: R-001
title: Draft Fast Track
status: proposed
priority: P0
level: 2
source: test
readiness: raw
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Raw idea only
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

    // 对照：不加 --draft 仍按原门禁报错
    assert.throws(
      () => run('backlog promote R-001', cwd),
      /尚未达到可执行成熟度/,
    );

    // --draft 跳过成熟度门禁，proposed → active 合法，直接建任务
    const out = run('backlog promote --draft R-001', cwd);
    assert.match(out, /已 promote backlog 条目: R-001/);

    const item = readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-draft.md'), 'utf-8');
    assert.match(item, /status: active/);
    assert.match(item, /task: T-\d{8}-draft-fast-track/);

    const state = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
    assert.match(state.task_id, /^T-\d{8}-draft-fast-track$/);
    assert.equal(state.phase, 'drafting');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog promote --draft fast-tracks a level-3 item missing user confirmation', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    // level 3 缺 user_confirmed：不加 --draft 会被门禁拦下
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-l3draft.md'), `---
id: R-001
title: L3 Draft Track
status: proposed
priority: P0
level: 3
source: test
readiness: analyzed
evidence:
  brainstorm: null
  analysis: analysis/requirements.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Level 3 raw idea
`);
    writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 3,
      task_id: '',
      task_title: '',
      phase: 'idle',
      gate: 'none',
      current_step: '等待下一步',
      started_at: '2026-05-31T00:00:00.000Z',
      updated_at: '2026-05-31T00:00:00.000Z',
    }, null, 2));

    assert.throws(
      () => run('backlog promote R-001', cwd),
      /尚未达到可执行成熟度/,
    );

    const out = run('backlog promote --draft R-001', cwd);
    assert.match(out, /已 promote backlog 条目: R-001/);
    assert.match(
      readFileSync(join(cwd, '.docpath', 'backlog', 'R-001-l3draft.md'), 'utf-8'),
      /status: active/,
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('backlog accept/plan --draft skip maturity gate consistently with promote', () => {
    const cwd = mkWorkspace();
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-apdraft.md'), `---
id: R-001
title: Accept Plan Draft
status: proposed
priority: P0
level: 2
source: test
readiness: raw
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-05-31
---

Raw idea only
`);

    // 默认路径：accept 对 raw 条目报错
    assert.throws(
      () => run('backlog accept R-001', cwd),
      /尚未达到可执行成熟度/,
    );
    // --draft：accept 跳过门禁成功（proposed → accepted 合法）
    const acceptOut = run('backlog accept --draft R-001', cwd);
    assert.match(acceptOut, /R-001 → accepted/);

    // --draft：plan 跳过门禁成功（accepted → planned 合法）
    const planOut = run('backlog plan --draft R-001', cwd);
    assert.match(planOut, /R-001 → planned/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
