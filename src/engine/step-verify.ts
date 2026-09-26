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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import {
  getChangedSourceFiles,
  listTestFiles,
  selectTouchedTestFiles,
  testRelatesToFile,
  buildNodeTestCommand,
} from '../commands/check/test-scope.js';
import { readFileSafe, resolveDocpathDir } from '../utils/file.js';
import { readActiveTaskFile } from '../utils/task-files.js';

const execFileAsync = promisify(execFile);

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

export const STEP_VERIFY_MAX_TESTS = 6;

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

  // 3. 从工作区当前 git 改动的源文件自动推导关联测试
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

  // 优先级合并：直接修改的单测 > 精准同名单测 > 模糊相关单测
  const combined = Array.from(
    new Set([...directChangedTests, ...exactMatchedTests, ...fuzzyMatchedTests]),
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

/**
 * 执行步骤级即时单测验证
 */
export async function runStepTargetedVerification(
  cwd: string,
  options: StepVerifyOptions & { taskId?: string } = {},
): Promise<StepVerifyResult> {
  const { step, explicitTest, timeoutMs = 25000, taskId } = options;

  const targetTests = await resolveStepTargetedTests(cwd, { step, explicitTest, taskId });

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

  const isNode = existsSync(join(cwd, 'package.json'));
  const isGo = existsSync(join(cwd, 'go.mod'));
  const isPython = existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'requirements.txt'));
  const isRust = existsSync(join(cwd, 'Cargo.toml'));

  let cmd = '';
  let args: string[] = [];

  if (isNode) {
    cmd = 'node';
    args = ['--test', '--test-concurrency=2', '--test-isolation=process', ...targetTests];
  } else if (isGo) {
    cmd = 'go';
    args = ['test', ...targetTests];
  } else if (isPython) {
    cmd = 'pytest';
    args = [...targetTests];
  } else if (isRust) {
    cmd = 'cargo';
    args = ['test', ...targetTests];
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

  try {
    const testEnv: Record<string, string | undefined> = { ...process.env, FORCE_COLOR: '0' };
    delete testEnv.NODE_TEST_CONTEXT;
    delete testEnv.NODE_TEST_PARENT;
    delete testEnv.NODE_TEST_REPORTER;

    const res = await execFileAsync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      env: testEnv,
    });
    stdout = res.stdout || '';
    stderr = res.stderr || '';
    passed = true;
  } catch (err: any) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    passed = false;
  }

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
        .filter((l) => /ERR_ASSERTION|AssertionError|✖|fail|error|Error:/i.test(l))
        .slice(0, 8);
      if (failLines.length > 0) {
        lines.push('    ── 失败摘要 ──');
        for (const fl of failLines) {
          lines.push(`    ${fl.trim()}`);
        }
      }
    }
    lines.push('    👉 建议: 请先根据单测报错定位并修复本步骤代码，再推进下一步');
  }

  return lines.join('\n');
}
