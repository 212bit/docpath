import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let runners;

before(async () => {
  runners = await import('../dist/commands/check/runners.js');
});

describe('expandPackageScript (check runner 挂起免疫)', () => {
  it('inlines nested pnpm run references recursively (docpath 自身脚本形态)', () => {
    const scripts = {
      build: 'pnpm run build:clean',
      'build:clean': 'tsup --clean',
      'build:test': 'tsup',
      test: 'pnpm run build:test && node --test --test-concurrency=4 tests/*.test.mjs',
      typecheck: 'tsc --noEmit',
    };
    const build = runners.expandPackageScript(scripts.build, scripts);
    assert.equal(build.inlineable, true);
    assert.equal(build.command, 'tsup --clean');

    const test = runners.expandPackageScript(scripts.test, scripts);
    assert.equal(test.inlineable, true);
    assert.equal(test.command.replace(/\s+/g, ' '), 'tsup && node --test --test-concurrency=4 tests/*.test.mjs');
  });

  it('expands npm run and bare pnpm <script> forms', () => {
    const scripts = { test: 'echo ok', build: 'npm run test', prep: 'pnpm test' };
    assert.equal(runners.expandPackageScript(scripts.build, scripts).command, 'echo ok');
    assert.equal(runners.expandPackageScript(scripts.prep, scripts).command, 'echo ok');
  });

  it('appends trailing args after the script name', () => {
    const scripts = { build: 'tsup', watch: 'pnpm run build -- --watch' };
    const r = runners.expandPackageScript(scripts.watch, scripts);
    assert.equal(r.inlineable, true);
    assert.equal(r.command, 'tsup -- --watch');
  });

  it('refuses workspace flags / unknown / cyclic references (保守回退 runner)', () => {
    // workspace flags
    const flagged = runners.expandPackageScript('pnpm -r --filter @x/y build', { build: 'tsup' });
    assert.equal(flagged.inlineable, false);
    // 未知脚本引用
    const unknown = runners.expandPackageScript('pnpm run missing-script', { build: 'tsup' });
    assert.equal(unknown.inlineable, false);
    // 循环引用
    const cyclic = runners.expandPackageScript('pnpm run a', { a: 'pnpm run b', b: 'pnpm run a' });
    assert.equal(cyclic.inlineable, false);
  });

  it('bails out on quotes / subshells (含特殊结构的脚本不内联)', () => {
    assert.equal(runners.expandPackageScript('echo "$(date)"', {}).inlineable, false);
    assert.equal(runners.expandPackageScript(`echo "hello world"`, {}).inlineable, false);
  });

  it('keeps plain commands inlineable without runner references', () => {
    const r = runners.expandPackageScript('node --test --test-concurrency=4 tests/*.test.mjs', {});
    assert.equal(r.inlineable, true);
    assert.equal(r.command, 'node --test --test-concurrency=4 tests/*.test.mjs');
  });
});

