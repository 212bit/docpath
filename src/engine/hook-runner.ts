/**
 * DocPath Lifecycle Hook Runner Engine
 *
 * 负责发现、编排与执行生命周期 Hook：
 * 1. 脚本文件 (.docpath/hooks/<event-name>.(sh|js|mjs|py|ts))
 * 2. 配置文件 (.docpath/config.yaml 中的 hooks.<event-name>)
 * 3. 插件体系 (.docpath/plugins/<plugin>/ 声明的 hooks)
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { resolveDocpathDir, readFileSafe } from '../utils/file.js';
import { readOptionalFile, readCurrentState } from '../utils/workspace.js';
import { parse as parseYaml } from 'yaml';
import {
  type HookEvent,
  VALID_HOOK_EVENTS,
  loadPlugins,
  type PluginHookConfig,
} from './plugin-system.js';

export { type HookEvent, VALID_HOOK_EVENTS } from './plugin-system.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export const DEFAULT_HOOK_TIMEOUT_MS = 15000;

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
export async function discoverScriptHooks(cwd: string): Promise<RegisteredHook[]> {
  const docpathDir = await resolveDocpathDir(cwd);
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

/**
 * 从 .docpath/config.yaml 中解析 hooks 配置
 */
export async function discoverConfigHooks(cwd: string): Promise<RegisteredHook[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const configPath = join(docpathDir, 'config.yaml');
  if (!existsSync(configPath)) return [];

  const raw = await readFileSafe(configPath);
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

/**
 * 从所有已启用的插件中提取 hooks
 */
export async function discoverPluginHooks(cwd: string): Promise<RegisteredHook[]> {
  const plugins = await loadPlugins(cwd);
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

/**
 * 汇总工作区中所有注册的 hooks
 */
export async function listAllRegisteredHooks(cwd: string): Promise<RegisteredHook[]> {
  const [scriptHooks, configHooks, pluginHooks] = await Promise.all([
    discoverScriptHooks(cwd),
    discoverConfigHooks(cwd),
    discoverPluginHooks(cwd),
  ]);

  return [...scriptHooks, ...configHooks, ...pluginHooks];
}

/**
 * 执行指定生命周期的所有 Hook
 */
export async function executeLifecycleHook(
  cwd: string,
  event: HookEvent,
  context: { taskId?: string; step?: string; note?: string } = {},
  options: { timeoutMs?: number; strict?: boolean } = {},
): Promise<HookReport> {
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
