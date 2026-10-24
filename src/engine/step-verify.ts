/**
 * Step-Pass 步骤级即时单测随做随验引擎 (Step-level Immediate Targeted Test Verification)
 *
 * 在每步 step-pass / step done 时：
 * 1. 精准提取与当前步骤或当前 git 改动相关的单测文件（支持显式指定 / plan 说明提述 / 改动源码推导）
 * 2. 毫秒级靶向执行单文件或子集测试
 * 3. 即时反馈单步验证结论（通过/失败详情），避免全量收口阶段才发现回归
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { runTool, runToolOrThrow } from '../utils/run-tool.js';
import {
  getChangedSourceFiles,
  listTestFiles,
  selectTouchedTestFiles,
  testRelatesToFile,
  buildNodeTestCommand,
  resolveTestIsolationFlag,
} from './test-scope.js';
import { readFileSafe, resolveDocpathDir } from '../utils/file.js';
import { readActiveTaskFile } from '../utils/task-files.js';
import { analyzeTestImpact } from './tia.js';

export interface StepVerifyOptions {
  step?: string;
  explicitTest?: string;
  strictVerify?: boolean;
  timeoutMs?: number;
}

export interface StepVerifyResult {
  executed: boolean;
  skippedReason?: 'no_target_tests' | 'unsupported_stack' | 'manual_skip';
  passed: boolean;
  targetTests: string[];
  durationMs: number;
  passCount: number;
  failCount: number;
  output: string;
  command: string;
  summary: string;
}

export const STEP_VERIFY_MAX_TESTS = 3;

/**
 * 提取当前步骤关联的靶向测试文件列表
 */
export async function resolveStepTargetedTests(
  cwd: string,
  options: { step?: string; explicitTest?: string; taskId?: string } = {},
): Promise<string[]> {
  const { step, explicitTest, taskId } = options;
  const testFiles = listTestFiles(cwd);

  // 1. 显式指定的测试文件（--test <path>）
  if (explicitTest) {
    const cleanPath = explicitTest.replace(/\\/g, '/').replace(/^\.\/+/, '');
    if (existsSync(join(cwd, cleanPath))) {
      return [cleanPath];
    }
    // 模糊匹配
    const match = testFiles.find((t) => t.includes(cleanPath) || basename(t) === basename(cleanPath));
    if (match) return [match];
  }

  const directChangedTests = new Set<string>();
  const exactMatchedTests = new Set<string>();
  const fuzzyMatchedTests = new Set<string>();
  const tiaImpactedTests = new Set<string>();

  // 2. 从当前 plan.md / plan.json / spec.md 的步骤描述中解析测试文件提述
  if (taskId && step) {
    try {
      const docpathDir = await resolveDocpathDir(cwd);
      const planRaw = await readActiveTaskFile(docpathDir, taskId, 'plan.md');
      if (planRaw) {
        // 查找步骤相关的段落
        const stepRegex = new RegExp(`(?:^|\\n)###?\\s+${step}\\b[\\s\\S]*?(?=(?:\\n###?\\s+[A-Za-z0-9]+)|$)`, 'i');
        const stepBlock = planRaw.match(stepRegex)?.[0] || '';
        for (const tf of testFiles) {
          if (stepBlock.includes(tf) || stepBlock.includes(basename(tf))) {
            exactMatchedTests.add(tf);
          }
        }
      }
    } catch {
      // 容错
    }
  }

  // 3. TIA 智能单测影响面分析 (Test Impact Analysis 静态拓扑图谱推导)
  try {
    const tiaReport = await analyzeTestImpact(cwd);
    for (const testFile of tiaReport.impacted_tests) {
      tiaImpactedTests.add(testFile);
    }
  } catch {
    // TIA 容错降级
  }

  // 4. 从工作区当前 git 改动的源文件自动推导关联测试（基名与模糊匹配补充）
  const changedFiles = getChangedSourceFiles(cwd);
  if (changedFiles && changedFiles.length > 0) {
    // 过滤出直接被修改的测试文件
    for (const file of changedFiles) {
      const norm = file.replace(/\\/g, '/');
      if (testFiles.includes(norm) || (norm.startsWith('tests/') && norm.endsWith('.mjs'))) {
        directChangedTests.add(norm);
      }
    }

    // 根据修改的源码文件反查关联测试
    for (const cf of changedFiles) {
      const cfBase = basename(cf).replace(/\.[^.]+$/, '').toLowerCase();
      for (const tf of testFiles) {
        const tfBase = basename(tf).replace(/\.(test|spec)\.[^.]+$/, '').toLowerCase();
        if (cfBase === tfBase) {
          exactMatchedTests.add(tf);
        } else if (testRelatesToFile(tf, cf)) {
          fuzzyMatchedTests.add(tf);
        }
      }
    }
  }

  // 优先级合并：直接修改的单测 > TIA 推导受波及单测 > 精准同名单测 > 模糊相关单测
  const combined = Array.from(
    new Set([...directChangedTests, ...tiaImpactedTests, ...exactMatchedTests, ...fuzzyMatchedTests]),
  );

  // 步骤级验证严格控制数量（≤ 6 个），确保毫秒级即时反馈
  return combined.slice(0, STEP_VERIFY_MAX_TESTS);
}

