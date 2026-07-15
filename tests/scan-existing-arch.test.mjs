import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mod;

before(async () => {
  mod = await import('../dist/utils/scan-existing-arch.js');
});

function makeProject() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-arch-'));
  execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@t.test'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd, stdio: 'ignore' });
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo-app', scripts: { test: 'pnpm test' } }));
  mkdirSync(join(cwd, 'src'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'index.ts'), 'export {}');
  writeFileSync(join(cwd, 'README.md'), '# demo');
  return cwd;
}

describe('scan-existing-arch (S3 / FR-2+FR-6)', () => {
  it('buildScanArchitectureContent produces non-template arch with real tree + tech', async () => {
    const cwd = makeProject();
    try {
      const content = await mod.buildScanArchitectureContent(cwd);
      assert.ok(content, 'content should be non-null for a real project');
      const c = content;
      assert.ok(c.includes('# 项目架构'), 'has title');
      assert.ok(c.includes('## 目录结构'), 'has dir-tree section');
      assert.ok(c.includes('src/'), 'has real src entry');
      assert.ok(!c.includes('{项目一句话描述}'), 'is not the template placeholder');
      assert.ok(c.includes('## 核心技术选型') || c.includes('## 架构决策记录'), 'has tech/ADR section');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('writeScanArchitecture writes when file absent (带保留地初写)', async () => {
    const cwd = makeProject();
    try {
      const res = await mod.writeScanArchitecture(cwd, false);
      assert.equal(res.outcome, 'written');
      assert.ok(existsSync(res.path), 'file written');
      const written = readFileSync(res.path, 'utf-8');
      assert.ok(written.includes('## 目录结构'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('writeScanArchitecture SKIPS existing file without --force (§4.b)', async () => {
    const cwd = makeProject();
    try {
      // 预先放一份既有 learn/ADR 段落
      mkdirSync(join(cwd, '.docpath', 'rules'), { recursive: true });
      const existing = '# 项目架构\n\n## 来自 learn 的经验\n- ADR-X: 既有决策\n';
      writeFileSync(join(cwd, '.docpath', 'rules', 'architecture.md'), existing);

      const res = await mod.writeScanArchitecture(cwd, false);
      assert.equal(res.outcome, 'skipped');
      assert.match(res.reason || '', /跳过；--force 可覆盖/);
      // 原内容未被改写（带保留）
      const after = readFileSync(res.path, 'utf-8');
      assert.equal(after, existing, 'existing ADR/learn content must be preserved');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('writeScanArchitecture OVERWRITES existing when --force', async () => {
    const cwd = makeProject();
    try {
      mkdirSync(join(cwd, '.docpath', 'rules'), { recursive: true });
      writeFileSync(join(cwd, '.docpath', 'rules', 'architecture.md'), 'OLD\n');
      const res = await mod.writeScanArchitecture(cwd, true);
      assert.equal(res.outcome, 'written');
      const after = readFileSync(res.path, 'utf-8');
      assert.notEqual(after, 'OLD\n', 'force overwrites');
      assert.ok(after.includes('## 目录结构'), 'written scan content');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('writeScanArchitecture noop when nothing detected', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-arch-empty-'));
    execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
    try {
      const res = await mod.writeScanArchitecture(cwd, false);
      assert.ok(res.outcome === 'noop' || res.outcome === 'written', `got ${res.outcome}`);
      // 空项目要么 noop 要么仅有占位 → 不应抛错
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
