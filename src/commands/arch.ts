/**
 * docpath:arch — 架构分层依赖与防腐门禁体检
 *
 * 校验分层单向流动 (types -> utils -> engine -> governance -> commands -> cli)，
 * 自动拦截逆向引用与循环依赖。
 */

import { existsSync } from 'node:fs';
import { resolveDocpathDir } from '../utils/file.js';
import {
  checkArchitectureLayers,
  DEFAULT_ARCH_LAYERS,
  type ArchitectureReport,
} from '../engine/arch-guard.js';

export interface ArchOptions {
  cwd: string;
  action?: 'check' | 'layers' | 'cycles';
  strict?: boolean;
  agent?: boolean;
  json?: boolean;
}

export async function archCommand(options: ArchOptions): Promise<void> {
  const { cwd, action = 'check', strict = false, agent = false, json = false } = options;
  const { stringify } = await import('yaml');
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
  }

  // 1. Action: layers 展示分层规则
  if (action === 'layers') {
    if (json) {
      console.log(JSON.stringify(DEFAULT_ARCH_LAYERS, null, 2));
      return;
    }
    if (agent) {
      console.log(
        stringify({
          agent_view: 'arch_layers',
          layers: DEFAULT_ARCH_LAYERS.map((l) => ({
            name: l.name,
            level: l.level,
            pattern: l.pattern.source,
            description: l.description,
          })),
        }),
      );
      return;
    }

    console.log(`\n🏛️  DocPath 架构分层防腐规范体系\n`);
    for (const l of DEFAULT_ARCH_LAYERS) {
      console.log(`  [Layer ${l.level}] ${l.name.padEnd(12)} : ${l.description}`);
    }
    console.log(`\n💡  核心约束: 低层级模块（如 types, utils）绝对禁止反向依赖高层级模块（如 commands, engine）\n`);
    return;
  }

  const report: ArchitectureReport = await checkArchitectureLayers(cwd, { strict });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed && strict) process.exit(1);
    return;
  }

  if (agent) {
    console.log(
      stringify({
        agent_view: 'arch_check',
        passed: report.passed,
        stats: report.stats,
        layer_stats: report.layer_stats,
        violations: report.violations,
        circular_cycles: report.circular_cycles.map((c) => c.display),
      }),
    );
    if (!report.passed && strict) process.exit(1);
    return;
  }

  console.log(`\n🏛️  DocPath 架构分层与依赖防腐体检\n`);
  console.log(`📊  体检结果: 扫描 **${report.stats.total_files}** 个模块 | 发现 **${report.stats.errors}** 错误, **${report.stats.warnings}** 警告`);
  console.log(`${'─'.repeat(50)}\n`);

  console.log(`📦  模块分层分布:`);
  for (const [layer, count] of Object.entries(report.layer_stats)) {
    console.log(`   - ${layer.padEnd(12)}: ${count} 个源文件`);
  }
  console.log('');

  if (report.violations.length === 0) {
    console.log(`✅  架构防腐体检全部通过！模块单向流动完好，无循环依赖。\n`);
    return;
  }

  console.log(`🚨  发现架构违规项:`);
  for (const v of report.violations) {
    const icon = v.severity === 'error' ? '❌' : '⚠️';
    console.log(`   ${icon} [${v.type}] ${v.file}`);
    console.log(`      ➜ ${v.message}`);
    console.log(`      💡 规范: ${v.rule}`);
  }
  console.log('');

  if (report.circular_cycles.length > 0) {
    console.log(`🔄  循环依赖拓扑环:`);
    for (const cycle of report.circular_cycles) {
      console.log(`   🔁 ${cycle.display}`);
    }
    console.log('');
  }

  if (!report.passed) {
    console.log(`❌  架构体检未通过，请修复上述分层逆向依赖！\n`);
    if (strict) process.exit(1);
  } else {
    console.log(`💡  体检完成，当前警告项建议在后续重构中解耦。\n`);
  }
}
