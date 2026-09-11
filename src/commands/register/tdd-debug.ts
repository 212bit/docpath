import type { CAC } from 'cac';
import { traceCommand } from '../trace.js';

export function registerTddDebugCommands(cli: CAC): void {

  cli.command('trace [action] [matrixAction]', 'Trace & analyze agent command behavior — show|session|health|anomaly|ceremony|clear|enable|disable|matrix')
    .option('--cwd <path>', '项目目录')
    .option('--session [id]', '过滤 Session ID')
    .option('--limit <n>', '只显示最近的 n 条记录 (默认 50)')
    .option('--json', '输出 JSON 格式')
    .action(async (action: string | undefined, matrixAction: string | undefined, options: { cwd?: string; session?: string; limit?: string; json?: boolean }) => {
      const cwd = options.cwd || process.cwd();
      const validActions = ['show', 'session', 'health', 'anomaly', 'ceremony', 'clear', 'enable', 'disable', 'matrix'] as const;
      const act = action && validActions.includes(action as typeof validActions[number])
        ? (action as typeof validActions[number])
        : 'show';
      const validMatrixActions = ['status', 'generate', 'check'] as const;
      const matrixAct = matrixAction && validMatrixActions.includes(matrixAction as typeof validMatrixActions[number])
        ? (matrixAction as typeof validMatrixActions[number])
        : undefined;
      
      const limitVal = options.limit ? parseInt(options.limit, 10) : 50;

      await traceCommand({
        cwd,
        action: act,
        matrixAction: matrixAct,
        session: options.session,
        limit: isNaN(limitVal) ? 50 : limitVal,
        json: !!options.json
      });
    });
}
