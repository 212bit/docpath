import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mod;

before(async () => {
  mod = await import('../dist/utils/scan-existing-tree.js');
});

function makeProject(extra = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-scan-'));
  // git init 以激活 .gitignore git check-ignore
  execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@t.test'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd, stdio: 'ignore' });
  mkdirSync(join(cwd, 'src', 'commands'), { recursive: true });
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'index.ts'), 'export {}');
  writeFileSync(join(cwd, 'src', 'commands', 'foo.ts'), 'export {}');
  writeFileSync(join(cwd, 'README.md'), '# x');
  if (extra.writeGitignore) writeFileSync(join(cwd, '.gitignore'), extra.writeGitignore);
  // 硬黑名单目录（不被 .gitignore 也应被黑名单排除）
  for (const d of (extra.blocklistDirs ?? ['node_modules', 'build', 'dist', '.worktrees'])) {
    mkdirSync(join(cwd, d), { recursive: true });
    writeFileSync(join(cwd, d, 'noise.txt'), 'x');
  }
  return cwd;
}

describe('scan-existing-tree (S2 / FR-2 前置)', () => {
  it('excludes hard blocklist dirs (node_modules/build/dist/.worktrees) without gitignore', async () => {
    const cwd = makeProject();
    try {
      const tree = await mod.scanProjectTree(cwd);
      const text = mod.renderTree(tree);
      assert.ok(!text.includes('node_modules/'), 'node_modules should be excluded');
      assert.ok(!text.includes('build/'), 'build should be excluded');
      assert.ok(!text.includes('dist/'), 'dist should be excluded');
      assert.ok(!text.includes('.worktrees/'), '.worktrees should be excluded');
      // 真实结构留存
      assert.ok(text.includes('src/'));
      assert.ok(text.includes('commands/'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('respects project .gitignore (ignored dirs/files excluded)', async () => {
    const cwd = makeProject({ writeGitignore: 'docs/\n*.log\nlocal-cache/\n' });
    mkdirSync(join(cwd, 'local-cache'), { recursive: true });
    writeFileSync(join(cwd, 'app.log'), 'log');
    try {
      const tree = await mod.scanProjectTree(cwd);
      const text = mod.renderTree(tree);
      assert.ok(!text.includes('docs/'), 'docs/ is gitignored, should be excluded');
      assert.ok(!text.includes('app.log'), '*.log is gitignored, should be excluded');
      assert.ok(!text.includes('local-cache/'), 'local-cache/ is gitignored, should be excluded');
      assert.ok(text.includes('src/'), 'src/ kept');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('renders real structure tree with dirs before files, sorted', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-scan-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
      writeFileSync(join(cwd, 'b-file.txt'), 'x');
      writeFileSync(join(cwd, 'a-file.txt'), 'x');
      mkdirSync(join(cwd, 'zdir'), { recursive: true });
      mkdirSync(join(cwd, 'adir'), { recursive: true });
      writeFileSync(join(cwd, 'zdir', 'c.ts'), 'x');
      const tree = await mod.scanProjectTree(cwd);
      const text = mod.renderTree(tree);
      // 目录在前
      const adirPos = text.indexOf('adir/');
      const afilePos = text.indexOf('a-file.txt');
      assert.ok(adirPos < afilePos, 'dirs should precede files');
      // 字典序
      assert.ok(text.indexOf('adir/') < text.indexOf('zdir/'), 'dirs sorted');
      assert.ok(text.indexOf('a-file.txt') < text.indexOf('b-file.txt'), 'files sorted');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('folds overflow entries per directory', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-scan-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
      for (let i = 0; i < 50; i++) writeFileSync(join(cwd, `f${String(i).padStart(2, '0')}.ts`), 'x');
      const tree = await mod.scanProjectTree(cwd, { maxEntriesPerDir: 5 });
      const text = mod.renderTree(tree);
      assert.ok(text.includes('… (45 more)'), 'overflow should be folded');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('isHardBlocklisted matches the §4.d blocklist', () => {
    assert.equal(mod.isHardBlocklisted('node_modules'), true);
    assert.equal(mod.isHardBlocklisted('build'), true);
    assert.equal(mod.isHardBlocklisted('.git'), true);
    assert.equal(mod.isHardBlocklisted('dist'), true);
    assert.equal(mod.isHardBlocklisted('target'), true);
    assert.equal(mod.isHardBlocklisted('.worktrees'), true);
    assert.equal(mod.isHardBlocklisted('coverage'), true);
    assert.equal(mod.isHardBlocklisted('src'), false);
  });
});
