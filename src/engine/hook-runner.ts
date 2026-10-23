/**
 * DocPath Lifecycle Hook Runner Engine
 *
 * 负责发现、编排与执行生命周期 Hook：
 * 1. 脚本文件 (.docpath/hooks/<event-name>.(sh|js|mjs|py|ts))
 * 2. 配置文件 (.docpath/config.yaml 中的 hooks.<event-name>)
 * 3. 插件体系 (.docpath/plugins/<plugin>/ 声明的 hooks)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFile, exec, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { resolveDocpathDirSync } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';
import { logger } from '../utils/logger.js';
import { parse as parseYaml } from 'yaml';
import {
  type HookEvent,
  VALID_HOOK_EVENTS,
  loadPluginsSync,
  type PluginHookConfig,
} from './plugin-system.js';

export { type HookEvent, VALID_HOOK_EVENTS } from './plugin-system.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export const DEFAULT_HOOK_TIMEOUT_MS = 15000;

/**
 * Hard cap for `on-gate-blocked`. A notification must not stall the gate
 * that already decided to block. Configured `timeout_ms` values are clamped
 * to this ceiling.
 */
export const GATE_BLOCKED_HOOK_TIMEOUT_MS = 3000;

export const GATE_BLOCKED_EVENT = 'on-gate-blocked' as const;

export interface RegisteredHook {
  id: string;
  name: string;
  event: HookEvent;
  source: 'script' | 'config' | 'plugin';
  pluginName?: string;
  command: string;
  scriptPath?: string;
  timeout_ms: number;
  fail_fast: boolean;
}

export interface HookExecutionResult {
  id: string;
  name: string;
  event: HookEvent;
  source: 'script' | 'config' | 'plugin';
  pluginName?: string;
  command: string;
  passed: boolean;
  exitCode: number;
  duration_ms: number;
  output: string;
  error?: string;
  fail_fast: boolean;
}

export interface HookReport {
  event: HookEvent;
  total_hooks: number;
  passed: boolean;
  duration_ms: number;
  results: HookExecutionResult[];
}

/**
 * 扫描 .docpath/hooks/ 目录下的原生可执行脚本
 */
export function discoverScriptHooksSync(cwd: string): RegisteredHook[] {
  const docpathDir = resolveDocpathDirSync(cwd);
  const hooksDir = join(docpathDir, 'hooks');
  if (!existsSync(hooksDir)) return [];

  const registered: RegisteredHook[] = [];
  try {
    const entries = readdirSync(hooksDir);
    for (const entry of entries) {
      const fullPath = join(hooksDir, entry);
      if (!statSync(fullPath).isFile()) continue;

      // 提取文件名与事件名 (例如 pre-check.sh -> event: pre-check)
      const base = basename(entry).replace(/\.[^.]+$/, '');
      const ext = entry.slice(base.length);

      if (VALID_HOOK_EVENTS.includes(base as HookEvent)) {
        const event = base as HookEvent;
        let command = fullPath;
        if (ext === '.js' || ext === '.mjs') {
          command = `node "${fullPath}"`;
        } else if (ext === '.py') {
          command = `python3 "${fullPath}"`;
        } else if (ext === '.sh') {
          command = `bash "${fullPath}"`;
        }

        registered.push({
          id: `script:${entry}`,
          name: entry,
          event,
          source: 'script',
          command,
          scriptPath: fullPath,
          timeout_ms: DEFAULT_HOOK_TIMEOUT_MS,
          fail_fast: true,
        });
      }
    }
  } catch {
    // 容错
  }

  return registered;
}

export async function discoverScriptHooks(cwd: string): Promise<RegisteredHook[]> {
  return discoverScriptHooksSync(cwd);
}

/**
 * 从 .docpath/config.yaml 中解析 hooks 配置
 */
export function discoverConfigHooksSync(cwd: string): RegisteredHook[] {
  const docpathDir = resolveDocpathDirSync(cwd);
  const configPath = join(docpathDir, 'config.yaml');
  if (!existsSync(configPath)) return [];

  let raw = '';
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const config = parseYaml(raw);
    if (!config || typeof config !== 'object' || !config.hooks) return [];

    const registered: RegisteredHook[] = [];
    for (const [eventKey, hooksVal] of Object.entries(config.hooks)) {
      if (!VALID_HOOK_EVENTS.includes(eventKey as HookEvent)) continue;
      const event = eventKey as HookEvent;

      if (Array.isArray(hooksVal)) {
        hooksVal.forEach((item: any, idx: number) => {
          if (typeof item === 'string' && item.trim()) {
            registered.push({
              id: `config:${event}:${idx}`,
              name: `config:${event}[${idx}]`,
              event,
              source: 'config',
              command: item.trim(),
              timeout_ms: DEFAULT_HOOK_TIMEOUT_MS,
              fail_fast: false,
            });
          } else if (item && typeof item === 'object' && typeof item.command === 'string') {
            registered.push({
              id: `config:${event}:${item.name || idx}`,
              name: item.name || `config:${event}[${idx}]`,
              event,
              source: 'config',
              command: item.command.trim(),
              timeout_ms: item.timeout_ms || DEFAULT_HOOK_TIMEOUT_MS,
              fail_fast: item.fail_fast ?? false,
            });
          }
        });
      }
    }
    return registered;
  } catch {
    return [];
  }
}

