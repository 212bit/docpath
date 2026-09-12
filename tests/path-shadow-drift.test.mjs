// R-332: 全局安装与仓库开发版双轨漂移提示（PATH 影子检测）
import './registry-isolation.mjs';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;
const { detectPathShadowing, takePathShadowAdvisory } = await import('../dist/utils/version-drift.js');

const dirs = [];
const origPath = process.env.PATH;

after(() => {
  process.env.PATH = origPath;
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function mkBase(prefix) {
  const base = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(base);
  return base;
}

/** 伪 docpath 源码 checkout：package.json(name=docpath) + bin/docpath.js 即判据。 */
function mkCheckout(version = '9.9.9') {
  const root = mkBase('dp-shadow-repo-');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'docpath', version }));
  mkdirSync(join(root, 'bin'), { recursive: true });
  writeFileSync(join(root, 'bin', 'docpath.js'), '#!/usr/bin/env node\nconsole.log(1)\n');
  chmodSync(join(root, 'bin', 'docpath.js'), 0o755);
  return root;
}

/** 伪全局安装：<base>/node_modules/docpath/bin/docpath.js + PATH 垫片 <base>/bin/docpath。 */
function mkForeignGlobal(version) {
  const base = mkBase('dp-shadow-global-');
  const pkgRoot = join(base, 'node_modules', 'docpath');
  mkdirSync(join(pkgRoot, 'bin'), { recursive: true });
  const binFile = join(pkgRoot, 'bin', 'docpath.js');
  writeFileSync(binFile, '#!/usr/bin/env node\nconsole.log(0)\n');
  chmodSync(binFile, 0o755);
  writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({ name: 'docpath', version, bin: { docpath: 'bin/docpath.js' } }));
  const bindir = join(base, 'bin');
  mkdirSync(bindir);
  symlinkSync(binFile, join(bindir, 'docpath'));
  return bindir;
}

function withPath(prefix) {
  process.env.PATH = `${prefix}:${origPath}`;
}

describe('detectPathShadowing (R-332)', () => {
  it('flags a foreign PATH docpath when running inside a docpath checkout', async () => {
    const repo = mkCheckout('9.9.9');
    const bindir = mkForeignGlobal('0.0.9');
    withPath(bindir);
    const shadow = await detectPathShadowing(repo);
    assert.ok(shadow, '影子必须被检出');
    assert.equal(shadow.shadow_version, '0.0.9');
    assert.equal(shadow.repo_version, '9.9.9');
    assert.match(shadow.shadow_path, /node_modules\/docpath\/bin\/docpath\.js$/);
  });

  it('flags shadow by path even when versions are equal (同号不同行为, R-334 实测)', async () => {
    const repo = mkCheckout('0.1.1');
    const bindir = mkForeignGlobal('0.1.1');
    withPath(bindir);
    const shadow = await detectPathShadowing(repo);
    assert.ok(shadow);
    assert.equal(shadow.shadow_version, '0.1.1');
  });

  it('is silent when PATH docpath resolves inside the checkout (pnpm link 对齐)', async () => {
    const repo = mkCheckout('9.9.9');
    const bindir = join(repo, 'globalbin');
    mkdirSync(bindir);
    symlinkSync(join(repo, 'bin', 'docpath.js'), join(bindir, 'docpath'));
    withPath(bindir);
    assert.equal(await detectPathShadowing(repo), null);
  });

  it('is silent outside a docpath checkout (用户项目零噪音)', async () => {
    const user = mkBase('dp-shadow-user-');
    writeFileSync(join(user, 'package.json'), JSON.stringify({ name: 'user-app' }));
    const bindir = mkForeignGlobal('0.0.9');
    withPath(bindir);
    assert.equal(await detectPathShadowing(user), null);
  });
});

describe('takePathShadowAdvisory nag-once (R-332)', () => {
  it('advises once per shadow fingerprint and re-advises on state change', async () => {
    const repo = mkCheckout('9.9.9');
    const bindir = mkForeignGlobal('0.0.9');
    withPath(bindir);
    const shadow = await detectPathShadowing(repo);
    const first = takePathShadowAdvisory(shadow);
    assert.ok(first);
    assert.match(first, /PATH 影子/);
    assert.match(first, /node bin\/docpath\.js/);
    // 同一指纹：不再提示
    assert.equal(takePathShadowAdvisory(shadow), null);
    // 影子版本变化：重新提示
    writeFileSync(join(bindir, '..', 'node_modules', 'docpath', 'package.json'), JSON.stringify({ name: 'docpath', version: '0.1.0', bin: { docpath: 'bin/docpath.js' } }));
    const changed = await detectPathShadowing(repo);
    assert.ok(takePathShadowAdvisory(changed));
  });

  it('returns null without a shadow', () => {
    assert.equal(takePathShadowAdvisory(null), null);
  });
});

describe('R-332 agent surfaces', () => {
  it('next --agent warns once on stderr and install --doctor reports the issue', () => {
    const repo = mkCheckout('9.9.9');
    const bindir = mkForeignGlobal('0.0.9');
    const env = { ...process.env, PATH: `${bindir}:${origPath}` };
    execFileSync('node', [BIN, 'init', '--cwd', repo, '--level', '2'], { env, encoding: 'utf-8', timeout: 60000 });

    const first = runCli(['next', '--agent'], repo, env);
    assert.match(first.stderr, /PATH 影子/);
    const second = runCli(['next', '--agent'], repo, env);
    assert.doesNotMatch(second.stderr, /PATH 影子/);

    const doctor = runCli(['install', '--doctor', '--json'], repo, env);
    const report = JSON.parse(doctor.stdout);
    const issue = report.issues.find((item) => item.id === 'global-version-drift');
    assert.ok(issue, 'install --doctor 必须含 global-version-drift');
    assert.equal(issue.severity, 'warn');
    assert.match(issue.message, /0\.0\.9/);
    assert.match(issue.message, /9\.9\.9/);
  });

  it('install --doctor stays clean in a non-docpath user project (零噪音)', () => {
    const user = mkBase('dp-shadow-user-cli-');
    writeFileSync(join(user, 'package.json'), JSON.stringify({ name: 'user-app' }));
    const bindir = mkForeignGlobal('0.0.9');
    const env = { ...process.env, PATH: `${bindir}:${origPath}` };
    execFileSync('node', [BIN, 'init', '--cwd', user, '--level', '2'], { env, encoding: 'utf-8', timeout: 60000 });
    const doctor = runCli(['install', '--doctor', '--json'], user, env);
    const report = JSON.parse(doctor.stdout);
    assert.equal(report.issues.find((item) => item.id === 'global-version-drift'), undefined);
  });
});

function runCli(args, cwd, env) {
  // spawnSync 显式 pipe：execFileSync 默认 stderr inherit，无法捕获 advisory。
  const res = spawnSync('node', [BIN, ...args, '--cwd', cwd], { env, encoding: 'utf-8', timeout: 60000 });
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}
