import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, cwd) {
  const argList = Array.isArray(args) ? args : args.split(/\s+/);
  return execFileSync('node', [BIN, ...argList], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function mkRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-docs-sync-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'docs'), { recursive: true });
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: docs-sync-test\n');
  writeFileSync(join(dp, 'docs', 'guide.md'), '# User Guide\n\nThis is a user guide.\n');
  return cwd;
}

describe('docpath docs sync: 文档资产全量同步与自愈', () => {
  it('docs sync 自动扫描并建立索引', () => {
    const cwd = mkRepo();
    try {
      const out = run(['docs', 'sync'], cwd);
      assert.match(out, /文档资产全量同步与自愈/);
      assert.match(out, /文档索引已刷新并完成自愈/);
      assert.equal(existsSync(join(cwd, '.docpath', 'docs-index.json')), true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
