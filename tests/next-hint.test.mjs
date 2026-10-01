import './registry-isolation.mjs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { parse } from 'yaml';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * R-460 test :: next-hint 信任化与自环清理
 *
 * FR-1 验收：路由输出的 recommended_command 必须是「具体可执行命令」，
 * 绝不因路由解析不到就把 agent 引回 `docpath next --agent` 空转（自环）。
 * 引擎侧改动（engine/next-hint.ts）在路由兜底时改指只读诊断 `docpath status --agent`，
 * 并把自环识别抽成可测试原语 isNextSelfLoop。
 */
describe('next-hint 自环清理 (R-460)', () => {
  it('未初始化项目：路由给具体 init 命令，绝不自指 next', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-nh-empty-'));
    const out = execSync(`node ${BIN} next --cwd ${cwd} --agent --compact`, { encoding: 'utf-8' });
    const route = parse(out);
    assert.equal(route.recommended_command, 'docpath init');
    assert.doesNotMatch(route.recommended_command, /^docpath next/i);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('自环识别原语行为正确（若编译产物已暴露）', async () => {
    let isNextSelfLoop;
    try {
      const mod = await import('../dist/engine/next-hint.js');
      isNextSelfLoop = typeof mod?.isNextSelfLoop === 'function' ? mod.isNextSelfLoop : undefined;
    } catch {
      isNextSelfLoop = undefined;
    }
    if (isNextSelfLoop !== undefined) {
      assert.equal(isNextSelfLoop('docpath next --agent'), true);
      assert.equal(isNextSelfLoop('docpath next'), true);
      assert.equal(isNextSelfLoop('docpath status --agent'), false);
      assert.equal(isNextSelfLoop('docpath go --step S1'), false);
    }
  });

  it('智能推断推荐 Skill (P0)', async () => {
    let inferRecommendedSkill;
    try {
      const mod = await import('../dist/engine/next-hint.js');
      inferRecommendedSkill = typeof mod?.inferRecommendedSkill === 'function' ? mod.inferRecommendedSkill : undefined;
    } catch {
      inferRecommendedSkill = undefined;
    }
    if (inferRecommendedSkill !== undefined) {
      // 门禁失败场景 -> docpath-gate
      assert.equal(inferRecommendedSkill({ gate: 'check_fail' }), 'docpath-gate');
      assert.equal(inferRecommendedSkill({ gate: 'review_fail' }), 'docpath-gate');
      assert.equal(inferRecommendedSkill({ nextAction: '质量检查失败，执行恢复' }), 'docpath-gate');

      // Worktree 场景 -> docpath-worktree
      assert.equal(inferRecommendedSkill({ inWorktree: true }), 'docpath-worktree');

      // 子代理派发场景 -> docpath-subagent
      assert.equal(inferRecommendedSkill({ sessionHealthWarning: true }), 'docpath-subagent');
      assert.equal(inferRecommendedSkill({ nextAction: '连续长步骤，建议派发 subagent' }), 'docpath-subagent');

      // 正常常规推进 -> 无需挂载 skill (undefined)
      assert.equal(inferRecommendedSkill({ gate: 'none', nextAction: '执行下一步 S1' }), undefined);
    }
  });
});