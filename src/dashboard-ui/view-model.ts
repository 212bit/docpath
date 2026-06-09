import type { DashboardData } from './types.js';

export type EmptyStateModel = {
  id: string;
  title: string;
  impact: string;
  command: string;
};

export type ProjectOverviewModel = {
  taskLabel: string;
  phaseLabel: string;
  stepLabel: string;
  nextCommand: string;
  recommendationReason: string;
  impactScope: string;
  attentionItems: Array<{
    id: string;
    label: string;
    severity: 'ok' | 'warning' | 'error';
    summary: string;
    detail: string;
  }>;
  emptyStates: EmptyStateModel[];
};

function compact(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function explainNextCommand(data: DashboardData): string {
  const phase = data.current.phase || 'unknown';
  const gate = data.current.gate || 'none';
  const step = data.current.current_step || '未识别步骤';
  if (gate !== 'none') return `当前 gate 为 ${gate}，下一步命令用于处理门禁或恢复流程。`;
  if (phase === 'executing') return `当前处于执行阶段，推荐继续推进 ${step} 并保持 breadcrumb/plan 同步。`;
  if (phase === 'checking') return '当前处于检查阶段，推荐优先修复质量门禁反馈。';
  if (phase === 'reviewing') return '当前处于审查阶段，推荐优先处理 review 反馈并保留证据。';
  if (phase === 'completed') return '任务已完成，推荐进入 journal 或归档确认。';
  return `当前阶段为 ${phase}，推荐命令来自 DocPath 路由状态机。`;
}

function summarizeImpact(data: DashboardData): string {
  const parts = compact([
    data.changes.available ? `${data.changes.counts.total} 个变更文件` : 'changes 不可用',
    `${data.health.attention_queue.length} 个关注信号`,
    `${data.backlog.filtered_total}/${data.backlog.total} 个 backlog 匹配`,
    data.selected_project.status === 'missing' ? '项目选择缺失' : null,
  ]);
  return parts.length > 0 ? parts.join(' · ') : '当前没有额外影响范围';
}

export function buildDashboardEmptyStates(data: DashboardData): EmptyStateModel[] {
  const states: EmptyStateModel[] = [];
  if (data.selected_project.status === 'missing') {
    states.push({
      id: 'unknown-project',
      title: '未找到请求的项目',
      impact: data.selected_project.message || '当前 root/project 不在 registry 中，页面只能展示 fallback 数据。',
      command: data.selected_project.requested
        ? `docpath dashboard --root ${data.selected_project.requested}`
        : 'docpath projects',
    });
  }
  if (!data.current.task_id) {
    states.push({
      id: 'missing-current-task',
      title: '没有活跃任务',
      impact: 'Project Overview 无法展示当前任务、阶段和步骤，只能展示项目级摘要。',
      command: 'docpath next --agent',
    });
  }
  if (data.backlog.total === 0) {
    states.push({
      id: 'missing-backlog',
      title: 'Backlog 为空',
      impact: 'Backlog 视图没有可筛选条目，需求池暂不可用于规划。',
      command: 'docpath backlog add',
    });
  }
  if (!data.settings.registry.exists || data.registry.total === 0) {
    states.push({
      id: 'missing-registry',
      title: '项目注册表不可用',
      impact: 'Global Projects/Teams 只能展示当前项目，跨项目摘要不完整。',
      command: 'docpath projects',
    });
  }
  return states;
}

export function buildProjectOverviewModel(data: DashboardData): ProjectOverviewModel {
  return {
    taskLabel: data.current.task_id || '无活跃任务',
    phaseLabel: `${data.current.phase || 'unknown'} / ${data.current.gate || 'none'}`,
    stepLabel: data.current.current_step || '-',
    nextCommand: data.next.command || data.overview.next.command || 'docpath next --agent',
    recommendationReason: explainNextCommand(data),
    impactScope: summarizeImpact(data),
    attentionItems: data.health.attention_queue.length > 0 ? data.health.attention_queue : data.health.signals.slice(0, 3),
    emptyStates: buildDashboardEmptyStates(data),
  };
}

export function readonlyCommand(command: string): string {
  return command.trim() || 'docpath next --agent';
}
