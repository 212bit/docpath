import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { generateAgentOutput } from './agent-output.js';
import { readCurrentState } from '../utils/workspace.js';
import { isInWorktree } from '../utils/worktree.js';

export type NextHint = {
  next_action: string;
  recommended_command: string;
  exit_criteria: string;
  recommended_skill?: string;
};

/**
 * 推断当前场景最推荐挂载的 Skill（按需引导，零心智负担）
 */
export function inferRecommendedSkill(options: {
  gate?: string;
  phase?: string;
  nextAction?: string;
  inWorktree?: boolean;
  sessionHealthWarning?: boolean;
}): string | undefined {
  const gate = options.gate || '';
  const action = options.nextAction || '';

  // 1. 门禁失败 / 状态机阻塞 → 推荐 docpath-gate
  if (['check_fail', 'review_fail', 'blocked'].includes(gate) || /失败|阻塞|门禁未通过|recover/i.test(action)) {
    return 'docpath-gate';
  }

  // 2. Git Worktree 并发环境 → 推荐 docpath-worktree
  if (options.inWorktree) {
    return 'docpath-worktree';
  }

  // 3. 上下文膨胀 / 会话看门狗建议轮换 → 推荐 docpath-subagent
  if (options.sessionHealthWarning || /subagent|派发|轮换/i.test(action)) {
    return 'docpath-subagent';
  }

  return undefined;
}

/**
 * R-460: 自环兜底。当路由无法解析出「具体可执行命令」（解析失败 / 空值 /
 * 或解析到命令本身又指回 next），`emitNextHint` 不再回指 `docpath next --agent`
 * （那只会让 Agent 再空转一轮），而是给出一条具体、只读的诊断命令
 * `docpath status --agent`，让 Agent 拿到当前状态快照后自行决定下一步。
 *
 * 与 `docpath next --agent` 语义互补：next 路由用于「路线不确定时重算下一步」；
 * status 诊断用于「路由算不出时先把状态读清楚、避免死循环 next」。
 */
function concreteFallback(): NextHint {
  return {
    next_action: '无法解析下一步路由，先运行只读诊断命令读取当前工作流状态',
    recommended_command: 'docpath status --agent',
    exit_criteria: 'docpath status --agent 已输出当前状态快照；据其执行下一步',
  };
}

function scalar(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** 推荐命令是否把「下一步」指回 next 本身（自环需要换成具体命令）。 */
export function isNextSelfLoop(command: string): boolean {
  return /^docpath\s+next(?:\s|$)/i.test(command.trim());
}

async function resolveNextHint(cwd: string): Promise<NextHint> {
  const rawOutput = await generateAgentOutput(cwd, { view: 'next' });
  const route = parseYaml(rawOutput) as Record<string, unknown> | null;
  const recommended = scalar(route?.recommended_command, '');
  const currentState = await readCurrentState(cwd).catch(() => null);
  const inWorktree = isInWorktree(cwd);
  const sessionHealthWarning = Boolean(
    route?.session_health
    && typeof route.session_health === 'object'
    && (route.session_health as Record<string, unknown>).rotate_recommended,
  );

  const baseHint: NextHint = (!recommended || isNextSelfLoop(recommended))
    ? concreteFallback()
    : {
        next_action: scalar(route?.next_action, '运行 docpath status --agent 获取当前状态'),
        recommended_command: recommended,
        exit_criteria: scalar(route?.exit_criteria, '按 recommended_command 完成下一步'),
      };

  const skill = inferRecommendedSkill({
    gate: currentState?.gate,
    phase: currentState?.phase,
    nextAction: baseHint.next_action,
    inWorktree,
    sessionHealthWarning,
  });

  if (skill) {
    baseHint.recommended_skill = skill;
  }

  return baseHint;
}

export async function emitNextHint(cwd: string): Promise<void> {
  let hint: NextHint;
  try {
    hint = await resolveNextHint(cwd);
  } catch (error) {
    hint = {
      ...concreteFallback(),
      next_action: `无法解析下一步路由，用只读诊断命令确认状态（解析异常: ${error instanceof Error ? error.message : String(error)}）`,
    };
  }

  console.log('');
  // R-304 输出契约：末行必须有意义——不再尾随空行（曾致链式脚本 tail 读空误判）。
  console.log(stringifyYaml({ next_hint: hint }, { lineWidth: 0 }).trimEnd());
}