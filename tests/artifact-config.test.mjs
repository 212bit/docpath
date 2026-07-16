/**
 * R-275: ArtifactConfig 死字段清理后的契约回归
 * - DEFAULT_ARTIFACT_CONFIG 只含有真实消费方的字段 (generate_md_views)
 * - 残留的旧用户配置字段不影响行为
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ARTIFACT_CONFIG, mergeArtifactConfig } from '../dist/types/config.js';

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
