import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatActiveGuardrails, isSubstantiveDecision } from '../dist/utils/agent-output/context-injection.js';

describe('formatActiveGuardrails', () => {
  it('formats empty decisions array to empty array', () => {
    assert.deepEqual(formatActiveGuardrails([]), []);
  });

  it('converts prohibitions to 【严禁】 directives', () => {
    const decisions = [
      {
        id: 'ADR-20260923-004',
        taskId: 'T-worktree',
        category: 'worktree',
        conclusion: 'worktree 模块严禁使用 symlink 共享目录',
        createdAt: '2026-09-23T14:00:00.000Z',
      },
    ];
    const result = formatActiveGuardrails(decisions);
    assert.equal(result.length, 1);
    assert.equal(result[0], '【严禁】worktree 模块严禁使用 symlink 共享目录 (ADR-20260923-004)');
  });

  it('converts obligations to 【必须】 directives', () => {
    const decisions = [
      {
        id: 'ADR-20260923-005',
        taskId: 'T-check',
        category: 'risk',
        conclusion: 'check 风险复评升级 R2 时必须自动补齐 plan.md 避免漂移',
        createdAt: '2026-09-23T14:32:00.000Z',
      },
    ];
    const result = formatActiveGuardrails(decisions);
    assert.equal(result.length, 1);
    assert.equal(result[0], '【必须】check 风险复评升级 R2 时必须自动补齐 plan.md 避免漂移 (ADR-20260923-005)');
  });

  it('preserves pre-tagged directives and appends ADR ID', () => {
    const decisions = [
      {
        id: 'ADR-20260923-006',
        taskId: 'T-custom',
        category: 'general',
        conclusion: '【架构红线】核心引擎必须保持纯函数状态机',
        createdAt: '2026-09-23T15:00:00.000Z',
      },
    ];
    const result = formatActiveGuardrails(decisions);
    assert.equal(result.length, 1);
    assert.equal(result[0], '【架构红线】核心引擎必须保持纯函数状态机 (ADR-20260923-006)');
  });

  it('falls back to category or standard prefix for neutral decisions', () => {
    const decisions = [
      {
        id: 'ADR-20260910-002',
        taskId: 'T-install',
        category: 'arch.install',
        conclusion: '采用 universal 统一安装入口',
        createdAt: '2026-09-10T00:00:00.000Z',
      },
    ];
    const result = formatActiveGuardrails(decisions);
    assert.equal(result.length, 1);
    assert.equal(result[0], '【架构:install】采用 universal 统一安装入口 (ADR-20260910-002)');
  });
});

describe('isSubstantiveDecision', () => {
  it('filters out risk escalation transient audit logs', () => {
    assert.equal(isSubstantiveDecision({
      category: 'risk.escalation',
      decision: 'check 风险复评升级 R2 → R3',
    }), false);
    assert.equal(isSubstantiveDecision({
      category: 'risk.escalation',
      decision: 'check 风险复评升级 R1 → R2',
    }), false);
  });

  it('filters out policy skip logs and short placeholders', () => {
    assert.equal(isSubstantiveDecision({
      category: 'policy.skip',
      decision: '跳过 review',
    }), false);
    assert.equal(isSubstantiveDecision({
      category: 'architecture',
      decision: '方案 B',
    }), false);
  });

  it('accepts substantive architectural and design decisions', () => {
    assert.equal(isSubstantiveDecision({
      category: 'design-decision',
      decision: 'R-349: blocked closeout 用独立 agent.blocked 事件，收口路径写 review 事件前必须做 FSM 合法性预检',
    }), true);
    assert.equal(isSubstantiveDecision({
      category: 'architecture',
      decision: '采用 branch merge-mediated 隔离模型替代 symlink',
    }), true);
  });

  it('filters out boilerplate placeholders and generic non-decisions', () => {
    assert.equal(isSubstantiveDecision({
      category: 'architecture',
      decision: '待补充',
    }), false);
    assert.equal(isSubstantiveDecision({
      category: 'architecture',
      decision: '- 决策理由: 满足 backlog 声明的全部验收条件，且无额外依赖风险',
    }), false);
    assert.equal(isSubstantiveDecision({
      category: 'architecture',
      decision: '满足 backlog 声明的全部验收条件，且无额外依赖风险',
    }), false);
  });

  it('cleans up - 决策理由: prefix when formatting active guardrails', () => {
    const decisions = [
      {
        id: 'ADR-20260925-015',
        taskId: 'T-test',
        category: 'architecture',
        conclusion: '- 决策理由: 必须在写入 spec 前通过 write-spec 工具校验',
        createdAt: '2026-09-25T00:00:00.000Z',
      },
    ];
    const result = formatActiveGuardrails(decisions);
    assert.equal(result.length, 1);
    assert.equal(result[0], '【必须】必须在写入 spec 前通过 write-spec 工具校验 (ADR-20260925-015)');
  });
});

