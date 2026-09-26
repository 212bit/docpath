/**
 * docpath plugin — 插件管理与诊断命令
 */

import { stringify as stringifyYaml } from 'yaml';
import {
  loadPlugins,
  diagnosePlugins,
  type PluginInfo,
} from '../engine/plugin-system.js';

export interface PluginCommandOptions {
  cwd: string;
  action?: string;
  agent?: boolean;
  json?: boolean;
}

export async function pluginCommand(options: PluginCommandOptions): Promise<void> {
  const { cwd, action = 'list', agent, json } = options;

  if (action === 'doctor') {
    const report = await diagnosePlugins(cwd);

    if (json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (agent) {
      console.log(
        stringifyYaml({
          agent_view: 'plugin_doctor',
          healthy: report.healthy,
          total_plugins: report.total_plugins,
          active_plugins: report.active_plugins,
          plugins: report.plugins.map((p) => ({
            name: p.name,
            valid: p.valid,
            enabled: p.manifest.enabled !== false,
            errors: p.errors,
            hooks_count: p.hooksCount,
            rules_count: p.rulesCount,
          })),
        }),
      );
      return;
    }

    console.log(`\n🩺  DocPath 插件健康诊断 (共 ${report.total_plugins} 个插件, 启用 ${report.active_plugins} 个):\n`);
    if (report.total_plugins === 0) {
      console.log('    ℹ️  未安装任何插件。插件目录: .docpath/plugins/<plugin-name>/');
      return;
    }

    for (const p of report.plugins) {
      const statusIcon = p.valid ? '✅' : '❌';
      const enabledText = p.manifest.enabled === false ? ' [已禁用]' : '';
      console.log(`  ${statusIcon} 插件: ${p.name}${enabledText}`);
      console.log(`     路径: ${p.dir}`);
      console.log(`     声明文件: ${p.manifestFile || '(缺失)'}`);
      console.log(`     能力: ${p.hooksCount} 个 Hooks, ${p.rulesCount} 个规则`);
      if (p.errors.length > 0) {
        console.log('     异常项:');
        for (const err of p.errors) {
          console.log(`       - ❌ ${err}`);
        }
      }
      console.log('');
    }

    console.log(`诊断结论: ${report.healthy ? '✅ 全部插件配置有效' : '❌ 存在配置异常插件'}\n`);
    return;
  }

  // 默认为 list
  const plugins = await loadPlugins(cwd);

  if (json) {
    console.log(JSON.stringify(plugins, null, 2));
    return;
  }

  if (agent) {
    console.log(
      stringifyYaml({
        agent_view: 'plugin_list',
        total_plugins: plugins.length,
        plugins: plugins.map((p) => ({
          name: p.name,
          version: p.manifest.version,
          description: p.manifest.description,
          author: p.manifest.author,
          enabled: p.manifest.enabled !== false,
          valid: p.valid,
          hooks_count: p.hooksCount,
          rules_count: p.rulesCount,
        })),
      }),
    );
    return;
  }

  console.log(`\n🧩  DocPath 已安装插件列表 (共 ${plugins.length} 个):\n`);
  if (plugins.length === 0) {
    console.log('    ℹ️  未发现已安装插件。');
    console.log('    如需扩展，可在 .docpath/plugins/<name>/ 创建 plugin.json 声明自定义 hooks 或 rules。\n');
    return;
  }

  for (const p of plugins) {
    const statusIcon = !p.valid ? '❌' : p.manifest.enabled === false ? '⏸️' : '✅';
    console.log(`  ${statusIcon} ${p.name} (v${p.manifest.version || '1.0.0'})`);
    if (p.manifest.description) {
      console.log(`     描述: ${p.manifest.description}`);
    }
    console.log(`     状态: ${!p.valid ? '配置错误' : p.manifest.enabled === false ? '已停用' : '启用中'} | Hooks: ${p.hooksCount} | Rules: ${p.rulesCount}`);
    console.log('');
  }
}