describe('resolveRunnerScriptCommand (探针 + 回退)', () => {
  it('prefers inlined command without probing', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-inline-'));
    try {
      const resolved = await runners.resolveRunnerScriptCommand(
        'build',
        { build: 'pnpm run inner', inner: 'node --version' },
        { pkgRunner: 'definitely-missing-runner-xyz', runCmd: 'definitely-missing-runner-xyz run' },
        cwd,
      );
      assert.equal(resolved.cmd, 'node --version');
      assert.equal(resolved.runnerBroken, null);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('skips execution with environment_failure semantics when runner probe hangs', async () => {
    runners.resetRunnerProbeCacheForTest();
    const cwd = mkdtempSync(join(tmpdir(), 'dp-hang-'));
    try {
      // 伪造 "pnpm"：一个只会挂起的 shell 脚本，模拟 Electron 包装 shim 的挂起行为
      const fakeBin = join(cwd, 'fake-bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakePnpm = join(fakeBin, 'pnpm');
      writeFileSync(fakePnpm, '#!/bin/sh\nsleep 30\n');
      chmodSync(fakePnpm, 0o755);
      const savedPath = process.env.PATH;
      process.env.PATH = `${fakeBin}:${savedPath || ''}`;
      try {
        // 用 sleep 冒充会挂起的 runner：探针超时 → 判定不可用 → cmd=null
        const resolved = await runners.resolveRunnerScriptCommand(
          'deploy',
          { deploy: 'pnpm -r run build' },
          { pkgRunner: 'pnpm', runCmd: 'pnpm run' },
          cwd,
        );
        assert.equal(resolved.cmd, null);
        assert.ok(resolved.runnerBroken);
        assert.equal(resolved.runnerBroken.probed, true);
        assert.equal(resolved.runnerBroken.usable, false);
      } finally {
        process.env.PATH = savedPath;
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      runners.resetRunnerProbeCacheForTest();
    }
  }, 30000);
});

describe('runPackageScriptChecks end-to-end (inline 直连执行)', () => {
  it('runs inlined scripts and reports pass/fail without runner routing', async () => {
    runners.resetRunnerProbeCacheForTest();
    const cwd = mkdtempSync(join(tmpdir(), 'dp-e2e-'));
    try {
      // 全部脚本无引号/子 shell → 完全可内联，不依赖任何 runner 可用性
      writeFileSync(join(cwd, 'ok-build.mjs'), "process.stdout.write('OK-BUILD');\n");
      writeFileSync(join(cwd, 'fail-test.mjs'), 'process.exit(3);\n');
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'inline-e2e',
        scripts: {
          build: 'pnpm run inner-build',
          'inner-build': 'node ok-build.mjs',
          test: 'node fail-test.mjs',
        },
      }));
      const pkgPath = join(cwd, 'package.json');
      const nodeCommands = runners.detectNodeCommandConfig(cwd);
      const results = await runners.runPackageScriptChecks(cwd, pkgPath, nodeCommands, { cwd, skipLint: true });
      const build = results.find((r) => r.name === '构建');
      const test = results.find((r) => r.name === '测试');
      assert.ok(build, 'build result missing');
      assert.equal(build.passed, true);
      assert.match(build.output, /OK-BUILD/);
      assert.ok(test, 'test result missing');
      assert.equal(test.passed, false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      runners.resetRunnerProbeCacheForTest();
    }
  });

  it('missing local tsc is an immediate environment_failure and does not run PATH tsc or npx', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-no-tsc-'));
    const pathBin = join(cwd, 'path-bin');
    mkdirSync(pathBin, { recursive: true });
    const pathTsc = join(pathBin, 'tsc');
    writeFileSync(pathTsc, '#!/bin/sh\necho PATH_TSC\nexit 0\n');
    chmodSync(pathTsc, 0o755);
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'no-tsc', scripts: {} }));
    writeFileSync(join(cwd, 'tsconfig.json'), '{}\n');
    const savedPath = process.env.PATH;
    process.env.PATH = `${pathBin}${savedPath ? `:${savedPath}` : ''}`;
    try {
      const started = Date.now();
      const results = await runners.runCompileChecks(cwd, join(cwd, 'package.json'), runners.detectNodeCommandConfig(cwd));
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 2000, `missing tsc must fail immediately, took ${elapsed}ms`);
      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'TypeScript 编译');
      assert.equal(results[0].passed, false);
      assert.equal(results[0].environment_failure, true);
      assert.equal(results[0].environment_exemptible, true);
      assert.equal(results[0].command, 'tsc --noEmit');
      assert.match(results[0].output, /未找到本地 tsc/);
      assert.doesNotMatch(results[0].output, /PATH_TSC/);
      assert.doesNotMatch(results[0].command, /\bnpx\b/);
    } finally {
      process.env.PATH = savedPath;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('runs project-local tsc instead of a PATH tsc', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-local-tsc-'));
    const pathBin = join(cwd, 'path-bin');
    const localBin = join(cwd, 'node_modules', '.bin');
    mkdirSync(pathBin, { recursive: true });
    mkdirSync(localBin, { recursive: true });
    writeFileSync(join(pathBin, 'tsc'), '#!/bin/sh\necho PATH_TSC\nexit 1\n');
    writeFileSync(join(localBin, 'tsc'), '#!/bin/sh\necho LOCAL_TSC\nexit 0\n');
    chmodSync(join(pathBin, 'tsc'), 0o755);
    chmodSync(join(localBin, 'tsc'), 0o755);
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'local-tsc' }));
    writeFileSync(join(cwd, 'tsconfig.json'), '{}\n');
    const savedPath = process.env.PATH;
    process.env.PATH = `${pathBin}${savedPath ? `:${savedPath}` : ''}`;
    try {
      const results = await runners.runCompileChecks(cwd, join(cwd, 'package.json'), runners.detectNodeCommandConfig(cwd));
      assert.equal(results.length, 1);
      assert.equal(results[0].passed, true, results[0].output);
      assert.match(results[0].output, /LOCAL_TSC/);
      assert.doesNotMatch(results[0].output, /PATH_TSC/);
      assert.equal(results[0].command, 'tsc --noEmit');
    } finally {
      process.env.PATH = savedPath;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('uses the main checkout tsc when a git worktree has no local node_modules', async () => {
    const main = mkdtempSync(join(tmpdir(), 'dp-tsc-main-'));
    const sibling = mkdtempSync(join(tmpdir(), 'dp-tsc-wt-'));
    const worktree = join(sibling, 'feature');
    try {
      mkdirSync(join(main, 'node_modules', '.bin'), { recursive: true });
      const tsc = join(main, 'node_modules', '.bin', 'tsc');
      writeFileSync(tsc, '#!/bin/sh\necho MAIN_TSC\nexit 0\n');
      chmodSync(tsc, 0o755);
      writeFileSync(join(main, 'package.json'), JSON.stringify({ name: 'main' }));
      writeFileSync(join(main, 'tsconfig.json'), '{}\n');
      execSync('git init', { cwd: main, encoding: 'utf-8' });
      execSync('git config user.email t@example.com', { cwd: main, encoding: 'utf-8' });
      execSync('git config user.name t', { cwd: main, encoding: 'utf-8' });
      execSync('git add package.json tsconfig.json', { cwd: main, encoding: 'utf-8' });
      execSync('git commit -m baseline', { cwd: main, encoding: 'utf-8' });
      execSync(`git worktree add ${JSON.stringify(worktree)} HEAD`, { cwd: main, encoding: 'utf-8' });
      rmSync(join(worktree, 'node_modules'), { recursive: true, force: true });

      const results = await runners.runCompileChecks(
        worktree,
        join(worktree, 'package.json'),
        runners.detectNodeCommandConfig(worktree),
      );
      assert.equal(results.length, 1);
      assert.equal(results[0].passed, true, results[0].output);
      assert.match(results[0].output, /MAIN_TSC/);
      assert.equal(results[0].command, 'tsc --noEmit');
      assert.equal(results[0].environment_failure, undefined);
    } finally {
      try { execSync(`git worktree remove --force ${JSON.stringify(worktree)}`, { cwd: main, encoding: 'utf-8' }); } catch { /* ignore cleanup */ }
      rmSync(main, { recursive: true, force: true });
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('compile check inlines typecheck script', async () => {
    runners.resetRunnerProbeCacheForTest();
    const cwd = mkdtempSync(join(tmpdir(), 'dp-tsc-'));
    try {
      writeFileSync(join(cwd, 'ok-tsc.mjs'), "process.stdout.write('OK-TSC');\n");
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'inline-tsc',
        scripts: { typecheck: 'pnpm run inner-tsc', 'inner-tsc': 'node ok-tsc.mjs' },
      }));
      writeFileSync(join(cwd, 'tsconfig.json'), '{}');
      const results = await runners.runCompileChecks(cwd, join(cwd, 'package.json'), runners.detectNodeCommandConfig(cwd));
      assert.equal(results.length, 1);
      assert.equal(results[0].passed, true);
      assert.match(results[0].output, /OK-TSC/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      runners.resetRunnerProbeCacheForTest();
    }
  });
});

