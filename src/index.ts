#!/usr/bin/env node

/** DocPath CLI — 文径工作流引擎 */

import { cac } from 'cac';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerCommands } from './commands/register.js';
import { installDirtyGuardBlockHook } from './engine/gate-blocked.js';
import { renderAdvancedHelp, renderDefaultHelp, renderDeprecatedHelp } from './commands/register/command-metadata.js';
import { resolveSessionContext, verifySessionCwd } from './utils/session.js';
import { DocPathError } from './utils/error-helpers.js';
import { isTraceEnabled, writeTraceEntry, isTraceEnabledSync, writeTraceEntrySync } from './utils/trace.js';

installDirtyGuardBlockHook();

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(
  await readFile(join(__dirname, '..', 'package.json'), 'utf-8')
);

function createCli() {
  const cli = cac('docpath');
  cli.version(pkg.version);
  cli.help();
  registerCommands(cli);
  return cli;
}

/** 进程内复用 CLI 时，把 process.exit 变成可捕获的控制流，避免拖垮宿主进程。 */
class CliExit extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.name = 'CliExit';
    this.code = code;
  }
}

/**
 * 执行一次 CLI。argv 形态与 process.argv 相同：`[node, entry, ...args]`。
 * 直接 `node dist/index.js` 与 `bin/docpath.js` 都会走到这里；测试 worker 复用同一入口，
 * 从而省掉每个用例冷启动 Node 的成本。每次调用使用新的 cac 实例。
 */
export async function runCli(argv: string[]): Promise<number> {
  const originalExit = process.exit;
  const previousArgv = process.argv;
  const previousExitCode = process.exitCode;
  process.argv = argv.slice();
  process.exitCode = undefined;
  process.exit = ((code?: number) => {
    throw new CliExit(typeof code === 'number' ? code : 0);
  }) as typeof process.exit;

  try {
    if (process.env.DOCPATH_RESET_RUNNER_PROBE === '1') {
      delete process.env.DOCPATH_RESET_RUNNER_PROBE;
      const { resetRunnerProbeCacheForTest } = await import('./commands/check/runners.js');
      resetRunnerProbeCacheForTest();
    }
    return await executeCli();
  } catch (err) {
    if (err instanceof CliExit) return err.code;
    console.error(err instanceof Error ? (err.stack || err.message) : String(err));
    return 1;
  } finally {
    process.exit = originalExit;
    process.argv = previousArgv;
    process.exitCode = previousExitCode;
  }
}

function handleCuratedHelp(argv: string[]): boolean {
  const args = argv.slice(2);
  const first = args[0];
  const second = args[1];
  const isGlobalHelp = args.length === 0 || first === '--help' || first === '-h';
  if (isGlobalHelp) {
    process.stdout.write(renderDefaultHelp(pkg.version));
    return true;
  }
  if (first === 'help') {
    if (second === 'advanced') {
      process.stdout.write(renderAdvancedHelp(pkg.version));
      return true;
    }
    if (second === 'deprecated') {
      process.stdout.write(renderDeprecatedHelp(pkg.version));
      return true;
    }
    process.stdout.write(renderDefaultHelp(pkg.version));
    return true;
  }
  return false;
}

type CliPositional = { required?: boolean; variadic?: boolean };

function getPositionalAllowance(
  matchedCommand: { args?: CliPositional[] } | undefined,
): { declaredCount: number; hasVariadic: boolean } {
  const args = matchedCommand?.args || [];
  return {
    declaredCount: args.length,
    hasVariadic: args.some((arg) => arg.variadic),
  };
}

