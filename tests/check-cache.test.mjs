import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeCodeScopeDigest } from '../dist/commands/check/cache.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  try {
    return { code: 0, out: execSync(`node ${BIN} ${args}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }) };
  } catch (error) {
    return { code: error.status || 1, out: `${error.stdout || ''}${error.stderr || ''}${error.message || ''}` };
  }
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * 最小可 check 工作区：秒级 runner 脚本 + 空 state（--force 独立运行）。
 * 结构门禁在无活跃任务时应优雅跳过/通过。
 */
function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-check-cache-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: check-cache-test\n');
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 1, task_id: '', task_title: '', phase: 'idle', state: 'idle', gate: 'none',
  }));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({
    name: 'check-cache-fixture',
    scripts: {
      typecheck: 'node --version',
      build: 'node --version',
      test: 'node --version',
    },
  }));
  mkdirSync(join(cwd, 'src'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'app.ts'), 'export const a = 1;\n');
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'initial']);
  return cwd;
}

function lastCheck(cwd) {
  return JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'last-check.json'), 'utf-8'));
}

describe('check scope cache (R-331)', () => {
  describe('computeCodeScopeDigest', () => {
    it('is stable for identical scope state', () => {
      const cwd = mkWorkspace();
      try {
        assert.equal(computeCodeScopeDigest(cwd), computeCodeScopeDigest(cwd));
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('changes when a scope file changes', () => {
      const cwd = mkWorkspace();
      try {
        const before = computeCodeScopeDigest(cwd);
        appendFileSync(join(cwd, 'src', 'app.ts'), 'export const b = 2;\n');
        assert.notEqual(before, computeCodeScopeDigest(cwd));
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('does not change when only non-scope files change', () => {
      const cwd = mkWorkspace();
      try {
        const before = computeCodeScopeDigest(cwd);
        appendFileSync(join(cwd, 'README.md'), 'docs edit\n');
        assert.equal(before, computeCodeScopeDigest(cwd));
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('survives a commit of the same bytes (content-addressed, R-331 closeout path)', () => {
      const cwd = mkWorkspace();
      try {
        appendFileSync(join(cwd, 'src', 'app.ts'), 'export const b = 2;\n');
        const before = computeCodeScopeDigest(cwd);
        git(cwd, ['add', '.']);
        git(cwd, ['commit', '-m', 'commit the dirty bytes']);
        assert.equal(before, computeCodeScopeDigest(cwd));
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  describe('end-to-end reuse', () => {
    it('full check primes digest, doc-only change hits cache, scope change falls back to full', () => {
      const cwd = mkWorkspace();
      try {
        // 1. 首次全量：落 digest，无 cached 标记
        const prime = run('check', cwd);
        assert.equal(prime.code, 0, `prime check failed: ${prime.out}`);
        const primed = lastCheck(cwd);
        assert.ok(primed.passed, 'prime check should pass');
        assert.ok(primed.code_scope_digest, 'prime should persist code_scope_digest');
        assert.equal(primed.cached, undefined);

        // 2. 非 scope（docs）变更 → 命中缓存
        appendFileSync(join(cwd, 'README.md'), 'docs edit\n');
        const hit = run('check', cwd);
        assert.equal(hit.code, 0, `cached check failed: ${hit.out}`);
        assert.match(hit.out, /scope 缓存命中/);
        assert.equal(lastCheck(cwd).cached, true);

        // 3. scope（src）变更 → 自动回落全量
        appendFileSync(join(cwd, 'src', 'app.ts'), 'export const b = 2;\n');
        const full = run('check', cwd);
        assert.equal(full.code, 0, `full check failed: ${full.out}`);
        assert.doesNotMatch(full.out, /scope 缓存命中/);
        assert.equal(lastCheck(cwd).cached, undefined);
        assert.ok(lastCheck(cwd).code_scope_digest, 'full check should refresh digest');
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('--no-cache forces full run even when digest matches', () => {
      const cwd = mkWorkspace();
      try {
        const prime = run('check', cwd);
        assert.equal(prime.code, 0, `prime check failed: ${prime.out}`);
        appendFileSync(join(cwd, 'README.md'), 'docs edit\n');

        const forced = run('check --no-cache', cwd);
        assert.equal(forced.code, 0, `no-cache check failed: ${forced.out}`);
        assert.doesNotMatch(forced.out, /scope 缓存命中/);
        assert.equal(lastCheck(cwd).cached, undefined);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });
});
