/**
 * docpath changes — 提交前只读变更收口视图。
 *
 * 报告构建逻辑见 utils/changes-report.ts；本文件仅保留渲染与 CLI 命令入口。
 */

import { buildChangesReport, type ChangesReport, type ChangeGroupName } from '../utils/changes-report.js';
import { assertWorktreeContract } from './worktree.js';

interface ChangesOptions {
  cwd: string;
  agent?: boolean;
  json?: boolean;
  since?: string;
  task?: string;
  scope?: string[];
}

const GROUP_LABELS: Record<ChangeGroupName, string> = {
  source: '源码',
  tests: '测试',
  docpath: 'DocPath 运行态',
  templates_docs: '模板/文档',
  other: '其他',
};

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderAgentYaml(report: ChangesReport): string {
  if (shouldRenderCompactAgentYaml(report)) return renderCompactAgentYaml(report);

  const lines: string[] = [];
  lines.push(`ready_to_commit: ${report.ready_to_commit}`);
  lines.push(`branch: ${yamlString(report.branch)}`);
  lines.push(`git_root: ${yamlString(report.git_root)}`);
  lines.push(`mode: ${yamlString(report.mode)}`);
  lines.push(`since: ${report.since === null ? 'null' : yamlString(report.since)}`);
  lines.push(`closeout_context: ${yamlString(report.closeout_context)}`);
  lines.push('current_task:');
  lines.push(`  task_id: ${yamlString(report.current_task.task_id)}`);
  lines.push(`  task_title: ${yamlString(report.current_task.task_title)}`);
  lines.push(`  phase: ${yamlString(report.current_task.phase)}`);
  lines.push(`  gate: ${yamlString(report.current_task.gate)}`);
  lines.push('selection:');
  lines.push(`  mode: ${yamlString(report.selection.mode)}`);
  lines.push(`  selected_task_id: ${yamlString(report.selection.selected_task_id)}`);
  lines.push(`  selected_task_title: ${yamlString(report.selection.selected_task_title)}`);
  lines.push('  scope_files:');
  for (const file of report.selection.scope_files) lines.push(`    - ${yamlString(file)}`);
  lines.push('  selected_files:');
  for (const file of report.selection.selected_files) lines.push(`    - ${yamlString(file)}`);
  lines.push('  outside_selected_task_files:');
  for (const file of report.selection.outside_selected_task_files) lines.push(`    - ${yamlString(file)}`);
  lines.push(`  outside_selected_task_note: ${report.selection.outside_selected_task_note === null ? 'null' : yamlString(report.selection.outside_selected_task_note)}`);
  lines.push('counts:');
  lines.push(`  total: ${report.counts.total}`);
  lines.push(`  staged: ${report.counts.staged}`);
  lines.push(`  unstaged: ${report.counts.unstaged}`);
  lines.push(`  untracked: ${report.counts.untracked}`);
  lines.push('groups:');
  for (const group of Object.keys(GROUP_LABELS) as ChangeGroupName[]) {
    lines.push(`  ${group}:`);
    for (const file of report.groups[group]) lines.push(`    - ${yamlString(file)}`);
  }

  // worktree_isolation: 精简输出，非 worktree 场景只输出 active 状态
  lines.push('worktree_isolation:');
  lines.push(`  active: ${report.worktree_isolation.active}`);
  if (report.worktree_isolation.active) {
    lines.push(`  expected_noise_count: ${report.worktree_isolation.expected_noise_count}`);
    lines.push('  expected_noise_files:');
    for (const file of report.worktree_isolation.expected_noise_files) lines.push(`    - ${yamlString(file)}`);
    lines.push(`  commit_relevant_count: ${report.worktree_isolation.commit_relevant_count}`);
    lines.push('  commit_relevant_files:');
    for (const file of report.worktree_isolation.commit_relevant_files) lines.push(`    - ${yamlString(file)}`);
    lines.push(`  note: ${report.worktree_isolation.note === null ? 'null' : yamlString(report.worktree_isolation.note)}`);
  }

  lines.push('artifact_policy:');
  lines.push(`  canonical_default: ${report.artifact_policy.canonical_default}`);
  lines.push(`  canonical_pattern: ${yamlString(report.artifact_policy.canonical_pattern)}`);
  lines.push(`  current_alias_policy: ${yamlString(report.artifact_policy.current_alias_policy)}`);

  // ignored_evidence: agent 模式下只保留计数和 add_command，移除文件列表
  lines.push('ignored_evidence:');
  lines.push(`  check: ${yamlString(report.ignored_evidence.check)}`);
  lines.push(`  skip_reason: ${report.ignored_evidence.skip_reason === null ? 'null' : yamlString(report.ignored_evidence.skip_reason)}`);
  lines.push(`  count: ${report.ignored_evidence.files.length}`);
  lines.push(`  canonical_count: ${report.ignored_evidence.canonical_files.length}`);
  lines.push(`  add_command: ${report.ignored_evidence.add_command === null ? 'null' : yamlString(report.ignored_evidence.add_command)}`);

  // untracked_evidence: 当前任务 canonical 路径下 untracked 非 gitignored 的证据文件
  lines.push('untracked_evidence:');
  lines.push(`  count: ${report.untracked_evidence.files.length}`);
  lines.push(`  add_command: ${report.untracked_evidence.add_command === null ? 'null' : yamlString(report.untracked_evidence.add_command)}`);
  if (report.untracked_evidence.files.length > 0) {
    lines.push('  files:');
    for (const file of report.untracked_evidence.files) lines.push(`    - ${yamlString(file)}`);
  }

  lines.push(`recommended_stage_command: ${report.recommended_stage_command === null ? 'null' : yamlString(report.recommended_stage_command)}`);
  lines.push('blocking_reasons:');
  for (const reason of report.blocking_reasons) lines.push(`  - ${yamlString(reason)}`);
  lines.push('next_actions:');
  for (const action of report.next_actions) lines.push(`  - ${yamlString(action)}`);
  lines.push(`suggested_commit_message: ${yamlString(report.suggested_commit_message)}`);
  return `${lines.join('\n')}\n`;
}

