import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';
import { evaluateSessionWatchdog } from '../dist/engine/session-watchdog.js';
import { generateAgentOutput } from '../dist/engine/agent-output.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('Session Watchdog & Master-Worker Rotation (R-437)', () => {
  it('reports healthy when session depth is low', () => {
    const report = evaluateSessionWatchdog({
      phase: 'executing',
      taskId: 'T-101',
      currentStep: { id: 'S1', title: '初始步骤' },
      planTasks: [{ id: 'S1', title: '初始步骤', done: false }],
      breadcrumbEventCount: 2,
    });

    assert.equal(report.status, 'healthy');
    assert.equal(report.reason, undefined);
  });

  it('triggers rotate_recommended when breadcrumb events exceed threshold', () => {
    const report = evaluateSessionWatchdog({
      phase: 'executing',
      taskId: 'T-101',
      currentStep: { id: 'S2', title: '核心模块实现' },
      planTasks: [
        { id: 'S1', title: '准备工作', done: true },
        { id: 'S2', title: '核心模块实现', done: false },
      ],
      breadcrumbEventCount: 7,
    });

    assert.equal(report.status, 'rotate_recommended');
    assert.match(report.reason || '', /7 条执行事件/);
    assert.match(report.recommended_action || '', /invoke_subagent/);
    assert.match(report.subagent_prompt || '', /Worker Subagent/);
    assert.match(report.subagent_prompt || '', /S2/);
  });

  it('triggers rotate_recommended when consecutive steps completed >= 2 with remaining steps', () => {
    const report = evaluateSessionWatchdog({
      phase: 'executing',
      taskId: 'T-101',
      currentStep: { id: 'S3', title: '收尾步骤' },
      planTasks: [
        { id: 'S1', title: '第一步', done: true },
        { id: 'S2', title: '第二步', done: true },
        { id: 'S3', title: '收尾步骤', done: false },
      ],
      breadcrumbEventCount: 3,
    });

    assert.equal(report.status, 'rotate_recommended');
    assert.match(report.reason || '', /已连续完成 2 个步骤/);
    assert.match(report.recommended_action || '', /invoke_subagent/);
  });

  it('integrates session_health into docpath next output when rotate_recommended', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-watchdog-e2e-'));
    try {
      execSync(`node "${BIN}" init --cwd "${cwd}"`, { stdio: 'ignore' });
      execSync(`node "${BIN}" start "模块A与模块B与模块C重构" --draft --cwd "${cwd}"`, {
        stdio: 'ignore',
      });

      // Claim and finish S1
      execSync(`node "${BIN}" go --step S1 --cwd "${cwd}"`, { stdio: 'ignore' });
      execSync(`node "${BIN}" step-pass --step S1 --cwd "${cwd}"`, { stdio: 'ignore' });

      // Claim and finish S2
      execSync(`node "${BIN}" go --step S2 --cwd "${cwd}"`, { stdio: 'ignore' });
      execSync(`node "${BIN}" step-pass --step S2 --cwd "${cwd}"`, { stdio: 'ignore' });

      // Check next output for S3
      const output = execSync(`node "${BIN}" next --agent --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });
      const parsed = parseYaml(output);

      assert.ok(parsed.session_health, 'session_health should be present in YAML output');
      assert.equal(parsed.session_health.status, 'rotate_recommended');
      assert.match(parsed.session_health.subagent_prompt, /Worker Subagent/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
