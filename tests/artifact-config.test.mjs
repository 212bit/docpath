/**
 * R-275: ArtifactConfig 死字段清理后的契约回归
 * - DEFAULT_ARTIFACT_CONFIG 只含有真实消费方的字段 (generate_md_views)
 * - 残留的旧用户配置字段不影响行为
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_ARTIFACT_CONFIG, mergeArtifactConfig } from '../dist/types/config.js';
import { readDocPathConfig, readDeclaredDocumentScanPaths } from '../dist/utils/config.js';

describe('artifact config (R-275)', () => {
  it('DEFAULT_ARTIFACT_CONFIG only declares fields with real consumers', () => {
    assert.deepEqual(Object.keys(DEFAULT_ARTIFACT_CONFIG), ['generate_md_views']);
    assert.equal(DEFAULT_ARTIFACT_CONFIG.generate_md_views, false);
  });

  it('mergeArtifactConfig keeps default and applies user override', () => {
    assert.equal(mergeArtifactConfig(undefined).generate_md_views, false);
    assert.equal(mergeArtifactConfig({}).generate_md_views, false);
    assert.equal(mergeArtifactConfig({ generate_md_views: true }).generate_md_views, true);
  });

  it('legacy removed fields in user config are inert (no throw, no behavior change)', () => {
    const merged = mergeArtifactConfig({
      generate_on_demand: true,
      archive_decisions_monthly: true,
      decisions_retention_days: 30,
      keep_workspace_views: ['current.md'],
    });
    assert.equal(merged.generate_md_views, false);
  });
});

describe('readDocPathConfig unification (R-294: yaml 优先 + json 回退)', () => {
  function mkConfigWorkspace({ yaml = null, json = null } = {}) {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-config-'));
    mkdirSync(join(cwd, '.docpath'), { recursive: true });
    if (yaml !== null) writeFileSync(join(cwd, '.docpath', 'config.yaml'), yaml, 'utf-8');
    if (json !== null) writeFileSync(join(cwd, '.docpath', 'config.json'), json, 'utf-8');
    return cwd;
  }

  it('sees yaml-only fields written by init (the S5 bug class)', async () => {
    const cwd = mkConfigWorkspace({
      yaml: 'document_scan_paths:\n  - docs\n  - guides\n',
    });
    try {
      const config = await readDocPathConfig(cwd);
      assert.deepEqual(config.document_scan_paths, ['docs', 'guides']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('merges both sources with yaml winning per top-level field and json filling gaps', async () => {
    const cwd = mkConfigWorkspace({
      yaml: 'document_scan_paths:\n  - from-yaml\n',
      json: JSON.stringify({
        document_scan_paths: ['from-json'],
        review_skill_gate: { enabled: false },
      }),
    });
    try {
      const config = await readDocPathConfig(cwd);
      assert.deepEqual(config.document_scan_paths, ['from-yaml'], '顶层冲突字段 yaml 胜');
      assert.deepEqual(config.review_skill_gate, { enabled: false }, 'json 独有字段回退填充仍可见');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('keeps json-only legacy workspaces fully working', async () => {
    const cwd = mkConfigWorkspace({
      json: JSON.stringify({ review_skill_gate: { enabled: true }, document_scan_paths: ['legacy'] }),
    });
    try {
      const config = await readDocPathConfig(cwd);
      assert.deepEqual(config.document_scan_paths, ['legacy']);
      assert.deepEqual(config.review_skill_gate, { enabled: true });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('readDeclaredDocumentScanPaths keeps declared semantics through the unified reader', async () => {
    const declaredInYaml = mkConfigWorkspace({
      yaml: 'document_scan_paths:\n  - docs\n',
      json: JSON.stringify({ document_scan_paths: ['shadowed'] }),
    });
    const jsonFallback = mkConfigWorkspace({
      yaml: 'project:\n  name: no-scan-paths\n',
      json: JSON.stringify({ document_scan_paths: ['from-json'] }),
    });
    const undeclared = mkConfigWorkspace({ yaml: 'project:\n  name: none\n' });
    try {
      assert.deepEqual(await readDeclaredDocumentScanPaths(declaredInYaml), ['docs']);
      assert.deepEqual(await readDeclaredDocumentScanPaths(jsonFallback), ['from-json']);
      assert.equal(await readDeclaredDocumentScanPaths(undeclared), null);
    } finally {
      for (const dir of [declaredInYaml, jsonFallback, undeclared]) rmSync(dir, { recursive: true, force: true });
    }
  });
});