/**
 * 解析测试运行输出中的 pass / fail 统计
 */
function parseTestOutputCounts(output: string): { passCount: number; failCount: number } {
  let passCount = 0;
  let failCount = 0;

  const passMatch = output.match(/pass(?:ed)?\s*[:\s]\s*(\d+)/i) || output.match(/ℹ pass\s+(\d+)/i);
  if (passMatch) {
    passCount = parseInt(passMatch[1], 10) || 0;
  } else {
    // 统计勾选标记
    const checkMarks = (output.match(/✔|√/g) || []).length;
    if (checkMarks > 0) passCount = checkMarks;
  }

  const failMatch = output.match(/fail(?:ed)?\s*[:\s]\s*(\d+)/i) || output.match(/ℹ fail\s+(\d+)/i) || output.match(/✖ failing tests:/i);
  if (failMatch) {
    const count = parseInt(failMatch[1] || '1', 10);
    failCount = Number.isNaN(count) ? 1 : count;
  } else {
    const crossMarks = (output.match(/✖|×/g) || []).length;
    if (crossMarks > 0) failCount = crossMarks;
  }

  return { passCount, failCount };
}

function getLatestMtime(dir: string): number {
  let maxMtime = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        const subMax = getLatestMtime(full);
        if (subMax > maxMtime) maxMtime = subMax;
      } else if (e.isFile()) {
        const mt = statSync(full).mtimeMs;
        if (mt > maxMtime) maxMtime = mt;
      }
    }
  } catch {}
  return maxMtime;
}

/**
 * 自动检查并确保 TypeScript / 构建产物新鲜度
 * 若 src/ 下有比 dist/ 更新的文件，或配置了 build 脚本且 dist/ 缺失，自动执行快速增量构建
 */
