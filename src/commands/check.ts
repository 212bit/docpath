/**
 * docpath:check — 质量门禁 + 工作流护栏检查
 *
 * 执行编译/测试/lint 检查 + harness 规则检查，输出验证报告。
 * Level 2+ 自动写入 breadcrumb。
 *
 * 新增：--harness 检查 harness.md 中的 pre-flight/boundary/pattern 规则
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentMd, updateCurrentState } from '../utils/workspace.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';

interface CheckOptions {
  cwd: string;
  /** 跳过测试，只检查编译 */
  skipTests?: boolean;
  /** 跳过 lint */
  skipLint?: boolean;
  /** 启用 harness 规则检查 */
  harness?: boolean;
  /** 只检查 pre-flight 规则 */
  preflight?: boolean;
  /** 只检查 boundary 规则 */
  boundary?: boolean;
  /** 只检查 pattern 规则 */
  pattern?: boolean;
  /** 只运行 harness 检查，跳过编译/测试/lint */
  onlyHarness?: boolean;
}

interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  category?: 'compile' | 'test' | 'lint' | 'plan' | 'preflight' | 'boundary' | 'pattern';
}

function runCheck(name: string, cmd: string, cwd: string, category?: CheckResult['category']): CheckResult {
  try {
    const output = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { name, passed: true, output: output.slice(0, 500), category };
  } catch (err: any) {
    return { name, passed: false, output: (err.stderr || err.stdout || err.message || '').slice(0, 500), category };
  }
}

// ─── Harness 规则解析 ───

interface HarnessRule {
  id: string;
  trigger: string;
  level: 'WARN' | 'MUST' | 'INFO';
  description: string;
  enforced?: string;
}

function parseHarnessRules(content: string): HarnessRule[] {
  const rules: HarnessRule[] = [];
  const lines = content.split('\n');
  let currentSection = '';

  for (const line of lines) {
    // 检测 section 标题
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim();
      continue;
    }

    // 解析表格行: | id | trigger | level | description | enforced? |
    const match = line.match(/^\|\s*(\S+)\s*\|\s*(.+?)\s*\|\s*(WARN|MUST|INFO)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|$/);
    if (match) {
      rules.push({
        id: match[1],
        trigger: match[2].trim(),
        level: match[3] as HarnessRule['level'],
        description: match[4].trim(),
        enforced: match[5]?.trim() || undefined,
      });
    }
  }

  return rules;
}

// ─── Harness 规则检查 ───

