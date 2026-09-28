import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { truncateErrorOutput } from '../dist/commands/check/formatters.js';
import { performSilentAutoFormat } from '../dist/utils/auto-format.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('Automated Efficiency Guards (R-436)', () => {
  it('truncates verbose error logs while retaining core failure assertions', () => {
    const rawLines = ['Compiling project v1.0.0...'];
    for (let i = 0; i < 60; i++) {
      rawLines.push(`  ✔ test_case_${i} passed (2ms)`);
    }
    rawLines.push('  ✖ AssertionError [ERR_ASSERTION]: Expected true but got false');
    rawLines.push('      at TestContext.<anonymous> (test/demo.rs:42:15)');
    rawLines.push('      at runTest (internal/runner.rs:100:5)');
    for (let i = 60; i < 120; i++) {
      rawLines.push(`  ✔ test_case_${i} passed (2ms)`);
    }
    rawLines.push('Tests failed: 1, Passed: 119');

    const truncated = truncateErrorOutput(rawLines.join('\n'));
    assert.match(truncated, /AssertionError/);
    assert.match(truncated, /test\/demo\.rs:42:15/);
    assert.match(truncated, /已智能折叠 \d+ 行非核心日志/);
    assert.ok(truncated.split('\n').length < 60, 'Truncated log should be significantly shorter than original 125 lines');
  });

  it('performs silent auto-format safely without throwing on non-formatted workspaces', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-guards-fmt-'));
    try {
      const res = performSilentAutoFormat(cwd);
      assert.equal(typeof res.formatted, 'boolean');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('generates wip-note.md snapshot during step-pass for clean session handoff', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-guards-wip-'));
    try {
      execSync(`node "${BIN}" init --cwd "${cwd}"`, { stdio: 'ignore' });
      execSync(`node "${BIN}" start "模块A与模块B开发" --draft --cwd "${cwd}"`, {
        stdio: 'ignore',
      });

      // Claim S1
      execSync(`node "${BIN}" go --step S1 --cwd "${cwd}"`, { stdio: 'ignore' });

      // Pass S1 (should transition to S2 and create wip-note.md)
      execSync(`node "${BIN}" step-pass --step S1 --cwd "${cwd}"`, { stdio: 'ignore' });

      const wipPath = join(cwd, '.docpath', 'workspace', 'wip-note.md');
      assert.ok(existsSync(wipPath), 'wip-note.md should exist after step-pass');
      const wipContent = readFileSync(wipPath, 'utf-8');
      assert.match(wipContent, /completed_step:\s*S1/);
      assert.match(wipContent, /next_step:\s*S2/);
      assert.match(wipContent, /可随时新开会话并运行/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
