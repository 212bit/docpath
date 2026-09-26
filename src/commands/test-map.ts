/**
 * docpath:test-map — Test Impact Analysis (TIA) 智能单测影响面推导与执行
 *
 * 基于 AST / Import 静态依赖图谱与 Git 改动影响面，自动推导受波及的精准单测集合。
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolveDocpathDir } from '../utils/file.js';
import { analyzeTestImpact, type TestImpactReport } from '../engine/tia.js';

export interface TestMapOptions {
  cwd: string;
  files?: string[];
  since?: string;
  run?: boolean;
  agent?: boolean;
  json?: boolean;
}

export async function testMapCommand(options: TestMapOptions): Promise<void> {
  const { cwd, files = [], since, run = false, agent = false, json = false } = options;
  const { stringify } = await import('yaml');
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
  }

  const report: TestImpactReport = await analyzeTestImpact(cwd, {
    files: files.length > 0 ? files : undefined,
    since,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (agent) {
    console.log(
      stringify({
        agent_view: 'test_impact_analysis',
        modified_files: report.modified_files,
        impacted_tests: report.impacted_tests,
        stats: report.stats,
        dependency_chains: report.dependency_chains,
      }),
    );
    return;
  }

  console.log(`\n🎯  DocPath 智能单测影响面推导 (Test Impact Analysis)\n`);
  console.log(`📊  检测到 **${report.stats.modified_count}** 个改动文件 ➔ 影响 **${report.stats.impacted_test_count} / ${report.stats.total_test_count}** 个单测`);
  console.log(`⚡  单测减载比: ${(report.stats.reduction_ratio * 100).toFixed(0)}% (节省 ${report.stats.saved_test_count} 个无关测试)\n`);

  if (report.modified_files.length > 0) {
    console.log(`📁  触发源文件:`);
    for (const f of report.modified_files) {
      console.log(`   - ${f}`);
    }
    console.log('');
  }

  if (report.impacted_tests.length === 0) {
    console.log(`✨  当前改动无需运行任何单测（无受波及测试或未修改代码逻辑）。\n`);
    return;
  }

  console.log(`🧪  受影响测试清单 (Impacted Tests):`);
  for (const t of report.impacted_tests) {
    console.log(`   👉 ${t}`);
  }
  console.log('');

  if (report.dependency_chains.length > 0) {
    console.log(`🔗  依赖推导链路:`);
    for (const c of report.dependency_chains) {
      console.log(`   • ${c.trigger_file} ➔ ${c.chain.join(' ➔ ')}`);
    }
    console.log('');
  }

  if (run) {
    console.log(`🚀  正在定向运行受影响单测: node --test ${report.impacted_tests.join(' ')}\n`);
    const result = spawnSync('node', ['--test', ...report.impacted_tests], {
      cwd,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  } else {
    console.log(`💡  提示: 加上 \`--run\` 参数可一键定向执行这些测试: \`docpath test-map --run\`\n`);
  }
}