export async function discoverConfigHooks(cwd: string): Promise<RegisteredHook[]> {
  return discoverConfigHooksSync(cwd);
}

/**
 * 从所有已启用的插件中提取 hooks
 */

export function discoverPluginHooksSync(cwd: string): RegisteredHook[] {
  const plugins = loadPluginsSync(cwd);
  const registered: RegisteredHook[] = [];

  for (const plugin of plugins) {
    if (!plugin.valid || plugin.manifest.enabled === false) continue;
    if (!plugin.manifest.hooks) continue;

    for (const [eventKey, hookList] of Object.entries(plugin.manifest.hooks)) {
      if (!VALID_HOOK_EVENTS.includes(eventKey as HookEvent)) continue;
      const event = eventKey as HookEvent;

      if (Array.isArray(hookList)) {
        hookList.forEach((item: string | PluginHookConfig, idx: number) => {
          if (typeof item === 'string') {
            registered.push({
              id: `plugin:${plugin.name}:${event}:${idx}`,
              name: `${plugin.name}:${event}[${idx}]`,
              event,
              source: 'plugin',
              pluginName: plugin.name,
              command: item,
              timeout_ms: DEFAULT_HOOK_TIMEOUT_MS,
              fail_fast: false,
            });
          } else if (item && typeof item === 'object' && typeof item.command === 'string') {
            registered.push({
              id: `plugin:${plugin.name}:${event}:${item.name || idx}`,
              name: item.name ? `${plugin.name}:${item.name}` : `${plugin.name}:${event}[${idx}]`,
              event,
              source: 'plugin',
              pluginName: plugin.name,
              command: item.command,
              timeout_ms: item.timeout_ms || DEFAULT_HOOK_TIMEOUT_MS,
              fail_fast: item.fail_fast ?? false,
            });
          }
        });
      }
    }
  }

  return registered;
}

export async function discoverPluginHooks(cwd: string): Promise<RegisteredHook[]> {
  return discoverPluginHooksSync(cwd);
}

/**
 * 汇总工作区中所有注册的 hooks
 */
export function listAllRegisteredHooksSync(cwd: string): RegisteredHook[] {
  return [
    ...discoverScriptHooksSync(cwd),
    ...discoverConfigHooksSync(cwd),
    ...discoverPluginHooksSync(cwd),
  ];
}

export async function listAllRegisteredHooks(cwd: string): Promise<RegisteredHook[]> {
  return listAllRegisteredHooksSync(cwd);
}

/**
 * 执行指定生命周期的所有 Hook
 */
export interface HookRunContext {
  taskId?: string;
  step?: string;
  note?: string;
  gate?: string;
  reason?: string;
  paths?: string[];
}

export async function executeLifecycleHook(
  cwd: string,
  event: HookEvent,
  context: HookRunContext = {},
  options: { timeoutMs?: number; strict?: boolean } = {},
): Promise<HookReport> {
  if (event === GATE_BLOCKED_EVENT) {
    return runOnGateBlockedHooks(cwd, {
      gate: context.gate ?? '',
      taskId: context.taskId,
      step: context.step,
      reason: context.reason ?? '',
      paths: context.paths,
    }, { bestEffort: false, strict: options.strict, timeoutMs: options.timeoutMs });
  }

  const allHooks = await listAllRegisteredHooks(cwd);
  const targetHooks = allHooks.filter((h) => h.event === event);

  if (targetHooks.length === 0) {
    return {
      event,
      total_hooks: 0,
      passed: true,
      duration_ms: 0,
      results: [],
    };
  }

  const state = await readCurrentState(cwd);
  const taskId = context.taskId || state?.task_id || '';
  const currentStep = context.step || state?.current_step || '';

  const hookEnv: Record<string, string> = {
    ...process.env,
    DOCPATH_HOOK_EVENT: event,
    DOCPATH_TASK_ID: taskId,
    DOCPATH_CURRENT_STEP: currentStep,
    DOCPATH_CWD: cwd,
  };

  const results: HookExecutionResult[] = [];
  const startOverall = performance.now();
  let overallPassed = true;

  for (const hook of targetHooks) {
    const timeout = options.timeoutMs || hook.timeout_ms || DEFAULT_HOOK_TIMEOUT_MS;
    const start = performance.now();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let passed = false;
    let error: string | undefined;

    try {
      const res = await execAsync(hook.command, {
        cwd,
        timeout,
        env: hookEnv,
        encoding: 'utf-8',
      });
      stdout = res.stdout || '';
      stderr = res.stderr || '';
      passed = true;
      exitCode = 0;
    } catch (err: any) {
      stdout = err.stdout || '';
      stderr = err.stderr || '';
      exitCode = typeof err.code === 'number' ? err.code : 1;
      passed = false;
      error = err.message || 'Hook execution failed';
    }

    const duration = Math.round(performance.now() - start);
    const fullOutput = [stdout, stderr].filter(Boolean).join('\n').trim();

    results.push({
      id: hook.id,
      name: hook.name,
      event: hook.event,
      source: hook.source,
      pluginName: hook.pluginName,
      command: hook.command,
      passed,
      exitCode,
      duration_ms: duration,
      output: fullOutput,
      error,
      fail_fast: hook.fail_fast,
    });

    if (!passed) {
      if (hook.fail_fast || options.strict) {
        overallPassed = false;
        break; // fail_fast 立即阻断
      }
    }
  }

  const totalDuration = Math.round(performance.now() - startOverall);

  return {
    event,
    total_hooks: targetHooks.length,
    passed: overallPassed && results.every((r) => r.passed || !r.fail_fast),
    duration_ms: totalDuration,
    results,
  };
}

