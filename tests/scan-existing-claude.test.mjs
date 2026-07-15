import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let claudeUtil;
before(async () => {
  claudeUtil = await import('../dist/utils/scan-existing-claude.js');
});

const ANCHOR = '## 项目命令（由 init --scan-existing 生成）';
const bin = () => new URL('../bin/docpath.js', import.meta.url).pathname;

function makePkg(cwd, scripts) {
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo', scripts }));
  mkdirSync(join(cwd, 'src'), { recursive: true });
}

describe('scan-existing-claude renderProjectCommandsBlock (S6 unit)', () => {
  it('renders filled + TODO slots, never fabricates', () => {
    const block = claudeUtil.renderProjectCommandsBlock({
      test: { command: 'npm run test', source: 'package.json' },
      build: { command: 'npm run build', source: 'package.json' },
      format: { command: '', source: 'empty', needsTodo: true },
      lint: { command: '', source: 'empty', needsTodo: true },
    });
    assert.ok(block.startsWith(ANCHOR));
    assert.match(block, /`npm run test`/);
    assert.match(block, /`npm run build`/);
    assert.match(block, /TODO: 未探测到 format 命令，请确认/);
    assert.match(block, /TODO: 未探测到 lint 命令，请确认/);
    // 不编造空槽位为命令
    assert.ok(!/`npm run format`/.test(block));
    assert.ok(!/`npm run lint`/.test(block));
  });
});

describe('writeProjectCommandsBlock outcomes (S6 unit)', () => {
  it('written: creates CLAUDE.md when absent', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cl-'));
    try {
      const r = await claudeUtil.writeProjectCommandsBlock(cwd, {
        test: { command: 'npm run test', source: 'package.json' },
        build: { command: '', source: 'empty', needsTodo: true },
        format: { command: '', source: 'empty', needsTodo: true },
        lint: { command: '', source: 'empty', needsTodo: true },
      });
      assert.equal(r.outcome, 'written');
      const md = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8');
      assert.match(md, /`npm run test`/);
      assert.match(md, /TODO: 未探测到 build 命令，请确认/);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('appended: appends block at tail, preserves existing content (§4.e)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cl-'));
    try {
      writeFileSync(join(cwd, 'CLAUDE.md'), '# Foo\n\n## Bar\n\nSome existing content.\n');
      const r = await claudeUtil.writeProjectCommandsBlock(cwd, {
        test: { command: 'npm run test', source: 'package.json' },
        build: { command: 'npm run build', source: 'package.json' },
        format: { command: '', source: 'empty', needsTodo: true },
        lint: { command: '', source: 'empty', needsTodo: true },
      });
      assert.equal(r.outcome, 'appended');
      const md = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8');
      assert.match(md, /Some existing content\./);
      assert.ok(md.includes('## Bar'));
      // 区块在末尾
      assert.ok(md.trim().endsWith('TODO: 未探测到 lint 命令，请确认'));
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('replaced: re-run replaces old block by anchor, does not stack (AC-7)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cl-'));
    try {
      const cmds1 = {
        test: { command: 'npm run test', source: 'package.json' },
        build: { command: '', source: 'empty', needsTodo: true },
        format: { command: '', source: 'empty', needsTodo: true },
        lint: { command: '', source: 'empty', needsTodo: true },
      };
      const cmds2 = {
        test: { command: 'npm run test', source: 'package.json' },
        build: { command: 'npm run build', source: 'package.json' },
        format: { command: '', source: 'empty', needsTodo: true },
        lint: { command: '', source: 'empty', needsTodo: true },
      };
      await claudeUtil.writeProjectCommandsBlock(cwd, cmds1);
      await claudeUtil.writeProjectCommandsBlock(cwd, cmds2);
      const md = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8');
      // 只有一个锚点（不堆积）
      assert.equal((md.match(/## 项目命令（由 init --scan-existing 生成）/g) || []).length, 1);
      // 第二次的 build 已填入，第一次的 build TODO 不残留
      assert.match(md, /`npm run build`/);
      assert.ok(!/TODO: 未探测到 build 命令，请确认/.test(md), 'stale build TODO must be gone after replace');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('replaced preserves trailing content after the block when anchored mid-file', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cl-'));
    try {
      writeFileSync(join(cwd, 'CLAUDE.md'), `# Top\n\n${ANCHOR}\n\n- stale\n\n## After Block\n\nkeep me\n`);
      const r = await claudeUtil.writeProjectCommandsBlock(cwd, {
        test: { command: 'npm run test', source: 'package.json' },
        build: { command: '', source: 'empty', needsTodo: true },
        format: { command: '', source: 'empty', needsTodo: true },
        lint: { command: '', source: 'empty', needsTodo: true },
      });
      assert.equal(r.outcome, 'replaced');
      const md = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8');
      assert.match(md, /keep me/);
      assert.match(md, /## After Block/);
      assert.ok(!md.includes('- stale'));
      assert.equal((md.match(/## 项目命令（由 init --scan-existing 生成）/g) || []).length, 1);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});

describe('init --scan-existing CLAUDE.md E2E (S6 / AC-3 + AC-7)', () => {
  it('appends ## 项目命令 block with filled + TODO slots', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cl-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
      makePkg(cwd, { test: 'jest', build: 'tsup' });
      execFileSync(process.execPath, [bin(), 'init', '--cwd', cwd, '--scan-existing', '--level', '1'], { stdio: 'ignore' });
      const md = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8');
      assert.match(md, /## 项目命令（由 init --scan-existing 生成）/);
      assert.match(md, /`npm run test`/);
      assert.match(md, /`npm run build`/);
      assert.match(md, /TODO: 未探测到 format 命令，请确认/);
      assert.match(md, /TODO: 未探测到 lint 命令，请确认/);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('does NOT touch CLAUDE.md with project-commands block when no --scan-existing (回归)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cl-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
      makePkg(cwd, { test: 'jest' });
      execFileSync(process.execPath, [bin(), 'init', '--cwd', cwd, '--level', '1'], { stdio: 'ignore' });
      const md = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8');
      assert.ok(!/## 项目命令（由 init --scan-existing 生成）/.test(md), 'no project-commands block without flag');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('re-run with --force replaces block, no stacking (AC-7)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cl-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
      makePkg(cwd, { test: 'jest' });
      execFileSync(process.execPath, [bin(), 'init', '--cwd', cwd, '--scan-existing', '--level', '1'], { stdio: 'ignore' });
      // 二次 init 用 --force 覆盖（写模板后再锚点替换）
      execFileSync(process.execPath, [bin(), 'init', '--cwd', cwd, '--scan-existing', '--force', '--level', '1'], { stdio: 'ignore' });
      const md = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8');
      const anchors = md.match(/## 项目命令（由 init --scan-existing 生成）/g) || [];
      assert.equal(anchors.length, 1, 'block must not stack on re-run with --force');
      // 仍含探测到的 test 命令
      assert.match(md, /`npm run test`/);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