describe('probeRunnerUsable', () => {
  it('treats yarn as unprobed/usable (CLI 形态差异大，不做临时目录探针)', async () => {
    runners.resetRunnerProbeCacheForTest();
    const result = await runners.probeRunnerUsable(process.cwd(), { pkgRunner: 'yarn', runCmd: 'yarn' });
    assert.equal(result.probed, false);
    assert.equal(result.usable, true);
  });

  it('marks fast-failing runner unusable (缺失/报错的 runner ≠ 可用)', async () => {
    runners.resetRunnerProbeCacheForTest();
    const cwd = mkdtempSync(join(tmpdir(), 'dp-probe-'));
    try {
      // 假 pnpm 快速退出（模拟缺失/报错，非挂起）：探针判定不可用，
      // check 快速给出明确诊断而非空耗超时
      const fakeBin = join(cwd, 'fake-bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakePnpm = join(fakeBin, 'pnpm');
      writeFileSync(fakePnpm, '#!/bin/sh\nexit 3\n');
      chmodSync(fakePnpm, 0o755);
      const savedPath = process.env.PATH;
      process.env.PATH = `${fakeBin}:${savedPath || ''}`;
      try {
        const result = await runners.probeRunnerUsable(cwd, { pkgRunner: 'pnpm', runCmd: 'pnpm run' });
        assert.equal(result.probed, true);
        assert.equal(result.usable, false);
      } finally {
        process.env.PATH = savedPath;
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      runners.resetRunnerProbeCacheForTest();
    }
  });

  it('marks hanging pnpm shim unusable (探针超时判定挂起)', async () => {
    runners.resetRunnerProbeCacheForTest();
    const cwd = mkdtempSync(join(tmpdir(), 'dp-hang2-'));
    try {
      const fakeBin = join(cwd, 'fake-bin');
      mkdirSync(fakeBin, { recursive: true });
      const fakePnpm = join(fakeBin, 'pnpm');
      writeFileSync(fakePnpm, '#!/bin/sh\nsleep 30\n');
      chmodSync(fakePnpm, 0o755);
      const savedPath = process.env.PATH;
      process.env.PATH = `${fakeBin}:${savedPath || ''}`;
      try {
        const result = await runners.probeRunnerUsable(cwd, { pkgRunner: 'pnpm', runCmd: 'pnpm run' });
        assert.equal(result.probed, true);
        assert.equal(result.usable, false);
        assert.match(result.detail || '', /挂起/);
      } finally {
        process.env.PATH = savedPath;
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      runners.resetRunnerProbeCacheForTest();
    }
  }, 30000);
});
