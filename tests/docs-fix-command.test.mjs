import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-docs-fix-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(cwd, 'docs', 'features'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: docs-fix-test\ndocument_scan_paths:\n  - docs\n');
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style Rules\n\n## rule 1\n- details\n');

  // 1. Normal doc
  writeFileSync(
    join(cwd, 'docs', 'features', 'overview.md'),
    '# Feature Overview\n\nDetailed overview description.\n',
  );

  // 2. Doc missing H1 heading
  writeFileSync(
    join(cwd, 'docs', 'features', 'missing-h1.md'),
    'This document is missing an H1 heading.\n\n## Sub heading\nDetails here.\n',
  );

  // 3. Empty doc
  writeFileSync(join(cwd, 'docs', 'features', 'empty-guide.md'), '');

  // 4. Doc with broken link that can be redirected to overview.md
  writeFileSync(
    join(cwd, 'docs', 'features', 'guide.md'),
    '# User Guide\n\nSee [Overview Link](../features/old-overview-name.md) for details.\n',
  );

  // Initial scan to create base index
  execSync(`node ${BIN} docs scan`, { cwd, encoding: 'utf-8' });

  // 5. Create an unindexed doc after initial scan
  writeFileSync(
    join(cwd, 'docs', 'features', 'new-feature.md'),
    '# New Feature\n\nAdded after scan.\n',
  );

  return cwd;
}

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

describe('docpath docs doctor & fix commands', () => {
  it('diagnoses document issues with docs doctor', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('docs doctor', cwd);
      assert.match(out, /DocPath 活文档全景体检报告/);
      assert.match(out, /missing-h1\.md/);
      assert.match(out, /empty-guide\.md/);
      assert.match(out, /new-feature\.md/);
      assert.match(out, /可自愈/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('previews fixes with docs fix --dry-run without modifying files', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('docs fix --dry-run', cwd);
      assert.match(out, /\[dry-run\] 活文档自愈修复预览/);
      assert.match(out, /拟修复一级标题/);
      assert.match(out, /拟初始化空白文档/);

      // Verify empty-guide is still empty under dry-run
      const emptyContent = readFileSync(join(cwd, 'docs', 'features', 'empty-guide.md'), 'utf-8');
      assert.equal(emptyContent, '');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('automatically heals missing headings, empty docs, and unindexed files', () => {
    const cwd = mkWorkspace();
    try {
      const out = run('docs fix', cwd);
      assert.match(out, /活文档自愈修复完成/);
      assert.match(out, /修复\/补齐 H1 标题/);

      // Verify missing-h1.md now has an H1 heading
      const fixedH1 = readFileSync(join(cwd, 'docs', 'features', 'missing-h1.md'), 'utf-8');
      assert.match(fixedH1, /^# Missing H1\n/);

      // Verify empty-guide.md now has scaffolding
      const fixedEmpty = readFileSync(join(cwd, 'docs', 'features', 'empty-guide.md'), 'utf-8');
      assert.match(fixedEmpty, /^# Empty Guide\n/);

      // Verify docs-index.json now includes new-feature.md
      const indexJson = readFileSync(join(cwd, '.docpath', 'docs-index.json'), 'utf-8');
      assert.match(indexJson, /new-feature\.md/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports --agent structured output for doctor and fix', () => {
    const cwd = mkWorkspace();
    try {
      const doctorAgent = run('docs doctor --agent', cwd);
      assert.match(doctorAgent, /agent_view: docs_doctor/);
      assert.match(doctorAgent, /stats:/);

      const fixAgent = run('docs fix --agent', cwd);
      assert.match(fixAgent, /agent_view: docs_fix/);
      assert.match(fixAgent, /healed_headings:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
