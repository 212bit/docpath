import './registry-isolation.mjs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-check-cfg-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: check-cfg-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1,
    task_id: 'T-20260920-check-cfg',
    task_title: 'Check Config Test',
    phase: 'executing',
    gate: 'check_pending',
    current_step: 'step-1',
    workflow_profile: 'standard',
    started_at: '2026-06-16T00:00:00.000Z',
    updated_at: '2026-06-16T00:00:00.000Z',
  }, null, 2));
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), '# Breadcrumb\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), [
    '# T-20260920-check-cfg - Check Config Test',
    '',
    '## 2. 需求清单',
    '### 功能需求',
    '- [ ] FR-1: test custom check',
    '',
    '## 5. 验收标准',
    '- [ ] AC-1: custom check passes',
    '',
  ].join('\n'));
  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runResult(args, cwd) {
  try {
    return { code: 0, out: run(args, cwd) };
  } catch (error) {
    return {
      code: error.status || 1,
      out: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

describe('docpath check custom config and makefile integration', () => {
  it('executes custom check command configured in .docpath/config.yaml', () => {
    const cwd = mkWorkspace();
    writeFileSync(join(cwd, '.docpath', 'config.yaml'), [
      'project:',
      '  name: check-cfg-test',
      'check:',
      '  command: echo "CUSTOM_CHECK_EXECUTED"',
      '',
    ].join('\n'));

    const res = runResult(`check --cwd ${cwd}`, cwd);

    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /自定义门禁 \(echo "CUSTOM_CHECK_EXECUTED"\)/);
    assert.match(res.out, /CUSTOM_CHECK_EXECUTED/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('executes multiple custom check commands with categories and honors filter flags', () => {
    const cwd = mkWorkspace();
    writeFileSync(join(cwd, '.docpath', 'config.yaml'), [
      'project:',
      '  name: check-cfg-test',
      'check:',
      '  commands:',
      '    - name: 语法门禁',
      '      command: echo "SYNTAX_OK"',
      '      category: compile',
      '    - name: 业务测试',
      '      command: echo "TEST_OK"',
      '      category: test',
      '    - name: 格式校验',
      '      command: echo "LINT_OK"',
      '      category: lint',
      '',
    ].join('\n'));

    // 全量跑
    const resAll = runResult(`check --cwd ${cwd}`, cwd);
    assert.equal(resAll.code, 0, resAll.out);
    assert.match(resAll.out, /语法门禁/);
    assert.match(resAll.out, /业务测试/);
    assert.match(resAll.out, /格式校验/);

    // 跳过 tests
    const resSkipTest = runResult(`check --cwd ${cwd} --skip-tests`, cwd);
    assert.equal(resSkipTest.code, 0, resSkipTest.out);
    assert.match(resSkipTest.out, /语法门禁/);
    assert.doesNotMatch(resSkipTest.out, /业务测试/);
    assert.match(resSkipTest.out, /格式校验/);

    rmSync(cwd, { recursive: true, force: true });
  });

  it('prefers make check when Makefile contains a check target', () => {
    const cwd = mkWorkspace();
    writeFileSync(join(cwd, 'Makefile'), [
      'check:',
      '\t@echo "MAKE_CHECK_PASSED"',
      '',
      'build:',
      '\t@echo "MAKE_BUILD"',
      '',
    ].join('\n'));

    const res = runResult(`check --cwd ${cwd}`, cwd);

    assert.equal(res.code, 0, res.out);
    assert.match(res.out, /make 质量门禁 \(make check\): make check/);

    rmSync(cwd, { recursive: true, force: true });
  });
});
