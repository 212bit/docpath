/**
 * docpath hook — 生命周期 Hook 管理与手动调试命令
 */

import { stringify as stringifyYaml } from 'yaml';
import {
  listAllRegisteredHooks,
  executeLifecycleHook,
  type HookEvent,
  VALID_HOOK_EVENTS,
} from '../engine/hook-runner.js';

export interface HookCommandOptions {
  cwd: string;
  action?: string;
  event?: string;
  agent?: boolean;
  json?: boolean;
  strict?: boolean;
}

export async function hookCommand(options: HookCommandOptions): Promise<void> {
  const { cwd, action = 'list', event, agent, json, strict } = options;

  if (action === 'run') {
    if (!event || !VALID_HOOK_EVENTS.includes(event as HookEvent)) {
      throw new Error(
        `docpath hook run: 未指定或非法的 hook 事件名: "${event}"。\n` +
        `    有效事件: ${VALID_HOOK_EVENTS.join(', ')}`,
      );
    }

    const report = await executeLifecycleHook(cwd, event as HookEvent, {}, { strict });

    if (json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (agent) {
      console.log(
        stringifyYaml({
          agent_view: 'hook_run',
          event: report.event,
          passed: report.passed,
          total_hooks: report.total_hooks,
          duration_ms: report.duration_ms,
          results: report.results.map((r) => ({
            id: r.id,
            name: r.name,
            source: r.source,
            passed: r.passed,
            duration_ms: r.duration_ms,
            output: r.output,
            error: r.error,
          })),
        }),
      );
      return;
    }

    console.log(`\n🪝  执行生命周期 Hook: ${report.event} (共 ${report.total_hooks} 个)`);
    if (report.total_hooks === 0) {
      console.log('    ℹ️  未配置任何该事件的 Hook');
      return;
    }

    for (const res of report.results) {
      const icon = res.passed ? '✅' : '❌';
      console.log(`  ${icon} [${res.source}] ${res.name} (${res.duration_ms}ms)`);
      if (res.output) {
        console.log(`     输出: ${res.output.replace(/\n/g, '\n     ')}`);
      }
      if (res.error) {
        console.log(`     错误: ${res.error}`);
      }
    }

    console.log(`\n结论: ${report.passed ? '✅ 全部通过' : '❌ 存在失败项'} (耗时 ${report.duration_ms}ms)\n`);
    if (!report.passed && strict) {
      process.exit(1);
    }
    return;
  }

  // 默认为 list
  const hooks = await listAllRegisteredHooks(cwd);

  if (json) {
    console.log(JSON.stringify(hooks, null, 2));
    return;
  }

  if (agent) {
    console.log(
      stringifyYaml({
        agent_view: 'hook_list',
        total_hooks: hooks.length,
        hooks: hooks.map((h) => ({
          id: h.id,
          name: h.name,
          event: h.event,
          source: h.source,
          command: h.command,
          plugin: h.pluginName,
          fail_fast: h.fail_fast,
        })),
      }),
    );
    return;
  }

  console.log(`\n🪝  已注册生命周期 Hook 列表 (共 ${hooks.length} 个):\n`);
  if (hooks.length === 0) {
    console.log('    ℹ️  未配置任何 Hook。可通过以下方式添加:');
    console.log('       1. 在 .docpath/hooks/ 下放置 <event>.sh / <event>.mjs 脚本');
    console.log('       2. 在 .docpath/config.yaml 中配置 hooks.<event> 列表');
    console.log('       3. 在 .docpath/plugins/<name>/ 插件中声明 hooks\n');
    return;
  }

  const byEvent = new Map<string, typeof hooks>();
  for (const h of hooks) {
    const list = byEvent.get(h.event) || [];
    list.push(h);
    byEvent.set(h.event, list);
  }

  for (const [evt, list] of byEvent.entries()) {
    console.log(`  📌 事件: ${evt} (${list.length} 个)`);
    for (const h of list) {
      console.log(`     - [${h.source}] ${h.name} ➔ \`${h.command}\`${h.fail_fast ? ' [fail_fast]' : ''}`);
    }
    console.log('');
  }
}