export async function ensureBuildFreshness(cwd: string): Promise<{ built: boolean; error?: string }> {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return { built: false };

  try {
    const pkgRaw = await readFileSafe(pkgPath);
    if (!pkgRaw) return { built: false };
    const pkg = JSON.parse(pkgRaw);
    const hasBuild = Boolean(pkg.scripts?.build);
    const hasDist = existsSync(join(cwd, 'dist'));
    const hasSrc = existsSync(join(cwd, 'src'));

    if (!hasBuild || !hasSrc) return { built: false };

    let needsBuild = !hasDist;
    if (hasDist) {
      const srcStat = getLatestMtime(join(cwd, 'src'));
      const distStat = getLatestMtime(join(cwd, 'dist'));
      if (srcStat > distStat) {
        needsBuild = true;
      }
    }

    if (needsBuild) {
      await runToolOrThrow('npm', ['run', 'build'], { cwd, timeoutMs: 30000, stdin: 'ignore' });
      return { built: true };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { built: false, error: msg };
  }
  return { built: false };
}

/**
 * 执行步骤级即时单测验证
 */
export async function runStepTargetedVerification(
  cwd: string,
  options: StepVerifyOptions & { taskId?: string } = {},
): Promise<StepVerifyResult> {
  const { step, explicitTest, taskId } = options;

  const targetTests = await resolveStepTargetedTests(cwd, { step, explicitTest, taskId });
  const effectiveTimeoutMs = options.timeoutMs ?? Math.max(30000, 15000 + targetTests.length * 8000);

  if (targetTests.length === 0) {
    return {
      executed: false,
      skippedReason: 'no_target_tests',
      passed: true,
      targetTests: [],
      durationMs: 0,
      passCount: 0,
      failCount: 0,
      output: '',
      command: '',
      summary: '未检测到与本步骤相关的单测文件，已跳过靶向执行',
    };
  }

  const hasPy = targetTests.some((t) => t.endsWith('.py'));
  const hasGo = targetTests.some((t) => t.endsWith('.go'));
  const hasRs = targetTests.some((t) => t.endsWith('.rs'));
  const hasNode = targetTests.some((t) => /\.(mjs|cjs|js|ts|tsx|jsx)$/.test(t));

  const isNode = existsSync(join(cwd, 'package.json'));
  const isGo = existsSync(join(cwd, 'go.mod'));
  const isPython = existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'requirements.txt'));
  const isRust = existsSync(join(cwd, 'Cargo.toml'));

  let cmd = '';
  let args: string[] = [];

  if (hasPy || (!hasNode && !hasGo && !hasRs && isPython)) {
    cmd = 'pytest';
    args = [...targetTests];
  } else if (hasGo || (!hasNode && !hasPy && !hasRs && isGo)) {
    cmd = 'go';
    args = ['test', ...targetTests];
  } else if (hasRs || (!hasNode && !hasPy && !hasGo && isRust)) {
    cmd = 'cargo';
    args = ['test', ...targetTests];
  } else if (hasNode || isNode) {
    // 自动自愈构建产物新鲜度
    await ensureBuildFreshness(cwd);
    const concurrency = Math.min(Math.max(targetTests.length, 1), 4);
    cmd = 'node';
    const isolationFlag = resolveTestIsolationFlag();
    args = ['--test', `--test-concurrency=${concurrency}`, ...(isolationFlag ? [isolationFlag] : []), ...targetTests];
  } else {
    return {
      executed: false,
      skippedReason: 'unsupported_stack',
      passed: true,
      targetTests,
      durationMs: 0,
      passCount: 0,
      failCount: 0,
      output: '',
      command: '',
      summary: '项目语言栈未配置靶向单测驱动',
    };
  }

  const start = performance.now();
  let stdout = '';
  let stderr = '';
  let passed = false;

  const testEnv: Record<string, string | undefined> = { ...process.env, FORCE_COLOR: '0' };
  delete testEnv.NODE_TEST_CONTEXT;
  delete testEnv.NODE_TEST_PARENT;
  delete testEnv.NODE_TEST_REPORTER;

  const res = await runTool(cmd, args, {
    cwd,
    timeoutMs: effectiveTimeoutMs,
    env: testEnv,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  stdout = res.stdout || '';
  stderr = res.stderr || '';
  passed = res.status === 'ok';

  const durationMs = Math.round(performance.now() - start);
  const fullOutput = [stdout, stderr].filter(Boolean).join('\n');
  const { passCount, failCount } = parseTestOutputCounts(fullOutput);

  const commandStr = `${cmd} ${args.join(' ')}`;
  const summary = passed
    ? `靶向单测验证通过 (${targetTests.length} 文件, 耗时 ${durationMs}ms)`
    : `靶向单测验证失败 (${targetTests.length} 文件, 耗时 ${durationMs}ms)`;

  return {
    executed: true,
    passed,
    targetTests,
    durationMs,
    passCount,
    failCount,
    output: fullOutput,
    command: commandStr,
    summary,
  };
}

/**
 * 格式化终端输出
 */
export function renderStepVerifyFeedback(result: StepVerifyResult): string {
  if (!result.executed) {
    return '';
  }

  const lines: string[] = [];
  const testListStr = result.targetTests.length <= 2
    ? result.targetTests.join(', ')
    : `${result.targetTests.slice(0, 2).join(', ')} 等 ${result.targetTests.length} 个测试`;

  if (result.passed) {
    lines.push(`🧪  单步即时单测验证: ${testListStr} (${result.durationMs}ms) ✅ 通过`);
  } else {
    lines.push(`🧪  单步即时单测验证: ${testListStr} (${result.durationMs}ms) ❌ 失败`);
    if (result.output) {
      // 提取核心失败行
      const failLines = result.output
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^(?:✖|×|FAIL|FAILED|ERROR|Error:|AssertionError|ERR_ASSERTION|assert|panic:)/i.test(l) || /test at /i.test(l))
        .slice(0, 6);
      if (failLines.length > 0) {
        lines.push('    ── 失败摘要 ──');
        for (const fl of failLines) {
          lines.push(`    ${fl}`);
        }
      }
    }
    lines.push('    👉 建议: 请先根据单测报错定位并修复本步骤代码，再推进下一步');
  }

  return lines.join('\n');
}
