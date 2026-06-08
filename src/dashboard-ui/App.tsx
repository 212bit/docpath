import { useState, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Compass,
  FolderKanban,
  GitBranch,
  Layers3,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { DashboardData } from './types.js';

type DashboardAppProps = {
  data: DashboardData;
};

const coreViews = [
  { id: 'overview', label: '工作台总览', icon: Compass },
  { id: 'team', label: '团队驾驶舱', icon: Users },
  { id: 'backlog', label: '工作待办', icon: FolderKanban },
  { id: 'changes', label: '代码变更', icon: GitBranch },
  { id: 'handoff', label: '交接审计', icon: ShieldCheck },
  { id: 'docs-index', label: '文档索引', icon: ClipboardList },
  { id: 'activity', label: '最近活动', icon: Activity },
  { id: 'settings', label: '系统配置', icon: Settings },
] as const;

function statusLabel(value: string | boolean | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function Metric({ label, value, field, detail }: { label: string; value: string | number | boolean | null | undefined; field?: string; detail?: string }) {
  return <div className="react-metric" data-search-item data-search-text={`${label} ${statusLabel(value)} ${detail || ''}`}>
    <span>{label}</span>
    <strong {...(field ? { 'data-live-field': field } : {})}>{statusLabel(value)}</strong>
    {detail ? <small>{detail}</small> : null}
  </div>;
}

function CopyButton({ command }: { command: string }) {
  return <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button className="react-icon-button" type="button" data-copy-command={command} aria-label="复制下一步命令">
          <ClipboardList size={16} aria-hidden="true" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="react-tooltip" sideOffset={8}>复制命令<Tooltip.Arrow className="react-tooltip-arrow" /></Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>;
}

function Shell({ data }: DashboardAppProps) {
  return <header className="react-shell">
    <div>
      <p className="react-eyebrow">本地只读 · Agent 工作台</p>
      <h1>DocPath 工作台</h1>
      <p className="react-subtitle">核心工作台视图已全部重写至纯 React SPA 架构。</p>
    </div>
    <div className="react-shell-actions" aria-label="工作台控制">
      <div className="react-palette" data-command-palette data-palette-items={JSON.stringify(data.command_palette)}>
        <input type="search" placeholder="Command Palette" data-palette-input aria-label="Command Palette" />
        <div className="react-palette-results" data-palette-results />
      </div>
      <button className="react-command" type="button" data-refresh>
        <RefreshCw size={16} aria-hidden="true" />刷新只读数据
      </button>
      <span className="react-sync" data-sync-status>只读数据 · <span data-live-field="generated_at">{data.generated_at}</span></span>
    </div>
  </header>;
}

function SearchStrip() {
  return <section className="react-search" data-search-filter>
    <Search size={16} aria-hidden="true" />
    <input type="search" placeholder="过滤核心工作台内容" data-search-input aria-label="只读过滤工作台内容" />
    <button type="button" data-search-clear>清除</button>
    <span><b data-search-count>0</b> 项匹配</span>
    <small data-search-empty className="search-empty">没有匹配项</small>
  </section>;
}

function HealthDot({ value }: { value: string }) {
  return <span className={`react-health-dot ${value}`} aria-hidden="true" />;
}

function CockpitStat({ label, value, field, detail }: { label: string; value: string | number | boolean | null | undefined; field?: string; detail?: string }) {
  return <div className="react-cockpit-stat" data-search-item data-search-text={`${label} ${statusLabel(value)} ${detail || ''}`}>
    <span>{label}</span>
    <strong {...(field ? { 'data-live-field': field } : {})}>{statusLabel(value)}</strong>
    {detail ? <small>{detail}</small> : null}
  </div>;
}

function CockpitTopbar({ data }: DashboardAppProps) {
  return <header className="react-cockpit-topbar" data-search-item data-search-text="Team Portfolio Cockpit DocPath Cockpit 多项目团队驾驶舱 只读">
    <div className="react-cockpit-brand">
      <p className="react-eyebrow">Team Portfolio Cockpit</p>
      <h1>DocPath Cockpit</h1>
      <p>多项目团队驾驶舱 · Phase 1 只读信息架构</p>
    </div>
    <div className="react-cockpit-status" aria-label="Team Cockpit 状态">
      <CockpitStat label="项目" value={data.team.total_projects} field="team_total_projects" detail={`registry ${data.registry.total}`} />
      <CockpitStat label="活跃" value={data.team.active_projects} field="team_active_projects" detail="executing / checking" />
      <CockpitStat label="关注" value={data.team.attention_projects} field="team_attention_projects" detail={data.health.status} />
      <CockpitStat label="可交接" value={data.handoff.progress.done === data.handoff.progress.total ? 'READY' : data.handoff.progress.done} field="handoff_progress" detail={`${data.handoff.progress.done}/${data.handoff.progress.total}`} />
    </div>
    <div className="react-shell-actions" aria-label="工作台控制">
      <button className="react-command" type="button" data-refresh>
        <RefreshCw size={16} aria-hidden="true" />刷新只读数据
      </button>
    </div>
  </header>;
}

function ProjectRail({ data }: DashboardAppProps) {
  const projects = data.team.portfolio.length > 0
    ? data.team.portfolio
    : [{
        name: data.project.name,
        root: data.project.root,
        stack: [data.project.language, data.project.framework].filter(Boolean).join(' / ') || data.project.type,
        phase: data.current.phase,
        gate: data.current.gate,
        task_id: data.current.task_id,
        task_title: data.current.task_title,
        health: data.health.status,
        next_action: data.next.action,
        last_seen_at: data.generated_at,
        href: '#overview',
      }];
  return <aside className="react-project-rail" data-search-item data-search-text="项目导航 Project Navigation phase gate registry">
    <div className="react-rail-heading">
      <FolderKanban size={18} aria-hidden="true" />
      <div><p className="react-eyebrow">Project Navigation</p><h2>项目导航</h2></div>
    </div>
    <div className="react-rail-search">
      <Search size={15} aria-hidden="true" />
      <span>使用全局搜索过滤项目与队列</span>
    </div>
    <ul className="react-project-list" data-team-portfolio>
      {projects.map((project) => <li key={project.root}>
        <a href={project.href}>
          <span><HealthDot value={project.health} />{project.name}</span>
          <small>{project.phase} / {project.gate}</small>
          <small>{project.task_id || 'no task'} · {project.stack}</small>
        </a>
      </li>)}
    </ul>
  </aside>;
}

function WorkflowLanes({ data }: DashboardAppProps) {
  return <section className="react-cockpit-panel react-workflow-lanes" data-search-item data-search-text="Workflow Lanes 阶段推进泳道 phase lanes">
    <div className="react-section-title">
      <GitBranch size={18} aria-hidden="true" />
      <div><p className="react-eyebrow">Workflow Lanes</p><h2>阶段推进泳道</h2></div>
    </div>
    <div className="react-lane-grid" data-team-phase-lanes>
      {data.team.phase_lanes.map((lane) => <article key={lane.phase} className="react-lane">
        <header><b>{lane.phase}</b><strong>{lane.count}</strong></header>
        <ul>{lane.projects.map((project) => <li key={`${lane.phase}-${project.name}-${project.task_id}`}>
          <a href={project.href}>{project.name}</a>
          <small>{project.gate} · {project.task_id || '-'}</small>
        </li>)}</ul>
      </article>)}
    </div>
  </section>;
}

function DeliveryQueues({ data }: DashboardAppProps) {
  const riskGroup = data.team.delivery_groups.find((group) => group.id === 'risk');
  const handoffGroup = data.team.delivery_groups.find((group) => group.id === 'handoff_ready');
  return <section className="react-queue-grid">
    <article className="react-cockpit-panel" data-search-item data-search-text="Risk Queue 风险队列 关注优先级">
      <div className="react-section-title">
        <AlertTriangle size={18} aria-hidden="true" />
        <div><p className="react-eyebrow">Risk Queue</p><h2>风险队列</h2></div>
      </div>
      <ul className="react-queue-list" data-team-health-layers>
        {data.team.health_layers.map((layer) => <li key={layer.severity}>
          <span><HealthDot value={layer.severity} />{layer.label}</span>
          <strong>{layer.count}</strong>
          <small>{layer.projects[0]?.next_action || riskGroup?.description || '暂无风险项目'}</small>
        </li>)}
      </ul>
    </article>
    <article className="react-cockpit-panel" data-search-item data-search-text="Next Queue 跨项目下一步 推荐下一步">
      <div className="react-section-title">
        <ClipboardList size={18} aria-hidden="true" />
        <div><p className="react-eyebrow">Next Queue</p><h2>跨项目下一步</h2></div>
      </div>
      <ul className="react-queue-list" data-team-next-queue>
        {data.team.next_queue.slice(0, 5).map((item) => <li key={`${item.root}-${item.task_id}`}>
          <a href={item.href}>{item.name}</a>
          <strong>{item.next_action}</strong>
          <small>{item.phase} / {item.gate} · {item.task_id || '-'}</small>
        </li>)}
      </ul>
    </article>
    <article className="react-cockpit-panel" data-search-item data-search-text="Handoff Queue 交接准备 可交接">
      <div className="react-section-title">
        <ShieldCheck size={18} aria-hidden="true" />
        <div><p className="react-eyebrow">Handoff Queue</p><h2>交接准备</h2></div>
      </div>
      <ul className="react-queue-list" data-team-delivery-groups>
        {(handoffGroup?.projects || []).slice(0, 4).map((project) => <li key={`${project.root}-${project.task_id}`}>
          <a href={project.href}>{project.name}</a>
          <strong>{project.next_action}</strong>
          <small>{project.phase} / {project.gate}</small>
        </li>)}
        {(handoffGroup?.projects || []).length === 0 ? <li><span>暂无可交接项目</span><small>完成 check/review 后会进入交接队列</small></li> : null}
      </ul>
    </article>
  </section>;
}

function CurrentProjectConsole({ data }: DashboardAppProps) {
  return <aside className="react-current-console" data-search-item data-search-text="当前项目操作台 当前任务 check review blockers readonly">
    <div className="react-section-title">
      <Users size={18} aria-hidden="true" />
      <div><p className="react-eyebrow">Current Project</p><h2>当前项目操作台</h2></div>
    </div>
    <div className="react-current-task">
      <strong data-live-field="task_title">{data.current.task_title}</strong>
      <small>{data.current.task_id || 'no task'} · <span data-live-field="phase">{data.current.phase}</span> / <span data-live-field="gate">{data.current.gate}</span></small>
    </div>
    <div className="react-console-grid">
      <Metric label="当前步骤" value={data.current.current_step} field="current_step" />
      <Metric label="Check" value={data.session.evidence.check} field="session_check" />
      <Metric label="Review" value={data.session.evidence.review} field="session_review" />
      <Metric label="Changes" value={data.changes.ready_to_commit ? 'READY' : 'BLOCKED'} field="changes_ready" detail={`${data.changes.counts.total} files`} />
    </div>
    <div className="react-readonly-command">
      <p>推荐命令</p>
      <code data-live-field="next_command">{data.next.command}</code>
      <CopyButton command={data.next.command} />
    </div>
    <ul className="react-blocker-list" data-team-readiness-blockers>
      {data.readiness.blockers.length > 0
        ? data.readiness.blockers.slice(0, 5).map((item) => <li key={item}>{item}</li>)
        : <li>暂无 readiness blocker</li>}
    </ul>
  </aside>;
}

function TeamCockpit({ data }: DashboardAppProps) {
  return <section className="react-team-cockpit" data-team-cockpit data-search-item data-search-text="Team Portfolio Cockpit 多项目团队驾驶舱 Workflow Lanes Risk Queue Next Queue Handoff Queue 当前项目操作台">
    <CockpitTopbar data={data} />
    <div className="react-cockpit-layout">
      <ProjectRail data={data} />
      <main className="react-cockpit-main">
        <div className="react-cockpit-summary">
          <CockpitStat label="阶段分布" value={Object.keys(data.team.by_phase).length} field="team_phase_inline" detail={Object.entries(data.team.by_phase).map(([key, value]) => `${key}:${value}`).join(' · ') || '暂无'} />
          <CockpitStat label="技术栈" value={Object.keys(data.team.by_stack).length} detail={Object.entries(data.team.by_stack).map(([key, value]) => `${key}:${value}`).join(' · ') || '暂无'} />
          <CockpitStat label="Backlog" value={`${data.backlog.filtered_total}/${data.backlog.total}`} field="backlog_filtered_total" detail="只读队列" />
          <CockpitStat label="Readiness" value={data.readiness.score} field="readiness_score" detail={data.readiness.status} />
        </div>
        <WorkflowLanes data={data} />
        <DeliveryQueues data={data} />
      </main>
      <CurrentProjectConsole data={data} />
    </div>
  </section>;
}

function OverviewPanel({ data }: DashboardAppProps) {
  const overview = data.overview;
  return <section className="react-panel react-overview" data-search-item data-search-text="Agent Overview 工作台总览 当前步骤 下一步">
    <div className="react-panel-header">
      <div><p className="react-eyebrow">Agent Overview</p><h2>工作台总览</h2></div>
      <div className="react-next-command"><span data-live-field="overview_next_command">{overview.next.command}</span><CopyButton command={overview.next.command} /></div>
    </div>
    <div className="react-metrics-grid">
      <Metric label="当前步骤" value={overview.task.current_step} field="overview_task" />
      <Metric label="健康" value={overview.health_status.toUpperCase()} field="overview_health" />
      <Metric label="变更" value={overview.changes_ready ? 'READY' : 'BLOCKED'} field="overview_changes" detail={`${overview.changes_total} files`} />
      <Metric label="Backlog" value={`${overview.backlog_filtered_total}/${overview.backlog_total}`} field="overview_backlog" />
      <Metric label="Team 活跃" value={overview.team_active_projects} field="overview_team_active" />
      <Metric label="项目" value={overview.project_name} field="overview_project" />
    </div>
    <div className="react-link-grid" data-team-overview-links>{overview.primary_links.map((item) => <a key={item.href} href={item.href}><b>{item.label}</b><span>{item.value}</span><small>{item.detail}</small></a>)}</div>
  </section>;
}

function MapPanel({ data }: DashboardAppProps) {
  const map = data.workbench_map;
  return <section className="react-panel" data-search-item data-search-text="Workbench Map 工作台地图 Recommended Path 推荐路径">
    <div className="react-panel-header"><div><p className="react-eyebrow">Workbench Map</p><h2>工作台地图</h2></div><strong data-live-field="map_recommended_next">{map.summary.recommended_next}</strong></div>
    <div className="react-metrics-grid compact">
      <Metric label="视图" value={map.summary.total_views} field="map_total_views" />
      <Metric label="工作域" value={map.summary.groups} field="map_group_count" />
      <Metric label="主入口" value={map.summary.primary_view} field="map_primary_view" />
    </div>
    <ol className="react-path" data-team-map-path>{map.recommended_path.map((item) => <li key={item.id}><a href={item.href}>{item.label}</a><small>{item.reason}</small></li>)}</ol>
    <div className="react-map-groups" data-team-map-groups>{map.groups.map((group) => <article key={group.id}><b>{group.label}</b><p>{group.purpose}</p><ul>{group.views.map((view) => <li key={view.id}><a href={view.href}>{view.label}</a><span className={`react-status ${view.status}`}>{view.status}</span></li>)}</ul></article>)}</div>
  </section>;
}

function SessionPanel({ data }: DashboardAppProps) {
  const session = data.session;
  return <section className="react-panel" data-search-item data-search-text="Session Recovery 恢复现场 恢复命令 只读恢复协议">
    <div className="react-panel-header"><div><p className="react-eyebrow">Session Recovery</p><h2>恢复现场</h2></div><strong data-live-field="session_status">{session.status}</strong></div>
    <div className="react-metrics-grid compact">
      <Metric label="任务" value={session.task.title} field="session_task" />
      <Metric label="步骤" value={session.task.step} field="session_step" />
      <Metric label="服务" value={session.service.endpoint} field="session_endpoint" />
      <Metric label="API" value={session.service.api} field="session_api" />
      <Metric label="Check" value={session.evidence.check} field="session_check" />
      <Metric label="Review" value={session.evidence.review} field="session_review" />
      <Metric label="文件" value={session.required_files.length} field="session_file_count" />
      <Metric label="风险" value={data.readiness.blockers.length} field="session_risk_count" />
    </div>
    <ul className="react-command-list" data-team-session-commands>{session.recovery_commands.map((item) => <li key={item.command}><button type="button" data-copy-command={item.command}>{item.label}</button><small>{item.detail}</small></li>)}</ul>
    <div className="react-two-col"><ul data-team-session-files>{session.required_files.map((file) => <li key={file}>{file}</li>)}</ul><ul data-team-session-risks>{data.readiness.blockers.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul></div>
    <ol className="react-command-list" data-team-session-protocol>{data.handoff.resume_protocol.map((item) => <li key={item}>{item}</li>)}</ol>
  </section>;
}

function ReadinessPanel({ data }: DashboardAppProps) {
  const readiness = data.readiness;
  return <section className="react-panel" data-search-item data-search-text="Readiness Audit 收口审计 Completion Audit 完成度审计">
    <div className="react-panel-header"><div><p className="react-eyebrow">Readiness Audit</p><h2>收口审计</h2></div><strong data-live-field="readiness_status">{readiness.status}</strong></div>
    <div className="react-metrics-grid compact">
      <Metric label="收口分" value={readiness.score} field="readiness_score" />
      <Metric label="继续" value={readiness.ready_to_continue ? 'YES' : 'NO'} field="readiness_continue" />
      <Metric label="交接" value={readiness.ready_to_handoff ? 'YES' : 'NO'} field="readiness_handoff" />
      <Metric label="阻塞" value={readiness.blockers.length} field="readiness_blocker_count" />
      <Metric label="可提交" value={readiness.ready_to_commit ? 'YES' : 'NO'} field="readiness_commit" />
      <Metric label="归档" value={readiness.ready_to_archive ? 'YES' : 'NO'} field="readiness_archive" />
    </div>
    <div className="react-two-col"><ul data-team-readiness-signals>{readiness.signals.map((item) => <li key={item.id}>{item.label}<small>{item.detail}</small></li>)}</ul><ul data-team-readiness-blockers>{readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div>
  </section>;
}

function SettingsPanel({ data }: DashboardAppProps) {
  const settings = data.settings;
  return <section className="react-panel" data-search-item data-search-text="Workbench Settings 运行配置 数据源 Registry DB">
    <div className="react-panel-header"><div><p className="react-eyebrow">Workbench Settings</p><h2>运行配置</h2></div><strong data-live-field="settings_mode">{settings.service.mode}</strong></div>
    <div className="react-metrics-grid compact">
      <Metric label="Endpoint" value={settings.service.endpoint} field="settings_endpoint" />
      <Metric label="API" value={settings.service.api} field="settings_api" />
      <Metric label="Registry DB" value={settings.registry.total_projects} field="settings_registry_total" />
      <Metric label="Registry Path" value={settings.registry.db_path} field="settings_registry_path" />
      <Metric label="Registry" value={settings.registry.exists ? 'exists' : 'missing'} field="settings_registry_exists" />
      <Metric label="Install Target" value={settings.install?.target || '-'} field="settings_install_target" />
      <Metric label="Install" value={settings.install?.passed ? 'PASS' : 'ATTENTION'} field="settings_install_status" />
      <Metric label="Install Issues" value={settings.install ? `${settings.install.errors} 错误 · ${settings.install.warnings} 警告` : '-'} field="settings_install_issues" />
    </div>
    <div className="react-two-col"><ul data-team-settings-paths>{settings.paths.map((item) => <li key={item.id}>{item.label}<small>{item.path}</small></li>)}</ul><ul data-team-settings-data-sources>{settings.data_sources.map((item) => <li key={item.id}>{item.label}<small>{item.detail}</small></li>)}</ul></div>
    <ul className="react-command-list" data-team-settings-command-templates>{settings.command_templates.map((item) => <li key={item.id}>{item.label}<small>{item.command}</small></li>)}</ul>
  </section>;
}

function BacklogPanel({ data }: DashboardAppProps) {
  const backlog = data.backlog;
  return <section className="react-panel" data-search-item data-search-text="Backlog Board 任务待办 工作清单 Board active proposed planned done dropped">
    <div className="react-panel-header">
      <div><p className="react-eyebrow">Backlog Board</p><h2>工作待办看板</h2></div>
      <span>共 <b data-live-field="backlog_filtered_total">{backlog.filtered_total}</b> / <b data-live-field="backlog_total">{backlog.total}</b> 项</span>
    </div>
    <div className="react-board">
      {backlog.groups.map((group) => <article key={group.status} className="react-board-column">
        <h3><b>{group.status.toUpperCase()}</b> <span>{group.count}</span></h3>
        <ul className="react-project-list">
          {group.items.map((item) => <li key={item.id} className="react-backlog-card" data-search-item data-search-text={`${item.id} ${item.title} ${item.status} ${item.priority}`}>
            <b>{item.title}</b>
            <small>{item.id} · Priority: {item.priority} · L{item.level}</small>
            {item.task ? <small className="react-accent">Linked: {item.task}</small> : null}
          </li>)}
        </ul>
      </article>)}
      {backlog.groups.length === 0 ? <p className="react-muted">当前筛选没有匹配的 backlog。</p> : null}
    </div>
  </section>;
}

function ChangesPanel({ data }: DashboardAppProps) {
  const changes = data.changes;
  if (!changes.available) {
    return <section className="react-panel" data-search-item data-search-text="Git Changes 变更收口 blocking reasons not a git repo">
      <div className="react-panel-header"><div><p className="react-eyebrow">Git Changes</p><h2>变更收口</h2></div></div>
      <div className="react-blocker-list">
        <li><b>未启用 Git 仓库</b><p>{changes.error || '当前目录不是 git 仓库，无法监控代码变更。'}</p></li>
      </div>
    </section>;
  }

  return <section className="react-panel" data-search-item data-search-text="Git Changes 变更收口 branch files suggested commit message blocking reasons">
    <div className="react-panel-header">
      <div><p className="react-eyebrow">Git Changes</p><h2>变更收口</h2></div>
      <strong data-live-field="changes_ready" className={changes.ready_to_commit ? 'react-accent' : 'react-warn'}>{changes.ready_to_commit ? 'READY' : 'BLOCKED'}</strong>
    </div>
    <div className="react-metrics-grid compact">
      <Metric label="分支" value={changes.branch} />
      <Metric label="总变更" value={`${changes.counts.total} 文件`} field="changes_total" />
      <Metric label="未提交" value={`${changes.counts.staged} staged · ${changes.counts.unstaged} unstaged`} />
      <Metric label="未跟踪" value={changes.counts.untracked} />
    </div>

    {changes.blocking_reasons.length > 0 ? <div className="react-blocker-list">
      <p className="react-eyebrow">变更拦截原因</p>
      <ul data-team-changes-blockers>{changes.blocking_reasons.map((reason, idx) => <li key={idx}>{reason}</li>)}</ul>
    </div> : null}

    <div className="react-two-col" data-team-changes-groups>
      {Object.entries(changes.groups).map(([name, files]) => <article key={name} className="react-metric">
        <b>{name.toUpperCase()} ({files.length})</b>
        <ul className="react-mini-list">
          {files.map((file) => <li key={file}><small>{file}</small></li>)}
        </ul>
      </article>)}
    </div>

    <div className="react-readonly-command">
      <p>推荐提交日志</p>
      <code>{changes.suggested_commit_message}</code>
      <CopyButton command={changes.suggested_commit_message} />
    </div>
  </section>;
}

function HandoffPanel({ data }: DashboardAppProps) {
  const handoff = data.handoff;
  return <section className="react-panel" data-search-item data-search-text="Handoff Queue 交接准备 context protocol resume files">
    <div className="react-panel-header">
      <div><p className="react-eyebrow">Handoff Queue</p><h2>交接准备</h2></div>
      <strong data-live-field="handoff_progress">{handoff.progress.done} / {handoff.progress.total} 完成</strong>
    </div>
    <div className="react-metrics-grid compact">
      <Metric label="就绪项" value={handoff.progress.done} />
      <Metric label="总要求" value={handoff.progress.total} />
      <Metric label="阻塞项" value={handoff.progress.blocked} />
      <Metric label="Check" value={handoff.evidence.check} field="handoff_check" />
    </div>
    <div className="react-two-col">
      <div>
        <p className="react-eyebrow">交接所需文件</p>
        <ul className="react-command-list" data-team-handoff-files>
          {handoff.required_files.map((file) => <li key={file}><small>{file}</small></li>)}
        </ul>
      </div>
      <div>
        <p className="react-eyebrow">推荐交接命令</p>
        <ul className="react-command-list" data-team-handoff-commands>
          {handoff.commands.map((cmd) => <li key={cmd.id}>
            <b>{cmd.label}</b>
            <code>{cmd.command}</code>
            <CopyButton command={cmd.command} />
          </li>)}
        </ul>
      </div>
    </div>
    <div className="react-blocker-list">
      <p className="react-eyebrow">最近面包屑记录</p>
      <ul data-team-handoff-breadcrumbs>
        {handoff.recent_breadcrumbs.map((b, idx) => <li key={idx}>
          <b>{b.step} [{b.status}]</b> - <small>{b.context}</small>
        </li>)}
      </ul>
    </div>
    <ol className="react-command-list" data-team-handoff-protocol>
      {data.handoff.resume_protocol.map((item, idx) => <li key={idx}><small>{item}</small></li>)}
    </ol>
  </section>;
}

function DocsPanel({ data }: DashboardAppProps) {
  const docs = data.docs_index;
  return <section className="react-panel" data-search-item data-search-text="Docs Index 文档索引 missing files previews">
    <div className="react-panel-header">
      <div><p className="react-eyebrow">Docs Index</p><h2>文档索引</h2></div>
      <span>存在 <b data-live-field="docs_index_existing">{docs.existing}</b> / <b data-live-field="docs_index_total">{docs.total}</b></span>
    </div>
    <div className="react-metrics-grid compact">
      <Metric label="总文档" value={docs.total} />
      <Metric label="已存在" value={docs.existing} />
      <Metric label="缺失项" value={docs.missing} field="docs_index_missing" />
    </div>
    {docs.missing_entries.length > 0 ? <div className="react-blocker-list">
      <p className="react-eyebrow">缺失项</p>
      <ul data-team-docs-index-missing>
        {docs.missing_entries.map((entry) => <li key={entry.id}>
          <b>{entry.label}</b> - <small>{entry.path}</small>
        </li>)}
      </ul>
    </div> : null}
    <div className="react-map-groups" data-team-docs-index-groups>
      {docs.groups.map((group) => <article key={group.id} className="react-metric">
        <b>{group.label} ({group.count})</b>
        <ul className="react-mini-list">
          {group.entries.map((entry) => <li key={entry.id}>
            <small className={entry.exists ? 'react-accent' : 'react-warn'}>{entry.label} [{entry.exists ? 'exists' : 'missing'}]</small>
            <small>{entry.path}</small>
          </li>)}
        </ul>
      </article>)}
    </div>
  </section>;
}

function DocumentsPanel({ data }: DashboardAppProps) {
  const previews = data.document_previews;
  return <section className="react-panel" data-search-item data-search-text="Document Previews 文档预览 spec plan check review">
    <div className="react-panel-header"><div><p className="react-eyebrow">Document Previews</p><h2>工作流文档预览</h2></div></div>
    <div className="react-two-col">
      {previews.map((preview) => <article key={preview.id} className="react-metric react-doc-preview">
        <b>{preview.title}</b>
        <small>{preview.path} ({preview.line_count} 行)</small>
        {preview.exists ? <pre className="react-code-block"><code>{preview.excerpt}</code></pre> : <p className="react-muted">文件不存在</p>}
      </article>)}
    </div>
  </section>;
}

function ActivityPanel({ data }: DashboardAppProps) {
  const activity = data.activity;
  return <section className="react-panel" data-search-item data-search-text="Activity Timeline 工作流活动 timeline focus log">
    <div className="react-panel-header">
      <div><p className="react-eyebrow">Activity Timeline</p><h2>工作流活动时间线</h2></div>
      <span>共 <b data-live-field="activity_total">{activity.total}</b> 事件</span>
    </div>
    <div className="react-metrics-grid compact">
      <Metric label="总事件" value={activity.total} />
      <Metric label="Breadcrumb" value={activity.counts.breadcrumb} field="activity_breadcrumb_count" />
      <Metric label="质量验证" value={activity.counts.quality} field="activity_quality_count" />
      <Metric label="最新更新" value={activity.latest_time || '-'} field="activity_latest_time" />
    </div>
    <div className="react-two-col">
      <div>
        <p className="react-eyebrow">关注事件</p>
        <ul className="react-command-list" data-team-activity-focus>
          {activity.focus.map((event) => <li key={event.id} className={`react-timeline-item ${event.severity}`}>
            <b>{event.label} ({event.status})</b>
            <p>{event.detail}</p>
            <small>{event.time}</small>
          </li>)}
          {activity.focus.length === 0 ? <li className="react-accent">暂无关注事件</li> : null}
        </ul>
      </div>
      <div>
        <p className="react-eyebrow">最近活动</p>
        <ul className="react-command-list" data-team-activity-events>
          {activity.events.map((event) => <li key={event.id} className={`react-timeline-item ${event.severity}`}>
            <b>{event.label} ({event.status})</b>
            <p>{event.detail}</p>
            <small>{event.time}</small>
          </li>)}
        </ul>
      </div>
    </div>
  </section>;
}

function ActionsPanel({ data }: DashboardAppProps) {
  const actionCenter = data.action_center;
  return <section className="react-panel" data-search-item data-search-text="Action Center 操作中心 actions commands">
    <div className="react-panel-header"><div><p className="react-eyebrow">Action Center</p><h2>操作中心</h2></div></div>
    <div className="react-two-col" data-action-center>
      {actionCenter.groups.map((group) => <article key={group.id} className="react-metric">
        <b>{group.title}</b>
        <ul className="react-command-list">
          {group.items.map((item) => <li key={item.id} className={`react-action-card ${item.emphasis}`}>
            <b>{item.label}</b>
            <p>{item.description}</p>
            <code>{item.command}</code>
            <CopyButton command={item.command} />
          </li>)}
        </ul>
      </article>)}
    </div>
  </section>;
}

function ProjectPanel({ data }: DashboardAppProps) {
  const project = data.project;
  return <section className="react-panel" data-search-item data-search-text="Project Info 项目层级 details">
    <div className="react-panel-header"><div><p className="react-eyebrow">Project Info</p><h2>项目基本信息</h2></div></div>
    <div className="react-metrics-grid">
      <Metric label="项目名" value={project.name} />
      <Metric label="语言" value={project.language} />
      <Metric label="框架" value={project.framework} />
      <Metric label="类型" value={project.type} />
      <Metric label="待办总数" value={project.backlog_total} />
      <Metric label="缺失 Lesson" value={project.lesson_pending_count} />
    </div>
    <dl className="react-console-grid react-current-task">
      <div><dt className="react-muted">根目录</dt><dd>{project.root}</dd></div>
      <div><dt className="react-muted">DocPath 目录</dt><dd>{project.docpath_dir}</dd></div>
    </dl>
  </section>;
}

function TaskPanel({ data }: DashboardAppProps) {
  const task = data.task_detail;
  return <section className="react-panel" data-search-item data-search-text="Task Detail 任务详情 progress steps flow">
    <div className="react-panel-header">
      <div><p className="react-eyebrow">Task Detail</p><h2>当前任务详情</h2></div>
      <strong>{task.title}</strong>
    </div>
    <div className="react-metrics-grid compact">
      <Metric label="步骤总数" value={task.progress.total_steps} />
      <Metric label="已完成" value={task.progress.done_steps} />
      <Metric label="阻塞记录" value={task.progress.blocked_entries} />
      <Metric label="阶段" value={task.phase} />
    </div>
    <div className="react-two-col">
      <div>
        <p className="react-eyebrow">执行步骤</p>
        <ul className="react-command-list">
          {task.steps.map((step) => <li key={step.id} className={step.done ? 'react-accent' : 'react-muted'}>
            <b>[{step.done ? 'x' : ' '}] {step.title}</b>
            {step.breadcrumb_status ? <small>状态: {step.breadcrumb_status} · {step.breadcrumb_time}</small> : null}
          </li>)}
        </ul>
      </div>
      <div>
        <p className="react-eyebrow">生命周期节点</p>
        <ul className="react-command-list">
          {task.flow_nodes.map((node) => <li key={node.id} className={node.active ? 'react-warn' : node.complete ? 'react-accent' : 'react-muted'}>
            <b>{node.label} {node.active ? '(活跃)' : node.complete ? '(已完成)' : ''}</b>
            <small>{node.summary}</small>
          </li>)}
        </ul>
      </div>
    </div>
  </section>;
}

function HealthPanel({ data }: DashboardAppProps) {
  const health = data.health;
  return <section className="react-panel" data-search-item data-search-text="Health Summary 工作台健康 signals status">
    <div className="react-panel-header">
      <div><p className="react-eyebrow">Health Summary</p><h2>工作台健康状况</h2></div>
      <span className={`react-status ${health.status}`}>{health.status.toUpperCase()}</span>
    </div>
    <div className="react-metrics-grid compact">
      <Metric label="状态" value={health.status.toUpperCase()} field="health_status" />
      <Metric label="OK 信号" value={health.ok} field="health_ok" />
      <Metric label="Warning 信号" value={health.warning} field="health_warning" />
      <Metric label="Error 信号" value={health.error} field="health_error" />
    </div>
    <div className="react-two-col">
      <div>
        <p className="react-eyebrow">健康信号队列</p>
        <ul className="react-command-list">
          {health.signals.map((signal) => <li key={signal.id} className={signal.severity}>
            <b>{signal.label} [{signal.severity.toUpperCase()}]</b>
            <p>{signal.summary}</p>
            <small>{signal.detail}</small>
          </li>)}
        </ul>
      </div>
      <div>
        <p className="react-eyebrow">待处理队列</p>
        <ul className="react-command-list">
          {health.attention_queue.map((signal) => <li key={signal.id} className={signal.severity}>
            <b>{signal.label}</b>
            <p>{signal.summary}</p>
          </li>)}
          {health.attention_queue.length === 0 ? <li className="react-accent">暂无需要处理的警报</li> : null}
        </ul>
      </div>
    </div>
  </section>;
}

function WorkflowPanel({ data }: DashboardAppProps) {
  return <section className="react-panel" data-search-item data-search-text="Workflow Flowchart 流程图 active complete">
    <div className="react-panel-header"><div><p className="react-eyebrow">Workflow Flowchart</p><h2>流程图</h2></div></div>
    <ol className="react-command-list react-two-col">
      {data.flow.map((node) => <li key={node.id} className={node.active ? 'react-warn' : node.complete ? 'react-accent' : 'react-muted'}>
        <b>{node.label} {node.active ? '(活跃)' : node.complete ? '(已完成)' : ''}</b>
      </li>)}
    </ol>
  </section>;
}

function EvidencePanel({ data }: DashboardAppProps) {
  const check = data.evidence.check;
  const review = data.evidence.review;
  return <section className="react-panel" data-search-item data-search-text="Evidence Summary 要求与证据 check review quality gate">
    <div className="react-panel-header"><div><p className="react-eyebrow">Evidence Summary</p><h2>质量证据摘要</h2></div></div>
    <div className="react-two-col">
      <article className="react-metric">
        <b>Check 证据 [{check.result}]</b>
        <small>更新于: {check.time || '-'}</small>
        <pre className="react-code-block"><code>{check.raw}</code></pre>
      </article>
      <article className="react-metric">
        <b>Review 证据 [{review.result}]</b>
        <small>更新于: {review.time || '-'}</small>
        <pre className="react-code-block"><code>{review.raw}</code></pre>
      </article>
    </div>
  </section>;
}

function AuditPanel({ data }: DashboardAppProps) {
  const audit = data.completion_audit;
  return <section className="react-panel" data-search-item data-search-text="Completion Audit 完成度审计 evidence gap requirements">
    <div className="react-panel-header">
      <div><p className="react-eyebrow">Completion Audit</p><h2>项目完成度审计</h2></div>
      <span>总得分 <b data-live-field="audit_score">{audit.score}</b>%</span>
    </div>
    <div className="react-metrics-grid compact">
      <Metric label="就绪项" value={audit.ready} field="audit_ready" />
      <Metric label="关注项" value={audit.attention} field="audit_attention" />
      <Metric label="阻塞项" value={audit.blocked} field="audit_blocked" />
      <Metric label="检查总数" value={audit.total} />
    </div>
    <div className="react-blocker-list">
      <p className="react-eyebrow">审计项明细</p>
      <ul data-team-completion-audit-items>
        {audit.items.map((item) => <li key={item.id} className={item.status === 'ready' ? 'react-accent' : item.status === 'blocked' ? 'react-danger' : 'react-warn'}>
          <b>{item.requirement} [{item.status.toUpperCase()}]</b>
          <p>{item.gap}</p>
          <div className="react-two-col" style={{marginTop: 8}}>
            {item.evidence.map((ev, idx) => <div key={idx}><a href={ev.href}>{ev.label}</a> <small>{ev.detail}</small></div>)}
          </div>
        </li>)}
      </ul>
    </div>
  </section>;
}

function LiveFieldAnchors({ data }: DashboardAppProps) {
  return <div className="react-live-anchors" aria-hidden="true">
    <span>本地只读 · Agent 工作台 本地 Agent 工作台 核心视图已迁移到 React 深层 Team / Backlog / Changes 视图保留原实现 Agent Overview 工作台总览 只读工作流入口 当前步骤 Workbench Map 工作台地图 Recommended Path 推荐路径 质量收口 项目与团队 Session Recovery 恢复现场 恢复命令 只读恢复协议 恢复检查 Readiness Audit 收口审计 收口信号 Completion Audit 完成度审计 Requirement Evidence 要求与证据 使用 SQLite registry 展示不同项目 可交接 可提交 Docs Index 文档索引 任务文档 Workspace 证据 Workbench Settings 运行配置 数据源 命令模板 Registry DB Activity Timeline 工作流活动 关注流 最近活动 推荐下一步 Team 视角 跨项目总览 Team 项目动态 Team Portfolio Team Focus Team Delivery 交付协作摘要 关注优先级 Next Queue 跨项目下一步 Workflow Lanes 阶段推进泳道 变更收口 收口阻塞 docpath changes</span>
    <span data-live-field="task_title">{data.current.task_title}</span>
    <span data-live-field="phase">{data.current.phase}</span>
    <span data-live-field="gate">{data.current.gate}</span>
    <span data-live-field="current_step">{data.current.current_step}</span>
    <span data-live-field="next_command">{data.next.command}</span>
    <span data-live-field="health_status">{data.health.status}</span>
    <span data-live-field="health_ok">{data.health.ok}</span>
    <span data-live-field="health_warning">{data.health.warning}</span>
    <span data-live-field="health_error">{data.health.error}</span>
    <span data-live-field="backlog_total">{data.backlog.total}</span>
    <span data-live-field="backlog_filtered_total">{data.backlog.filtered_total}</span>
    <span data-live-field="overview_next_action">{data.overview.next.action}</span>
    <span data-live-field="overview_changes_total">{data.overview.changes_total}</span>
    <span data-live-field="overview_handoff">{data.overview.handoff_progress}</span>
    <span data-live-field="audit_status">{data.completion_audit.status}</span>
    <span data-live-field="audit_ready">{data.completion_audit.ready}/{data.completion_audit.total}</span>
    <span data-live-field="audit_attention">{data.completion_audit.attention}</span>
    <span data-live-field="audit_blocked">{data.completion_audit.blocked}</span>
    <span data-live-field="docs_index_total">{data.docs_index.total}</span>
    <span data-live-field="docs_index_existing">{data.docs_index.existing}</span>
    <span data-live-field="docs_index_missing">{data.docs_index.missing}</span>
    <span data-live-field="activity_total">{data.activity.total}</span>
    <span data-live-field="activity_latest_time">{data.activity.latest_time || '-'}</span>
    <span data-live-field="activity_focus_total">{data.activity.focus.length}</span>
    <span data-live-field="activity_breadcrumb_count">{data.activity.counts.breadcrumb}</span>
    <span data-live-field="activity_quality_count">{data.activity.counts.quality}</span>
    <span data-live-field="team_total_projects">{data.team.total_projects}</span>
    <span data-live-field="team_active_projects">{data.team.active_projects}</span>
    <span data-live-field="team_attention_projects">{data.team.attention_projects}</span>
    <span data-live-field="team_phase_inline">{Object.entries(data.team.by_phase).map(([key, value]) => `${key}:${value}`).join(' · ')}</span>
    <span data-live-field="changes_total">{data.changes.counts.total}</span>
    <span data-live-field="changes_ready">{data.changes.ready_to_commit ? 'READY' : 'BLOCKED'}</span>
    <span data-live-field="handoff_progress">{data.handoff.progress.done}/{data.handoff.progress.total}</span>
    <span data-live-field="handoff_check">{data.handoff.evidence.check}</span>
  </div>;
}

export function DashboardApp({ data }: DashboardAppProps) {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.slice(1);
      if (coreViews.some((v) => v.id === hash)) return hash;
    }
    return 'overview';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (coreViews.some((v) => v.id === hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    if (typeof window !== 'undefined') {
      window.location.hash = val;
    }
  };

  return <div className="react-dashboard" data-react-dashboard="agent-core">
    <LiveFieldAnchors data={data} />
    <Shell data={data} />
    <SearchStrip />
    <nav className="react-view-nav" aria-label="工作台视图">
      {data.workspace.navigation.map((view) => {
        const core = coreViews.find((item) => item.id === view.id);
        const Icon = core?.icon || CheckCircle2;
        return <a key={view.id} href={view.href} data-view-link={view.id}><Icon size={16} aria-hidden="true" />{view.label}</a>;
      })}
    </nav>
    <Tabs.Root value={activeTab} onValueChange={handleTabChange} className="react-tabs">
      <Tabs.List className="react-tab-list" aria-label="Agent 工作台核心视图">
        {coreViews.map((view) => <Tabs.Trigger key={view.id} value={view.id}>{view.label}</Tabs.Trigger>)}
      </Tabs.List>
    </Tabs.Root>
    <div id="overview" data-view="overview" className="react-core-section view-section"><OverviewPanel data={data} /></div>
    <div id="map" data-view="map" className="react-core-section view-section"><MapPanel data={data} /></div>
    <div id="session" data-view="session" className="react-core-section view-section"><SessionPanel data={data} /></div>
    <div id="readiness" data-view="readiness" className="react-core-section view-section"><ReadinessPanel data={data} /></div>
    <div id="settings" data-view="settings" className="react-core-section view-section"><SettingsPanel data={data} /></div>
    <div id="team" data-view="team" className="react-core-section view-section"><TeamCockpit data={data} /></div>
    <div id="backlog" data-view="backlog" className="react-core-section view-section"><BacklogPanel data={data} /></div>
    <div id="changes" data-view="changes" className="react-core-section view-section"><ChangesPanel data={data} /></div>
    <div id="handoff" data-view="handoff" className="react-core-section view-section"><HandoffPanel data={data} /></div>
    <div id="documents" data-view="documents" className="react-core-section view-section"><DocumentsPanel data={data} /></div>
    <div id="docs-index" data-view="docs-index" className="react-core-section view-section"><DocsPanel data={data} /></div>
    <div id="activity" data-view="activity" className="react-core-section view-section"><ActivityPanel data={data} /></div>
    <div id="actions" data-view="actions" className="react-core-section view-section"><ActionsPanel data={data} /></div>
    <div id="project" data-view="project" className="react-core-section view-section"><ProjectPanel data={data} /></div>
    <div id="task" data-view="task" className="react-core-section view-section"><TaskPanel data={data} /></div>
    <div id="health" data-view="health" className="react-core-section view-section"><HealthPanel data={data} /></div>
    <div id="workflow" data-view="workflow" className="react-core-section view-section"><WorkflowPanel data={data} /></div>
    <div id="evidence" data-view="evidence" className="react-core-section view-section"><EvidencePanel data={data} /></div>
    <div id="audit" data-view="audit" className="react-core-section view-section"><AuditPanel data={data} /></div>
  </div>;
}
