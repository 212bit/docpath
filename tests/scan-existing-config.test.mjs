import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let configTypes, configUtils;

before(async () => {
  configTypes = await import('../dist/types/config.js');
  configUtils = await import('../dist/utils/config.js');
});

describe('config document_scan_paths + project_commands (S5 / FR-4)', () => {
  it('DEFAULT_DOCUMENT_SCAN_PATHS is the §4 four/三 default', () => {
    assert.deepEqual(configTypes.DEFAULT_DOCUMENT_SCAN_PATHS, ['.docpath/', 'README.md', 'docs/']);
  });

  it('mergeDocumentScanPaths falls back to default when empty/missing (向后兼容)', () => {
    assert.deepEqual(configTypes.mergeDocumentScanPaths(undefined), ['.docpath/', 'README.md', 'docs/']);
    assert.deepEqual(configTypes.mergeDocumentScanPaths([]), ['.docpath/', 'README.md', 'docs/']);
    assert.deepEqual(configTypes.mergeDocumentScanPaths(['docs/', 'wiki/']), ['docs/', 'wiki/']);
  });

  it('readDocumentScanPaths returns default when no config.json (no crash)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cfg-'));
    try {
      const paths = await configUtils.readDocumentScanPaths(cwd);
      assert.deepEqual(paths, ['.docpath/', 'README.md', 'docs/']);
      assert.ok(paths.length === 3);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('readDocumentScanPaths honors user-declared paths from config.json', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cfg-'));
    try {
      mkdirSync(join(cwd, '.docpath'), { recursive: true });
      writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({
        document_scan_paths: ['.docpath/', 'wiki/', 'docs/'],
      }));
      const paths = await configUtils.readDocumentScanPaths(cwd);
      assert.deepEqual(paths, ['.docpath/', 'wiki/', 'docs/']);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});

describe('init generateConfig scan-existing fields (S5 E2E)', () => {
  it('config.yaml contains document_scan_paths + project_commands when scan-existing', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cfg-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'jest', build: 'tsup' } }));
      mkdirSync(join(cwd, 'src'), { recursive: true });
      // 通过 CLI 跑 init --scan-existing,然后检查生成的 config.yaml
      execFileSync(process.execPath, [new URL('../bin/docpath.js', import.meta.url).pathname, 'init', '--cwd', cwd, '--scan-existing', '--level', '1'], { stdio: 'ignore' });
      const cfg = readFileSync(join(cwd, '.docpath', 'config.yaml'), 'utf-8');
      assert.match(cfg, /document_scan_paths:/);
      assert.match(cfg, /README\.md/);
      assert.match(cfg, /project_commands:/);
      assert.match(cfg, /test: "npm run test"/);
      assert.match(cfg, /build: "npm run build"/);
      // format/lint 未探测到 → 空（不编造）
      assert.ok(!/format: ".*"/.test(cfg), 'format should be empty, not fabricated');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('config.yaml does NOT contain scan fields when no --scan-existing (逐字节回归)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-cfg-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'jest' } }));
      execFileSync(process.execPath, [new URL('../bin/docpath.js', import.meta.url).pathname, 'init', '--cwd', cwd, '--level', '1'], { stdio: 'ignore' });
      const cfg = readFileSync(join(cwd, '.docpath', 'config.yaml'), 'utf-8');
      assert.ok(!/document_scan_paths:/.test(cfg), 'no scan paths without flag');
      assert.ok(!/project_commands:/.test(cfg), 'no project_commands without flag');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
