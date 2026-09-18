import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';

// R-349: agent done / review / journal 写 review 类事件前必须做 FSM 合法性校验。
// 旧实现的失败路径硬走 review.failed / review.skipped，在 gate=check_fail 或
// phase=executing 时被状态机拒绝，抛出裸 "Illegal workflow transition"（顶层渲染成
// "未预期的错误"），既卡住 closeout 又掩盖真实失败原因。
//
// 本文件覆盖 AC-1..AC-4：
//  AC-1 gate ∈ {none, check_fail} 的收口路径给出可操作诊断（无裸异常、exit≠0）
//  AC-2 --status blocked 走可达的 blocked 语义（gate=blocked / state=blocked）
//  AC-3 新增转换规则与既有正常路径均被测试覆盖
//  AC-4 check_fail / blocked 仍被拒绝归档（契约不回退）

const BIN = new URL('../dist/index.js', import.meta.url).pathname;
const ILLEGAL_TRANSITION = /Illegal workflow transition/;
const UNEXPECTED_ERROR = /未预期的错误/;

function run(args, cwd) {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf-8', timeout: 60000 });
  return { code: result.status ?? 0, out: `${result.stdout || ''}${result.stderr || ''}` };
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
}

function readState(cwd) {
  return JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
}

/** 覆写 state.json 到指定 phase/gate（mkExecWorkspace 给的是 executing/none）。 */
function tuneState(cwd, phase, gate, extra = {}) {
  writeFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-AGENT',
    task_title: 'Agent Lifecycle',
    phase,
    gate,
    current_step: 'S7',
    started_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...extra,
  }, null, 2));
}

/** 建 git 仓库 + 一笔工作区改动，保证 reviewCommand 真正跑起来（有 diff 才有审查结论）。 */
function initGitWithDiff(cwd) {
  writeFileSync(join(cwd, 'lib.js'), 'export const a = 1;\n');
  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', 'initial']);
  writeFileSync(join(cwd, 'lib.js'), 'export const a = 1;\nexport const b = 2;\n');
}

