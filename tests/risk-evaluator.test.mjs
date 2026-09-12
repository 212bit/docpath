import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let evaluateTaskRisk;
let normalizeRiskPolicy;
let riskPolicyFromConfig;
let maxRiskTier;
let atLeastRiskTier;
let riskTierName;

before(async () => {
  ({ evaluateTaskRisk, normalizeRiskPolicy, riskPolicyFromConfig, maxRiskTier, atLeastRiskTier, riskTierName } =
    await import('../dist/engine/risk.js'));
});

describe('risk evaluator (R-338 S1)', () => {
  it('defaults to R1 when no signals present', () => {
    const verdict = evaluateTaskRisk({});
    assert.equal(verdict.tier, 1);
    assert.deepEqual(verdict.reasons, []);
  });

  it('escalates to R3 for CI/CD path changes', () => {
    const verdict = evaluateTaskRisk({ files: ['.github/workflows/ci.yml'] });
    assert.equal(verdict.tier, 3);
    assert.ok(verdict.reasons.some((r) => r.includes('CI/CD')));
  });

  it('escalates to R3 for migration and schema files', () => {
    assert.equal(evaluateTaskRisk({ files: ['db/migrations/001_init.sql'] }).tier, 3);
    assert.equal(evaluateTaskRisk({ files: ['src/api/schema.proto'] }).tier, 3);
    assert.equal(evaluateTaskRisk({ files: ['openapi.yaml'] }).tier, 3);
  });

  it('escalates to R3 for core engine changes', () => {
    assert.equal(evaluateTaskRisk({ files: ['src/engine/workflow-profile.ts'] }).tier, 3);
  });

  it('escalates to R2 for lifecycle command changes', () => {
    const verdict = evaluateTaskRisk({ files: ['src/commands/check.ts'] });
    assert.equal(verdict.tier, 2);
    assert.ok(verdict.reasons.some((r) => r.includes('生命周期命令')));
  });

  it('escalates to R0 for document-only changes', () => {
    const verdict = evaluateTaskRisk({ files: ['docs/guide.md'], text: '更新说明文档' });
    assert.equal(verdict.tier, 1, 'docs are not auto-R0 without explicit signal; stays default');
    assert.deepEqual(verdict.reasons, []);
  });

  it('escalates via text keywords (contract → R2, migration → R3)', () => {
    assert.equal(evaluateTaskRisk({ text: '调整 API 契约' }).tier, 2);
    assert.equal(evaluateTaskRisk({ text: '数据库迁移脚本' }).tier, 3);
  });

  it('escalates to R2 when file count reaches blast-radius threshold', () => {
    const files = Array.from({ length: 20 }, (_, i) => `src/feature/file${i}.ts`);
    const verdict = evaluateTaskRisk({ files });
    assert.equal(verdict.tier, 2);
    assert.ok(verdict.reasons.some((r) => r.includes('影响面阈值')));
  });

  it('honors config overrides for path globs and keywords', () => {
    const policy = normalizeRiskPolicy(riskPolicyFromConfig({
      critical_patterns: ['infra/terraform/**'],
      high_keywords: ['部署'],
    }));
    assert.equal(evaluateTaskRisk({ files: ['infra/terraform/main.tf'], policy }).tier, 3);
    assert.equal(evaluateTaskRisk({ text: '调整部署脚本', policy }).tier, 2);
    assert.equal(evaluateTaskRisk({ text: '普通修改', policy }).tier, 1);
  });

  it('takes the maximum across signals', () => {
    const verdict = evaluateTaskRisk({ files: ['src/commands/check.ts', 'README.md'], text: '涉及 API 契约' });
    assert.equal(verdict.tier, 2);
  });

  it('atLeastRiskTier never lowers a recorded tier (只升不降)', () => {
    assert.equal(atLeastRiskTier(3, 1), 3);
    assert.equal(atLeastRiskTier(1, 3), 3);
    assert.equal(atLeastRiskTier(null, 2), 2);
    assert.equal(atLeastRiskTier(undefined, 0), 1, 'missing record falls back to R1 baseline');
  });

  it('maxRiskTier and riskTierName behave sanely', () => {
    assert.equal(maxRiskTier(0, 2), 2);
    assert.equal(riskTierName(3), 'R3 高危');
    assert.equal(riskTierName(null), 'R1 常规');
  });
});
