/**
 * DocPath Plugin System Engine
 *
 * 负责解析、加载和诊断 .docpath/plugins/ 下的扩展插件。
 * 插件可声明自定义 hooks、自定义检查规则 (rules) 与元数据。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { resolveDocpathDirSync } from '../utils/file.js';

export type HookEvent =
  | 'pre-step'
  | 'post-step'
  | 'pre-check'
  | 'post-check'
  | 'pre-review'
  | 'post-review'
  | 'pre-done'
  | 'post-done'
  | 'on-major-decision'
  | 'on-gate-blocked';

export const VALID_HOOK_EVENTS: HookEvent[] = [
  'pre-step',
  'post-step',
  'pre-check',
  'post-check',
  'pre-review',
  'post-review',
  'pre-done',
  'post-done',
  'on-major-decision',
  'on-gate-blocked',
];

export interface PluginHookConfig {
  command: string;
  name?: string;
  timeout_ms?: number;
  fail_fast?: boolean;
}

export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  enabled?: boolean;
  hooks?: Partial<Record<HookEvent, Array<string | PluginHookConfig>>>;
  rules?: Array<{
    name: string;
    description?: string;
    file?: string;
  }>;
}

export interface PluginInfo {
  name: string;
  dir: string;
  manifestFile: string;
  manifest: PluginManifest;
  valid: boolean;
  errors: string[];
  hooksCount: number;
  rulesCount: number;
}

export interface PluginDiagnosisReport {
  total_plugins: number;
  active_plugins: number;
  healthy: boolean;
  plugins: PluginInfo[];
}

/**
 * 读取并校验单个插件目录下的 plugin.json 或 plugin.yaml
 */
export function loadSinglePlugin(pluginDir: string): PluginInfo {
  const jsonPath = join(pluginDir, 'plugin.json');
  const yamlPath = join(pluginDir, 'plugin.yaml');
  const ymlPath = join(pluginDir, 'plugin.yml');

  let manifestFile = '';
  let rawContent = '';

  if (existsSync(jsonPath)) {
    manifestFile = jsonPath;
    rawContent = readFileSync(jsonPath, 'utf-8');
  } else if (existsSync(yamlPath)) {
    manifestFile = yamlPath;
    rawContent = readFileSync(yamlPath, 'utf-8');
  } else if (existsSync(ymlPath)) {
    manifestFile = ymlPath;
    rawContent = readFileSync(ymlPath, 'utf-8');
  } else {
    return {
      name: pluginDir.split(/[/\\]/).pop() || 'unknown',
      dir: pluginDir,
      manifestFile: '',
      manifest: { name: pluginDir.split(/[/\\]/).pop() || 'unknown', enabled: false },
      valid: false,
      errors: ['缺失 plugin.json 或 plugin.yaml 声明文件'],
      hooksCount: 0,
      rulesCount: 0,
    };
  }

  const errors: string[] = [];
  let manifest: PluginManifest;

  try {
    manifest = manifestFile.endsWith('.json') ? JSON.parse(rawContent) : parseYaml(rawContent);
  } catch (err: any) {
    return {
      name: pluginDir.split(/[/\\]/).pop() || 'unknown',
      dir: pluginDir,
      manifestFile,
      manifest: { name: 'invalid', enabled: false },
      valid: false,
      errors: [`配置文件解析失败: ${err.message}`],
      hooksCount: 0,
      rulesCount: 0,
    };
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('插件清单中缺少必须的 "name" 字段');
  }

  let hooksCount = 0;
  if (manifest.hooks) {
    for (const [event, hookList] of Object.entries(manifest.hooks)) {
      if (!VALID_HOOK_EVENTS.includes(event as HookEvent)) {
        errors.push(`未知的 hook 事件名: "${event}" (有效事件: ${VALID_HOOK_EVENTS.join(', ')})`);
      }
      if (Array.isArray(hookList)) {
        hooksCount += hookList.length;
      }
    }
  }

  const rulesCount = Array.isArray(manifest.rules) ? manifest.rules.length : 0;

  return {
    name: manifest.name || pluginDir.split(/[/\\]/).pop() || 'unknown',
    dir: pluginDir,
    manifestFile,
    manifest: {
      enabled: true,
      ...manifest,
    },
    valid: errors.length === 0,
    errors,
    hooksCount,
    rulesCount,
  };
}

/**
 * 扫描并加载工作区下的所有插件 (.docpath/plugins/*)
 */
export function loadPluginsSync(cwd: string): PluginInfo[] {
  const docpathDir = resolveDocpathDirSync(cwd);
  const pluginsDir = join(docpathDir, 'plugins');

  if (!existsSync(pluginsDir)) {
    return [];
  }

  const plugins: PluginInfo[] = [];
  try {
    const entries = readdirSync(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullDir = join(pluginsDir, entry.name);
        plugins.push(loadSinglePlugin(fullDir));
      }
    }
  } catch {
    // 容错
  }

  return plugins;
}

export async function loadPlugins(cwd: string): Promise<PluginInfo[]> {
  return loadPluginsSync(cwd);
}

/**
 * 诊断插件健康度
 */
export async function diagnosePlugins(cwd: string): Promise<PluginDiagnosisReport> {
  const plugins = await loadPlugins(cwd);
  const activePlugins = plugins.filter((p) => p.valid && p.manifest.enabled !== false).length;
  const healthy = plugins.every((p) => p.valid);

  return {
    total_plugins: plugins.length,
    active_plugins: activePlugins,
    healthy,
    plugins,
  };
}