describe('R-349 agent done 收口门禁合法性（AC-1）', () => {
  it('gate=check_fail + --skip-check 给出诊断而非裸 Illegal transition（AC-1）', () => {
    const { dir } = mkExecWorkspace();
    try {
      tuneState(dir, 'checking', 'check_fail');
      initGitWithDiff(dir);
      const res = run(['agent', 'done', '--step', 'S7', '--skip-check', '--note', 'repro'], dir);
      assert.notEqual(res.code, 0, 'gate 不合法时必须非零退出');
      assert.doesNotMatch(res.out, ILLEGAL_TRANSITION);
      assert.doesNotMatch(res.out, UNEXPECTED_ERROR);
      assert.match(res.out, /当前工作流状态不允许该动作/);
      assert.match(res.out, /gate=check_fail/);
      assert.match(res.out, /docpath (check|next --agent)/, '必须给出恢复命令');
      // 原始审查结论不能被掩盖（review skill gate 缺证据）
      assert.match(res.out, /需要修改|review skill gate/);
      // 状态未被写坏
      const state = readState(dir);
      assert.equal(state.gate, 'check_fail');
      assert.equal(state.phase, 'checking');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('quick profile + gate=check_fail 的 review.skipped 路径同样干净失败（AC-1）', () => {
    const { dir } = mkExecWorkspace();
    try {
      tuneState(dir, 'checking', 'check_fail', { level: 1, workflow_profile: 'quick' });
      const res = run(['agent', 'done', '--step', 'S7', '--skip-check', '--note', 'repro'], dir);
      assert.notEqual(res.code, 0);
      assert.doesNotMatch(res.out, ILLEGAL_TRANSITION);
      assert.doesNotMatch(res.out, UNEXPECTED_ERROR);
      assert.match(res.out, /review\.skipped/);
      assert.match(res.out, /gate=check_fail/);
      assert.equal(readState(dir).gate, 'check_fail');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('quick profile + phase=executing（未跑 check）精确指出阶段不匹配（AC-1）', () => {
    const { dir } = mkExecWorkspace();
    try {
      tuneState(dir, 'executing', 'none', { level: 1, workflow_profile: 'quick' });
      const res = run(['agent', 'done', '--step', 'S7', '--skip-check', '--note', 'repro'], dir);
      assert.notEqual(res.code, 0);
      assert.doesNotMatch(res.out, ILLEGAL_TRANSITION);
      assert.doesNotMatch(res.out, UNEXPECTED_ERROR);
      assert.match(res.out, /phase=executing/);
      assert.match(res.out, /允许来源: checking, reviewing/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('独立运行 docpath review 也走同一门禁校验（非 agent done 路径）', () => {
    const { dir } = mkExecWorkspace();
    try {
      tuneState(dir, 'checking', 'check_fail');
      initGitWithDiff(dir);
      const res = run(['review'], dir);
      assert.notEqual(res.code, 0);
      assert.doesNotMatch(res.out, ILLEGAL_TRANSITION);
      assert.doesNotMatch(res.out, UNEXPECTED_ERROR);
      assert.match(res.out, /gate=check_fail/);
      assert.equal(readState(dir).gate, 'check_fail');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('既有正常路径不回归：gate=check_pass 仍可一键收口（AC-3）', () => {
    const { dir } = mkExecWorkspace();
    try {
      tuneState(dir, 'checking', 'check_pass');
      initGitWithDiff(dir);
      const res = run(['agent', 'done', '--step', 'S7', '--skip-check', '--skip-review', '--note', 'test'], dir);
      assert.equal(res.code, 0, res.out);
      const state = readState(dir);
      assert.equal(state.phase, 'completed');
      assert.equal(state.gate, 'review_pass');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('R-349 blocked closeout 独立语义（AC-2 / AC-4）', () => {
  it('--status blocked 写入 gate=blocked / state=blocked，不再污染 review_fail（AC-2）', () => {
    const { dir } = mkExecWorkspace();
    try {
      tuneState(dir, 'checking', 'check_pass');
      const res = run(['agent', 'done', '--step', 'S7', '--status', 'blocked', '--skip-check', '--skip-review', '--note', '等待上游 API key'], dir);
      assert.equal(res.code, 0, res.out);
      const state = readState(dir);
      assert.equal(state.gate, 'blocked');
      assert.equal(state.phase, 'executing');
      assert.equal(state.current_step, '等待上游 API key');
      assert.notEqual(state.gate, 'review_fail');

      const status = run(['status', '--agent'], dir);
      assert.match(status.out, /state: blocked/);
      assert.match(status.out, /gate: blocked/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocked 任务不能被归档/完成（AC-4）', () => {
    const { dir } = mkExecWorkspace();
    try {
      tuneState(dir, 'checking', 'check_pass');
      const blocked = run(['agent', 'done', '--step', 'S7', '--status', 'blocked', '--skip-check', '--skip-review', '--note', '等待上游 API key'], dir);
      assert.equal(blocked.code, 0, blocked.out);

      const journal = run(['journal'], dir);
      assert.notEqual(journal.code, 0);
      assert.match(journal.out, /归档门禁未通过/);
      assert.match(journal.out, /blocked/);

      const done = run(['done', '--skip-check', '--skip-review', '--note', 'x'], dir);
      assert.notEqual(done.code, 0);
      assert.match(done.out, /归档门禁未通过/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gate=check_fail 依旧拒绝归档（AC-4）', () => {
    const { dir } = mkExecWorkspace();
    try {
      tuneState(dir, 'checking', 'check_fail');
      const done = run(['done', '--skip-check', '--skip-review', '--note', 'x'], dir);
      assert.notEqual(done.code, 0);
      assert.match(done.out, /归档门禁未通过/);
      assert.match(done.out, /check_fail/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('R-349 FSM 转换规则单测（AC-3）', () => {
  let transitions;
  let stateMachine;

  before(async () => {
    transitions = await import('../dist/engine/transitions.js');
    stateMachine = await import('../dist/engine/state-machine.js');
  });

  it('workflowEventBlockReason 在合法/非法状态下分别返回 null / 原因', () => {
    assert.equal(transitions.workflowEventBlockReason({ phase: 'checking', gate: 'check_pass' }, 'review.failed'), null);
    assert.equal(transitions.workflowEventBlockReason({ phase: 'reviewing', gate: 'review_fail' }, 'review.passed'), null);

    const gateBlocked = transitions.workflowEventBlockReason({ phase: 'checking', gate: 'check_fail' }, 'review.failed');
    assert.match(gateBlocked, /gate=check_fail/);
    assert.match(gateBlocked, /允许门禁: check_pass, check_env_exempt, review_pass, review_fail/);

    const phaseBlocked = transitions.workflowEventBlockReason({ phase: 'executing', gate: 'none' }, 'review.skipped');
    assert.match(phaseBlocked, /phase=executing/);
  });

  it('agent.blocked 在未完成任务上合法、在 completed 上非法', () => {
    const valid = transitions.listValidWorkflowEvents({ phase: 'executing', gate: 'none' }).map((e) => e.event);
    assert.ok(valid.includes('agent.blocked'));
    assert.equal(transitions.workflowEventBlockReason({ phase: 'executing', gate: 'none' }, 'agent.blocked'), null);
    assert.match(
      String(transitions.workflowEventBlockReason({ phase: 'completed', gate: 'review_pass' }, 'agent.blocked')),
      /phase=completed/,
    );
  });

  it('blocked gate 下 journal.archived 不合法（失败/阻塞态不得归档）', () => {
    const events = transitions.listValidWorkflowEvents({ phase: 'executing', gate: 'blocked' }).map((e) => e.event);
    assert.equal(events.includes('journal.archived'), false);
    assert.match(
      String(transitions.workflowEventBlockReason({ phase: 'executing', gate: 'blocked' }, 'journal.archived')),
      /gate=blocked/,
    );
  });

  it('state-machine 把 blocked 渲染为 blocked（而非 check_fail）', () => {
    assert.equal(stateMachine.stateFromPhaseGate('executing', 'blocked'), 'blocked');
    assert.equal(stateMachine.stateFromPhaseGate('reviewing', 'blocked'), 'blocked');
    assert.deepEqual(stateMachine.snapshotFromState('blocked'), { phase: 'executing', gate: 'blocked', state: 'blocked' });
    // 既有映射不回退：review_fail 仍归一化为 check_fail
    assert.equal(stateMachine.stateFromPhaseGate('reviewing', 'review_fail'), 'check_fail');
  });
});
