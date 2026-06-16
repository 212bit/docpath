import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse } from 'yaml';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace({ phase = 'idle', gate = 'none', taskId = 'T-NEXT', taskTitle = 'Next routing', plan = '', lastCheck = '', breadcrumb = '# Breadcrumb\n' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-next-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'spec'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: next-test\n');
  writeFileSync(join(dp, 'spec', 'architecture.md'), '# Architecture\n');
  writeFileSync(join(dp, 'spec', 'style.md'), '# Style\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: taskId,
    task_title: taskTitle,
    phase,
    gate,
    current_step: 'routing',
    started_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), breadcrumb);
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), plan);
  if (lastCheck) writeFileSync(join(dp, 'workspace', 'last-check.md'), lastCheck);
  return cwd;
}

function nextAgent(cwd) {
  const output = execSync(`node ${BIN} next --cwd ${cwd} --agent`, { encoding: 'utf-8' });
  return parse(output);
}

function statusAgent(cwd) {
  const output = execSync(`node ${BIN} status --cwd ${cwd} --agent`, { encoding: 'utf-8' });
  return parse(output);
}

function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function initGitRepo(cwd) {
  git(cwd, 'init');
  git(cwd, 'config user.email test@example.com');
  git(cwd, 'config user.name Test');
  git(cwd, 'add .');
  git(cwd, 'commit -m initial');
}

