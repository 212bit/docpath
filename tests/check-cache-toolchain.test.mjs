import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  computeCodeScopeDigest,
  computeCategoryDigest,
  computeToolchainFingerprint,
} from '../dist/commands/check/cache.js';
import { readLastCheckEvidence } from '../dist/utils/workspace-evidence.js';

const TC_A = '22.22.2|darwin|arm64';
const TC_B = '26.4.0|darwin|arm64';

describe('check 缓存键工具链指纹 (R-502)', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'docpath-toolchain-'));
    execFileSync('git', ['init', '-q'], { cwd: repoDir });
    mkdirSync(join(repoDir, 'src'), { recursive: true });
    mkdirSync(join(repoDir, 'tests'), { recursive: true });
    writeFileSync(join(repoDir, 'src', 'index.ts'), 'export const a = 1;\n');
    writeFileSync(join(repoDir, 'tests', 'a.test.mjs'), 'export const b = 2;\n');
  });

  afterEach(() => {
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
  });

  it('指纹由 node 版本、平台与架构组成', () => {
    assert.equal(computeToolchainFingerprint('1.2.3', 'linux', 'x64'), '1.2.3|linux|x64');
    const current = computeToolchainFingerprint();
    assert.ok(current.startsWith(process.versions.node));
    assert.ok(current.includes(process.platform));
    assert.ok(current.includes(process.arch));
  });

  it('同一工具链下 digest 稳定，可跨调用复用', () => {
    const first = computeCodeScopeDigest(repoDir, undefined, TC_A);
    const second = computeCodeScopeDigest(repoDir, undefined, TC_A);
    assert.ok(first);
    assert.equal(first, second);

    assert.equal(
      computeCategoryDigest(repoDir, 'test', undefined, TC_A),
      computeCategoryDigest(repoDir, 'test', undefined, TC_A),
    );
  });

  it('仅 Node 版本变化即导致 digest 失效（本次修复的核心语义）', () => {
    const a = computeCodeScopeDigest(repoDir, undefined, TC_A);
    const b = computeCodeScopeDigest(repoDir, undefined, TC_B);
    assert.ok(a && b);
    assert.notEqual(a, b);
  });

  it('平台或架构变化同样导致 digest 失效', () => {
    const base = computeCodeScopeDigest(repoDir, undefined, TC_A);
    assert.notEqual(computeCodeScopeDigest(repoDir, undefined, '22.22.2|linux|arm64'), base);
    assert.notEqual(computeCodeScopeDigest(repoDir, undefined, '22.22.2|darwin|x64'), base);
  });

  it('分门类 digest 也包含指纹前缀，避免细粒度缓存漏判', () => {
    for (const category of ['compile', 'test', 'lint']) {
      const a = computeCategoryDigest(repoDir, category, undefined, TC_A);
      const b = computeCategoryDigest(repoDir, category, undefined, TC_B);
      assert.ok(a && b, category);
      assert.notEqual(a, b, category);
    }
  });

  it('非 git 目录仍返回 null，缓存语义回落全量', () => {
    const plainDir = mkdtempSync(join(tmpdir(), 'docpath-nogit-'));
    try {
      assert.equal(computeCodeScopeDigest(plainDir), null);
    } finally {
      rmSync(plainDir, { recursive: true, force: true });
    }
  });

  it('证据文件可落盘并读回 toolchain 字段', async () => {
    const docpathDir = join(repoDir, '.docpath');
    mkdirSync(join(docpathDir, 'workspace'), { recursive: true });
    writeFileSync(
      join(docpathDir, 'workspace', 'last-check.json'),
      JSON.stringify({
        schema_version: 1,
        kind: 'last-check',
        timestamp: new Date().toISOString(),
        passed: true,
        check_count: 1,
        code_scope_digest: computeCodeScopeDigest(repoDir, undefined, TC_A),
        toolchain: TC_A,
        checks: [{ name: '测试', passed: true, category: 'test' }],
      }),
    );

    const evidence = await readLastCheckEvidence(docpathDir);
    assert.ok(evidence);
    assert.equal(evidence.toolchain, TC_A);
    assert.equal(evidence.code_scope_digest, computeCodeScopeDigest(repoDir, undefined, TC_A));
  });
});
