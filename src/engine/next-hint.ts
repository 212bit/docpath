import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { generateAgentOutput } from './agent-output.js';

type NextHint = {
  next_action: string;
  recommended_command: string;
  exit_criteria: string;
};

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
  const route = parseYaml(
    await generateAgentOutput(cwd, { view: 'next' }),
  ) as Record<string, unknown> | null;
  const recommended = scalar(route?.recommended_command, '');
  // 解析到空洞 / 自环 → 兜底到只读诊断，避免把 agent 引回 next 空转。
  if (!recommended || isNextSelfLoop(recommended)) {
    return concreteFallback();
  }
  return {
    next_action: scalar(route?.next_action, '运行 docpath status --agent 获取当前状态'),
    recommended_command: recommended,
    exit_criteria: scalar(route?.exit_criteria, '按 recommended_command 完成下一步'),
  };
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