import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-docs-lifecycle-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(cwd, 'docs', 'features'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: docs-lifecycle-test\ndocument_scan_paths:\n  - docs\n');
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style Rules\n\n## rule 1\n- details\n');

  // 1. Active doc
  writeFileSync(
    join(cwd, 'docs', 'features', 'active-feature.md'),
    '---\nstatus: active\n---\n\n# Active Feature\n\nActive feature documentation.\n',
  );

  // 2. WIP doc
  writeFileSync(
    join(cwd, 'docs', 'features', 'draft-feature.md'),
    '---\nstatus: wip\n---\n\n# Draft Feature\n\nWIP feature description.\n',
  );

  // 3. Deprecated doc
  writeFileSync(
    join(cwd, 'docs', 'features', 'old-feature.md'),
    '---\nstatus: deprecated\ndeprecated_by: "docs/features/active-feature.md"\n---\n\n# Old Feature\n\nThis feature is deprecated.\n',
  );

  // 4. Doc referencing deprecated doc
  writeFileSync(
    join(cwd, 'docs', 'features', 'caller.md'),
    '---\nstatus: active\n---\n\n# Caller Feature\n\nSee [Old Feature](./old-feature.md) for background.\n',
  );

  // Initial scan to build docs-index.json
  execSync(`node ${BIN} docs scan`, { cwd, encoding: 'utf-8' });

  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('docpath docs lifecycle & archive commands', () => {
  it('detects lifecycle status and deprecated references in docs doctor', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('docs doctor', cwd);
      assert.match(out, /生命周期: 🟢 Active: \d+ \| 🟡 WIP: 1 \| 🔴 Deprecated: 1/);
      assert.match(out, /废弃引用 \(Deprecated Reference\)/);
      assert.match(out, /caller\.md/);
      assert.match(out, /引用了已废弃\/归档文档/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('updates document status with docs status command', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('docs status docs/features/draft-feature.md active', cwd);
      assert.match(out, /文档状态已更新.*\[ACTIVE\]/);

      const content = readFileSync(join(cwd, 'docs', 'features', 'draft-feature.md'), 'utf-8');
      assert.match(content, /status: active/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('archives documents safely with docs archive command', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('docs archive docs/features/active-feature.md --by docs/features/draft-feature.md --reason "Replaced by draft"', cwd);
      assert.match(out, /已归档文档.*docs\/archive/);
      assert.match(out, /Deprecated/);

      // Original file removed from original path
      assert.strictEqual(existsSync(join(cwd, 'docs', 'features', 'active-feature.md')), false);

      // Moved to archive
      const dateStr = new Date().toISOString().slice(0, 7);
      const archivePath = join(cwd, 'docs', 'archive', dateStr, 'active-feature.md');
      assert.strictEqual(existsSync(archivePath), true);

      const content = readFileSync(archivePath, 'utf-8');
      assert.match(content, /status: deprecated/);
      assert.match(content, /deprecated_by: docs\/features\/draft-feature\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('detects and heals code path drift with docs doctor and fix', () => {
    const cwd = mkWorkspace();
    try {
      // Create real source file in new location
      mkdirSync(join(cwd, 'src', 'engine'), { recursive: true });
      writeFileSync(join(cwd, 'src', 'engine', 'state-machine.ts'), 'export const state = 1;\n');

      // Create doc referencing old moved path `src/utils/state-machine.ts`
      writeFileSync(
        join(cwd, 'docs', 'features', 'drift-doc.md'),
        '# Drift Doc\n\nReference to old path: `src/utils/state-machine.ts` in details.\n',
      );

      const doctorOut = run('docs doctor', cwd);
      assert.match(doctorOut, /代码引用漂移 \(Code Drift\)/);
      assert.match(doctorOut, /drift-doc\.md/);
      assert.match(doctorOut, /state-machine\.ts/);

      // Run docs fix to auto-heal
      const fixOut = run('docs fix', cwd);
      assert.match(fixOut, /活文档自愈修复完成/);

      const fixedContent = readFileSync(join(cwd, 'docs', 'features', 'drift-doc.md'), 'utf-8');
      assert.match(fixedContent, /`src\/engine\/state-machine\.ts`/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('filters document list by lifecycle status', () => {
    const cwd = mkWorkspace();
    try {
      const activeOut = run('docs list --status active', cwd);
      assert.match(activeOut, /过滤状态: active/);
      assert.match(activeOut, /- docs\/features\/active-feature\.md/);
      assert.doesNotMatch(activeOut, /- docs\/features\/old-feature\.md/);

      const depOut = run('docs list --status deprecated', cwd);
      assert.match(depOut, /过滤状态: deprecated/);
      assert.match(depOut, /- docs\/features\/old-feature\.md/);
      assert.doesNotMatch(depOut, /- docs\/features\/active-feature\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
