import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  computeCategoryDigest,
  computeAllCategoryDigests,
  tryReuseGranularCategoryChecks,
} from '../dist/commands/check/cache.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-check-cache-'));
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

  writeFileSync(join(cwd, 'package.json'), JSON.stringify({
    name: 'cache-test',
    type: 'module',
    scripts: {
      build: 'node -e "process.exit(0)"',
      test: 'node --test',
      lint: 'node -e "process.exit(0)"',
    },
  }, null, 2));

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: cache-test\n');
  writeFileSync(join(cwd, 'README.md'), '# Cache Test\n');
  writeFileSync(join(cwd, 'src', 'index.ts'), 'export const x = 1;\n');
  writeFileSync(join(cwd, 'tests', 'index.test.mjs'), 'import { test } from "node:test"; test("ok", () => {});\n');

  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    schema_version: 1,
    phase: 'executing',
    task_id: 'T-cache-1',
  }, null, 2));

  execSync('git add . && git commit -m "init"', { cwd });
  return cwd;
}

function run(args, cwd, env = {}) {
  const cleanEnv = { ...process.env, ...env };
  delete cleanEnv.NODE_TEST_CONTEXT;
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, env: cleanEnv });
}

describe('docpath check granular category digest and incremental caching', () => {
  it('computes isolated compile digest unaffected by test file modifications', () => {
    const cwd = mkGitRepo();
    try {
      const compileBefore = computeCategoryDigest(cwd, 'compile');
      const testBefore = computeCategoryDigest(cwd, 'test');

      assert.ok(compileBefore);
      assert.ok(testBefore);

      // Modify only tests/index.test.mjs
      writeFileSync(join(cwd, 'tests', 'index.test.mjs'), 'import { test } from "node:test"; test("updated", () => {});\n');

      const compileAfter = computeCategoryDigest(cwd, 'compile');
      const testAfter = computeCategoryDigest(cwd, 'test');

      // Compile digest MUST remain unchanged
      assert.equal(compileAfter, compileBefore);
      // Test digest MUST change
      assert.notEqual(testAfter, testBefore);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('updates compile digest when src code changes', () => {
    const cwd = mkGitRepo();
    try {
      const compileBefore = computeCategoryDigest(cwd, 'compile');

      // Modify src/index.ts
      writeFileSync(join(cwd, 'src', 'index.ts'), 'export const x = 2;\n');

      const compileAfter = computeCategoryDigest(cwd, 'compile');
      assert.notEqual(compileAfter, compileBefore);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('persists and reuses granular category digests in docpath check', () => {
    const cwd = mkGitRepo();
    try {
      // First check run: creates baseline evidence
      const firstOut = run('check', cwd);
      assert.match(firstOut, /全部通过/);

      // Second check run with no code changes: all heavy runners reused
      const secondOut = run('check', cwd);
      assert.match(secondOut, /scope 缓存命中/);

      // Modify test file: compile and lint should reuse granular cache
      writeFileSync(join(cwd, 'tests', 'index.test.mjs'), 'import { test } from "node:test"; test("changed", () => {});\n');

      const thirdOut = run('check', cwd);
      assert.match(thirdOut, /全部通过/);

      // Test with --no-cache: forces fresh run
      const noCacheOut = run('check --no-cache', cwd);
      assert.doesNotMatch(noCacheOut, /scope 缓存命中/);
      assert.match(noCacheOut, /全部通过/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