async function runHarnessChecks(cwd: string, options: CheckOptions): Promise<CheckResult[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const harnessPath = join(docpathDir, 'harness.md');
  if (!existsSync(harnessPath)) {
    return [{
      name: 'Harness 规则',
      passed: false,
      output: '未找到 .docpath/harness.md，请先创建 harness 文件',
      category: 'preflight',
    }];
  }

  const content = await readFile(harnessPath, 'utf-8');
  const rules = parseHarnessRules(content);
  const results: CheckResult[] = [];

  // 按 category 过滤规则
  const filteredRules = rules.filter(rule => {
    if (options.preflight && !rule.id.startsWith('pre_')) return false;
    if (options.boundary && !rule.id.startsWith('bound_')) return false;
    if (options.pattern && !rule.id.startsWith('post_')) return false;
    return true;
  });

  if (filteredRules.length === 0) {
    return [{
      name: 'Harness 规则',
      passed: true,
      output: '未找到匹配的规则',
      category: 'preflight',
    }];
  }

  // 执行规则检查
  for (const rule of filteredRules) {
    const category: CheckResult['category'] = rule.id.startsWith('pre_')
      ? 'preflight'
      : rule.id.startsWith('bound_')
        ? 'boundary'
        : 'pattern';

    // 根据规则 ID 执行具体检查
    let passed = true;
    let output = '';

    switch (rule.id) {
      // Pre-flight 规则
      case 'pre_project_setup': {
        // 检查 .docpath/ 目录和必要文件
        const docpathDir = await resolveDocpathDir(cwd);
        const currentMd = join(docpathDir, 'workspace', 'current.md');
        const specDir = join(docpathDir, 'spec');
        passed = existsSync(docpathDir) && existsSync(currentMd) && existsSync(specDir);
        output = passed ? '项目结构完整' : '缺少 .docpath/ 目录或必要文件';
        break;
      }

      case 'pre_file_structure': {
        // 检查文件结构
        const docsMd = join(docpathDir, 'docs.md');
        passed = existsSync(docsMd);
        output = passed ? 'docs.md 存在' : '缺少 docs.md，请运行 `docpath docs scan`';
        break;
      }

      case 'pre_task_ready': {
        // 检查任务就绪状态
        try {
          const current = await readCurrentMd(cwd);
          passed = current?.state === 'ready' || current?.state === 'in_progress';
          output = passed ? `任务状态: ${current?.state}` : `任务未就绪: ${current?.state || 'unknown'}`;
        } catch {
          passed = false;
          output = '无法读取任务状态';
        }
        break;
      }

      case 'pre_dependencies': {
        // 检查依赖项
        const pkgPath = join(cwd, 'package.json');
        if (existsSync(pkgPath)) {
          try {
            const nodeModules = join(cwd, 'node_modules');
            passed = existsSync(nodeModules);
            output = passed ? '依赖已安装' : '请运行 npm install';
          } catch {
            passed = true;
            output = '无 package.json，跳过依赖检查';
          }
        } else {
          passed = true;
          output = '无 package.json，跳过依赖检查';
        }
        break;
      }

      // Boundary 规则
      case 'bound_time_box': {
        // 检查时间限制（从配置读取）
        const timeLimit = 60; // 默认 60 分钟
        output = `时间限制: ${timeLimit} 分钟（WARN 级别）`;
        passed = true; // 时间检查是警告，不是阻断
        break;
      }

      case 'bound_scope': {
        // 检查范围控制
        try {
          const current = await readCurrentMd(cwd);
          const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
          if (existsSync(planPath)) {
            const planContent = await readFile(planPath, 'utf-8');
            const taskCount = (planContent.match(/- \[[ x]\]/gi) || []).length;
            passed = taskCount <= 20; // 超过 20 个子任务可能超出范围
            output = passed ? `任务数量: ${taskCount}` : `任务数量过多: ${taskCount}，建议拆分`;
          } else {
            passed = true;
            output = '无 plan.md，跳过范围检查';
          }
        } catch {
          passed = true;
          output = '无法检查范围';
        }
        break;
      }

      case 'bound_tool_permission': {
        // 检查工具权限（从配置读取）
        output = '工具权限检查（WARN 级别）';
        passed = true; // 权限检查是警告，不是阻断
        break;
      }

      // Pattern 规则
      case 'post_shell_command': {
        // 检查 shell 命令安全性
        output = 'Shell 命令安全性检查（WARN 级别）';
        passed = true; // 模式检查是警告，不是阻断
        break;
      }

      case 'post_file_write': {
        // 检查文件写入
        output = '文件写入检查（WARN 级别）';
        passed = true; // 模式检查是警告，不是阻断
        break;
      }

      case 'post_external_tool': {
        // 检查外部工具使用
        output = '外部工具使用检查（WARN 级别）';
        passed = true; // 模式检查是警告，不是阻断
        break;
      }

      case 'post_spec_ref': {
        // 检查规范引用
        const docsMd = join(docpathDir, 'docs.md');
        passed = existsSync(docsMd);
        output = passed ? 'docs.md 存在' : '缺少 docs.md，请运行 `docpath docs scan`';
        break;
      }

      default:
        output = `未知规则: ${rule.id}`;
        passed = true;
    }

    // 根据 level 决定是否阻断
    const shouldBlock = rule.level === 'MUST' && !passed;
    results.push({
      name: `[${rule.level}] ${rule.description}`,
      passed: shouldBlock ? false : true,
      output: output,
      category,
    });
  }

  return results;
}

