import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatActiveGuardrails } from '../dist/utils/agent-output/context-injection.js';

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
