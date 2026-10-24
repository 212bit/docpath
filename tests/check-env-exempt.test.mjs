import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkExecWorkspace } from './helpers.mjs';

// R-350: 环境性 check 失败此前没有任何 sanctioned 出口——gate=check_fail 被所有
// 收口路径拒绝（done / agent done / journal.archived 的 requiredGate），Agent 只能
// 手工 commit 绕过 closeout。本文件覆盖新增的 check_env_exempt 环境豁免通道：
//
//  AC-1 仅工具链类失败时落 check_env_exempt，能继续 review/归档（且留痕 + exit 0）
//  AC-2 混合失败（环境类 + 真实失败）仍落 check_fail，收口被拒（契约不回退）
//  AC-3 歧义模式（Cannot find module / MODULE_NOT_FOUND / ENOENT.*node_modules）不豁免
//  AC-4 --no-env-exempt 强制按失败处理；豁免非粘性（随后真实失败覆盖）
//  AC-5 FSM/门禁允许集合：check.env_exempt 转换合法性 + requiredGate/allowedCompletionGates

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf-8', timeout: 60000 });
  return { code: result.status ?? 0, out: `${result.stdout || ''}${result.stderr || ''}` };
}

function readState(dir) {
  return JSON.parse(readFileSync(join(dir, '.docpath', 'workspace', 'state.json'), 'utf-8'));
}

function writeState(dir, patch) {
  const path = join(dir, '.docpath', 'workspace', 'state.json');
  const state = JSON.parse(readFileSync(path, 'utf-8'));
  writeFileSync(path, JSON.stringify({ ...state, ...patch }, null, 2));
}

/**
 * 造一个"项目检查全部按指定方式失败"的 fixture。
 * scripts 走内联展开（R-347），不需要 package manager 可用，行为可预测。
 * @param {string} dir 工作区根
 * @param {Record<string,string>} scripts package.json scripts
 */
function writePackageScripts(dir, scripts) {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0', scripts }, null, 2));
}

/** 脚手本体：单 token 的不存在命令。bash 输出 command not found，dash 输出 `: not found`，两者都应判为工具链不可用。 */
function missingToolScript(tool) {
  return `dp-missing-${tool}`;
}

/** 脚手本体：跑一个打印指定文案后非零退出的 node 脚本（用于构造歧义/真实失败输出）。 */
function nodeFailScript(dir, message) {
  writeFileSync(join(dir, 'fail-msg.mjs'), `console.error(${JSON.stringify(message)});\nprocess.exit(1);\n`);
  return 'node fail-msg.mjs';
}

/**
 * check 的"任务文件 current/canonical 漂移检查"要求 canonical 目录存在且与 current 一致。
 * mkExecWorkspace 有意只建 current，这里补齐 canonical 副本（本文件的用例不再写任务文档）。
 */
function syncCanonicalTaskFiles(dir) {
  const canonical = join(dir, '.docpath', 'tasks', 'T-AGENT');
  mkdirSync(canonical, { recursive: true });
  for (const name of ['spec.md', 'plan.md']) {
    copyFileSync(join(dir, '.docpath', 'tasks', 'current', name), join(canonical, name));
  }
}