describe('next --agent routing', () => {
  it('distinguishes status diagnostics from next route output', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    const status = statusAgent(cwd);
    const next = nextAgent(cwd);

    assert.equal(status.agent_view, 'status');
    assert.equal(next.agent_view, 'next');
    assert.match(status.agent_contract, /status_snapshot/);
    assert.match(next.agent_contract, /next_route/);
    assert.equal(status.recommended_command, 'docpath next --agent');
    assert.match(status.next_action, /诊断当前工作流状态/);
    assert.equal(status.route_hint.recommended_command, next.recommended_command);
    assert.equal(status.route_hint.next_action, next.next_action);
    assert.equal(status.workflow_profile, 'standard');
    assert.equal(status.gate_policy.requires_check, true);
    assert.equal(status.gate_policy.requires_review, true);
    assert.equal(status.gate_policy.journal_mode, 'full');
    assert.notDeepEqual(status, next);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('recommends backlog capture for a newly initialized project without accepted backlog', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    assert.match(output.next_action, /捕获 raw backlog/);
    assert.ok(output.required_files.includes('.docpath/workspace/current.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes completed state with lesson candidates into learn before creating new backlog', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## T-LESSON — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-LESSON',
      '- key: T-LESSON-workflow',
      '',
      '### Lesson',
      '',
      '推荐固化经验。',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath learn --dry-run');
    assert.match(output.next_action, /1 条待固化 lesson 候选/);
    assert.ok(output.required_files.includes('.docpath/workspace/lesson-candidates.md'));
    assert.equal(output.lesson_summary.pending_count, 1);
    assert.equal(output.lesson_summary.pending_keys.length, 1);
    assert.match(output.lesson_summary.pending_keys[0], /t-lesson-workflow/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('keeps clean completed git worktrees on the normal completed route', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    writeFileSync(join(cwd, 'README.md'), '# clean\n');
    initGitRepo(cwd);

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes completed dirty git worktrees into changes before accepted backlog', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
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
    writeFileSync(join(cwd, 'README.md'), '# initial\n');
    initGitRepo(cwd);
    writeFileSync(join(cwd, 'README.md'), '# changed\n');

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath changes --agent');
    assert.match(output.next_action, /git closeout/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes completed canonical ignored evidence into changes even with a clean worktree', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass', taskId: 'T-NEXT' });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), '# spec\n\n> backlog_id: R-999\n');
    writeFileSync(join(cwd, '.gitignore'), '.docpath/backlog/\n');
    writeFileSync(join(cwd, 'README.md'), '# clean\n');
    initGitRepo(cwd);
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-999.md'), `---
id: R-999
title: Ignored Backlog
status: done
priority: P2
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

Ignored backlog
`);

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath changes --agent');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes idle state with lesson candidates into learn when no backlog item is ready', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '- key: idle-lesson',
      '',
      '### Lesson',
      '',
      '推荐固化经验。',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath learn --dry-run');
    assert.ok(output.required_files.includes('.docpath/workspace/lesson-candidates.md'));
    assert.equal(output.lesson_summary.pending_count, 1);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes idle state to highest-priority accepted backlog item', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-003-gamma.md'), `---
id: R-003
title: Gamma
status: accepted
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

Gamma
`);
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
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

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog promote R-001');
    assert.match(output.next_action, /R-001 Alpha/);
    assert.ok(output.required_files.includes('.docpath/backlog/backlog.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('keeps accepted backlog priority over lesson candidates', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '- key: backlog-priority',
      '',
      '### Lesson',
      '',
      '推荐固化经验。',
      '',
    ].join('\n'));
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-alpha.md'), `---
id: R-001
title: Alpha
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

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog promote R-001');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('ignores empty lesson-candidates templates', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'lesson-candidates.md'), '# Lesson Candidates\n\n');

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('ignores lesson candidates already present in auto-learn metadata', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## T-LESSON — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-LESSON',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: T-LESSON-workflow',
      '',
      '### Lesson',
      '',
      '推荐固化经验。',
      '',
    ].join('\n'));
    writeFileSync(join(cwd, '.docpath', 'spec', 'style.md'), [
      '# Style',
      '',
      '<!-- docpath:auto-learn:style -->',
      '- **T-LESSON-workflow**: 推荐固化经验。',
      '<!-- docpath:lesson-meta best-practice:style:t-lesson-workflow:journal:t-lesson -->',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reads learned metadata from .docpath/rules before legacy spec paths', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    mkdirSync(join(cwd, '.docpath', 'rules'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## T-LESSON — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-LESSON',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: rules-learned',
      '',
      '### Lesson',
      '',
      '推荐固化经验。',
      '',
    ].join('\n'));
    writeFileSync(join(cwd, '.docpath', 'rules', 'style.md'), [
      '# Style',
      '',
      '<!-- docpath:auto-learn:style -->',
      '- **rules-learned**: 推荐固化经验。',
      '<!-- docpath:lesson-meta best-practice:style:rules-learned:journal:t-lesson -->',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    assert.equal(output.lesson_summary.pending_count, 0);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes drafting with placeholder spec into spec completion guidance', () => {
    const cwd = mkWorkspace({ phase: 'drafting', gate: 'none' });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), [
      '# Placeholder Spec',
      '',
      '## 背景',
      '',
      '- 待补充',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath brainstorm --dry-run');
    assert.match(output.next_action, /补全需求/);
    assert.ok(output.required_files.includes('.docpath/tasks/current/spec.md'));
    assert.ok(output.must_update.includes('.docpath/tasks/current/spec.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes idle state to accept the highest-priority proposed backlog item when none are accepted', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-002-beta.md'), `---
id: R-002
title: Beta
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

Beta
`);
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

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog accept R-001');
    assert.match(output.next_action, /先接收 backlog 条目: R-001 Alpha/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes raw proposed backlog through analysis before accept', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-001-raw.md'), `---
id: R-001
title: Raw Idea
status: proposed
priority: P0
level: 2
source: test
readiness: raw
links:
  task: null
  spec: null
created_at: 2026-05-31
---

## 背景

- 待补充

## 验收

- 待补充
`);

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath brainstorm --dry-run --input "Raw Idea"');
    assert.match(output.next_action, /先分析 backlog 条目/);
    assert.ok(output.must_update.includes('.docpath/backlog/'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('ignores stale in-progress breadcrumbs when idle has no task id', () => {
    const cwd = mkWorkspace({
      phase: 'idle',
      gate: 'none',
      taskId: '',
      taskTitle: '',
      breadcrumb: [
        '# Breadcrumb',
        '',
        '### 🔄 S9 [T-OLD] — 2026-05-29T00:00:00.000Z',
        '',
        '---',
        'taskId: T-OLD',
        'step: S9',
        'status: in_progress',
        'timestamp: 2026-05-29T00:00:00.000Z',
        '---',
        '',
        '- **状态**: in_progress',
        '- **上下文**: stale old step',
        '',
      ].join('\n'),
    });

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    assert.doesNotMatch(output.next_action, /S9/);
    assert.equal(output.progress.in_progress, 0);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('recommends the next incomplete plan step', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: '# Plan\n\n- [x] S1: done\n- [ ] S2: implement routing\n',
      breadcrumb: [
        '# Breadcrumb',
        '',
        '### ✅ S1 [T-NEXT] — 2026-05-29T00:00:00.000Z',
        '',
        '---',
        'taskId: T-NEXT',
        'step: S1',
        'status: done',
        'timestamp: 2026-05-29T00:00:00.000Z',
        '---',
        '',
        '- **状态**: done',
        '- **上下文**: done',
        '',
      ].join('\n'),
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath start S2');
    assert.match(output.next_action, /S2/);
    assert.ok(output.required_files.includes('.docpath/tasks/current/plan.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('derives progress from section-style plan steps without explicit checklist lines', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: [
        '## 执行计划',
        '',
        '### S1: finished step',
        '- **描述**: done',
        '- **验收条件**: done',
        '- **依赖**: 无',
        '',
        '### S2: next step',
        '- **描述**: todo',
        '- **验收条件**: todo',
        '- **依赖**: S1',
        '',
      ].join('\n'),
      breadcrumb: [
        '# Breadcrumb',
        '',
        '### ✅ S1 [T-NEXT] — 2026-05-29T00:00:00.000Z',
        '',
        '---',
        'taskId: T-NEXT',
        'step: S1',
        'status: done',
        'timestamp: 2026-05-29T00:00:00.000Z',
        '---',
        '',
        '- **状态**: done',
        '- **上下文**: done',
        '',
      ].join('\n'),
    });

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath start S2');
    assert.equal(output.progress.total, 2);
    assert.equal(output.progress.done, 1);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes check failures into debug', () => {
    const cwd = mkWorkspace({
      phase: 'checking',
      gate: 'check_fail',
      lastCheck: '# Last Check Evidence\n\n**结果**: ❌ FAIL\n',
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath debug reproduce');
    assert.match(output.next_action, /修复质量检查失败/);
    assert.ok(output.required_files.includes('.docpath/workspace/last-check.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes check failures in active tdd check phase back into tdd loop', () => {
    const cwd = mkWorkspace({
      phase: 'checking',
      gate: 'check_fail',
      lastCheck: '# Last Check Evidence\n\n**结果**: ❌ FAIL\n',
    });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'tdd-state.json'), JSON.stringify({
      phase: 'check',
      started_at: '2026-05-29T00:00:00.000Z',
      updated_at: '2026-05-29T00:00:00.000Z',
      cycles: 1,
    }, null, 2));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath tdd next');
    assert.match(output.next_action, /TDD 循环推进/);
    assert.ok(output.required_files.includes('.docpath/workspace/tdd-state.json'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes review_pass into journal', () => {
    const cwd = mkWorkspace({
      phase: 'reviewing',
      gate: 'review_pass',
      lastCheck: '# Last Check Evidence\n\n**结果**: ✅ PASS\n',
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath journal');
    assert.match(output.next_action, /知识归档/);
    assert.ok(output.required_files.includes('.docpath/workspace/review.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes plan/breadcrumb drift into check', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: '# Plan\n\n- [x] S1: implemented without breadcrumb\n',
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath check');
    assert.match(output.next_action, /漂移/);
    assert.ok(output.must_update.includes('.docpath/workspace/breadcrumb.md'));
    assert.ok(output.must_update.includes('.docpath/tasks/current/plan.md'));
    assert.match(output.drift_summary, /plan 已完成但缺少 breadcrumb/);
    assert.deepEqual(output.drift_details.plan_done_without_breadcrumb, ['S1']);
    assert.deepEqual(output.drift_details.breadcrumb_done_without_plan, []);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('includes empty drift summary when plan and breadcrumb are aligned', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: '# Plan\n\n- [x] S1: completed\n- [ ] S2: next step\n',
      breadcrumb: [
        '# Breadcrumb',
        '',
        '### ✅ S1 [T-NEXT] — 2026-05-29T00:00:00.000Z',
        '',
        '---',
        'taskId: T-NEXT',
        'step: S1',
        'status: done',
        'timestamp: 2026-05-29T00:00:00.000Z',
        '---',
        '',
        '- **状态**: done',
        '- **上下文**: finished',
        '',
      ].join('\n'),
    });
    const output = nextAgent(cwd);

    assert.equal(output.drift_summary, null);
    assert.deepEqual(output.drift_details.plan_done_without_breadcrumb, []);
    assert.deepEqual(output.drift_details.breadcrumb_done_without_plan, []);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not keep a completed step in progress when a later done breadcrumb exists', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: '# Plan\n\n- [x] S1: completed\n- [ ] S2: next step\n',
      breadcrumb: [
        '# Breadcrumb',
        '',
        '### 🔄 S1 [T-NEXT] — 2026-05-29T00:00:00.000Z',
        '',
        '---',
        'taskId: T-NEXT',
        'step: S1',
        'status: in_progress',
        'timestamp: 2026-05-29T00:00:00.000Z',
        '---',
        '',
        '- **状态**: in_progress',
        '- **上下文**: started',
        '',
        '### ✅ S1 [T-NEXT] — 2026-05-29T00:01:00.000Z',
        '',
        '---',
        'taskId: T-NEXT',
        'step: S1',
        'status: done',
        'timestamp: 2026-05-29T00:01:00.000Z',
        '---',
        '',
        '- **状态**: done',
        '- **上下文**: finished',
        '',
      ].join('\n'),
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath start S2');
    assert.doesNotMatch(output.next_action, /完成进行中的步骤: S1/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('prefers agent done when executing task has pending-done sentinel', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: '# Plan\n\n- [x] S1: completed\n',
    });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'pending-done.md'), `---
task_id: T-NEXT
entered_at: 2026-05-29T00:00:00.000Z
phase: executing
warned: false
---
`);

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath done');
    assert.match(output.next_action, /未收尾任务哨兵/);
    assert.ok(output.required_files.includes('.docpath/workspace/pending-done.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not let pending-done override unfinished plan work', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: '# Plan\n\n- [x] S1: completed\n- [ ] S2: continue implementation\n',
      breadcrumb: [
        '# Breadcrumb',
        '',
        '### ✅ S1 [T-NEXT] — 2026-05-29T00:00:00.000Z',
        '',
        '---',
        'taskId: T-NEXT',
        'step: S1',
        'status: done',
        'timestamp: 2026-05-29T00:00:00.000Z',
        '---',
        '',
      ].join('\n'),
    });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'pending-done.md'), `---
task_id: T-NEXT
entered_at: 2026-05-29T00:00:00.000Z
phase: executing
warned: false
---
`);

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath start S2');
    assert.match(output.next_action, /pending-done 哨兵/);
    assert.ok(output.required_files.includes('.docpath/workspace/pending-done.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('recommends gc for completed projects with many historical task dirs and no backlog candidates', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    const dp = join(cwd, '.docpath');
    for (let i = 0; i < 21; i++) {
      mkdirSync(join(dp, 'tasks', `T-202605${String(i).padStart(2, '0')}-old`), { recursive: true });
    }

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath gc');
    assert.match(output.next_action, /历史任务目录/);
    assert.match(output.exit_criteria, /docpath gc --force/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes stale pending-done warning breadcrumb only once', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: '# Plan\n\n- [x] S1: completed\n',
    });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'pending-done.md'), `---
task_id: T-NEXT
entered_at: 2026-05-29T00:00:00.000Z
phase: executing
warned: false
---
`);

    nextAgent(cwd);
    nextAgent(cwd);

    const breadcrumb = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');
    const matches = breadcrumb.match(/\[WARN\] Task T-NEXT active >24h without done/g) || [];
    assert.equal(matches.length, 1);
    const sentinel = readFileSync(join(cwd, '.docpath', 'workspace', 'pending-done.md'), 'utf-8');
    assert.match(sentinel, /warned: true/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
