/**
 * docpath help-me - 上下文感知帮助命令
 *
 * 根据当前工作流状态提供相关建议和命令。
 */

import { showContextualHelp } from '../utils/contextual-help.js';

interface HelpMeOptions {
  cwd: string;
}

export async function helpMeCommand(options: HelpMeOptions): Promise<void> {
  await showContextualHelp(options.cwd);
}
