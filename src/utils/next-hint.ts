import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { generateAgentOutput } from './agent-output.js';

type NextHint = {
  next_action: string;
  recommended_command: string;
  exit_criteria: string;
};

function scalar(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function resolveNextHint(cwd: string): Promise<NextHint> {
  const route = parseYaml(await generateAgentOutput(cwd, { view: 'next' })) as Record<string, unknown> | null;
  return {
    next_action: scalar(route?.next_action, '运行 docpath next --agent 获取下一步路由'),
    recommended_command: scalar(route?.recommended_command, 'docpath next --agent'),
    exit_criteria: scalar(route?.exit_criteria, '按 recommended_command 完成下一步'),
  };
}

export async function emitNextHint(cwd: string): Promise<void> {
  let hint: NextHint;
  try {
    hint = await resolveNextHint(cwd);
  } catch (error) {
    hint = {
      next_action: '运行 docpath next --agent 获取下一步路由',
      recommended_command: 'docpath next --agent',
      exit_criteria: `next_hint fallback: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  console.log('');
  // R-304 输出契约：末行必须有意义——不再尾随空行（曾致链式脚本 tail 读空误判）。
  console.log(stringifyYaml({ next_hint: hint }, { lineWidth: 0 }).trimEnd());
}
