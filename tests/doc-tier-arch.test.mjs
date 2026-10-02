import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferDocumentTier,
  buildProjectDocumentEntry,
  parseFrontmatterMetadata,
} from '../dist/utils/document-index.js';

test('inferDocumentTier identifies core and architecture docs by heuristics', () => {
  assert.deepEqual(inferDocumentTier('docs/architecture/overview.md'), { is_core: true, tier: 'architecture' });
  assert.deepEqual(inferDocumentTier('docs/arch/system-design.md'), { is_core: true, tier: 'architecture' });
  assert.deepEqual(inferDocumentTier('docs/design/rfc-001.md'), { is_core: true, tier: 'architecture' });
  assert.deepEqual(inferDocumentTier('spec/architecture.md'), { is_core: true, tier: 'architecture' });
  assert.deepEqual(inferDocumentTier('rules/style.md'), { is_core: true, tier: 'core' });
  assert.deepEqual(inferDocumentTier('.docpath/rules/workflow.md'), { is_core: true, tier: 'core' });
  assert.deepEqual(inferDocumentTier('AGENTS.md'), { is_core: true, tier: 'core' });
  assert.deepEqual(inferDocumentTier('README.md'), { is_core: true, tier: 'core' });
  assert.deepEqual(inferDocumentTier('decisions.md'), { is_core: true, tier: 'core' });

  // Standard docs
  assert.deepEqual(inferDocumentTier('docs/features/login.md'), { is_core: false, tier: 'standard' });
  assert.deepEqual(inferDocumentTier('docs/guides/getting-started.md'), { is_core: false, tier: 'standard' });

  // Archive docs
  assert.deepEqual(inferDocumentTier('tasks/done/T-1/spec.md'), { is_core: false, tier: 'archive' });
  assert.deepEqual(inferDocumentTier('docs/archive/2026-01/old.md'), { is_core: false, tier: 'archive' });
});

test('inferDocumentTier respects frontmatter declarations', () => {
  assert.deepEqual(inferDocumentTier('docs/features/custom.md', 'core'), { is_core: true, tier: 'core' });
  assert.deepEqual(inferDocumentTier('docs/features/custom.md', 'architecture'), { is_core: true, tier: 'architecture' });
  assert.deepEqual(inferDocumentTier('docs/architecture/draft.md', 'standard'), { is_core: false, tier: 'standard' });
  assert.deepEqual(inferDocumentTier('docs/features/custom.md', undefined, true), { is_core: true, tier: 'core' });
});

test('buildProjectDocumentEntry embeds is_core and tier metadata', () => {
  const entry = buildProjectDocumentEntry({
    path: 'docs/architecture/gateway.md',
    content: '# Gateway Architecture\n\nHigh-performance API Gateway design.',
    size: 200,
    mtime: new Date(),
  });

  assert.equal(entry.is_core, true);
  assert.equal(entry.tier, 'architecture');
  assert.equal(entry.title, 'Gateway Architecture');
});

test('docpath doc arch and search prioritization CLI integration', async () => {
  const { execSync } = await import('child_process');
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');

  const BIN = new URL('../dist/index.js', import.meta.url).pathname;
  const cwd = mkdtempSync(join(tmpdir(), 'dp-arch-test-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(cwd, 'docs', 'architecture'), { recursive: true });
  mkdirSync(join(cwd, 'docs', 'features'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: arch-test\ndocument_scan_paths:\n  - README.md\n  - docs\n');
  writeFileSync(join(cwd, 'README.md'), '# Main Architecture\n\nSystem entrance overview.\n');
  writeFileSync(join(dp, 'rules', 'engine.md'), '# Engine Rules\n\nExecution protocols.\n');
  writeFileSync(
    join(cwd, 'docs', 'architecture', 'system.md'),
    '# Core System Architecture\n\nDetailed breakdown of core components.\n',
  );
  writeFileSync(
    join(cwd, 'docs', 'features', 'login.md'),
    '# User Login Feature\n\nOrdinary feature guide.\n',
  );

  // 1. Test docpath doc arch CLI execution
  const archOut = execSync(`node ${BIN} doc arch --cwd ${cwd}`, { encoding: 'utf-8' });
  assert.ok(archOut.includes('核心架构与重要文档全景大盘'));
  assert.ok(archOut.includes('docs/architecture/system.md'));
  assert.ok(archOut.includes('rules/engine.md'));
  assert.ok(archOut.includes('README.md'));

  // 2. Test docpath doc arch --json
  const jsonOut = execSync(`node ${BIN} doc arch --json --cwd ${cwd}`, { encoding: 'utf-8' });
  const parsedJson = JSON.parse(jsonOut);
  assert.ok(parsedJson.total_core_count >= 3);
  assert.ok(parsedJson.categories.architecture.some((d) => d.path === 'docs/architecture/system.md'));

  // 3. Test search prioritization with core boost
  const searchOut = execSync(`node ${BIN} doc search "System" --cwd ${cwd}`, { encoding: 'utf-8' });
  const cleanSearchOut = searchOut.replace(/\u001b\[[0-9;]*m/g, '');
  assert.ok(cleanSearchOut.includes('ARCH') || cleanSearchOut.includes('CORE'));
  assert.ok(cleanSearchOut.includes('docs/architecture/system.md'));

  rmSync(cwd, { recursive: true, force: true });
});

test('diagnoseDocumentHealth applies strict standards to core architecture docs', async () => {
  const { diagnoseDocumentHealth, renderDocHealthTable } = await import('../dist/utils/docs-doctor.js');
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');

  const cwd = mkdtempSync(join(tmpdir(), 'dp-arch-health-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(cwd, 'docs', 'architecture'), { recursive: true });

  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: arch-health\ndocument_scan_paths:\n  - docs\n');

  // Core doc missing summary and older than 90 days
  const archFile = join(cwd, 'docs', 'architecture', 'overview.md');
  writeFileSync(archFile, '# Overview\n\n');
  const pastTime = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
  utimesSync(archFile, pastTime, pastTime);

  const report = await diagnoseDocumentHealth(cwd);
  const coreIssues = report.issues.filter((i) => i.file === 'docs/architecture/overview.md');
  assert.ok(coreIssues.some((i) => i.type === 'missing-heading' && i.message.includes('缺失段落概述')));
  assert.ok(coreIssues.some((i) => i.type === 'stale-unreviewed' && i.message.includes('90 天')));

  const table = renderDocHealthTable(report);
  assert.ok(table.includes('核心架构治理 (Core & Arch Health)'));

  rmSync(cwd, { recursive: true, force: true });
});
