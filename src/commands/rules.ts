import { resolve } from 'node:path';
import { stringify } from 'yaml';
import { resolveDocpathDir } from '../utils/file.js';
import {
  diagnoseRulesAndDecisions,
  fixRuleIssues,
  type RuleDoctorReport,
  type RuleDoctorIssue,
} from '../engine/rule-doctor.js';

export interface RuleCommandOptions {
  cwd: string;
  action?: 'doctor' | 'dedupe' | 'fix' | 'list' | 'groom';
  json?: boolean;
  agent?: boolean;
  fix?: boolean;
  similarityThreshold?: number;
  maxBudgetLines?: number;
}

function printHumanReport(report: RuleDoctorReport): void {
  console.log('\n🩺  DocPath Rule & ADR Doctor 规则与决策体检\n');

  console.log(`📊  规则统计:`);
  console.log(`  - 规则文件: ${report.stats.totalRuleFiles} 个`);
  console.log(`  - 规则条目: ${report.stats.totalRules} 条`);
  console.log(`  - ADR 决策: ${report.stats.totalDecisions} 条`);
  console.log(`  - 总行数: ${report.stats.totalBudgetLines} 行\n`);

  if (report.issues.length === 0) {
    console.log('✅  所有规则与 ADR 检查通过，无冗余重复、语义冲突或失效引用！\n');
    return;
  }

  console.log(`📋  体检发现 (${report.errors} 错误, ${report.warnings} 警告, ${report.infos} 提示):\n`);

  const categoryEmojis: Record<string, string> = {
    duplicate: '🔴 [重复规则]',
    semantic_conflict: '💥 [语义冲突]',
    near_duplicate: '🟡 [高度相似]',
    stale_reference: '⚠️  [失效引用]',
    budget_exceeded: '📏 [超出预算]',
    superseded_adr: '🔄 [ADR 覆盖]',
    empty_rule: '📝 [内容缺失]',
  };

  for (const issue of report.issues) {
    const prefix = categoryEmojis[issue.category] || `[${issue.category}]`;
    const severityIcon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';

    console.log(`  ${severityIcon} ${prefix} ${issue.target}`);
    console.log(`     ${issue.message}`);
    console.log(`     💡 建议: ${issue.recommendation}\n`);
  }

  if (report.passed) {
    console.log(`✅  rule doctor 通过 (${report.warnings} 警告)`);
  } else {
    console.log(`❌  rule doctor 发现 ${report.errors} 个错误需要处理`);
  }
}

export async function ruleCommand(options: RuleCommandOptions): Promise<void> {
  const { cwd, action = 'doctor', json = false, agent = false, fix = false } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (action === 'dedupe' || action === 'fix' || fix) {
    const fixResult = await fixRuleIssues(docpathDir, { repoRoot: cwd });
    if (agent) {
      console.log(stringify({
        agent_view: 'rule_fix',
        fixed_duplicates: fixResult.fixedDuplicates,
        cleaned_stale_refs: fixResult.cleanedStaleRefs,
      }));
    } else if (json) {
      console.log(JSON.stringify(fixResult, null, 2));
    } else {
      console.log(`\n🧹  已自动清理 ${fixResult.fixedDuplicates} 个完全重复规则条目，清除 ${fixResult.cleanedStaleRefs} 处失效 Evidence 引用。\n`);
    }
    return;
  }

  const report = await diagnoseRulesAndDecisions({
    cwd,
    maxBudgetLines: options.maxBudgetLines,
    similarityThreshold: options.similarityThreshold,
  });

  if (agent) {
    console.log(stringify({
      agent_view: 'rule_doctor',
      passed: report.passed,
      errors: report.errors,
      warnings: report.warnings,
      infos: report.infos,
      stats: report.stats,
      issues: report.issues.map((i) => ({
        id: i.id,
        severity: i.severity,
        category: i.category,
        target: i.target,
        message: i.message,
        recommendation: i.recommendation,
        fixable: !!i.fixable,
      })),
    }));
  } else if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (!report.passed && !agent) {
    process.exitCode = 1;
  }
}