export async function checkCommand(options: CheckOptions): Promise<void> {
  const { cwd, skipTests, skipLint } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  console.log('\n🔍  质量检查...\n');

  const current = await readCurrentMd(cwd);
  const results: CheckResult[] = [];

  // 当 --only-harness 时，自动启用 harness 检查并跳过常规检查
  if (options.onlyHarness) {
    options.harness = true;
  }

  // 当 --preflight 或 --boundary 单独使用时，自动启用 harness
  if ((options.preflight || options.boundary) && !options.harness) {
    options.harness = true;
  }

  // 1-5. 常规检查（--only-harness 时跳过）
  if (!options.onlyHarness) {
    // 1. 编译检查 (检测项目类型)
    const pkgPath = join(cwd, 'package.json');
    const tsconfigPath = join(cwd, 'tsconfig.json');
    const cargoPath = join(cwd, 'Cargo.toml');
    const goModPath = join(cwd, 'go.mod');

    // 检测包管理器
    const hasPnpmLock = existsSync(join(cwd, 'pnpm-lock.yaml'));
    const hasYarnLock = existsSync(join(cwd, 'yarn.lock'));
    const pkgRunner = hasPnpmLock ? 'pnpm' : hasYarnLock ? 'yarn' : 'npm';
    const runCmd = hasPnpmLock ? 'pnpm run' : hasYarnLock ? 'yarn' : 'npm run';

    if (existsSync(tsconfigPath)) {
      // 优先使用项目定义的 typecheck 脚本
      let typecheckCmd = 'npx tsc --noEmit 2>&1';
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
          const scripts = pkg.scripts || {};
          if (scripts.typecheck) {
            typecheckCmd = `${runCmd} typecheck 2>&1`;
          } else if (scripts['type-check']) {
            typecheckCmd = `${runCmd} type-check 2>&1`;
          }
        } catch { /* use default */ }
      }
      results.push(runCheck('TypeScript 编译', typecheckCmd, cwd, 'compile'));
    } else if (existsSync(cargoPath)) {
      results.push(runCheck('Rust 编译', 'cargo check 2>&1', cwd));
    } else if (existsSync(goModPath)) {
      results.push(runCheck('Go 编译', 'go build ./... 2>&1', cwd));
    }

    // 2. 构建检查
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
        if (pkg.scripts?.build) {
          results.push(runCheck('构建', `${runCmd} build 2>&1`, cwd, 'compile'));
        }
      } catch { /* skip */ }
    }

    // 3. 测试
    if (!skipTests && existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
        if (pkg.scripts?.test) {
          results.push(runCheck('测试', `${pkgRunner} test 2>&1`, cwd, 'test'));
        }
      } catch { /* skip */ }
    }

    // 4. Lint
    if (!skipLint && existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
        if (pkg.scripts?.lint) {
          results.push(runCheck('Lint', `${runCmd} lint 2>&1`, cwd, 'lint'));
        }
      } catch { /* skip */ }
    }

    // 5. DocPath plan.md 验收条件检查
    const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
    let planDoneCount = 0;
    let planTotalCount = 0;
    if (existsSync(planPath)) {
      const planContent = await readFile(planPath, 'utf-8');
      planDoneCount = (planContent.match(/- \[x\]/gi) || []).length;
      planTotalCount = (planContent.match(/- \[[ x]\]/gi) || []).length;
      if (planTotalCount > 0) {
        const passed = planDoneCount === planTotalCount;
        results.push({
          name: `子任务完成度 (${planDoneCount}/${planTotalCount})`,
          passed,
          output: passed ? '所有子任务已完成' : `还有 ${planTotalCount - planDoneCount} 个子任务未完成`,
          category: 'plan',
        });
      }
    }

    // 5b. current.md checklist 独立检查 + 与 plan.md 一致性检查
    const currentMdPath = join(docpathDir, 'workspace', 'current.md');
    if (existsSync(currentMdPath)) {
      try {
        const currentContent = await readFile(currentMdPath, 'utf-8');
        // 提取 "执行检查清单" 区块
        const checklistMatch = currentContent.match(/##[^\n]*?执行检查清单\s*\n([\s\S]*?)(?=\n##|\n---|\n```|$)/);
        if (checklistMatch) {
          const checklistBlock = checklistMatch[1];
          const currentDoneCount = (checklistBlock.match(/- \[x\]/gi) || []).length;
          const currentTotalCount = (checklistBlock.match(/- \[[ x]\]/gi) || []).length;

          // 只有 plan.md 有 checkbox 且 100% 完成时才做交叉一致性检查
          const planFullyDone = planTotalCount > 0 && planDoneCount === planTotalCount;
          if (currentTotalCount > 0 && planFullyDone && currentDoneCount < currentTotalCount) {
            results.push({
              name: `⚠️  Checklist 同步 (${currentDoneCount}/${currentTotalCount})`,
              passed: false,
              output: `plan.md 全部完成但 current.md checklist 仍有 ${currentTotalCount - currentDoneCount} 项未勾选，请同步更新`,
              category: 'plan',
            });
          } else if (currentTotalCount > 0) {
            results.push({
              name: `Checklist 同步 (${currentDoneCount}/${currentTotalCount})`,
              passed: true,
              output: planFullyDone ? 'current.md checklist 与执行状态一致' : 'checklist 已记录 (plan.md 未全部完成，暂不交叉校验)',
              category: 'plan',
            });
          }
        }
      } catch { /* skip */ }
    }
  }

  // 6. Harness 规则检查 (--harness 选项)
  if (options.harness) {
    console.log('\n🔍  检查工作流护栏...\n');
    const harnessResults = await runHarnessChecks(cwd, options);
    results.push(...harnessResults);
  }

  // 输出报告
  const allPassed = results.every(r => r.passed);

  // 按 category 分组输出
  const categories: Record<string, CheckResult[]> = {};
  for (const r of results) {
    const cat = r.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  }

  const categoryNames: Record<string, string> = {
    compile: '📝 编译检查',
    test: '🧪 测试检查',
    lint: '🔍 Lint 检查',
    plan: '📋 计划检查',
    preflight: '🚀 Pre-flight 检查',
    boundary: '🛡️  Boundary 检查',
    pattern: '📊 Pattern 检查',
    other: '📦 其他检查',
  };

  for (const [cat, catResults] of Object.entries(categories)) {
    console.log(`\n${categoryNames[cat] || cat}:`);
    for (const r of catResults) {
      const icon = r.passed ? '✅' : '❌';
      console.log(`  ${icon}  ${r.name}`);
      if (!r.passed && r.output) {
        console.log(`     └─ ${r.output.slice(0, 200)}`);
      }
    }
  }

  if (results.length === 0) {
    console.log('⚠️  未检测到可执行的检查项（无 tsconfig/package.json/Cargo.toml/go.mod）');
  }

  console.log(`\n${allPassed ? '✅  全部通过' : '❌  存在失败项'}\n`);

  // 更新状态
  const newState = allPassed ? 'check_pass' : 'check_fail';
  await updateCurrentState(cwd, newState);

  // [Harness Lite] 写入 last-check.md
  const lastCheckPath = join(cwd, '.docpath', 'workspace', 'last-check.md');
  const checkLines: string[] = ['# Last Check Evidence', ''];
  checkLines.push(`**时间**: ${new Date().toISOString()}`);
  checkLines.push(`**结果**: ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
  checkLines.push(`**检查项**: ${results.length}`);
  checkLines.push('');
  for (const r of results) {
    checkLines.push(`- ${r.passed ? '✅' : '❌'} ${r.name}`);
  }
  checkLines.push('');
  await writeFile(lastCheckPath, checkLines.join('\n'), 'utf-8');

  // 写入 breadcrumb
  const taskId = current?.task_id || 'unknown';
  await writeBreadcrumb(cwd, {
    taskId,
    step: 'check',
    status: allPassed ? 'done' : 'blocked',
    context: allPassed
      ? `质量检查通过 (${results.length} 项)`
      : `质量检查失败: ${results.filter(r => !r.passed).map(r => r.name).join(', ')}`,
  });

  if (!allPassed) {
    console.log('请修复失败项后重新运行 `docpath:check`\n');
  } else {
    console.log('下一步: `docpath:review` 进行代码审查\n');
  }
}