export interface GateBlockedContext {
  /** Stable gate id: `git-dirty-guard`, `check`, `review`, or `hippo-gate`. */
  gate: string;
  taskId?: string;
  step?: string;
  reason: string;
  /** Offending paths. The dirty-worktree guard fills this; other gates omit it. */
  paths?: string[];
}

export interface GateBlockedPayload {
  event: typeof GATE_BLOCKED_EVENT;
  task_id: string;
  gate: string;
  step: string;
  reason: string;
  paths: string[];
}

const GATE_REASON_ENV_MAX = 2000;
const GATE_PATHS_ENV_MAX = 4000;
const GATE_CONTEXT_ENV_MAX = 16_000;

function oneLine(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1))}…`;
}

function readStateFallback(cwd: string): { taskId: string; step: string } {
  try {
    const statePath = join(resolveDocpathDirSync(cwd), 'workspace', 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8')) as { task_id?: unknown; current_step?: unknown };
    return {
      taskId: typeof state.task_id === 'string' ? state.task_id : '',
      step: typeof state.current_step === 'string' ? state.current_step : '',
    };
  } catch {
    return { taskId: '', step: '' };
  }
}

export function buildGateBlockedPayload(cwd: string, context: GateBlockedContext): GateBlockedPayload {
  const fallback = readStateFallback(cwd);
  const paths = Array.isArray(context.paths)
    ? context.paths.filter((path): path is string => typeof path === 'string')
    : [];
  return {
    event: GATE_BLOCKED_EVENT,
    task_id: context.taskId || fallback.taskId,
    gate: context.gate || '',
    step: context.step || fallback.step,
    reason: context.reason || '',
    paths,
  };
}

function pathsForEnv(paths: string[]): string {
  let encoded = JSON.stringify(paths);
  if (encoded.length <= GATE_PATHS_ENV_MAX) return encoded;
  const kept: string[] = [];
  for (const path of paths) {
    const next = JSON.stringify([...kept, path]);
    if (next.length > GATE_PATHS_ENV_MAX - 32) break;
    kept.push(path);
  }
  return JSON.stringify({ truncated: true, count: paths.length, paths: kept });
}

function gateBlockedEnv(cwd: string, payload: GateBlockedPayload, stdin: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.DOCPATH_HOOK_EVENT = payload.event;
  env.DOCPATH_TASK_ID = payload.task_id;
  env.DOCPATH_TASK = payload.task_id;
  env.DOCPATH_CURRENT_STEP = payload.step;
  env.DOCPATH_STEP = payload.step;
  env.DOCPATH_GATE = payload.gate;
  env.DOCPATH_REASON = oneLine(payload.reason, GATE_REASON_ENV_MAX);
  env.DOCPATH_PATHS = pathsForEnv(payload.paths);
  env.DOCPATH_CWD = cwd;
  if (stdin.length <= GATE_CONTEXT_ENV_MAX) {
    env.DOCPATH_GATE_CONTEXT = stdin;
  }
  return env;
}

function hookTimeoutMs(hook: RegisteredHook, override?: number): number {
  const requested = override || hook.timeout_ms || DEFAULT_HOOK_TIMEOUT_MS;
  return Math.min(Math.max(requested, 1), GATE_BLOCKED_HOOK_TIMEOUT_MS);
}

let timeoutBin: string | null | undefined;

function resolveTimeoutBin(): string | null {
  if (timeoutBin !== undefined) return timeoutBin;
  const probe = spawnSync('timeout', ['--version'], { encoding: 'utf-8' });
  timeoutBin = probe.status === 0 ? 'timeout' : null;
  return timeoutBin;
}

/**
 * Run `on-gate-blocked` hooks. `bestEffort` (the gate path) warns and still
 * reports `passed: true` so a hook failure cannot change the gate outcome.
 * Manual `docpath hook run` uses `bestEffort: false` and keeps fail_fast.
 */
export function runOnGateBlockedHooks(
  cwd: string,
  context: GateBlockedContext,
  options: { bestEffort: boolean; strict?: boolean; timeoutMs?: number },
): HookReport {
  const targetHooks = listAllRegisteredHooksSync(cwd).filter((hook) => hook.event === GATE_BLOCKED_EVENT);
  if (targetHooks.length === 0) {
    return {
      event: GATE_BLOCKED_EVENT,
      total_hooks: 0,
      passed: true,
      duration_ms: 0,
      results: [],
    };
  }

  const payload = buildGateBlockedPayload(cwd, context);
  const stdin = `${JSON.stringify(payload)}\n`;
  const env = gateBlockedEnv(cwd, payload, stdin.trim());
  const results: HookExecutionResult[] = [];
  const startOverall = performance.now();
  let overallPassed = true;

  for (const hook of targetHooks) {
    const timeout = hookTimeoutMs(hook, options.timeoutMs);
    const start = performance.now();
    // GNU timeout puts the hook in its own process group and kills that group.
    // spawnSync's own timeout only signals the direct shell, which leaves
    // grandchildren (for example `sleep` or `curl`) running.
    const killer = resolveTimeoutBin();
    const res = killer
      ? spawnSync(killer, [
        '-s', 'KILL',
        '-k', '0.2',
        (timeout / 1000).toFixed(3),
        'bash', '-c', hook.command,
      ], {
        cwd,
        env,
        encoding: 'utf-8',
        input: stdin,
        timeout: timeout + 1000,
        killSignal: 'SIGKILL',
      })
      : spawnSync(hook.command, {
        cwd,
        env,
        encoding: 'utf-8',
        shell: true,
        input: stdin,
        timeout,
        killSignal: 'SIGKILL',
      });
    const stdout = res.stdout || '';
    const stderr = res.stderr || '';
    const errno = res.error as NodeJS.ErrnoException | undefined;
    const timedOut = errno?.code === 'ETIMEDOUT'
      || Boolean(res.signal)
      || res.status === 124
      || res.status === 137;
    const exitCode = typeof res.status === 'number' ? res.status : 1;
    const passed = !res.error && exitCode === 0 && !res.signal;
    const error = passed
      ? undefined
      : timedOut
        ? `timed out after ${timeout}ms`
        : (res.error?.message || `exit ${exitCode}`);
    const output = [stdout, stderr].filter(Boolean).join('\n').trim();

    results.push({
      id: hook.id,
      name: hook.name,
      event: hook.event,
      source: hook.source,
      pluginName: hook.pluginName,
      command: hook.command,
      passed,
      exitCode,
      duration_ms: Math.round(performance.now() - start),
      output,
      error,
      fail_fast: hook.fail_fast,
    });

    if (!passed) {
      if (options.bestEffort) {
        const detail = output ? `${error}: ${output}` : error;
        logger.warn(`on-gate-blocked hook "${hook.name}" failed (${detail}). Gate outcome unchanged.`);
      } else if (hook.fail_fast || options.strict) {
        overallPassed = false;
        break;
      }
    }
  }

  const passed = options.bestEffort
    ? true
    : overallPassed && results.every((result) => result.passed || !result.fail_fast);

  return {
    event: GATE_BLOCKED_EVENT,
    total_hooks: targetHooks.length,
    passed,
    duration_ms: Math.round(performance.now() - startOverall),
    results,
  };
}

/**
 * Best-effort notification for a blocked gate.
 *
 * Never throws. Hook failures and the {@link GATE_BLOCKED_HOOK_TIMEOUT_MS}
 * timeout are warnings only. `hippo-gate` (when added) should await this
 * before returning its pre-step self-review block:
 *
 * ```ts
 * await emitGateBlocked(cwd, { gate: 'hippo-gate', taskId, step, reason });
 * ```
 */
export function emitGateBlockedSync(cwd: string, context: GateBlockedContext): void {
  try {
    runOnGateBlockedHooks(cwd, context, { bestEffort: true });
  } catch (error) {
    logger.warn(`on-gate-blocked hook failed (${error instanceof Error ? error.message : String(error)}). Gate outcome unchanged.`);
  }
}

export async function emitGateBlocked(cwd: string, context: GateBlockedContext): Promise<void> {
  emitGateBlockedSync(cwd, context);
}
