import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluateHippoGate, readHippoGateConfig, collectUncommittedDiff } from '../dist/engine/hippo-gate.js';

const FAKE_HIPPO = `#!/usr/bin/env node
const fs = require('fs');
const idx = process.argv.indexOf('-f');
const diff = idx >= 0 ? fs.readFileSync(process.argv[idx + 1], 'utf8') : '';
const mode = process.env.FAKE_MODE || 'pass';
if (mode === 'pass') {
  console.log(JSON.stringify({ passed: true, violations: [], diffBytes: diff.length }));
  process.exit(0);
}
if (mode === 'fail') {
  console.log(JSON.stringify({
    passed: false,
    violations: [{ severity: 'error', source: 'project_memory', reason: '触碰禁用项 eval', rule_text: '禁止使用 eval' }],
  }));
  process.exit(1);
}
if (mode === 'crash') { console.error('boom'); process.exit(3); }
console.log('not json at all');
process.exit(0);
`;

describe('Hippo 门禁合一 (P2 step-pass 前置钩子)', () => {
  let projectDir;
  let fakeBinary;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'docpath-hippo-gate-'));
    execFileSync('git', ['init', '-q'], { cwd: projectDir });
    writeFileSync(join(projectDir, 'index.js'), 'console.log(1);\n');
    execFileSync('git', ['add', '.'], { cwd: projectDir });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init'], { cwd: projectDir });

    fakeBinary = join(projectDir, 'fake-hippo.js');
    writeFileSync(fakeBinary, FAKE_HIPPO);
    chmodSync(fakeBinary, 0o755);
  });

  afterEach(() => {
    delete process.env.FAKE_MODE;
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('未接入 Hippo 的项目直接跳过，不改变既有流程', async () => {
    writeFileSync(join(projectDir, 'index.js'), 'console.log(2);\n');
    const result = await evaluateHippoGate({ cwd: projectDir, binary: fakeBinary });
    assert.equal(result.status, 'skipped');
    assert.match(result.reason, /未接入 Hippo/);
  });

  it('无未提交改动时跳过，避免空跑自审', async () => {
    mkdirSync(join(projectDir, '.hippo'), { recursive: true });
    const result = await evaluateHippoGate({ cwd: projectDir, binary: fakeBinary });
    assert.equal(result.status, 'skipped');
    assert.match(result.reason, /无未提交改动/);
  });

  it('mode=off 时关闭门禁', async () => {
    mkdirSync(join(projectDir, '.hippo'), { recursive: true });
    writeFileSync(join(projectDir, '.hippo', 'review-contract.json'), JSON.stringify({ gate: { mode: 'off' } }));
    writeFileSync(join(projectDir, 'index.js'), 'console.log(3);\n');
    const result = await evaluateHippoGate({ cwd: projectDir, binary: fakeBinary });
    assert.equal(result.status, 'skipped');
    assert.match(result.reason, /mode=off/);
  });

  it('自审通过时放行', async () => {
    mkdirSync(join(projectDir, '.hippo'), { recursive: true });
    writeFileSync(join(projectDir, 'index.js'), 'console.log(4);\n');
    process.env.FAKE_MODE = 'pass';
    const result = await evaluateHippoGate({ cwd: projectDir, binary: fakeBinary });
    assert.equal(result.status, 'pass');
  });

  it('存在 error 级违规且 mode=block 时阻断状态转移', async () => {
    mkdirSync(join(projectDir, '.hippo'), { recursive: true });
    writeFileSync(join(projectDir, 'index.js'), 'eval(userInput);\n');
    process.env.FAKE_MODE = 'fail';
    const result = await evaluateHippoGate({ cwd: projectDir, binary: fakeBinary });
    assert.equal(result.status, 'blocked');
    assert.ok(result.violations.some((v) => v.severity === 'error'));
    assert.match(result.reason, /拒绝状态转移/);
  });

  it('mode=warn 时只告警不阻断', async () => {
    mkdirSync(join(projectDir, '.hippo'), { recursive: true });
    writeFileSync(join(projectDir, '.hippo', 'review-contract.json'), JSON.stringify({ gate: { mode: 'warn' } }));
    writeFileSync(join(projectDir, 'index.js'), 'eval(userInput);\n');
    process.env.FAKE_MODE = 'fail';
    const result = await evaluateHippoGate({ cwd: projectDir, binary: fakeBinary });
    assert.equal(result.status, 'warn');
    assert.equal(readHippoGateConfig(projectDir).mode, 'warn');
  });

  it('hippo 异常退出或输出不可解析时 fail-open 为 warn', async () => {
    mkdirSync(join(projectDir, '.hippo'), { recursive: true });
    writeFileSync(join(projectDir, 'index.js'), 'console.log(5);\n');

    process.env.FAKE_MODE = 'crash';
    const crashed = await evaluateHippoGate({ cwd: projectDir, binary: fakeBinary });
    assert.equal(crashed.status, 'warn');

    process.env.FAKE_MODE = 'garbage';
    const garbage = await evaluateHippoGate({ cwd: projectDir, binary: fakeBinary });
    assert.equal(garbage.status, 'warn');
  });

  it('diff 采集覆盖未提交改动，且在超限时截断', async () => {
    writeFileSync(join(projectDir, 'index.js'), 'console.log(6);\n');
    const diff = collectUncommittedDiff(projectDir, 200_000);
    assert.ok(diff && diff.includes('console.log(6)'));

    const truncated = collectUncommittedDiff(projectDir, 10);
    assert.ok(truncated && truncated.length <= 10);
  });
});
