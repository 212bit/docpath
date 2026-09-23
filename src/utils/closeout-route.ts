/**
 * 收口路线推荐（R-363）。
 *
 * 背景：step-pass / go 原先无条件把 `docpath quick-done` 列为「推荐收口」首项，
 * 不看本次实际 changed files。但 quick-done 走 quick 通道，受 quick-guard 约束
 * （RISKY_PATH_PATTERNS + max_changed_files）。改动命中核心路径（如 src/engine/**）时
 * quick 通道在 done 阶段必拒，顺着「推荐」走会白绕一圈。
 *
 * 本模块按实际改动做 scope 分类（复用 quick-guard 的 evaluateQuickScope，与 done 阶段
 * 真正使用的判定同源，避免「推荐」与「门禁」两套口径漂移），据此产出收口路线：
 *   - scope 通过（quick 可行）→ quick-done 作为推荐项；
 *   - scope 不通过（quick 必拒）→ 不出现 quick-done，主推 check -> review -> agent done，
 *     并附上被拒原因。
 */

import { evaluateQuickScope } from '../engine/quick-guard.js';

export interface CloseoutRoute {
  /** 是否可走 quick-done 一键收口（由实际改动 scope 决定）。 */
  quickDoneAllowed: boolean;
  /** 建议的主推收口命令。 */
  recommendedCommand: string;
  /** 逐行渲染的收口路线（调用方直接 console.log）。 */
  lines: string[];
}

/**
 * 按实际 changed files 判定收口路线。
 *
 * 注意：scope 判定依赖 git status，非 git 仓/读取失败时 evaluateQuickScope 返回
 * guardedFiles 为空、reasons 为空 → allowed=true，即回落到「推荐 quick-done」的旧行为。
 * 这是有意的保守选择：无 scope 信息时不擅自降级推荐。
 */
export function resolveCloseoutRoute(cwd: string): CloseoutRoute {
  const verdict = evaluateQuickScope(cwd);
  const quickDoneAllowed = verdict.allowed;

  if (quickDoneAllowed) {
    return {
      quickDoneAllowed,
      recommendedCommand: 'docpath quick-done',
      lines: [
        '    - 一键快速收口 (门禁 + 评审 + 提交准备): `docpath quick-done` (推荐)',
        '    - 逐步验证门禁: `docpath check` -> `docpath review` -> `docpath agent done`',
      ],
    };
  }

  // quick 在 done 阶段必拒：不推荐它，并说明原因（取前 3 条，避免刷屏）
  const reasons = verdict.reasons.slice(0, 3);
  const more = verdict.reasons.length > reasons.length ? `（另有 ${verdict.reasons.length - reasons.length} 项）` : '';
  return {
    quickDoneAllowed,
    recommendedCommand: 'docpath check',
    lines: [
      '    - 逐步验证门禁 (推荐): `docpath check` -> `docpath review` -> `docpath agent done`',
      `    - ⚠️  不可用 quick-done：改动超出 quick 通道范围，done 阶段会被拒${more}`,
      ...reasons.map((reason) => `        · ${reason}`),
    ],
  };
}

/** 渲染收口路线为可打印文本块（含标题行）。 */
export function renderCloseoutRoute(route: CloseoutRoute): string {
  return ['', '👉  推荐收尾路线:', ...route.lines].join('\n');
}
