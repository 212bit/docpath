import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let resolveGatePolicy;
let resolveEffectiveWorkflowProfile;
let gatePolicyForProfile;

before(async () => {
  ({ resolveGatePolicy, resolveEffectiveWorkflowProfile, gatePolicyForProfile } =
    await import('../dist/engine/workflow-profile.js'));
});

const REQUIRED_GATES = (policy) => [
  policy.requiresSpec,
  policy.requiresPlan,
  policy.requiresCheck,
  policy.requiresReview,
];

describe('risk × level gate policy (R-338 S2)', () => {
  it('keeps gatePolicyForProfile outputs unchanged (compat baseline)', () => {
    const quick = gatePolicyForProfile('quick');
    assert.equal(quick.requiresSpec, false);
    assert.equal(quick.requiresPlan, false);
    assert.equal(quick.requiresCheck, true);
    assert.equal(quick.requiresReview, false);
    assert.equal(quick.journalMode, 'minimal');

    const standard = gatePolicyForProfile('standard');
    assert.deepEqual(
      [standard.requiresSpec, standard.requiresPlan, standard.requiresCheck, standard.requiresReview, standard.journalMode, standard.liteCheck],
      [true, true, true, true, 'full', false],
    );

    const instant = gatePolicyForProfile('instant');
    assert.equal(instant.liteCheck, true);
    assert.equal(instant.requiresCheck, false);
  });

  it('defaults missing risk to R1 with no behavioral change', () => {
    const resolved = resolveGatePolicy({ profile: 'quick' });
    assert.equal(resolved.riskTier, 1);
    assert.equal(resolved.upgraded, false);
    assert.deepEqual(REQUIRED_GATES(resolved.policy), [false, false, true, false]);
  });

  it('upgrades quick to standard when risk reaches R2', () => {
    const resolved = resolveGatePolicy({ profile: 'quick', riskTier: 2 });
    assert.equal(resolved.effectiveProfile, 'standard');
    assert.equal(resolved.upgraded, true);
    assert.ok(resolved.reasons.some((r) => r.includes('R2')));
    assert.deepEqual(REQUIRED_GATES(resolved.policy), [true, true, true, true]);
  });

  it('upgrades instant to standard when risk reaches R2', () => {
    const resolved = resolveGatePolicy({ profile: 'instant', riskTier: 2 });
    assert.equal(resolved.effectiveProfile, 'standard');
    assert.equal(resolved.upgraded, true);
  });

  it('applies R3 floors: spec + plan required and liteCheck disabled', () => {
    const resolved = resolveGatePolicy({ profile: 'instant', riskTier: 3 });
    assert.equal(resolved.policy.requiresSpec, true);
    assert.equal(resolved.policy.requiresPlan, true);
    assert.equal(resolved.policy.liteCheck, false);
    assert.equal(resolved.policy.requiresCheck, true);
    assert.equal(resolved.policy.requiresReview, true);
    assert.ok(resolved.reasons.some((r) => r.includes('R3')));
    // instant 已因 R2+ 升级 standard（liteCheck 本为 false）；liteCheck 关闭地板对
    // 未来“liteCheck 但 R3”的组合生效 —— 此处验证最终态而非触发路径
  });

  it('standard profile keeps its shape at R1 but gains nothing extra', () => {
    const resolved = resolveGatePolicy({ profile: 'standard', riskTier: 1 });
    assert.equal(resolved.effectiveProfile, 'standard');
    assert.equal(resolved.upgraded, false);
    assert.deepEqual(REQUIRED_GATES(resolved.policy), [true, true, true, true]);
  });

  it('invariant: at the same level, gate strength is monotonically non-decreasing in risk', () => {
    for (const profile of ['quick', 'standard', 'strict', 'instant']) {
      for (const level of [0, 1, 2, 3]) {
        let prevCount = -1;
        let prevPolicy = null;
        for (const tier of [0, 1, 2, 3]) {
          const resolved = resolveGatePolicy({ profile, riskTier: tier, level });
          const count = REQUIRED_GATES(resolved.policy).filter(Boolean).length
            + (resolved.policy.journalMode === 'full' ? 1 : 0);
          assert.ok(
            count >= prevCount,
            `${profile} L${level} R${tier}: gate count ${count} < previous ${prevCount}`,
          );
          if (prevPolicy) {
            // 每一项要求都不得从 true 变 false
            for (const key of ['requiresSpec', 'requiresPlan', 'requiresCheck', 'requiresReview']) {
              if (prevPolicy[key] === true) {
                assert.equal(resolved.policy[key], true, `${profile} L${level} R${tier}: ${key} regressed`);
              }
            }
          }
          prevCount = count;
          prevPolicy = resolved.policy;
        }
      }
    }
  });

  it('resolveEffectiveWorkflowProfile reports R2+ as an upgrade reason for quick', () => {
    const resolution = resolveEffectiveWorkflowProfile({ profile: 'quick', riskTier: 3 });
    assert.equal(resolution.effectiveProfile, 'standard');
    assert.ok(resolution.reasons.some((r) => r.includes('R3')));
  });

  it('resolveEffectiveWorkflowProfile ignores risk for standard profile', () => {
    const resolution = resolveEffectiveWorkflowProfile({ profile: 'standard', riskTier: 3 });
    assert.equal(resolution.effectiveProfile, 'standard');
    assert.equal(resolution.upgraded, false);
    assert.deepEqual(resolution.reasons, []);
  });
});
