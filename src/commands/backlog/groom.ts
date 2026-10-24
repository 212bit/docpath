/**
 * docpath backlog — groom 巡检与报告
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import {
  detectBacklogIdCollisions,
  listBacklogItems,
  refreshBacklogIndex,
  writeBacklogItem,
  type BacklogIdCollision,
  type BacklogItem,
} from '../../engine/backlog.js';
import { diagnoseBacklogCommitDrift } from '../../engine/backlog-commit-drift.js';
import {
  auditBacklogHygiene,
  autoFixBacklogHygiene,
  type BacklogGroomIssue,
} from '../../engine/backlog-groom.js';
import { resolveDocpathDir } from '../../utils/file.js';
import { readinessRank } from './evidence.js';
import {
  getMarkdownSection,
  hasSection,
  isPlaceholderBody,
  isPlaceholderValue,
} from './markdown.js';
import type { BacklogCommandOptions } from './types.js';

function inspectBacklogItem(item: BacklogItem): BacklogGroomIssue[] {
  const issues: BacklogGroomIssue[] = [];
  if ((item.status === 'proposed' || item.status === 'accepted') && !hasSection(item.body, '背景')) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'body.background',
      message: '条目正文缺少 `## 背景` 章节',
      suggestion: `docpath backlog edit ${item.id} --background <text> --acceptance <text>`,
    });
  }
  if ((item.status === 'proposed' || item.status === 'accepted') && !hasSection(item.body, '验收')) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'body.acceptance',
      message: '条目正文缺少 `## 验收` 章节',
      suggestion: `docpath backlog edit ${item.id} --background <text> --acceptance <text>`,
    });
  }
  const bg = getMarkdownSection(item.body, '背景');
  const ac = getMarkdownSection(item.body, '验收');
  if (bg !== null || ac !== null) {
    if (item.status === 'proposed' || item.status === 'accepted') {
      if (isPlaceholderValue(bg)) {
        issues.push({
          id: item.id,
          severity: 'error',
          field: 'body.background',
          message: '条目正文 `## 背景` 章节为空或包含占位内容',
          suggestion: `docpath backlog edit ${item.id} --background <text>`,
        });
      }
      if (isPlaceholderValue(ac)) {
        issues.push({
          id: item.id,
          severity: 'error',
          field: 'body.acceptance',
          message: '条目正文 `## 验收` 章节为空或包含占位内容',
          suggestion: `docpath backlog edit ${item.id} --acceptance <text>`,
        });
      }
    }
  } else {
    if ((item.status === 'proposed' || item.status === 'accepted') && isPlaceholderBody(item.body)) {
      issues.push({
        id: item.id,
        severity: 'error',
        field: 'body',
        message: '条目正文为空或仍包含占位内容',
        suggestion: `docpath backlog edit ${item.id} --body-file <path>`,
      });
    }
  }
  if (
    item.status !== 'dropped'
    && item.status !== 'proposed'
    && item.status !== 'accepted'
    && isPlaceholderBody(item.body)
  ) {
    if (bg !== null || ac !== null) {
      if (isPlaceholderValue(bg)) {
        issues.push({
          id: item.id,
          severity: 'error',
          field: 'body.background',
          message: '条目正文 `## 背景` 章节为空或包含占位内容',
          suggestion: `docpath backlog edit ${item.id} --background <text>`,
        });
      }
      if (isPlaceholderValue(ac)) {
        issues.push({
          id: item.id,
          severity: 'error',
          field: 'body.acceptance',
          message: '条目正文 `## 验收` 章节为空或包含占位内容',
          suggestion: `docpath backlog edit ${item.id} --acceptance <text>`,
        });
      }
    } else {
      issues.push({
        id: item.id,
        severity: 'error',
        field: 'body',
        message: '条目正文为空或仍包含占位内容',
        suggestion: `docpath backlog edit ${item.id} --body-file <path>`,
      });
    }
  }
  if (item.status !== 'dropped' && item.level >= 2 && readinessRank(item.readiness) < readinessRank('analyzed')) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'readiness',
      message: `level ${item.level} 条目成熟度不足: ${item.readiness}`,
      suggestion: `docpath backlog edit ${item.id} --readiness analyzed --evidence-analysis <path>`,
    });
  }
  if (item.status !== 'dropped' && item.level >= 3 && !item.evidence.user_confirmed) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'evidence.user_confirmed',
      message: 'level 3 条目缺少用户确认依据',
      suggestion: `docpath backlog edit ${item.id} --readiness confirmed --user-confirmed <text>`,
    });
  }
  if (item.status === 'done' && item.links.spec && isPlaceholderBody(item.body)) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'body.stale_from_spec',
      message: 'done 条目已关联 spec，但 backlog 正文仍未从 spec 回填',
      suggestion: '重新运行 journal 回填，或用 docpath backlog edit 补充正文',
    });
  }
  if ((item.status === 'active' || item.status === 'done') && !item.links.task) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'links.task',
      message: 'active/done 条目缺少 task 链接',
      suggestion: '确认任务归档或手工修复 backlog links.task',
    });
  }
  if ((item.status === 'active' || item.status === 'done') && !item.links.spec) {
    issues.push({
      id: item.id,
      severity: 'error',
      field: 'links.spec',
      message: 'active/done 条目缺少 spec 链接',
      suggestion: '确认任务归档或手工修复 backlog links.spec',
    });
  }
  return issues;
}

async function collectBacklogGroomIssues(options: BacklogCommandOptions): Promise<{ issues: BacklogGroomIssue[]; warnings: BacklogGroomIssue[] }> {
  const docpathDir = await resolveDocpathDir(options.cwd);
  const issues: BacklogGroomIssue[] = [];
  const warnings: BacklogGroomIssue[] = [];

  if (!existsSync(join(docpathDir, 'backlog', 'backlog.md'))) {
    issues.push({
      id: 'backlog.md',
      severity: 'error',
      field: 'index',
      message: '缺少 backlog 索引文件 .docpath/backlog/backlog.md',
      suggestion: 'docpath backlog refresh',
    });
  }

  const items = await listBacklogItems(options.cwd);
  for (const item of items) {
    issues.push(...inspectBacklogItem(item));
  }

  const hygiene = auditBacklogHygiene(items);
  issues.push(...hygiene.issues);
  warnings.push(...hygiene.warnings);

  // 提交说明引用了仍开放的条目：告警，不计入 issues（不让 groom 失败）。
  try {
    const drift = await diagnoseBacklogCommitDrift(options.cwd);
    for (const warning of drift.warnings) {
      warnings.push({
        id: warning.id,
        severity: 'warning',
        field: 'git.commit',
        message: warning.message,
        suggestion: warning.suggestion,
      });
    }
  } catch {
    // 无 git 或日志不可读：保持 groom 原有结论。
  }

  return { issues, warnings };
}

function renderGroomReport(issues: BacklogGroomIssue[], warnings: BacklogGroomIssue[] = [], collisions: BacklogIdCollision[] = []): string {
  const lines = ['', '🧹  Backlog 健康检查', ''];
  if (issues.length === 0) {
    lines.push('✅  Backlog 健康检查通过');
  } else {
    lines.push(`❌  发现 ${issues.length} 个问题`);
    lines.push('');
    for (const issue of issues) {
      lines.push(`- [${issue.id}] ${issue.field}: ${issue.message}`);
      lines.push(`  修复建议: ${issue.suggestion}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push(`⚠️  发现 ${warnings.length} 个治理建议/改进提示:`);
    for (const warning of warnings) {
      lines.push(`- ⚠️ [${warning.id}] ${warning.field}: ${warning.message}`);
      lines.push(`  建议: ${warning.suggestion}`);
    }
  }

  if (collisions.length > 0) {
    lines.push('');
    lines.push(`⚠️  检测到 ${collisions.length} 起 id 撞号（active 与 archived 同 id 并存；非破坏性告警，不计入健康检查失败）:`);
    for (const collision of collisions) {
      lines.push(`- [${collision.id}] active「${collision.active_title}」 vs archived「${collision.archived_title}」${collision.identical ? '（内容一致）' : '（内容不同=两条不同需求）'}`);
    }
    lines.push('  说明: 多为 R-273 前 worktree 号池 stale 的历史残留；refreshBacklogIndex 拒绝覆盖以保护两条记录。');
    lines.push('  处理: 需经独立迁移条目重新分配 id 并修正 links，勿在本命令内自动改数据。');
  }

  lines.push('');
  return lines.join('\n');
}

export async function backlogGroom(options: BacklogCommandOptions): Promise<void> {
  if (options.fix) {
    const allItems = await listBacklogItems(options.cwd);
    const { fixedCount, fixes } = await autoFixBacklogHygiene(
      options.cwd,
      allItems,
      writeBacklogItem,
      refreshBacklogIndex,
    );
    if (!options.agent && fixedCount > 0) {
      console.log(`🔧  Backlog 自动修复完成 (已修复 ${fixedCount} 项):`);
      for (const fix of fixes) {
        console.log(`    - ${fix}`);
      }
      console.log('');
    }
  }

  const { issues, warnings } = await collectBacklogGroomIssues(options);
  // R-321/FR-2：撞号检测为非破坏性告警，不计入 issues（不触发 groom 失败），
  // 只把 refreshBacklogIndex 归档时的「静默跳过」显式暴露；数据迁移另走独立条目。
  const collisions = await detectBacklogIdCollisions(options.cwd);

  if (options.agent) {
    console.log(stringify({
      passed: issues.length === 0,
      issue_count: issues.length,
      warning_count: warnings.length,
      issues,
      warnings,
      id_collisions: collisions,
    }));
  } else {
    console.log(renderGroomReport(issues, warnings, collisions));
  }

  if (issues.length > 0) {
    throw new Error(`docpath backlog groom failed: ${issues.length} issue(s)`);
  }
}
