import './registry-isolation.mjs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
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
  if (phase === 'executing') {
    writeFileSync(join(dp, 'workspace', 'pending-done.json'), JSON.stringify({
      task_id: taskId,
      entered_at: new Date().toISOString(),
      phase: 'executing',
      warned: false,
    }, null, 2));
    writeFileSync(join(dp, 'workspace', 'pending-done.md'), '# Pending Done\n');
  }
  return cwd;
}

function nextAgent(cwd, opts = {}) {
  const flags = [
    opts.verbose ? ' --verbose' : '',
    opts.compact ? ' --compact' : '',
  ].join('');
  const output = execSync(`node ${BIN} next --cwd ${cwd} --agent${flags}`, { encoding: 'utf-8' });
  return parse(output);
}

function nextAgentRaw(cwd, opts = {}) {
  const flags = [
    opts.verbose ? ' --verbose' : '',
    opts.compact ? ' --compact' : '',
  ].join('');
  return execSync(`node ${BIN} next --cwd ${cwd} --agent${flags}`, { encoding: 'utf-8' });
}

// 与 src/utils/document-index.ts estimateTokens 保持一致的估算口径
function estimateTokens(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return Math.ceil(cjk * 1.5 + (text.length - cjk) / 4);
}

function statusAgent(cwd, opts = {}) {
  const verbose = opts.verbose ? ' --verbose' : '';
  const output = execSync(`node ${BIN} status --cwd ${cwd} --agent${verbose}`, { encoding: 'utf-8' });
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

function sha256(content) {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

describe('next --agent routing', () => {
  it('keeps stable agent contract fields on next and status outputs', () => {
    const plan = [
      '## 执行计划',
      '',
      '### S1: Contract step',
      '- [ ] S1: Contract step',
      '- **描述**: 验证 agent 输出契约',
      '- **验收条件**: next/status 字段稳定',
      '- **依赖**: 无',
      '',
    ].join('\n');
    const cwd = mkWorkspace({ phase: 'planning', gate: 'none', plan });
    const next = nextAgent(cwd);
    const status = statusAgent(cwd);

    assert.equal(next.agent_view, 'next');
    assert.equal(status.agent_view, 'status');
    assert.equal(next.recommended_command, 'docpath go --step S1');
    assert.equal(status.recommended_command, 'docpath next --agent');
    assert.ok(Array.isArray(next.context_refs));
    assert.ok(Array.isArray(status.context_refs));
    assert.ok(next.context_refs.length > 0);
    assert.ok(status.context_refs.length > 0);
    assert.ok(typeof next.next_action === 'string' && next.next_action.length > 0);
    assert.ok(typeof status.next_action === 'string' && status.next_action.length > 0);
    // gate_policy 是静态配置，常规输出省略，verbose 才展开
    assert.equal(next.gate_policy, undefined, 'non-verbose next should omit gate_policy');
    assert.equal(status.gate_policy, undefined, 'non-verbose status should omit gate_policy');
    const verboseNext = nextAgent(cwd, { verbose: true });
    assert.ok(verboseNext.gate_policy.requires_check);
    const verboseStatus = statusAgent(cwd, { verbose: true });
    assert.ok(verboseStatus.gate_policy.requires_review);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('renders --compact as core routing fields only', () => {
    const plan = [
      '## 执行计划',
      '',
      '### S1: Contract step',
      '- [ ] S1: Contract step',
      '- **描述**: 验证 compact 输出契约',
      '- **验收条件**: 只保留核心路由字段',
      '- **依赖**: 无',
      '',
    ].join('\n');
    const cwd = mkWorkspace({ phase: 'planning', gate: 'none', plan });
    const normal = nextAgent(cwd);
    const compact = nextAgent(cwd, { compact: true });

    assert.deepEqual(
      Object.keys(compact).sort(),
      ['agent_view', 'next_action', 'recommended_command', 'state', 'step_id'],
    );
    assert.equal(compact.agent_view, 'next');
    assert.equal(compact.state, normal.state);
    assert.equal(compact.next_action, normal.next_action);
    assert.equal(compact.recommended_command, normal.recommended_command);
    assert.equal(compact.recommended_command, 'docpath go --step S1');
    assert.equal(compact.step_id, 'S1');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('falls back to state.current_step for compact step_id when the route has no step', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    const compact = nextAgent(cwd, { compact: true });

    assert.equal(compact.recommended_command, 'docpath backlog capture --title <title>');
    assert.equal(compact.step_id, 'routing');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('cuts next --agent tokens by 60%+ and stays under 200 tokens in compact mode', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    const normalTokens = estimateTokens(nextAgentRaw(cwd));
    const compactTokens = estimateTokens(nextAgentRaw(cwd, { compact: true }));

    assert.ok(normalTokens > 300, `expected a sizeable normal output, got ${normalTokens} tokens`);
    assert.ok(compactTokens < 200, `expected compact under 200 tokens, got ${compactTokens}`);
    assert.ok(
      compactTokens <= normalTokens * 0.4,
      `expected >=60% token reduction, got ${compactTokens}/${normalTokens}`,
    );
    rmSync(cwd, { recursive: true, force: true });
  });

  it('keeps compact output minimal for uninitialized projects', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-next-empty-'));
    const compact = nextAgent(cwd, { compact: true });

    assert.deepEqual(
      Object.keys(compact).sort(),
      ['agent_view', 'next_action', 'recommended_command', 'state', 'step_id'],
    );
    assert.equal(compact.state, 'uninitialized');
    assert.equal(compact.recommended_command, 'docpath init');
    assert.equal(compact.step_id, '');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('distinguishes status diagnostics from next route output', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    const status = statusAgent(cwd);
    const next = nextAgent(cwd);

    assert.equal(status.agent_view, 'status');
    assert.equal(next.agent_view, 'next');
    assert.equal(status.recommended_command, 'docpath next --agent');
    assert.match(status.next_action, /诊断当前工作流状态/);
    assert.equal(status.route_hint.recommended_command, next.recommended_command);
    assert.equal(status.route_hint.next_action, next.next_action);
    assert.equal(status.workflow_profile, 'standard');
    // gate_policy 常规省略，verbose 才展开
    const verboseStatus = statusAgent(cwd, { verbose: true });
    assert.equal(verboseStatus.gate_policy.requires_check, true);
    assert.equal(verboseStatus.gate_policy.requires_review, true);
    assert.equal(verboseStatus.gate_policy.journal_mode, 'full');
    assert.notDeepEqual(status, next);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('recommends backlog capture for a newly initialized project without accepted backlog', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    assert.match(output.next_action, /捕获 raw backlog/);
    assert.ok(output.context_refs.some(ref => ref.path === '.docpath/workspace/current.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not route completed state with lesson candidates into learn (learn removed)', () => {
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
      '当 docpath next 检测 lesson 候选时，由于 learn 已下线，不应死循环推荐 learn。',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not route completed state into learn when only low-value workflow lessons are pending', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## T-LOW — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-LOW',
      '- key: T-LOW-workflow',
      '',
      '### Lesson',
      '',
      '✅ 推荐保留本次任务的执行经验：完成 4/4 步，阻塞 0 步。',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    assert.equal(output.lesson_summary.pending_count, 0);
    assert.equal(output.lesson_summary.pending_keys, undefined);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not route completed state into learn when all lesson candidates are skipped', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## seed placeholder',
      '',
      '- task_id: T-OLD',
      '- type: best-practice',
      '- target: style',
      '- source: journal',
      '- key: option-a-placeholder',
      '',
      '### Lesson',
      '',
      '方案 A / 方案 A。backlog promote seed spec 保留 backlog 作为来源，便于后续 plan/go 接续。',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    assert.equal(output.lesson_summary.pending_count, 0);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes completed state with proposed backlog directly when lessons exist', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-900.md'), `---
id: R-900
title: Raw proposed item
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
created_at: 2026-06-29
---

## 背景

- 待补充

## 验收

- 待补充
`);
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
      'Lesson candidate.',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.ok(output.recommended_command.includes('brainstorm --dry-run'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('still promotes accepted executable backlog before pending lessons', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-901.md'), `---
id: R-901
title: Accepted ready item
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
created_at: 2026-06-29
---

## 背景

Accepted executable backlog.

## 验收

Promote ready.
`);
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

    assert.equal(output.recommended_command, 'docpath start R-901 --draft');
    assert.match(output.next_action, /R-901/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not force learn for low-value lessons when proposed backlog exists', () => {
    const cwd = mkWorkspace({ phase: 'completed', gate: 'review_pass' });
    mkdirSync(join(cwd, '.docpath', 'backlog'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'backlog', 'R-900.md'), `---
id: R-900
title: Raw proposed item
status: proposed
priority: P2
level: 1
source: test
readiness: shaped
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-06-29
---

## 背景

Shaped proposed item.

## 验收

Accept after review.
`);
    writeFileSync(join(cwd, '.docpath', 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## T-LOW — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-LOW',
      '- key: T-LOW-workflow',
      '',
      '### Lesson',
      '',
      '✅ 推荐保留本次任务的执行经验：完成 4/4 步，阻塞 0 步。',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.equal(output.lesson_summary.pending_count, 0);
    assert.notEqual(output.recommended_command, 'docpath learn --dry-run');
    assert.match(output.recommended_command, /backlog accept R-900|brainstorm/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes completed dirty worktree before pending lessons', () => {
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
    writeFileSync(join(cwd, 'README.md'), '# initial\n');
    initGitRepo(cwd);
    writeFileSync(join(cwd, 'README.md'), '# dirty\n');

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath changes --agent');
    assert.match(output.next_action, /git closeout|未提交变更/);
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

  it('routes idle state with lesson candidates directly to capture (learn removed)', () => {
    const cwd = mkWorkspace({ phase: 'idle', gate: 'none' });
    writeFileSync(join(cwd, '.docpath', 'workspace', 'lesson-candidates.md'), [
      '# Lesson Candidates',
      '',
      '## T-IDLE — 2026-06-01T00:00:00.000Z',
      '',
      '- task_id: T-IDLE',
      '- key: idle-lesson',
      '',
      '### Lesson',
      '',
      'Lesson candidate.',
      '',
    ].join('\n'));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
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

    assert.equal(output.recommended_command, 'docpath start R-001 --draft');
    assert.match(output.next_action, /R-001 Alpha/);
    assert.ok(output.context_refs.some(ref => ref.path === '.docpath/backlog/backlog.md'));
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

    assert.equal(output.recommended_command, 'docpath start R-001 --draft');
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
    assert.ok(output.context_refs.some(ref => ref.path === '.docpath/tasks/current/spec.md'));
    assert.ok(output.command_effects.updates.includes('.docpath/tasks/current/spec.md'));
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
    assert.ok(output.command_effects.updates.includes('.docpath/backlog/'));
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

    assert.equal(output.recommended_command, 'docpath go --step S2');
    assert.match(output.next_action, /S2/);
    assert.ok(output.context_refs.some(ref => ref.path === '.docpath/tasks/current/plan.md'));
    assert.ok(output.context_refs.some((ref) =>
      ref.path === '.docpath/workspace/current.md'
      && ref.access === 'index_only'
      && ref.preferred_command === 'docpath next --agent',
    ));
    assert.ok(output.context_refs.some((ref) =>
      ref.path === '.docpath/tasks/current/plan.md'
      && ref.access === 'index_only'
      && ref.preferred_command === 'docpath reveal --topic S2 --level 1',
    ));
    assert.deepEqual(output.command_effects.updates, ['.docpath/workspace/breadcrumb.md', '.docpath/tasks/current/plan.md']);
    assert.equal(output.command_effects.update_mode, 'via_docpath_command');
    assert.ok(output.command_effects.do_not_edit_directly.includes('.docpath/workspace/breadcrumb.md'));
    assert.ok(output.command_effects.do_not_edit_directly.includes('.docpath/tasks/current/plan.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not route completed tasks back to stale in-progress steps', () => {
    const cwd = mkWorkspace({
      phase: 'completed',
      gate: 'review_pass',
      plan: '# Plan\n\n- [x] S1: done\n- [ ] S4: verification already closed\n',
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
        '- **上下文**: done before closeout',
        '',
        '### 🔄 S4 [T-NEXT] — 2026-05-29T00:00:00.000Z',
        '',
        '---',
        'taskId: T-NEXT',
        'step: S4',
        'status: in_progress',
        'timestamp: 2026-05-29T00:00:00.000Z',
        '---',
        '',
        '- **状态**: in_progress',
        '- **上下文**: stale verification step after closeout',
        '',
      ].join('\n'),
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath backlog capture --title <title>');
    assert.doesNotMatch(output.next_action, /S4/);
    assert.doesNotMatch(output.recommended_command, /agent step|go --step/);
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

    assert.equal(output.recommended_command, 'docpath go --step S2');
    assert.equal(output.progress.total, 2);
    assert.equal(output.progress.done, 1);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes check failures into check', () => {
    const cwd = mkWorkspace({
      phase: 'checking',
      gate: 'check_fail',
      lastCheck: '# Last Check Evidence\n\n**结果**: ❌ FAIL\n',
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath check');
    assert.match(output.next_action, /修复质量检查失败/);
    assert.ok(output.context_refs.some(ref => ref.path === '.docpath/workspace/last-check.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('does not let stale last-check failures override planning routes', () => {
    const plan = [
      '## 执行计划',
      '',
      '### S1: Current task work',
      '- **描述**: current work',
      '- **验收条件**: current acceptance',
      '- **依赖**: 无',
      '',
      '## Checklist',
      '- [ ] S1',
      '',
    ].join('\n');
    const cwd = mkWorkspace({
      phase: 'planning_done',
      gate: 'none',
      plan,
      lastCheck: '# Last Check Evidence\n\n**结果**: ❌ FAIL\n',
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath go --step S1');
    assert.match(output.next_action, /执行下一个未完成步骤|计划已就绪/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes Markdown and JSON machine-truth divergence to write-plan', () => {
    const oldPlan = [
      '## 执行计划',
      '',
      '### S1: Old JSON step',
      '- **描述**: old',
      '- **验收条件**: old acceptance',
      '- **依赖**: 无',
      '',
      '## Checklist',
      '- [ ] S1',
      '',
    ].join('\n');
    const editedPlan = oldPlan.replace('old acceptance', 'edited acceptance');
    const cwd = mkWorkspace({
      phase: 'planning_done',
      gate: 'none',
      plan: editedPlan,
    });
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'plan.json'), JSON.stringify({
      schema_version: 1,
      kind: 'plan',
      markdown: oldPlan,
      generated_at: '2026-05-29T00:00:00.000Z',
      source: {
        kind: 'markdown',
        created_at: '2026-05-29T00:00:00.000Z',
        updated_at: '2026-05-29T00:00:00.000Z',
        content_sha256: sha256(oldPlan),
      },
      title: 'Old JSON step',
      steps: [{
        id: 'S1',
        name: 'Old JSON step',
        description: 'old',
        acceptance: 'old acceptance',
        dependencies: '无',
        status: 'pending',
      }],
    }, null, 2));

    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath write-plan --stdin');
    assert.match(output.next_action, /机器真理源不同步/);
    assert.ok(output.context_refs.some((ref) => ref.path.endsWith('plan.md')));
    assert.ok(output.context_refs.some((ref) => ref.path.endsWith('plan.json')));
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
    assert.ok(output.context_refs.some(ref => ref.path === '.docpath/workspace/review.md'));
    rmSync(cwd, { recursive: true, force: true });
  });

  it('routes review_pass into journal even when breadcrumb has a stale in-progress step', () => {
    const cwd = mkWorkspace({
      phase: 'reviewing',
      gate: 'review_pass',
      lastCheck: '# Last Check Evidence\n\n**结果**: ✅ PASS\n',
      plan: '# Plan\n\n- [x] S1: implementation\n- [ ] S4: verification\n',
      breadcrumb: [
        '# Breadcrumb',
        '',
        '### 🔄 S4 [T-NEXT] — 2026-05-29T00:00:00.000Z',
        '',
        '---',
        'taskId: T-NEXT',
        'step: S4',
        'status: in_progress',
        'timestamp: 2026-05-29T00:00:00.000Z',
        '---',
        '',
        '- **状态**: in_progress',
        '- **上下文**: stale verification step after review',
        '',
      ].join('\n'),
    });
    const output = nextAgent(cwd);

    assert.equal(output.recommended_command, 'docpath journal');
    assert.match(output.next_action, /知识归档/);
    assert.doesNotMatch(output.next_action, /S4/);
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
    assert.ok(output.command_effects.updates.includes('.docpath/workspace/breadcrumb.md'));
    assert.ok(output.command_effects.updates.includes('.docpath/tasks/current/plan.md'));
    assert.match(output.drift_summary, /plan 已完成但缺少 breadcrumb/);
    assert.deepEqual(output.drift_details.plan_done_without_breadcrumb, ['S1']);
    assert.deepEqual(output.drift_details.breadcrumb_done_without_plan, []);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('compacts empty drift details when plan and breadcrumb are aligned', () => {
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

    assert.equal(output.drift_summary, undefined);
    assert.equal(output.drift_details, undefined);
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

    assert.equal(output.recommended_command, 'docpath go --step S2');
    assert.doesNotMatch(output.next_action, /完成进行中的步骤: S1/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('prefers agent done when executing task has pending-done sentinel', () => {
    const cwd = mkWorkspace({
      phase: 'executing',
      gate: 'none',
      plan: '# Plan\n\n- [x] S1: completed\n',
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
    assert.ok(output.context_refs.some(ref => ref.path === '.docpath/workspace/pending-done.md'));
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

    assert.equal(output.recommended_command, 'docpath go --step S2');
    assert.match(output.next_action, /pending-done 哨兵/);
    assert.ok(output.context_refs.some(ref => ref.path === '.docpath/workspace/pending-done.md'));
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
    writeFileSync(join(cwd, '.docpath', 'workspace', 'pending-done.json'), JSON.stringify({
      task_id: 'T-NEXT',
      entered_at: '2026-05-29T00:00:00.000Z',
      phase: 'executing',
      warned: false,
    }, null, 2));

    nextAgent(cwd);
    nextAgent(cwd);

    const breadcrumb = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');
    const matches = breadcrumb.match(/\[WARN\] Task T-NEXT active >24h without done/g) || [];
    assert.equal(matches.length, 1);
    const sentinel = readFileSync(join(cwd, '.docpath', 'workspace', 'pending-done.md'), 'utf-8');
    assert.match(sentinel, /warned: true/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('after check_pass with completed plan recommends review not plan', () => {
    const plan = [
      '## 执行计划',
      '',
      '### S1: Done step',
      '- [x] S1: Done step',
      '- **描述**: finished',
      '- **验收条件**: done',
      '',
      '## Checklist',
      '- [x] S1',
    ].join('\n');
    const breadcrumb = [
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
    ].join('\n');
    const cwd = mkWorkspace({
      phase: 'checking',
      gate: 'check_pass',
      plan,
      lastCheck: '**结果**: ✅ PASS\n',
      breadcrumb,
    });
    // Provide a complete-looking spec so drafting/plan routes cannot win
    writeFileSync(join(cwd, '.docpath', 'tasks', 'current', 'spec.md'), [
      '# T-NEXT - Next routing',
      '',
      '## 1. 背景与动机',
      'Complete enough for routing tests.',
      '',
      '## 2. 需求清单',
      '### 功能需求',
      '- [x] FR-1: done',
      '',
      '## 5. 验收标准',
      '- [x] AC-1: done',
    ].join('\n'));

    const output = nextAgent(cwd);
    // R-366: check 通过后的收口入口统一为 docpath done（内部即 check -> review -> journal）
    assert.equal(output.recommended_command, 'docpath done');
    assert.doesNotMatch(output.recommended_command || '', /docpath plan/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