function shouldRenderCompactAgentYaml(report: ChangesReport): boolean {
  return report.mode === 'worktree'
    && report.counts.total === 0
    && report.worktree_isolation.active === false
    && report.ignored_evidence.check === 'checked'
    && report.ignored_evidence.canonical_files.length === 0
    && report.blocking_reasons.every((reason) => reason === '当前工作树没有可提交变更');
}

function renderCompactAgentYaml(report: ChangesReport): string {
  const lines: string[] = [];
  lines.push(`ready_to_commit: ${report.ready_to_commit}`);

  if (report.blocking_reasons.length > 0) {
    lines.push('blocking_reasons:');
    for (const reason of report.blocking_reasons) lines.push(`  - ${yamlString(reason)}`);
  }

  if (report.next_actions.length > 0) {
    lines.push('next_actions:');
    for (const action of report.next_actions) lines.push(`  - ${yamlString(action)}`);
  }

  if (report.ignored_evidence.add_command) {
    lines.push(`add_command: ${yamlString(report.ignored_evidence.add_command)}`);
  }
  if (report.untracked_evidence.add_command) {
    lines.push(`stage_command: ${yamlString(report.untracked_evidence.add_command)}`);
  }

  return `${lines.join('\n')}\n`;
}

function renderHuman(report: ChangesReport): string {
  const lines: string[] = [];
  lines.push('\n📦  DocPath 变更收口\n');
  lines.push(`  分支: ${report.branch}`);
  if (report.since) lines.push(`  基线: ${report.since}`);
  lines.push(`  收口上下文: ${report.closeout_context}`);
  lines.push(`  任务: ${report.current_task.task_id || '-'} ${report.current_task.task_title || ''}`.trimEnd());
  lines.push(`  选择: ${report.selection.mode} ${report.selection.selected_task_id || '-'}`.trimEnd());
  if (report.selection.scope_files.length > 0) {
    lines.push(`  显式 scope: ${report.selection.scope_files.join(', ')}`);
  }
  lines.push(`  变更: ${report.counts.total} 个文件（staged ${report.counts.staged}, unstaged ${report.counts.unstaged}, untracked ${report.counts.untracked}）`);
  lines.push(`  提交状态: ${report.ready_to_commit ? '✅ ready' : '⚠️ blocked'}`);
  lines.push('');

  for (const group of Object.keys(GROUP_LABELS) as ChangeGroupName[]) {
    const files = report.groups[group];
    if (files.length === 0) continue;
    lines.push(`  ${GROUP_LABELS[group]} (${files.length})`);
    for (const file of files) lines.push(`    - ${file}`);
  }

  if (report.worktree_isolation.active) {
    lines.push(`\n  Worktree isolation`);
    lines.push(`    expected .docpath noise: ${report.worktree_isolation.expected_noise_count}`);
    lines.push(`    commit-relevant files: ${report.worktree_isolation.commit_relevant_count}`);
    if (report.worktree_isolation.expected_noise_files.length > 0) {
      lines.push('    expected noise files');
      for (const file of report.worktree_isolation.expected_noise_files) lines.push(`      - ${file}`);
    }
    if (report.worktree_isolation.commit_relevant_files.length > 0) {
      lines.push('    commit-relevant files');
      for (const file of report.worktree_isolation.commit_relevant_files) lines.push(`      - ${file}`);
    }
  }

  if (report.selection.selected_files.length > 0 || report.selection.outside_selected_task_files.length > 0) {
    lines.push(`\n  Task-aware selection`);
    if (report.selection.selected_files.length > 0) {
      lines.push(`    selected task files (${report.selection.selected_files.length})`);
      for (const file of report.selection.selected_files) lines.push(`      - ${file}`);
    }
    if (report.selection.outside_selected_task_files.length > 0) {
      lines.push(`    outside selected task (${report.selection.outside_selected_task_files.length})`);
      for (const file of report.selection.outside_selected_task_files) lines.push(`      - ${file}`);
      if (report.selection.outside_selected_task_note) lines.push(`    note: ${report.selection.outside_selected_task_note}`);
    }
  }

  lines.push('\n  Artifact policy');
  lines.push(`    canonical default: ${report.artifact_policy.canonical_default ? 'yes' : 'no'}`);
  lines.push(`    canonical pattern: ${report.artifact_policy.canonical_pattern}`);
  lines.push(`    current alias: ${report.artifact_policy.current_alias_policy}`);

  if (report.ignored_evidence.check === 'skipped') {
    lines.push('\n  被 gitignore 忽略的 DocPath evidence');
    lines.push(`    检查已跳过: ${report.ignored_evidence.skip_reason || '当前模式不适用'}`);
  } else if (report.ignored_evidence.files.length > 0) {
    lines.push(`\n  被 gitignore 忽略的 DocPath evidence (${report.ignored_evidence.files.length})`);
    if (report.ignored_evidence.canonical_files.length > 0) {
      lines.push(`    canonical evidence (${report.ignored_evidence.canonical_files.length})`);
      for (const file of report.ignored_evidence.canonical_files) lines.push(`      - ${file}`);
    }
    if (report.ignored_evidence.alias_files.length > 0) {
      lines.push(`    alias evidence (${report.ignored_evidence.alias_files.length})`);
      for (const file of report.ignored_evidence.alias_files) lines.push(`      - ${file}`);
    }
    if (report.ignored_evidence.add_command) {
      lines.push('  提交提示');
      if (report.recommended_stage_command) {
        lines.push(`    推荐: ${report.recommended_stage_command}`);
        lines.push('    fallback:');
      }
      lines.push(`    ${report.ignored_evidence.add_command}`);
    }
  }

  if (report.blocking_reasons.length > 0) {
    lines.push('\n  阻塞原因');
    for (const reason of report.blocking_reasons) lines.push(`    - ${reason}`);
  }

  if (report.next_actions.length > 0) {
    lines.push('\n  下一步');
    for (const action of report.next_actions) lines.push(`    - ${action}`);
  }

  if (report.untracked_evidence.files.length > 0) {
    lines.push(`\n  当前任务未提交证据 (${report.untracked_evidence.files.length})`);
    for (const file of report.untracked_evidence.files) lines.push(`    - ${file}`);
    if (report.untracked_evidence.add_command) {
      lines.push(`  stage 提示: ${report.untracked_evidence.add_command}`);
    }
  }

  lines.push('\n  建议 commit message');
  lines.push(`    ${report.suggested_commit_message}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function changesCommand(options: ChangesOptions): Promise<void> {
  await assertWorktreeContract(options.cwd);
  const report = await buildChangesReport(options.cwd, {
    since: options.since,
    task: options.task,
    scope: options.scope,
  });
  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  process.stdout.write(options.agent ? renderAgentYaml(report) : renderHuman(report));
}
