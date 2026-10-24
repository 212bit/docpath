import { spawn, spawnSync } from 'node:child_process';
import { looksLikeEnvironmentFailure } from './environment-failure.js';

/**
 * 全仓外部命令的唯一出口。
 *
 * 新代码不得直接 import `child_process`。`tests/run-tool.test.mjs` 扫描 `src`，
 * 除本文件外一律失败。
 *
 * 不变量：
 * - 每次执行都有超时（缺省 {@link DEFAULT_RUN_TIMEOUT_MS}，调用方可覆盖，不能关掉）。
 * - stdin 默认 ignore，只有显式 `stdin: 'inherit'` 或传入 `input` 时才接管道/终端。
 * - ENOENT，以及 bash/dash/busybox 的 command-not-found，收成 `environment_failure`。
 * - 超时收成 `timeout`，不把挂起当成普通非零退出。
 * - 命令是 npm/npx（或 shell 脚本里调用它们）时默认 `npm_config_offline=true`；
 *   argv 形式的 npx 再前置 `--offline`（`--no-install` 的现行等价语义：缺包失败，不访问 registry）。
 */

export const DEFAULT_RUN_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BUFFER = 1024 * 1024;

const NPM_COMMAND = /(?:^|&&|\|\||[;&|`(\n])\s*(?:npm|npx)(?:\s|$)/;

export type RunToolStatus = 'ok' | 'error' | 'timeout' | 'environment_failure';

export interface RunToolResult {
  status: RunToolStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  environmentFailure: boolean;
  error?: NodeJS.ErrnoException;
  /** 展示用命令行（shell 为原字符串，argv 为拼接后的最终参数）。 */
  command: string;
}

export interface RunToolOptions {
  cwd?: string;
  /** 缺省 {@link DEFAULT_RUN_TIMEOUT_MS}。必须为正数。 */
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  /** 默认 ignore。inherit 只给明确要共享终端的调用（例如 test-map）。 */
  stdin?: 'ignore' | 'pipe' | 'inherit';
  stdout?: 'pipe' | 'inherit' | 'ignore';
  stderr?: 'pipe' | 'inherit' | 'ignore';
  /** 写入 stdin。设置后 stdin 固定为 pipe，不会继承终端。 */
  input?: string;
  shell?: boolean;
  killSignal?: NodeJS.Signals;
  /**
   * true 强制 npm 离线环境；false 关闭；缺省时仅对 npm/npx 开启。
   */
  offline?: boolean;
}

export interface PreparedRun {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  shell: boolean;
  timeoutMs: number;
  maxBuffer: number;
  stdin: 'ignore' | 'pipe' | 'inherit';
  stdout: 'pipe' | 'inherit' | 'ignore';
  stderr: 'pipe' | 'inherit' | 'ignore';
  input?: string;
  killSignal: NodeJS.Signals;
  commandLine: string;
}

export class RunToolError extends Error {
  readonly status: Exclude<RunToolStatus, 'ok'>;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly environmentFailure: boolean;
  /** 数值退出码，或 ENOENT / ETIMEDOUT。兼容原先读取 err.code 的 catch。 */
  readonly code: string | number | null;
  readonly killed: boolean;
  readonly cmd: string;

  constructor(result: RunToolResult) {
    const detail = (result.stderr || result.stdout || result.error?.message || '').trim();
    const head = result.timedOut
      ? `Command timed out: ${result.command}`
      : `Command failed: ${result.command}`;
    super(detail ? `${head}\n${detail}` : head);
    this.name = 'RunToolError';
    this.status = result.status === 'ok' ? 'error' : result.status;
    this.exitCode = result.exitCode;
    this.signal = result.signal;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
    this.timedOut = result.timedOut;
    this.environmentFailure = result.environmentFailure;
    this.killed = result.timedOut || Boolean(result.signal);
    this.code = result.timedOut
      ? 'ETIMEDOUT'
      : (result.error?.code === 'ENOENT' || result.error?.code === 'ENOTDIR'
        ? result.error.code
        : result.exitCode);
    this.cmd = result.command;
  }
}

export function commandRequestsNpmOffline(command: string): boolean {
  return NPM_COMMAND.test(command);
}

function npmBinaryName(command: string): string {
  return command.split(/[\\/]/).pop()?.toLowerCase() ?? '';
}

function isNpmBinary(command: string): boolean {
  const base = npmBinaryName(command);
  return base === 'npm' || base === 'npx' || base === 'npm.cmd' || base === 'npx.cmd';
}

function isNpxBinary(command: string): boolean {
  const base = npmBinaryName(command);
  return base === 'npx' || base === 'npx.cmd';
}

function resolveTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_RUN_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(`run-tool timeoutMs must be a positive number, got ${timeoutMs}`);
  }
  return timeoutMs;
}

function offlineEnabled(command: string, shell: boolean, offline: boolean | undefined): boolean {
  if (offline === false) return false;
  if (offline === true) return true;
  return shell ? commandRequestsNpmOffline(command) : isNpmBinary(command);
}

function withNpxOfflineArgs(command: string, args: string[], enabled: boolean): string[] {
  if (!enabled || !isNpxBinary(command)) return args;
  if (args.some((arg) => arg === '--offline' || arg === '--no-install')) return args;
  return ['--offline', ...args];
}

function applyOfflineEnv(env: NodeJS.ProcessEnv, enabled: boolean, force: boolean): NodeJS.ProcessEnv {
  if (!enabled) return env;
  if (force || env.npm_config_offline === undefined) {
    env.npm_config_offline = 'true';
  }
  return env;
}

export function prepareInvocation(
  command: string,
  args: readonly string[] = [],
  options: RunToolOptions = {},
): PreparedRun {
  const shell = options.shell === true;
  const enabled = offlineEnabled(command, shell, options.offline);
  const finalArgs = shell ? [...args] : withNpxOfflineArgs(command, [...args], enabled);
  const env = applyOfflineEnv(
    { ...(options.env ?? process.env) },
    enabled,
    options.offline === true,
  );
  const stdin = options.input !== undefined ? 'pipe' : (options.stdin ?? 'ignore');
  const commandLine = shell ? command : [command, ...finalArgs].join(' ');
  return {
    command,
    args: finalArgs,
    env,
    shell,
    timeoutMs: resolveTimeoutMs(options.timeoutMs),
    maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    stdin,
    stdout: options.stdout ?? 'pipe',
    stderr: options.stderr ?? 'pipe',
    input: options.input,
    killSignal: options.killSignal ?? 'SIGTERM',
    commandLine,
  };
}

interface RawSpawn {
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: NodeJS.ErrnoException;
  timedOut: boolean;
}

function asText(value: string | Buffer | null | undefined): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return '';
}

function classify(raw: RawSpawn, commandLine: string): RunToolResult {
  const stdout = raw.stdout;
  const stderr = raw.stderr;
  const timedOut = raw.timedOut || raw.error?.code === 'ETIMEDOUT';
  const base = {
    stdout,
    stderr,
    exitCode: raw.status,
    signal: raw.signal,
    error: raw.error,
    command: commandLine,
  };
  if (timedOut) {
    return { ...base, status: 'timeout', timedOut: true, environmentFailure: false };
  }
  const spawnCode = raw.error?.code;
  if (spawnCode === 'ENOENT' || spawnCode === 'ENOTDIR') {
    return { ...base, status: 'environment_failure', timedOut: false, environmentFailure: true };
  }
  if (raw.status === 0 && !raw.error && !raw.signal) {
    return { ...base, status: 'ok', timedOut: false, environmentFailure: false };
  }
  const blob = `${stderr}\n${stdout}\n${raw.error?.message ?? ''}`;
  if (looksLikeEnvironmentFailure(blob)) {
    return { ...base, status: 'environment_failure', timedOut: false, environmentFailure: true };
  }
  return { ...base, status: 'error', timedOut: false, environmentFailure: false };
}

function syncSpawnOptions(prepared: PreparedRun, cwd: string | undefined) {
  return {
    cwd,
    env: prepared.env,
    encoding: 'utf8' as const,
    timeout: prepared.timeoutMs,
    killSignal: prepared.killSignal,
    maxBuffer: prepared.maxBuffer,
    input: prepared.input,
    shell: prepared.shell,
    stdio: [prepared.stdin, prepared.stdout, prepared.stderr] as [
      'ignore' | 'pipe' | 'inherit',
      'ignore' | 'pipe' | 'inherit',
      'ignore' | 'pipe' | 'inherit',
    ],
    windowsHide: true,
  };
}

export function runToolSync(command: string, args: string[] = [], options: RunToolOptions = {}): RunToolResult {
  const prepared = prepareInvocation(command, args, options);
  const result = spawnSync(prepared.command, prepared.args, syncSpawnOptions(prepared, options.cwd));
  const spawnError = result.error as NodeJS.ErrnoException | undefined;
  return classify({
    stdout: asText(result.stdout),
    stderr: asText(result.stderr),
    status: result.status,
    signal: result.signal,
    error: spawnError,
    timedOut: spawnError?.code === 'ETIMEDOUT',
  }, prepared.commandLine);
}

export function runShellSync(command: string, options: RunToolOptions = {}): RunToolResult {
  return runToolSync(command, [], { ...options, shell: true });
}

export function runToolSyncOrThrow(command: string, args: string[] = [], options: RunToolOptions = {}): string {
  const result = runToolSync(command, args, options);
  if (result.status !== 'ok') throw new RunToolError(result);
  return result.stdout;
}

export function runShellSyncOrThrow(command: string, options: RunToolOptions = {}): string {
  const result = runShellSync(command, options);
  if (result.status !== 'ok') throw new RunToolError(result);
  return result.stdout;
}

export function runTool(command: string, args: string[] = [], options: RunToolOptions = {}): Promise<RunToolResult> {
  const prepared = prepareInvocation(command, args, options);
  const stdio = [prepared.stdin, prepared.stdout, prepared.stderr] as const;
  return new Promise((resolve) => {
    const child = spawn(prepared.command, prepared.args, {
      cwd: options.cwd,
      env: prepared.env,
      shell: prepared.shell,
      stdio: [...stdio],
      windowsHide: true,
    });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let overflow = false;
    let timedOut = false;
    let spawnError: NodeJS.ErrnoException | undefined;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (status: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (overflow && !spawnError && !timedOut) {
        const err = new Error('stdio maxBuffer exceeded') as NodeJS.ErrnoException;
        err.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
        spawnError = err;
      }
      resolve(classify({
        stdout: Buffer.concat(outChunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        status,
        signal,
        error: spawnError,
        timedOut,
      }, prepared.commandLine));
    };
    const take = (chunks: Buffer[], current: number, chunk: Buffer): number => {
      const next = current + chunk.length;
      if (next > prepared.maxBuffer) {
        overflow = true;
        child.kill(prepared.killSignal);
        return current;
      }
      chunks.push(chunk);
      return next;
    };
    timer = setTimeout(() => {
      timedOut = true;
      child.kill(prepared.killSignal);
    }, prepared.timeoutMs);
    killTimer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL');
    }, prepared.timeoutMs + 1000);
    child.stdout?.on('data', (chunk: Buffer) => {
      outBytes = take(outChunks, outBytes, chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      errBytes = take(errChunks, errBytes, chunk);
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      spawnError = err;
    });
    child.on('close', (code, signal) => {
      finish(code, signal);
    });
    if (prepared.stdin === 'pipe' && prepared.input === undefined) {
      child.stdin?.end();
    } else if (prepared.input !== undefined) {
      child.stdin?.end(prepared.input);
    }
  });
}

export function runShell(command: string, options: RunToolOptions = {}): Promise<RunToolResult> {
  return runTool(command, [], { ...options, shell: true });
}

export async function runToolOrThrow(
  command: string,
  args: string[] = [],
  options: RunToolOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const result = await runTool(command, args, options);
  if (result.status !== 'ok') throw new RunToolError(result);
  return { stdout: result.stdout, stderr: result.stderr };
}

export async function runShellOrThrow(
  command: string,
  options: RunToolOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const result = await runShell(command, options);
  if (result.status !== 'ok') throw new RunToolError(result);
  return { stdout: result.stdout, stderr: result.stderr };
}
