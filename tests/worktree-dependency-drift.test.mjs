/**
 * R-467: worktree node_modules 共享软链接的依赖安装写穿副作用
 *
 * 复现的原始事故：worktree create 把主仓库 node_modules 软链接进 worktree，
 * Worker 在 worktree 里装的包实际写进主仓库；worktree 删除后，主干 test:ui 才报
 * ERR_MODULE_NOT_FOUND —— 「合并成功」在结构上不可能反映这个 gitignored 的副作用。
 *
 * 本测试锁定三件事：
 *   1. 检测器能识别「worktree node_modules 共享主仓库」这一写穿形态；
 *   2. 检测器能分别报出 missing（声明未装）与 phantom（装了未声明）；
 *   3. doctor 在合并前就把这些事实暴露成可读信号。
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

let inspectDependencyIsolation;
let renderDependencyDrift;

const load = async () => {
  if (inspectDependencyIsolation) return;
  const mod = await import('../dist/utils/worktree-dependency-drift.js');
  inspectDependencyIsolation = mod.inspectDependencyIsolation;
  renderDependencyDrift = mod.renderDependencyDrift;
};

const cleanups = [];
after(() => {
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd, args) => execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

function mkTemp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

/** 造一个最小主仓库：package.json 声明 vitest，node_modules 里实装 vitest */
function mkMainRepo({ declared = ['vitest'], installed = ['vitest'] } = {}) {
  const cwd = mkTemp('dp-dep-main-');
  git(cwd, 'init -q -b main');
  git(cwd, 'config user.email t@t');
  git(cwd, 'config user.name t');
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({
    name: 'dep-repro',
    version: '1.0.0',
    devDependencies: Object.fromEntries(declared.map((n) => [n, '^1.0.0'])),
  }, null, 2));
  for (const name of installed) {
    mkdirSync(join(cwd, 'node_modules', name), { recursive: true });
    writeFileSync(join(cwd, 'node_modules', name, 'package.json'), '{}');
  }
  writeFileSync(join(cwd, '.gitignore'), 'node_modules/\n');
  git(cwd, 'add -A');
  git(cwd, 'commit -qm init');
  return cwd;
}

/** 复刻 worktree create 5.1 的形态：worktree 的 node_modules 软链到主仓库 */
function linkSharedNodeModules(worktreePath, mainRepoPath) {
  mkdirSync(worktreePath, { recursive: true });
  symlinkSync(join(mainRepoPath, 'node_modules'), join(worktreePath, 'node_modules'), 'dir');
}

describe('worktree dependency isolation drift (R-467)', () => {
  it('detects a shared node_modules symlink as write-through into main', async () => {
    await load();
    const main = mkMainRepo();
    const wt = mkTemp('dp-dep-wt-');
    linkSharedNodeModules(wt, main);
    writeFileSync(join(wt, 'package.json'), JSON.stringify({
      name: 'dep-repro', version: '1.0.0', devDependencies: { vitest: '^1.0.0' },
    }, null, 2));

    const report = inspectDependencyIsolation(wt, main);
    assert.equal(report.form, 'symlink');
    assert.equal(report.sharedWithMain, true, 'symlink 指向主仓库 node_modules 时必须判定为写穿');
    assert.equal(report.drifted, true);
    assert.ok(report.drift.some((d) => d.kind === 'shared-symlink'));
    assert.equal(realpathSync(report.linkTarget), realpathSync(join(main, 'node_modules')));
  });

  it('reports missing declared dependencies (the ERR_MODULE_NOT_FOUND trigger)', async () => {
    await load();
    // 主仓库缺 vitest —— 正是 worktree 删除后主干 test:ui 挂掉的状态
    const main = mkMainRepo({ installed: [] });
    const report = inspectDependencyIsolation(main, main);

    const missing = report.drift.find((d) => d.kind === 'missing');
    assert.ok(missing, '未安装的声明依赖必须被报出');
    assert.match(missing.detail, /vitest/);
    assert.match(missing.detail, /MODULE_NOT_FOUND/);
  });

  it('reports phantom packages installed but not declared (ghost dependency)', async () => {
    await load();
    const main = mkMainRepo({ declared: ['vitest'], installed: ['vitest', 'tinybench'] });
    const report = inspectDependencyIsolation(main, main);

    const phantom = report.drift.find((d) => d.kind === 'phantom');
    assert.ok(phantom, '装了但没声明的包必须被报出');
    assert.match(phantom.detail, /tinybench/);
  });

  it('stays quiet for a directory node_modules with no drift', async () => {
    await load();
    const main = mkMainRepo();
    const report = inspectDependencyIsolation(main, main);
    assert.equal(report.form, 'directory');
    assert.equal(report.drifted, false);
    assert.deepEqual(renderDependencyDrift(report), []);
  });

  it('treats macOS /private path aliases as the same target', async () => {
    await load();
    // /tmp -> /private/tmp 的别名字符串不等，但语义相同，不能误判为「指向别处」
    const main = mkMainRepo();
    const wt = mkTemp('dp-dep-alias-');
    linkSharedNodeModules(wt, realpathSync(main));
    writeFileSync(join(wt, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2));

    const report = inspectDependencyIsolation(wt, main);
    assert.equal(report.sharedWithMain, true, 'realpath 归一后才能正确识别共享');
  });

  it('surfaces the drift through `worktree doctor` before merge', async () => {
    await load();
    const cwd = mkMainRepo();
    // 造一个受管 worktree，然后手工把 node_modules 替换成共享软链接
    const worktreePath = join(cwd, '.worktrees', 'feature-drift');
    execSync(`node ${CLI} worktree create feature-drift`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    assert.equal(existsSync(worktreePath), true, 'worktree 应已创建');

    // create 已经软链过；确认 doctor 把写穿形态报出来。
    // doctor 可能因为本精简仓库缺 .docpath/backlog 等条目而非 0 退出，
    // 这里只关心漂移信号是否出现，故捕获输出而不因退出码失败。
    let out = '';
    try {
      out = execSync(`node ${CLI} worktree doctor feature-drift`, {
        cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, DOCPATH_SESSION: '' },
      });
    } catch (err) {
      out = `${err.stdout || ''}${err.stderr || ''}`;
    }

    assert.match(out, /dependency isolation/, 'doctor 必须在合并前暴露 node_modules 写穿形态');
    assert.match(out, /R-467/, '提示必须带 R-467 以便定位');
  });
});
