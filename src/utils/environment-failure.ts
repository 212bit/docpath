import { looksLikeMissingShellCommand } from './shell-missing-command.js';

/**
 * 检测子进程输出是否表明失败原因是环境问题（命令缺失、依赖未装等），而非代码问题。
 * 帮助 Agent 用最廉价的判定先排除工具链问题，避免用昂贵的 token 去诊断代码。
 *
 * dash/ash 写 `sh: 1: cmd: not found`，bash 写 `command not found`。两者都是命令缺失。
 */
export function looksLikeEnvironmentFailure(output: string): boolean {
  if (looksLikeMissingShellCommand(output)) return true;
  const envPatterns = [
    /command not found/i,
    /ENOENT.*node_modules/,
    /ENOENT.*\.bin/,
    /Cannot find module/i,
    /MODULE_NOT_FOUND/,
    /is not recognized as (an )?internal or external command/i,
    /no such file or directory.*node_modules/,
    /spawn.*ENOENT/,
    /sh: (line \d+: )?.+: command not found/,
    /pnpm: command not found/i,
    /npm: command not found/i,
    /yarn: command not found/i,
    /npx: command not found/i,
    /Permission denied.*node_modules/,
    /EACCES.*node_modules/,
    /attempt to write a readonly database/i,
    /SQLITE_READONLY/i,
    /read-only file system/i,
    /EROFS/i,
    /Permission denied.*projects\.sqlite/i,
    /EACCES.*projects\.sqlite/i,
  ];
  return envPatterns.some((pattern) => pattern.test(output));
}