// fail-loud：先解析不执行，校验命令合法性后再运行。
// - 未知 flag / 缺失必填参数：cac 在 runMatchedCommand 内抛 CACError → 被捕获并清晰报错
// - 未知命令：给了位置参数却没有命令匹配 → 显式报错
// 任何一种都以非零码退出，绝不静默忽略。
async function executeCli(): Promise<number> {
  const cli = createCli();
  try {
  if (handleCuratedHelp(process.argv)) {
    process.exit(0);
  }

  // R-304: 参数含换行会让 cac 解析错乱并直接输出 help（实测打崩），显式 fail-loud。
  // 多行内容请走 --stdin / --body-file；--content 为已知多行合法通道，豁免。
  const rawArgs = process.argv.slice(2);
  const newlineArgIndex = rawArgs.findIndex((arg, i) => arg.includes('\n') && rawArgs[i - 1] !== '--content');
  if (newlineArgIndex !== -1) {
    console.error('❌  参数包含换行符（cac 解析会错乱）。多行内容请使用 --stdin 或 --body-file。');
    process.exit(1);
  }

  const parsed = cli.parse(process.argv, { run: false });

  // --help / --version 已在 parse() 内输出，直接结束。
  if (!cli.matchedCommand && (cli.options.help || cli.options.version)) {
    process.exit(0);
  }

  if (!cli.matchedCommand && parsed.args.length > 0) {
    console.error(`❌  未知命令: ${parsed.args[0]}`);
    console.error('    运行 `docpath --help` 查看可用命令。');
    process.exit(1);
  }

  if (cli.matchedCommand) {
    const { declaredCount, hasVariadic } = getPositionalAllowance(
      cli.matchedCommand as { args?: CliPositional[] },
    );
    const extraPositionals = hasVariadic ? [] : parsed.args.slice(declaredCount);
    if (extraPositionals.length > 0) {
      console.error(`❌  命令 \`${cli.matchedCommand.rawName}\` 收到了未声明的位置参数: ${extraPositionals.join(' ')}`);
      console.error('    运行 `docpath --help` 查看用法。');
      process.exit(1);
    }
  }

  let traceCwd = process.cwd();
  let cmdName = '';
  let cmdArgs: string[] = [];

  if (cli.matchedCommand) {
    cmdName = cli.matchedCommand.rawName.split(' ')[0];
    cmdArgs = process.argv.slice(3);
    const isBypassed = ['worktree', 'projects', 'init', 'config'].includes(cmdName);
    if (!isBypassed) {
      const cwd = (parsed.options.cwd as string) || process.cwd();
      traceCwd = cwd;
      const sessionOption = parsed.options.session as string | undefined;
      const { sessionId, source } = resolveSessionContext(sessionOption, { autoInfer: true });
      if (source === 'auto' && !process.env.DOCPATH_SESSION) {
        process.env.DOCPATH_SESSION = sessionId;
      }
      await verifySessionCwd(cwd, sessionId);
    }
  }

  const startMs = Date.now();
  const originalExit = process.exit;
  let traceWritten = false;

  const writeTraceBeforeExit = (code: number) => {
    if (traceWritten || !cmdName || ['trace', 'projects', 'init'].includes(cmdName)) return;
    traceWritten = true;
    try {
      const enabled = isTraceEnabledSync(traceCwd);
      if (enabled) {
        const durationMs = Date.now() - startMs;
        writeTraceEntrySync(
          traceCwd,
          {
            cmd: cmdName,
            args: cmdArgs,
            durationMs,
            exitCode: code,
          },
          // R-319: 透传 --session 选项值（trace 内部经 resolveSessionContext 统一解析），
          // 使 trace 的 session 字段与 verifySessionCwd 使用同一会话身份真源。
          parsed.options.session as string | undefined,
        );
      }
    } catch {
      // 忽略
    }
  };

  // 拦截 process.exit
  const wrappedExit: typeof process.exit = function(code?: number): never {
    const exitCode = code ?? 0;
    writeTraceBeforeExit(exitCode);
    return originalExit.call(process, exitCode);
  };
  process.exit = wrappedExit;

  let runError: any = null;

  try {
    await cli.runMatchedCommand();
    writeTraceBeforeExit(0);
  } catch (err) {
    if (err instanceof CliExit) throw err;
    const exitCode = err instanceof DocPathError ? err.getExitCode() : 1;
    writeTraceBeforeExit(exitCode);
    runError = err;
  }

  if (runError) {
    throw runError;
  }
  return typeof process.exitCode === 'number' ? process.exitCode : 0;
} catch (err) {
  if (err instanceof CliExit) throw err;
  // DocPath 结构化错误
  if (err instanceof DocPathError) {
    console.error(err.message);
    process.exit(err.getExitCode());
  }

  // 未预期的错误
  const isDebug = process.env.DOCPATH_DEBUG === '1';
  console.error('❌ 未预期的错误');

  if (isDebug && err instanceof Error) {
    console.error('\n调试信息：');
    console.error(err.stack);
  } else if (err instanceof Error) {
    console.error(`   ${err.message}`);
    console.error('\n运行 DOCPATH_DEBUG=1 docpath ... 查看详细堆栈');
  } else {
    console.error(`   ${String(err)}`);
  }

  process.exit(1);
  }
}

function launchedAsCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
  } catch {
    return false;
  }
}

if (launchedAsCli()) {
  const code = await runCli(process.argv);
  process.exit(code);
}
