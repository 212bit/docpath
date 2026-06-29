import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { CheckOptions, CheckResult, HarnessRule, HarnessEvaluation } from './types.js';
import { readCurrentState } from '../../utils/workspace.js';
import { readActiveTaskFile } from '../../utils/task-files.js';

export function parseHarnessRules(content: string): HarnessRule[] {
  const rules: HarnessRule[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('## ')) {
      continue;
    }

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

export function harnessRuleCategory(ruleId: string): CheckResult['category'] {
  if (ruleId.startsWith('pre_')) return 'preflight';
  if (ruleId.startsWith('bound_')) return 'boundary';
  return 'pattern';
}

export function shouldRunHarnessRule(rule: HarnessRule, options: CheckOptions): boolean {
  if (options.preflight && !rule.id.startsWith('pre_')) return false;
  if (options.boundary && !rule.id.startsWith('bound_')) return false;
  if (options.pattern && !rule.id.startsWith('post_')) return false;
  return true;
}

export function missingHarnessResult(): CheckResult {
  return {
    name: 'Harness 规则',
    passed: false,
    output: '未找到 .docpath/harness.md，请先创建 harness 文件',
    category: 'preflight',
  };
}

export function noMatchingHarnessRulesResult(): CheckResult {
  return {
    name: 'Harness 规则',
    passed: true,
    output: '未找到匹配的规则',
    category: 'preflight',
  };
}

export async function evaluatePreflightRule(ruleId: string, cwd: string, docpathDir: string): Promise<HarnessEvaluation> {
  switch (ruleId) {
    case 'pre_project_setup': {
      const currentMd = join(docpathDir, 'workspace', 'current.md');
      const specDir = join(docpathDir, 'spec');
      const passed = existsSync(docpathDir) && existsSync(currentMd) && existsSync(specDir);
      return { passed, output: passed ? '项目结构完整' : '缺少 .docpath/ 目录或必要文件' };
    }

    case 'pre_file_structure': {
      const docsMd = join(docpathDir, 'docs.md');
      const passed = existsSync(docsMd);
      return { passed, output: passed ? 'docs.md 存在' : '缺少 docs.md，请运行 `docpath docs scan`' };
    }

    case 'pre_task_ready': {
      try {
        const current = await readCurrentState(cwd);
        const passed = current?.state === 'ready' || current?.state === 'in_progress';
        return { passed, output: passed ? `任务状态: ${current?.state}` : `任务未就绪: ${current?.state || 'unknown'}` };
      } catch {
        return { passed: false, output: '无法读取任务状态' };
      }
    }

    case 'pre_dependencies': {
      const pkgPath = join(cwd, 'package.json');
      if (!existsSync(pkgPath)) return { passed: true, output: '无 package.json，跳过依赖检查' };
      const nodeModules = join(cwd, 'node_modules');
      const passed = existsSync(nodeModules);
      return { passed, output: passed ? '依赖已安装' : '请运行 npm install' };
    }

    default:
      return { passed: true, output: `未知规则: ${ruleId}` };
  }
}

export async function evaluateBoundaryRule(ruleId: string, cwd: string, docpathDir: string): Promise<HarnessEvaluation> {
  switch (ruleId) {
    case 'bound_time_box': {
      const timeLimit = 60;
      return { passed: true, output: `时间限制: ${timeLimit} 分钟（WARN 级别）` };
    }

    case 'bound_scope': {
      try {
        const state = await readCurrentState(cwd);
        const planContent = await readActiveTaskFile(docpathDir, state?.task_id, 'plan.md');
        if (!planContent.trim()) return { passed: true, output: '无 plan.md，跳过范围检查' };
        const taskCount = (planContent.match(/- \[[ x]\]/gi) || []).length;
        const passed = taskCount <= 20;
        return { passed, output: passed ? `任务数量: ${taskCount}` : `任务数量过多: ${taskCount}，建议拆分` };
      } catch {
        return { passed: true, output: '无法检查范围' };
      }
    }

    case 'bound_tool_permission':
      return { passed: true, output: '工具权限检查（WARN 级别）' };

    default:
      return { passed: true, output: `未知规则: ${ruleId}` };
  }
}

export function evaluatePatternRule(ruleId: string, docpathDir: string): HarnessEvaluation {
  switch (ruleId) {
    case 'post_shell_command':
      return { passed: true, output: 'Shell 命令安全性检查（WARN 级别）' };

    case 'post_file_write':
      return { passed: true, output: '文件写入检查（WARN 级别）' };

    case 'post_external_tool':
      return { passed: true, output: '外部工具使用检查（WARN 级别）' };

    case 'post_spec_ref': {
      const docsMd = join(docpathDir, 'docs.md');
      const passed = existsSync(docsMd);
      return { passed, output: passed ? 'docs.md 存在' : '缺少 docs.md，请运行 `docpath docs scan`' };
    }

    default:
      return { passed: true, output: `未知规则: ${ruleId}` };
  }
}

export async function evaluateHarnessRule(rule: HarnessRule, cwd: string, docpathDir: string): Promise<HarnessEvaluation> {
  const category = harnessRuleCategory(rule.id);
  if (category === 'preflight') return evaluatePreflightRule(rule.id, cwd, docpathDir);
  if (category === 'boundary') return evaluateBoundaryRule(rule.id, cwd, docpathDir);
  return evaluatePatternRule(rule.id, docpathDir);
}

export async function runSingleHarnessRule(rule: HarnessRule, cwd: string, docpathDir: string): Promise<CheckResult> {
  const category = harnessRuleCategory(rule.id);
  const evaluation = await evaluateHarnessRule(rule, cwd, docpathDir);
  const shouldBlock = rule.level === 'MUST' && !evaluation.passed;

  return {
    name: `[${rule.level}] ${rule.description}`,
    passed: shouldBlock ? false : true,
    output: evaluation.output,
    category,
  };
}

export async function runHarnessChecks(cwd: string, docpathDir: string, options: CheckOptions): Promise<CheckResult[]> {
  const harnessPath = join(docpathDir, 'harness.md');
  if (!existsSync(harnessPath)) return [missingHarnessResult()];

  const content = await readFile(harnessPath, 'utf-8');
  const rules = parseHarnessRules(content);
  const filteredRules = rules.filter(rule => shouldRunHarnessRule(rule, options));
  if (filteredRules.length === 0) return [noMatchingHarnessRulesResult()];

  return Promise.all(filteredRules.map(rule => runSingleHarnessRule(rule, cwd, docpathDir)));
}