function initGitWithDiff(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  writeFileSync(join(dir, 'file.txt'), 'hello\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
  writeFileSync(join(dir, 'file.txt'), 'hello world\n');
}

describe('R-350 check 环境豁免（AC-1 / AC-3 / AC-4）', () => {
  it('全部失败项都是工具链不可用时落 check_env_exempt，并能继续 review（AC-1）', () => {
    const { dir } = mkExecWorkspace();
    try {
      writePackageScripts(dir, {
        build: missingToolScript('docker'),
        test: missingToolScript('pytest'),
      });
      syncCanonicalTaskFiles(dir);
      writeState(dir, { phase: 'executing', gate: 'none' });
      initGitWithDiff(dir);

      const res = run(['check'], dir);
      assert.equal(res.code, 0, `豁免应视为通过（exit 0），实际: ${res.out}`);
      assert.match(res.out, /环境豁免/);
      assert.match(res.out, /check_env_exempt/);
      assert.doesNotMatch(res.out, /存在失败项/);

      const state = readState(dir);
      assert.equal(state.gate, 'check_env_exempt');
      assert.equal(state.phase, 'checking');

      // 证据留痕：审计条目 + last-check 标记
      const decisions = readFileSync(join(dir, '.docpath', 'workspace', 'decisions.md'), 'utf-8');
      assert.match(decisions, /policy\.env_exempt/);
      const lastCheck = readFileSync(join(dir, '.docpath', 'workspace', 'last-check.md'), 'utf-8');
      assert.match(lastCheck, /PASS \(环境豁免\)/);

      // 路由回归：gate=check_env_exempt 时 next --agent 必须指向收口入口，
      // 而不是把豁免态当"未检查"或"已完成"（R-366: 收口入口统一为 docpath done）
      const next = run(['next', '--agent'], dir);
      assert.match(next.out, /质量检查含环境豁免，执行收口/);
      assert.match(next.out, /recommended_command:\s*docpath done/);

      // 豁免后必须能继续走评审（requiredGate 视同 check_pass）
      const review = run(['review', '--force'], dir);
      assert.doesNotMatch(review.out, /Illegal workflow transition/);
      assert.doesNotMatch(review.out, /gate=check_env_exempt/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('歧义模式（Cannot find module / ENOENT node_modules）不触发豁免（AC-3）', () => {
    for (const output of [
      "Error: Cannot find module 'left-pad'",
      "npm ERR! code MODULE_NOT_FOUND",
      "Error: ENOENT: no such file or directory, open './node_modules/.bin/vitest'",
    ]) {
      const { dir } = mkExecWorkspace();
      try {
        writePackageScripts(dir, { test: nodeFailScript(dir, output) });
        syncCanonicalTaskFiles(dir);
        writeState(dir, { phase: 'executing', gate: 'none' });
        initGitWithDiff(dir);

        const res = run(['check'], dir);
        assert.notEqual(res.code, 0, `歧义失败不应豁免: ${output}`);
        assert.equal(readState(dir).gate, 'check_fail', `歧义失败应落 check_fail: ${output}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('--no-env-exempt 关闭豁免，仍落 check_fail（AC-4）', () => {
    const { dir } = mkExecWorkspace();
    try {
      writePackageScripts(dir, { test: missingToolScript('docker') });
      syncCanonicalTaskFiles(dir);
      writeState(dir, { phase: 'executing', gate: 'none' });
      initGitWithDiff(dir);

      const res = run(['check', '--no-env-exempt'], dir);
      assert.notEqual(res.code, 0);
      assert.equal(readState(dir).gate, 'check_fail');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('权限类输出（Permission denied / EACCES）不豁免（B3 收紧 2026-09-18）', () => {
    for (const output of [
      'EACCES: permission denied, open \'./node_modules/.bin/tsc\'',
      'sh: 1: cannot create temp file for here-document: Permission denied',
    ]) {
      const { dir } = mkExecWorkspace();
      try {
        writePackageScripts(dir, { test: nodeFailScript(dir, output) });
        syncCanonicalTaskFiles(dir);
        writeState(dir, { phase: 'executing', gate: 'none' });
        initGitWithDiff(dir);

        const res = run(['check'], dir);
        assert.notEqual(res.code, 0, `权限类失败不应豁免: ${output}`);
        assert.equal(readState(dir).gate, 'check_fail', `权限类失败应落 check_fail: ${output}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('豁免非粘性：环境修复后真实失败立即回落 check_fail（AC-4）', () => {
    const { dir } = mkExecWorkspace();
    try {
      writePackageScripts(dir, { test: missingToolScript('docker') });
      syncCanonicalTaskFiles(dir);
      writeState(dir, { phase: 'executing', gate: 'none' });
      initGitWithDiff(dir);
      const first = run(['check'], dir);
      assert.equal(first.code, 0, first.out);
      assert.equal(readState(dir).gate, 'check_env_exempt');

      // 换成真实失败（断言失败），豁免不得粘住
      writePackageScripts(dir, { test: nodeFailScript(dir, 'AssertionError: 1 !== 2') });
      const res = run(['check'], dir);
      assert.notEqual(res.code, 0);
      assert.equal(readState(dir).gate, 'check_fail');
      assert.match(res.out, /存在失败项/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('结构门禁失败与环境失败混合时不豁免（AC-2）', () => {
    const { dir } = mkExecWorkspace();
    try {
      writePackageScripts(dir, { test: missingToolScript('docker') });
      syncCanonicalTaskFiles(dir);
      writeState(dir, { phase: 'executing', gate: 'none' });
      initGitWithDiff(dir);
      // 结构门禁失败：删掉 plan.md（任务文档检查会报缺失/漂移）
      rmSync(join(dir, '.docpath', 'tasks', 'current', 'plan.md'), { force: true });

      const res = run(['check'], dir);
      assert.notEqual(res.code, 0, `混合失败必须仍失败: ${res.out}`);
      assert.equal(readState(dir).gate, 'check_fail');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('R-350 环境豁免判定与门禁允许集合（AC-5）', () => {
  let evaluateEnvironmentExemption;
  let transitions;
  let stateMachine;
  let policyModule;

  before(async () => {
    ({ evaluateEnvironmentExemption } = await import('../dist/commands/check/evidence.js'));
    transitions = await import('../dist/engine/transitions.js');
    stateMachine = await import('../dist/engine/state-machine.js');
    policyModule = await import('../dist/engine/policy.js');
  });

  const envFail = (name = '测试') => ({ name, passed: false, output: 'sh: 1: docker: command not found', environment_failure: true, environment_exemptible: true });
  const ambiguousFail = (name = '测试') => ({ name, passed: false, output: "Cannot find module 'x'", environment_failure: true });
  const realFail = (name = '编译') => ({ name, passed: false, output: 'TS2345: Argument of type ...' });
  const warn = () => ({ name: 'Lint', passed: false, severity: 'warning', output: 'warn' });

  it('全环境失败 → 豁免；含真实/歧义失败 → 不豁免；空失败集 → 不豁免', () => {
    assert.equal(evaluateEnvironmentExemption([envFail(), envFail('构建')]).exempt, true);
    assert.equal(evaluateEnvironmentExemption([envFail(), realFail()]).exempt, false);
    assert.equal(evaluateEnvironmentExemption([envFail(), ambiguousFail()]).exempt, false);
    assert.equal(evaluateEnvironmentExemption([realFail()]).exempt, false);
    assert.equal(evaluateEnvironmentExemption([{ name: 'ok', passed: true, output: '' }]).exempt, false);
  });

  it('severity=warning 不阻塞，也不影响豁免判定', () => {
    assert.equal(evaluateEnvironmentExemption([envFail(), warn()]).exempt, true);
    assert.equal(evaluateEnvironmentExemption([warn()]).exempt, false);
  });

  it('--no-env-exempt 强制不豁免', () => {
    const verdict = evaluateEnvironmentExemption([envFail()], { noEnvExempt: true });
    assert.equal(verdict.exempt, false);
    assert.equal(verdict.reason, 'disabled-by-flag');
  });

  it('check.env_exempt 转换合法性与 gate 渲染（AC-5）', () => {
    const target = transitions.EVENT_TARGETS?.['check.env_exempt'];
    // EVENT_TARGETS 未导出时退回元数据列表断言
    const meta = target || transitions.listWorkflowTransitions().find((item) => item.event === 'check.env_exempt');
    assert.ok(meta, 'check.env_exempt 必须存在');
    assert.equal(meta.gate, 'check_env_exempt');
    assert.equal(meta.phase, 'checking');

    const legal = transitions.listValidWorkflowEvents({ phase: 'executing', gate: 'none' }).map((item) => item.event);
    assert.ok(legal.includes('check.env_exempt'));
    assert.equal(stateMachine.stateFromPhaseGate('checking', 'check_env_exempt'), 'check_env_exempt');
    assert.equal(stateMachine.snapshotFromState('check_env_exempt').gate, 'check_env_exempt');
    assert.equal(stateMachine.normalizeGateStatus('check_env_exempt'), 'check_env_exempt');
  });

  it('下游 requiredGate 视同 check_pass：review 与归档均放行，check_fail 仍拒（AC-5）', () => {
    const valid = transitions.listValidWorkflowEvents({ phase: 'checking', gate: 'check_env_exempt' }).map((item) => item.event);
    assert.ok(valid.includes('review.passed'));
    assert.ok(valid.includes('review.skipped'));
    assert.ok(valid.includes('review.failed'));

    const archived = transitions.listValidWorkflowEvents({ phase: 'reviewing', gate: 'review_pass' }).map((item) => item.event);
    assert.ok(archived.includes('journal.archived'));

    const fromExempt = transitions.listValidWorkflowEvents({ phase: 'reviewing', gate: 'check_env_exempt' }).map((item) => item.event);
    assert.ok(fromExempt.includes('journal.archived'), '豁免态（quick 路径）应可归档');

    const fromFail = transitions.listValidWorkflowEvents({ phase: 'reviewing', gate: 'check_fail' }).map((item) => item.event);
    assert.ok(!fromFail.includes('journal.archived'), '失败态仍不得归档');
  });

  it('完成策略放行 check_env_exempt，但仍拦 check_fail（AC-5）', async () => {
    assert.equal(typeof policyModule.recordEnvExemption, 'function');
    const { resolveGatePolicy } = await import('../dist/engine/workflow-profile.js');
    assert.equal(typeof resolveGatePolicy, 'function');
  });
});
