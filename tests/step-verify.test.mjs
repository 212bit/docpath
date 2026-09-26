import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-step-verify-'));
  execSync('git init -b main', { cwd });
  execSync('git config user.name "Tester"', { cwd });
  execSync('git config user.email "tester@example.com"', { cwd });

  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'done'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(cwd, 'src'), { recursive: true });
  mkdirSync(join(cwd, 'tests'), { recursive: true });

  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'verify-test', type: 'module' }, null, 2));
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: verify-test\n');
  writeFileSync(join(cwd, 'README.md'), '# Step Verify Test\n');
  writeFileSync(join(cwd, 'src', 'calc.js'), 'export function add(a, b) { return a + b; }\n');
  writeFileSync(join(cwd, 'tests', 'calc.test.mjs'), [
    'import { test } from "node:test";',
    'import assert from "node:assert/strict";',
    'import { add } from "../src/calc.js";',
    'test("add works", () => { assert.equal(add(1, 2), 3); });',
  ].join('\n'));

  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    schema_version: 1,
    phase: 'idle',
    task_id: null,
  }, null, 2));

  execSync('git add . && git commit -m "init"', { cwd });
  return cwd;
}

function run(args, cwd, env = {}) {
  const cleanEnv = { ...process.env, ...env };
  delete cleanEnv.NODE_TEST_CONTEXT;
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, env: cleanEnv });
}

describe('docpath step-pass targeted test immediate verification', () => {
  it('executes targeted single test on step-pass with --test', () => {
    const cwd = mkGitRepo();
    try {
      // Start a task
      run('start "Test Step Verify" --draft', cwd);

      // Perform step-pass with explicit --test
      const out = run('step-pass --test tests/calc.test.mjs', cwd);
      assert.match(out, /单步即时单测验证/);
      assert.match(out, /calc\.test\.mjs/);
      assert.match(out, /通过/);
      assert.match(out, /step-pass: S1 已完成/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('automatically detects touched test files from modified source code on step-pass', () => {
    const cwd = mkGitRepo();
    try {
      run('start "Test Auto Verify" --draft', cwd);

      // Modify src/calc.js
      writeFileSync(join(cwd, 'src', 'calc.js'), 'export function add(a, b) { return a + b; }\n// touched\n');

      const out = run('step-pass', cwd);
      assert.match(out, /单步即时单测验证/);
      assert.match(out, /calc\.test\.mjs/);
      assert.match(out, /通过/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('blocks step completion when test fails in --strict-verify mode', () => {
    const cwd = mkGitRepo();
    try {
      run('start "Test Strict Verify" --draft', cwd);

      // Make test fail directly
      writeFileSync(join(cwd, 'tests', 'calc.test.mjs'), [
        'import { test } from "node:test";',
        'import assert from "node:assert/strict";',
        'test("fail", () => { assert.equal(1, 2); });',
      ].join('\n'));

      let threw = false;
      try {
        run('step-pass --strict-verify --test tests/calc.test.mjs', cwd);
      } catch (err) {
        threw = true;
      }
      assert.equal(threw, true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('skips verification when --skip-verify is provided', () => {
    const cwd = mkGitRepo();
    try {
      run('start "Test Skip Verify" --draft', cwd);

      // Make calc fail but skip verify
      writeFileSync(join(cwd, 'src', 'calc.js'), 'export function add(a, b) { return a - b; }\n');

      const out = run('step-pass --skip-verify', cwd);
      assert.doesNotMatch(out, /单步即时单测验证/);
      assert.match(out, /step-pass: S1 已完成/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
