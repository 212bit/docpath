import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mod;

before(async () => {
  mod = await import('../dist/utils/scan-existing-commands.js');
});

function gitInit(cwd) {
  execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@t.test'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd, stdio: 'ignore' });
}

describe('scan-existing-commands (S4 / FR-3)', () => {
  it('extracts package.json scripts directly', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cmd-'));
    try {
      gitInit(cwd);
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({
        name: 'demo',
        scripts: { test: 'pnpm test', build: 'tsup', format: 'prettier --w .', lint: 'eslint' },
      }));
      const c = await mod.extractProjectCommands(cwd);
      assert.equal(c.test.command, 'npm run test');
      assert.equal(c.test.source, 'package.json');
      assert.equal(c.build.command, 'npm run build');
      assert.equal(c.format.command, 'npm run format');
      assert.equal(c.lint.command, 'npm run lint');
      assert.ok(!c.test.needsTodo);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('uses Cargo default conventions for Cargo.toml projects', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cmd-'));
    try {
      gitInit(cwd);
      writeFileSync(join(cwd, 'Cargo.toml'), '[package]\nname = "demo"\n');
      const c = await mod.extractProjectCommands(cwd);
      assert.equal(c.test.command, 'cargo test');
      assert.equal(c.build.command, 'cargo build');
      assert.equal(c.format.command, 'cargo fmt');
      assert.equal(c.test.source, 'Cargo.toml');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('uses go default conventions for go.mod projects', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cmd-'));
    try {
      gitInit(cwd);
      writeFileSync(join(cwd, 'go.mod'), 'module demo\n\ngo 1.21\n');
      const c = await mod.extractProjectCommands(cwd);
      assert.equal(c.test.command, 'go test ./...');
      assert.equal(c.build.command, 'go build ./...');
      assert.match(c.format.command, /gofmt/);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('Makefile targets take priority over package.json (§4.c aggregation)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cmd-'));
    try {
      gitInit(cwd);
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'jest' } }));
      writeFileSync(join(cwd, 'Makefile'), 'test:\n\tnpm run test\n\nbuild:\n\ttsc\n');
      const c = await mod.extractProjectCommands(cwd);
      // Makefile 有 build → build 取 Makefile；package.json 没 build
      assert.equal(c.build.command, 'make build');
      assert.equal(c.build.source, 'Makefile');
      assert.equal(c.test.command, 'make test');
      assert.equal(c.test.source, 'Makefile');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('missing commands get TODO marker and are not fabricated', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cmd-'));
    try {
      gitInit(cwd);
      // 只有 test，没有 build/format/lint
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'jest' } }));
      const c = await mod.extractProjectCommands(cwd);
      assert.ok(c.test.command, 'test present');
      assert.equal(c.build.command, '');
      assert.equal(c.build.needsTodo, true, 'build missing → needsTodo');
      assert.equal(c.format.needsTodo, true);
      assert.equal(c.lint.needsTodo, true);
      const table = mod.renderCommandsTable(c);
      assert.match(table, /TODO: 未探测到 build 命令/);
      assert.match(table, /TODO: 未探测到 format 命令/);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('empty project returns all-TODO commands', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cmd-'));
    try {
      gitInit(cwd);
      const c = await mod.extractProjectCommands(cwd);
      assert.equal(c.test.needsTodo, true);
      assert.equal(c.build.needsTodo, true);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('hasAnyManifest detects presence/absence', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cmd-'));
    try {
      assert.equal(mod.hasAnyManifest(cwd), false);
      writeFileSync(join(cwd, 'package.json'), '{}');
      assert.equal(mod.hasAnyManifest(cwd), true);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
