/**
 * docpath:test-map — Test Impact Analysis (TIA) 智能单测影响面推导与执行
 *
 * 基于 AST / Import 静态依赖图谱与 Git 改动影响面，自动推导受波及的精准单测集合。
 */

import { existsSync } from 'node:fs';
import { runToolSync } from '../utils/run-tool.js';
import { resolveDocpathDir } from '../utils/file.js';
import { analyzeTestImpact, type TestImpactReport } from '../engine/tia.js';

const TEST_MAP_TIMEOUT_MS = 600_000;

function runInherited(command: string, args: string[], cwd: string): number | null {
  const result = runToolSync(command, args, {
    cwd,
    timeoutMs: TEST_MAP_TIMEOUT_MS,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (result.timedOut) {
    console.error(`\n命令超时（>${TEST_MAP_TIMEOUT_MS}ms）被终止: ${command}`);
  }
  return result.exitCode;
}

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
    const pyTests = report.impacted_tests.filter((t) => t.endsWith('.py'));
    const goTests = report.impacted_tests.filter((t) => t.endsWith('.go'));
    const rsTests = report.impacted_tests.filter((t) => t.endsWith('.rs'));
    const nodeTests = report.impacted_tests.filter((t) => /\.(mjs|cjs|js|ts|tsx|jsx)$/.test(t));

    let allPassed = true;

    // 1. Python
    if (pyTests.length > 0) {
      console.log(`🚀  正在定向运行 Python 受影响单测: pytest ${pyTests.join(' ')}\n`);
      if (runInherited('pytest', pyTests, cwd) !== 0) allPassed = false;
    }

    // 2. Go
    if (goTests.length > 0) {
      console.log(`🚀  正在定向运行 Go 受影响单测: go test ${goTests.join(' ')}\n`);
      if (runInherited('go', ['test', ...goTests], cwd) !== 0) allPassed = false;
    }

    // 3. Rust
    if (rsTests.length > 0) {
      const targets = rsTests.map((t) => t.replace(/^tests\//, '').replace(/\.rs$/, ''));
      const args = ['test', ...targets.map((t) => `--test=${t}`)];
      console.log(`🚀  正在定向运行 Rust 受影响单测: cargo ${args.join(' ')}\n`);
      if (runInherited('cargo', args, cwd) !== 0) allPassed = false;
    }

    // 4. Node / TypeScript
    if (nodeTests.length > 0) {
      console.log(`🚀  正在定向运行 Node/TS 受影响单测: node --test ${nodeTests.join(' ')}\n`);
      if (runInherited('node', ['--test', ...nodeTests], cwd) !== 0) allPassed = false;
    }

    if (!allPassed) {
      process.exit(1);
    }
  } else {
    console.log(`💡  提示: 加上 \`--run\` 参数可一键定向执行这些测试: \`docpath test-map --run\`\n`);
  }
}
