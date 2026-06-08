import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function mkWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-dashboard-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'current'), { recursive: true });
  mkdirSync(join(dp, 'tasks', 'T-HISTORY'), { recursive: true });
  mkdirSync(join(dp, 'backlog'), { recursive: true });
  mkdirSync(join(dp, 'rules'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), 'project:\n  name: dashboard-test\n  type: node\n  language: TypeScript\n  framework: cac\n');
  writeWorkspaceFiles(dp);
  writeRuleFiles(dp);
  writeTaskFiles(dp);
  writeBacklogFiles(dp);
  return cwd;
}

function writeWorkspaceFiles(dp) {
  writeFileSync(join(dp, 'workspace', 'state.json'), JSON.stringify({
    level: 3,
    task_id: 'T-DASHBOARD',
    task_title: '本地 Agent 工作台',
    phase: 'executing',
    gate: 'none',
    current_step: 'S2',
    started_at: '2026-06-08T00:00:00.000Z',
    updated_at: '2026-06-08T00:10:00.000Z',
  }, null, 2) + '\n');
  writeFileSync(join(dp, 'workspace', 'current.md'), '# Current\n');
  writeFileSync(join(dp, 'workspace', 'last-check.md'), '# Last Check Evidence\n\n**时间**: 2026-06-08T00:11:00.000Z\n**结果**: ✅ PASS\n\n- ✅ TypeScript 编译\n- ✅ 测试\n');
  writeFileSync(join(dp, 'workspace', 'review.md'), '# Code Review Report\n\n**时间**: 2026-06-08T00:12:00.000Z\n\n✅ 审查通过 (0 错误, 0 警告)\n');
  writeFileSync(join(dp, 'workspace', 'lesson-candidates.md'), [
    '# Lesson Candidates',
    '',
    '## dashboard-workflow',
    '- key: dashboard-project-layer',
    '- task_id: T-DASHBOARD',
    '- type: best-practice',
    '- target: style',
    '- source: journal:T-DASHBOARD',
    '',
    '### Lesson',
    'Dashboard 应展示项目层级后再进入任务层级。',
    '',
    '## learned-dashboard-workflow',
    '- key: learned-dashboard-project-layer',
    '- task_id: T-DASHBOARD',
    '- type: best-practice',
    '- target: style',
    '- source: journal:T-DASHBOARD',
    '',
    '### Lesson',
    '已学习的 Dashboard lesson 不应计入待固化数量。',
    '',
  ].join('\n'));
  writeBreadcrumb(dp);
}

function writeRuleFiles(dp) {
  writeFileSync(join(dp, 'rules', 'style.md'), [
    '# Style Rules',
    '',
    '<!-- docpath:lesson-meta best-practice:style:learned-dashboard-project-layer:journal:T-DASHBOARD:T-DASHBOARD -->',
    '已学习规则。',
    '',
  ].join('\n'));
  writeFileSync(join(dp, 'rules', 'architecture.md'), '# Architecture Rules\n');
}

function writeBreadcrumb(dp) {
  writeFileSync(join(dp, 'workspace', 'breadcrumb.md'), `# 面包屑 — 上下文恢复索引

### ✅ S1 [T-DASHBOARD] — 2026-06-08T00:05:00.000Z

---
taskId: T-DASHBOARD
step: S1
status: done
timestamp: 2026-06-08T00:05:00.000Z
---

- **状态**: done
- **上下文**: 梳理 Dashboard 数据

### 🔄 S2 [T-DASHBOARD] — 2026-06-08T00:08:00.000Z

---
taskId: T-DASHBOARD
step: S2
status: in_progress
timestamp: 2026-06-08T00:08:00.000Z
---

- **状态**: in_progress
- **上下文**: 实现只读页面
`);
}

function writeTaskFiles(dp) {
  writeFileSync(join(dp, 'tasks', 'current', 'plan.md'), '## 执行计划\n\n### S1: 梳理 Dashboard 数据\n- [x] S1: 梳理 Dashboard 数据\n- **描述**: 明确数据源\n- **验收条件**: 数据源清晰\n- **依赖**: 无\n\n### S2: 实现只读页面\n- [ ] S2: 实现只读页面\n- **描述**: 实现本地页面\n- **验收条件**: 页面可展示\n- **依赖**: S1\n');
  writeFileSync(join(dp, 'tasks', 'current', 'spec.md'), '# Dashboard Spec\n\nAgent 工作台。\n');
}

function writeBacklogFiles(dp) {
  writeFileSync(join(dp, 'backlog', 'R-001-dashboard.md'), `---
id: R-001
title: Dashboard
status: active
priority: P1
level: 3
source: test
links:
  task: T-DASHBOARD
  spec: tasks/T-DASHBOARD/spec.md
created_at: 2026-06-08
---

## 背景

测试 backlog。
`);
}

function run(args, cwd, env = {}) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 20000, env: { ...process.env, ...env } });
}

function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 20000 });
}

async function openSqliteDb(path) {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = ((warning, ...args) => {
    const type = typeof args[0] === 'string' ? args[0] : undefined;
    if (type === 'ExperimentalWarning' && String(warning).includes('SQLite is an experimental feature')) return;
    return originalEmitWarning.call(process, warning, ...args);
  });
  try {
    const { DatabaseSync } = await import('node:sqlite');
    return new DatabaseSync(path);
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

async function registerFixtureProjects(registryDb) {
  const active = mkdtempSync(join(tmpdir(), 'dp-registered-active-'));
  const idle = mkdtempSync(join(tmpdir(), 'dp-registered-idle-'));
  run(`init --cwd ${active} --level 1`, active, { DOCPATH_REGISTRY_DB: registryDb });
  run(`init --cwd ${idle} --level 1`, idle, { DOCPATH_REGISTRY_DB: registryDb });
  const db = await openSqliteDb(registryDb);
  db.prepare('UPDATE projects SET phase = ?, gate = ?, task_id = ?, task_title = ?, last_seen_at = ? WHERE root = ?')
    .run('executing', 'none', 'T-ACTIVE', '活跃项目任务', '2026-06-08T00:01:00.000Z', active);
  db.close();
  return { active, idle };
}

describe('dashboard command', () => {
  it('emits read-only dashboard data as JSON', async () => {
    const cwd = mkWorkspace();
    const registryDb = join(mkdtempSync(join(tmpdir(), 'dp-registry-')), 'projects.sqlite');
    const registered = await registerFixtureProjects(registryDb);
    const before = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');
    const data = JSON.parse(run(`dashboard --cwd ${cwd} --json`, cwd, { DOCPATH_REGISTRY_DB: registryDb }));
    const after = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');

    assert.equal(data.current.task_id, 'T-DASHBOARD');
    assert.equal(data.current.task_title, '本地 Agent 工作台');
    assert.equal(data.workspace.product, 'DocPath 工作台');
    assert.equal(data.workspace.mode, 'read-only');
    assert.deepEqual(data.workspace.navigation.map((item) => item.id), ['overview', 'map', 'session', 'readiness', 'audit', 'docs-index', 'settings', 'activity', 'team', 'actions', 'project', 'task', 'changes', 'handoff', 'documents', 'health', 'workflow', 'evidence', 'backlog']);
    assert.equal(data.overview.task.task_id, 'T-DASHBOARD');
    assert.equal(data.overview.task.current_step, 'S2');
    assert.equal(data.overview.next.command, 'docpath go --step S2');
    assert.equal(data.overview.health_status, 'warning');
    assert.equal(data.overview.changes_ready, false);
    assert.equal(data.overview.handoff_progress, '1/2');
    assert.equal(data.overview.backlog_filtered_total, 1);
    assert.equal(data.overview.team_active_projects, 1);
    assert.ok(data.overview.primary_links.some((item) => item.href === '#team'));
    assert.equal(data.workbench_map.summary.primary_view, 'overview');
    assert.equal(data.workbench_map.summary.total_views, data.workspace.navigation.length);
    assert.equal(data.workbench_map.summary.groups, 5);
    assert.equal(data.workbench_map.summary.recommended_next, 'docpath go --step S2');
    assert.deepEqual(data.workbench_map.groups.map((item) => item.id), ['start', 'execute', 'quality', 'project-team', 'knowledge-config']);
    assert.ok(data.workbench_map.groups.find((item) => item.id === 'start').views.some((item) => item.id === 'map'));
    assert.ok(data.workbench_map.groups.find((item) => item.id === 'quality').views.some((item) => item.id === 'readiness'));
    assert.ok(data.workbench_map.groups.find((item) => item.id === 'quality').views.some((item) => item.id === 'audit'));
    assert.deepEqual(data.workbench_map.recommended_path.map((item) => item.id), ['overview', 'map', 'actions', 'handoff']);
    assert.equal(data.completion_audit.total, 12);
    assert.equal(data.completion_audit.ready, 12);
    assert.equal(data.completion_audit.attention, 0);
    assert.equal(data.completion_audit.blocked, 0);
    assert.equal(data.completion_audit.score, 100);
    assert.equal(data.completion_audit.status, 'ready');
    assert.deepEqual(data.completion_audit.items.map((item) => item.id), ['local-readonly', 'current-task', 'workflow-data', 'check-review', 'backlog', 'agent-workbench', 'project-level', 'team-view', 'sqlite-registry', 'session-recovery', 'readiness-audit', 'docs-settings-map-search']);
    assert.ok(data.completion_audit.items.find((item) => item.id === 'team-view').evidence.some((entry) => entry.href === '#team'));
    assert.ok(data.completion_audit.items.find((item) => item.id === 'sqlite-registry').evidence.some((entry) => entry.detail === registryDb));
    assert.ok(data.activity.total >= 7);
    assert.equal(data.activity.counts.next, 1);
    assert.equal(data.activity.counts.quality, 2);
    assert.equal(data.activity.counts.changes, 1);
    assert.ok(data.activity.events.some((item) => item.id === 'next-action' && item.command === 'docpath go --step S2'));
    assert.ok(data.activity.events.some((item) => item.type === 'breadcrumb' && item.status === 'in_progress'));
    assert.ok(data.activity.events.some((item) => item.id === 'quality-check' && item.status === '✅ PASS'));
    assert.ok(data.activity.events.some((item) => item.id === 'changes-summary' && item.href === '#changes'));
    assert.ok(data.activity.focus.some((item) => item.severity === 'warning'));
    assert.equal(data.session.title, 'Session Recovery');
    assert.equal(data.session.service.mode, 'read-only');
    assert.equal(data.session.service.endpoint, 'http://127.0.0.1:7181');
    assert.equal(data.session.service.api, '/api/state');
    assert.equal(data.session.task.id, 'T-DASHBOARD');
    assert.equal(data.session.recovery_commands[0].command, 'docpath next --agent');
    assert.ok(data.session.recovery_commands.some((item) => item.command === 'docpath agent handoff'));
    assert.ok(data.session.required_files.includes('.docpath/workspace/current.md'));
    assert.equal(data.session.evidence.check, '✅ PASS');
    assert.ok(data.session.risks.some((item) => item.label === 'Changes'));
    assert.ok(data.session.protocol.some((item) => item.includes('页面自身不修改状态')));
    assert.ok(data.readiness.score > 0);
    assert.equal(data.readiness.status, 'attention');
    assert.equal(data.readiness.ready_to_continue, true);
    assert.equal(data.readiness.ready_to_handoff, true);
    assert.equal(data.readiness.ready_to_commit, false);
    assert.equal(data.readiness.ready_to_archive, false);
    assert.equal(data.readiness.next_command, 'docpath go --step S2');
    assert.ok(data.readiness.signals.some((item) => item.id === 'workflow'));
    assert.ok(data.readiness.signals.some((item) => item.id === 'changes' && item.status === 'attention'));
    assert.ok(data.readiness.signals.some((item) => item.id === 'handoff' && item.status === 'ready'));
    assert.equal(data.readiness.blockers.length, 0);
    assert.ok(data.docs_index.total >= 10);
    assert.ok(data.docs_index.existing >= 6);
    assert.ok(data.docs_index.groups.some((item) => item.id === 'task' && item.entries.some((entry) => entry.id === 'task-spec')));
    assert.ok(data.docs_index.groups.some((item) => item.id === 'workspace' && item.entries.some((entry) => entry.id === 'workspace-current')));
    assert.ok(data.docs_index.groups.some((item) => item.id === 'templates'));
    assert.ok(Array.isArray(data.docs_index.missing_entries));
    assert.equal(data.settings.service.endpoint, 'http://127.0.0.1:7181');
    assert.equal(data.settings.service.api, '/api/state');
    assert.equal(data.settings.registry.db_path, registryDb);
    assert.equal(data.settings.registry.exists, true);
    assert.equal(data.settings.registry.total_projects, 2);
    assert.equal(data.settings.install.target, data.project.install_health.target);
    assert.ok(data.settings.paths.some((item) => item.id === 'project-root' && item.path === cwd && item.exists));
    assert.ok(data.settings.paths.some((item) => item.id === 'docpath-dir' && item.exists));
    assert.ok(data.settings.data_sources.some((item) => item.id === 'registry' && item.path === registryDb));
    assert.deepEqual(data.settings.command_templates.map((item) => item.command), ['docpath dashboard', 'docpath projects']);
    assert.deepEqual(data.action_center.groups.map((item) => item.id), ['next', 'quality', 'changes', 'handoff', 'backlog', 'projects']);
    assert.equal(data.action_center.groups[0].items[0].command, 'docpath go --step S2');
    assert.ok(data.action_center.groups.find((item) => item.id === 'backlog').items.some((item) => item.command === 'docpath dashboard --status active'));
    assert.ok(data.action_center.groups.find((item) => item.id === 'projects').items.some((item) => item.command.startsWith('docpath dashboard --root ')));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#overview'));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#map'));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#session'));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#readiness'));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#audit'));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#docs-index'));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#settings'));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#activity'));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#actions'));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#changes'));
    assert.ok(data.command_palette.some((item) => item.type === 'view' && item.href === '#handoff'));
    assert.ok(data.command_palette.some((item) => item.type === 'command' && item.command === 'docpath go --step S2'));
    assert.ok(data.command_palette.some((item) => item.type === 'command' && item.command === 'docpath changes'));
    assert.ok(data.command_palette.some((item) => item.type === 'command' && item.command === 'docpath agent handoff'));
    assert.ok(data.command_palette.some((item) => item.type === 'project' && item.command.startsWith('docpath dashboard --root ')));
    assert.equal(data.task_detail.task_id, 'T-DASHBOARD');
    assert.equal(data.task_detail.progress.total_steps, 2);
    assert.equal(data.task_detail.progress.done_steps, 1);
    assert.equal(data.task_detail.steps[0].breadcrumb_status, 'done');
    assert.equal(data.task_detail.steps[1].breadcrumb_status, 'in_progress');
    assert.equal(data.task_detail.flow_nodes.find((item) => item.id === 'executing').active, true);
    assert.equal(data.task_detail.evidence_summary.check, '✅ PASS');
    assert.deepEqual(data.document_previews.map((item) => item.id), ['spec', 'plan', 'check', 'review']);
    assert.ok(data.document_previews.every((item) => item.exists));
    assert.ok(data.document_previews.find((item) => item.id === 'spec').summary.includes('Dashboard Spec'));
    assert.ok(data.document_previews.find((item) => item.id === 'check').line_count > 0);
    assert.equal(data.health.status, 'warning');
    assert.equal(data.health.error, 0);
    assert.ok(data.health.warning >= 1);
    assert.deepEqual(data.health.signals.map((item) => item.id), ['workflow', 'check', 'review', 'install', 'lesson', 'backlog']);
    assert.ok(data.health.attention_queue.some((item) => item.id === 'workflow'));
    assert.ok(data.health.attention_queue.some((item) => item.id === 'lesson'));
    assert.equal(data.project.name, 'dashboard-test');
    assert.equal(data.project.type, 'node');
    assert.equal(data.project.language, 'TypeScript');
    assert.equal(data.project.framework, 'cac');
    assert.equal(data.project.task_dirs, 1);
    assert.equal(data.project.backlog_total, 1);
    assert.equal(data.project.backlog_by_status.active, 1);
    assert.equal(data.project.lesson_pending_count, 1);
    assert.equal(data.next.command, 'docpath go --step S2');
    assert.equal(data.plan.length, 2);
    assert.equal(data.backlog.total, 1);
    assert.equal(data.backlog.filtered_total, 1);
    assert.deepEqual(data.backlog.filters, { status: null, priority: null, q: null });
    assert.equal(data.backlog.filtered_items.length, 1);
    assert.equal(data.backlog.groups.length, 1);
    assert.equal(data.backlog.groups[0].status, 'active');
    assert.equal(data.changes.available, false);
    assert.equal(data.changes.ready_to_commit, false);
    assert.match(data.changes.error, /不是 git 仓库/);
    assert.equal(data.handoff.commands[0].command, 'docpath agent handoff');
    assert.ok(data.handoff.commands.some((item) => item.command.startsWith('docpath context')));
    assert.ok(data.handoff.required_files.includes('.docpath/workspace/current.md'));
    assert.ok(data.handoff.required_files.some((item) => item.endsWith('tasks/current/plan.md')));
    assert.equal(data.handoff.progress.done, 1);
    assert.equal(data.handoff.progress.total, 2);
    assert.equal(data.handoff.evidence.check, '✅ PASS');
    assert.equal(data.handoff.recent_breadcrumbs.length, 2);
    assert.equal(data.registry.total, 2);
    assert.equal(data.project_directory.length, 2);
    assert.ok(data.project_directory.every((item) => item.href.startsWith('/?root=')));
    assert.equal(data.selected_project.status, 'current');
    assert.equal(data.selected_project.project, null);
    assert.equal(data.team.total_projects, 2);
    assert.equal(data.team.active_projects, 1);
    assert.equal(data.team.attention_projects, 1);
    assert.equal(data.team.by_phase.executing, 1);
    assert.equal(data.team.by_phase.idle, 1);
    assert.equal(data.team.portfolio.length, 2);
    const activePortfolio = data.team.portfolio.find((item) => item.root === registered.active);
    assert.equal(activePortfolio.health, 'warning');
    assert.equal(activePortfolio.next_action, '推进 T-ACTIVE');
    assert.ok(activePortfolio.href.startsWith('/?root='));
    assert.equal(data.team.projects_by_phase.find((item) => item.key === 'executing').count, 1);
    assert.equal(data.team.projects_by_stack.reduce((sum, item) => sum + item.count, 0), 2);
    assert.equal(data.team.recent_projects.length, 2);
    assert.equal(data.team.attention_items[0].root, registered.active);
    assert.deepEqual(data.team.delivery_groups.map((item) => item.id), ['risk', 'in_progress', 'waiting', 'handoff_ready']);
    assert.equal(data.team.delivery_groups.find((item) => item.id === 'in_progress').projects[0].root, registered.active);
    assert.equal(data.team.delivery_groups.find((item) => item.id === 'waiting').count, 1);
    assert.deepEqual(data.team.health_layers.map((item) => item.severity), ['error', 'warning', 'ok']);
    assert.equal(data.team.health_layers.find((item) => item.severity === 'warning').projects[0].next_action, '推进 T-ACTIVE');
    assert.equal(data.team.phase_lanes.find((item) => item.phase === 'executing').projects[0].task_id, 'T-ACTIVE');
    assert.equal(data.team.next_queue[0].root, registered.active);
    assert.equal(data.team.next_queue[0].next_action, '推进 T-ACTIVE');
    assert.equal(data.evidence.check.result, '✅ PASS');
    assert.equal(before, after, 'dashboard JSON must not mutate breadcrumb');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('prints an HTML Agent dashboard page', async () => {
    const cwd = mkWorkspace();
    const registryDb = join(mkdtempSync(join(tmpdir(), 'dp-registry-')), 'projects.sqlite');
    await registerFixtureProjects(registryDb);
    const html = run(`dashboard --cwd ${cwd} --print`, cwd, { DOCPATH_REGISTRY_DB: registryDb });

    assert.match(html, /<!doctype html>/);
    assert.match(html, /DocPath 工作台/);
    assert.match(html, /Team Portfolio Cockpit/);
    assert.match(html, /DocPath Cockpit/);
    assert.match(html, /多项目团队驾驶舱/);
    assert.match(html, /Phase 1 只读信息架构/);
    assert.match(html, /data-team-cockpit/);
    assert.match(html, /Project Navigation/);
    assert.match(html, /项目导航/);
    assert.match(html, /Risk Queue/);
    assert.match(html, /风险队列/);
    assert.match(html, /Handoff Queue/);
    assert.match(html, /交接准备/);
    assert.match(html, /当前项目操作台/);
    assert.match(html, /本地只读 · Agent 工作台/);
    assert.match(html, /data-react-dashboard="agent-core"/);
    assert.match(html, /data-react-dashboard-root/);
    assert.match(html, /__DOCPATH_DASHBOARD_DATA__/);
    assert.match(html, /核心视图已迁移到 React/);
    assert.match(html, /深层 Team \/ Backlog \/ Changes 视图保留原实现/);
    assert.match(html, /Team Portfolio Cockpit/);
    assert.match(html, /DocPath Cockpit/);
    assert.match(html, /多项目团队驾驶舱/);
    assert.match(html, /Phase 1 只读信息架构/);
    assert.match(html, /data-team-cockpit/);
    assert.match(html, /Project Navigation/);
    assert.match(html, /Risk Queue/);
    assert.match(html, /Handoff Queue/);
    assert.match(html, /当前项目操作台/);
    assert.match(html, /react-tab-list/);
    assert.match(html, /react-core-section/);
    assert.match(html, /过滤核心工作台内容/);
    assert.match(html, /aria-label="工作台视图"/);
    assert.match(html, /aria-label="工作台控制"/);
    assert.match(html, /data-command-palette/);
    assert.match(html, /data-palette-input/);
    assert.match(html, /data-palette-results/);
    assert.match(html, /data-search-filter/);
    assert.match(html, /data-search-input/);
    assert.match(html, /data-search-clear/);
    assert.match(html, /data-search-count/);
    assert.match(html, /data-search-empty/);
    assert.match(html, /只读过滤工作台内容/);
    assert.match(html, /Command Palette/);
    assert.match(html, /renderPaletteResults/);
    assert.match(html, /runPaletteItem/);
    assert.match(html, /searchCandidates/);
    assert.match(html, /indexSearchItems/);
    assert.match(html, /applySearchFilter/);
    assert.match(html, /reapplySearchFilter/);
    assert.match(html, /bindSearchFilter/);
    assert.match(html, /data-search-item/);
    assert.match(html, /data-search-text/);
    assert.match(html, /search-hidden/);
    assert.match(html, /search-empty/);
    assert.match(html, /paletteActiveIndex/);
    assert.match(html, /movePaletteActive/);
    assert.match(html, /ArrowDown/);
    assert.match(html, /ArrowUp/);
    assert.match(html, /metaKey \|\| event\.ctrlKey/);
    assert.match(html, /data-palette-items=/);
    assert.match(html, /data-refresh/);
    assert.doesNotMatch(html, /data-dashboard-action/);
    assert.doesNotMatch(html, /\/api\/action/);
    assert.doesNotMatch(html, /agent-step-done/);
    assert.match(html, /data-sync-status/);
    assert.match(html, /data-live-field="generated_at"/);
    assert.match(html, /data-live-field="task_title"/);
    assert.match(html, /data-live-field="phase"/);
    assert.match(html, /data-live-field="health_status"/);
    assert.match(html, /data-live-field="backlog_total"/);
    assert.match(html, /data-live-field="overview_task"/);
    assert.match(html, /data-live-field="overview_health"/);
    assert.match(html, /data-live-field="overview_changes"/);
    assert.match(html, /data-live-field="overview_handoff"/);
    assert.match(html, /data-live-field="overview_backlog"/);
    assert.match(html, /data-live-field="overview_next_command"/);
    assert.match(html, /data-live-field="map_total_views"/);
    assert.match(html, /data-live-field="map_group_count"/);
    assert.match(html, /data-live-field="map_primary_view"/);
    assert.match(html, /data-live-field="map_recommended_next"/);
    assert.match(html, /data-live-field="session_status"/);
    assert.match(html, /data-live-field="session_task"/);
    assert.match(html, /data-live-field="session_step"/);
    assert.match(html, /data-live-field="session_endpoint"/);
    assert.match(html, /data-live-field="session_api"/);
    assert.match(html, /data-live-field="session_check"/);
    assert.match(html, /data-live-field="session_review"/);
    assert.match(html, /data-live-field="session_file_count"/);
    assert.match(html, /data-live-field="session_risk_count"/);
    assert.match(html, /data-live-field="readiness_score"/);
    assert.match(html, /data-live-field="readiness_status"/);
    assert.match(html, /data-live-field="readiness_continue"/);
    assert.match(html, /data-live-field="readiness_handoff"/);
    assert.match(html, /data-live-field="readiness_commit"/);
    assert.match(html, /data-live-field="readiness_archive"/);
    assert.match(html, /data-live-field="readiness_blocker_count"/);
    assert.match(html, /data-live-field="readiness_next_command"/);
    assert.match(html, /data-live-field="audit_score"/);
    assert.match(html, /data-live-field="audit_status"/);
    assert.match(html, /data-live-field="audit_ready"/);
    assert.match(html, /data-live-field="audit_attention"/);
    assert.match(html, /data-live-field="audit_blocked"/);
    assert.match(html, /data-live-field="docs_index_total"/);
    assert.match(html, /data-live-field="docs_index_existing"/);
    assert.match(html, /data-live-field="docs_index_missing"/);
    assert.match(html, /data-live-field="settings_endpoint"/);
    assert.match(html, /data-live-field="settings_api"/);
    assert.match(html, /data-live-field="settings_mode"/);
    assert.match(html, /data-live-field="settings_registry_total"/);
    assert.match(html, /data-live-field="settings_registry_path"/);
    assert.match(html, /data-live-field="settings_registry_exists"/);
    assert.match(html, /data-live-field="settings_install_target"/);
    assert.match(html, /data-live-field="settings_install_status"/);
    assert.match(html, /data-live-field="settings_install_issues"/);
    assert.match(html, /data-live-field="activity_total"/);
    assert.match(html, /data-live-field="activity_latest_time"/);
    assert.match(html, /data-live-field="activity_focus_total"/);
    assert.match(html, /data-live-field="activity_breadcrumb_count"/);
    assert.match(html, /data-live-field="activity_quality_count"/);
    assert.match(html, /data-live-field="team_total_projects"/);
    assert.match(html, /data-live-field="team_phase_inline"/);
    assert.match(html, /data-live-field="changes_total"/);
    assert.match(html, /data-live-field="changes_ready"/);
    assert.match(html, /data-live-field="handoff_progress"/);
    assert.match(html, /data-live-field="handoff_check"/);
    assert.match(html, /data-action-center/);
    assert.match(html, /data-team-portfolio/);
    assert.match(html, /data-team-health-layers/);
    assert.match(html, /data-team-delivery-groups/);
    assert.match(html, /data-team-next-queue/);
    assert.match(html, /data-team-phase-lanes/);
    assert.match(html, /data-team-phase-distribution/);
    assert.match(html, /data-team-changes-blockers/);
    assert.match(html, /data-team-changes-groups/);
    assert.match(html, /data-team-handoff-commands/);
    assert.match(html, /data-team-handoff-files/);
    assert.match(html, /data-team-handoff-breadcrumbs/);
    assert.match(html, /data-team-handoff-protocol/);
    assert.match(html, /data-team-overview-links/);
    assert.match(html, /data-team-map-path/);
    assert.match(html, /data-team-map-groups/);
    assert.match(html, /data-team-session-commands/);
    assert.match(html, /data-team-session-files/);
    assert.match(html, /data-team-session-risks/);
    assert.match(html, /data-team-session-protocol/);
    assert.match(html, /data-team-readiness-signals/);
    assert.match(html, /data-team-readiness-blockers/);
    assert.match(html, /data-team-completion-audit-items/);
    assert.match(html, /data-team-docs-index-groups/);
    assert.match(html, /data-team-docs-index-missing/);
    assert.match(html, /data-team-settings-paths/);
    assert.match(html, /data-team-settings-data-sources/);
    assert.match(html, /data-team-settings-command-templates/);
    assert.match(html, /data-team-activity-events/);
    assert.match(html, /data-team-activity-focus/);
    assert.match(html, /data-overview-next-copy/);
    assert.match(html, /fetch\('\/api\/state'\)/);
    assert.match(html, /syncDashboard\(data\)/);
    assert.match(html, /syncOverview\(data\.overview\)/);
    assert.match(html, /syncWorkbenchMap\(data\.workbench_map\)/);
    assert.match(html, /syncSession\(data\.session\)/);
    assert.match(html, /syncReadiness\(data\.readiness\)/);
    assert.match(html, /syncCompletionAudit\(data\.completion_audit\)/);
    assert.match(html, /syncDocsIndex\(data\.docs_index\)/);
    assert.match(html, /syncSettings\(data\.settings\)/);
    assert.match(html, /syncActivity\(data\.activity\)/);
    assert.match(html, /syncTeam\(data\.team\)/);
    assert.match(html, /syncChanges\(data\.changes\)/);
    assert.match(html, /syncHandoff\(data\.handoff\)/);
    assert.match(html, /reapplySearchFilter\(\)/);
    assert.match(html, /renderChangeGroup/);
    assert.match(html, /renderHandoffCommand/);
    assert.match(html, /renderTeamHealthLayer/);
    assert.match(html, /renderTeamDeliveryGroup/);
    assert.match(html, /renderTeamNextQueueItem/);
    assert.match(html, /renderTeamPhaseLane/);
    assert.match(html, /renderOverviewLink/);
    assert.match(html, /renderSessionCommand/);
    assert.match(html, /renderSessionRisk/);
    assert.match(html, /renderReadinessSignal/);
    assert.match(html, /renderCompletionAuditItem/);
    assert.match(html, /renderDocsIndexEntry/);
    assert.match(html, /renderDocsIndexGroup/);
    assert.match(html, /renderSettingsPathItem/);
    assert.match(html, /renderSettingsDataSource/);
    assert.match(html, /renderSettingsTemplate/);
    assert.match(html, /renderActivityEvent/);
    assert.match(html, /renderMapPathItem/);
    assert.match(html, /renderMapViewItem/);
    assert.match(html, /renderMapGroup/);
    assert.match(html, /bindSearchFilter\(\)/);
    assert.match(html, /actionRoot\.innerHTML/);
    assert.match(html, /hashchange/);
    assert.match(html, /return knownViews\.indexOf\(hash\) >= 0 \? hash : 'overview'/);
    assert.match(html, /href="#overview"/);
    assert.match(html, /data-view-link="overview"/);
    assert.match(html, /href="#map"/);
    assert.match(html, /data-view-link="map"/);
    assert.match(html, /href="#session"/);
    assert.match(html, /data-view-link="session"/);
    assert.match(html, /href="#readiness"/);
    assert.match(html, /data-view-link="readiness"/);
    assert.match(html, /href="#audit"/);
    assert.match(html, /data-view-link="audit"/);
    assert.match(html, /href="#docs-index"/);
    assert.match(html, /data-view-link="docs-index"/);
    assert.match(html, /href="#settings"/);
    assert.match(html, /data-view-link="settings"/);
    assert.match(html, /href="#activity"/);
    assert.match(html, /data-view-link="activity"/);
    assert.match(html, /href="#team"/);
    assert.match(html, /data-view-link="team"/);
    assert.match(html, /href="#actions"/);
    assert.match(html, /data-view-link="actions"/);
    assert.match(html, /href="#project"/);
    assert.match(html, /href="#task"/);
    assert.match(html, /href="#changes"/);
    assert.match(html, /href="#handoff"/);
    assert.match(html, /href="#documents"/);
    assert.match(html, /href="#health"/);
    assert.match(html, /href="#workflow"/);
    assert.match(html, /href="#evidence"/);
    assert.match(html, /href="#backlog"/);
    assert.match(html, /id="overview"/);
    assert.match(html, /data-view="overview"/);
    assert.match(html, /id="map"/);
    assert.match(html, /data-view="map"/);
    assert.match(html, /id="session"/);
    assert.match(html, /data-view="session"/);
    assert.match(html, /id="readiness"/);
    assert.match(html, /data-view="readiness"/);
    assert.match(html, /id="audit"/);
    assert.match(html, /data-view="audit"/);
    assert.match(html, /id="docs-index"/);
    assert.match(html, /data-view="docs-index"/);
    assert.match(html, /id="settings"/);
    assert.match(html, /data-view="settings"/);
    assert.match(html, /id="activity"/);
    assert.match(html, /data-view="activity"/);
    assert.match(html, /id="team"/);
    assert.match(html, /data-view="team"/);
    assert.match(html, /id="actions"/);
    assert.match(html, /data-view="actions"/);
    assert.match(html, /id="project"/);
    assert.match(html, /data-view="project"/);
    assert.match(html, /id="task"/);
    assert.match(html, /data-view="task"/);
    assert.match(html, /id="changes"/);
    assert.match(html, /data-view="changes"/);
    assert.match(html, /id="handoff"/);
    assert.match(html, /data-view="handoff"/);
    assert.match(html, /id="documents"/);
    assert.match(html, /data-view="documents"/);
    assert.match(html, /id="health"/);
    assert.match(html, /data-view="health"/);
    assert.match(html, /id="workflow"/);
    assert.match(html, /data-view="workflow"/);
    assert.match(html, /id="evidence"/);
    assert.match(html, /data-view="evidence"/);
    assert.match(html, /id="backlog"/);
    assert.match(html, /data-view="backlog"/);
    assert.match(html, /本地 Agent 工作台/);
    assert.match(html, /Agent Overview/);
    assert.match(html, /工作台总览/);
    assert.match(html, /只读工作流入口/);
    assert.match(html, /当前步骤/);
    assert.match(html, /Workbench Map/);
    assert.match(html, /工作台地图/);
    assert.match(html, /Recommended Path/);
    assert.match(html, /推荐路径/);
    assert.match(html, /质量收口/);
    assert.match(html, /项目与团队/);
    assert.match(html, /Session Recovery/);
    assert.match(html, /恢复现场/);
    assert.match(html, /恢复命令/);
    assert.match(html, /只读恢复协议/);
    assert.match(html, /恢复检查/);
    assert.match(html, /Readiness Audit/);
    assert.match(html, /收口审计/);
    assert.match(html, /收口信号/);
    assert.match(html, /Completion Audit/);
    assert.match(html, /完成度审计/);
    assert.match(html, /Requirement Evidence/);
    assert.match(html, /要求与证据/);
    assert.match(html, /使用 SQLite registry 展示不同项目/);
    assert.match(html, /可交接/);
    assert.match(html, /可提交/);
    assert.match(html, /Docs Index/);
    assert.match(html, /文档索引/);
    assert.match(html, /任务文档/);
    assert.match(html, /Workspace 证据/);
    assert.match(html, /Workbench Settings/);
    assert.match(html, /运行配置/);
    assert.match(html, /数据源/);
    assert.match(html, /命令模板/);
    assert.match(html, /Registry DB/);
    assert.match(html, /Activity Timeline/);
    assert.match(html, /工作流活动/);
    assert.match(html, /关注流/);
    assert.match(html, /最近活动/);
    assert.match(html, /推荐下一步/);
    assert.match(html, /Team 视角/);
    assert.match(html, /跨项目总览/);
    assert.match(html, /Team 项目动态/);
    assert.match(html, /Team Portfolio/);
    assert.match(html, /Team Focus/);
    assert.match(html, /Team Delivery/);
    assert.match(html, /交付协作摘要/);
    assert.match(html, /关注优先级/);
    assert.match(html, /Next Queue/);
    assert.match(html, /跨项目下一步/);
    assert.match(html, /Workflow Lanes/);
    assert.match(html, /阶段推进泳道/);
    assert.match(html, /变更收口/);
    assert.match(html, /收口阻塞/);
    assert.match(html, /docpath changes/);
    assert.match(html, /交接准备/);
    assert.match(html, /恢复协议/);
    assert.match(html, /docpath agent handoff/);
    assert.match(html, /docpath context --max-tokens 8000/);
    assert.match(html, /Next Action/);
    assert.match(html, /data-copy-command="docpath go --step S2"/);
    assert.match(html, /docpath dashboard --status active/);
    assert.match(html, /已复制只读命令/);
    assert.match(html, /项目组合矩阵/);
    assert.match(html, /阶段分布/);
    assert.match(html, /技术栈分布/);
    assert.match(html, /推进 T-ACTIVE/);
    assert.match(html, /项目层级/);
    assert.match(html, /项目总览/);
    assert.match(html, /Task Detail/);
    assert.match(html, /流程节点详情/);
    assert.match(html, /S2 实现只读页面/);
    assert.match(html, /Dashboard Spec/);
    assert.match(html, /Check Evidence/);
    assert.match(html, /工作台健康/);
    assert.match(html, /关注队列/);
    assert.match(html, /Install Health/);
    assert.match(html, /dashboard-test/);
    assert.match(html, /Lesson 待固化/);
    assert.match(html, /流程图/);
    assert.match(html, /Breadcrumb 时间线/);
    assert.match(html, /项目目录/);
    assert.match(html, /class="project-link"/);
    assert.match(html, /Check \/ Review/);
    assert.match(html, /Backlog Board/);
    assert.match(html, /1\/1 条匹配/);
    assert.match(html, /href="\/\?status=active#backlog"/);
    assert.match(html, /docpath go --step S2/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('selects a registered project without mutating workspace state', async () => {
    const cwd = mkWorkspace();
    const registryDb = join(mkdtempSync(join(tmpdir(), 'dp-registry-')), 'projects.sqlite');
    const registered = await registerFixtureProjects(registryDb);
    const before = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');
    const data = JSON.parse(run(`dashboard --cwd ${cwd} --json --root ${registered.active}`, cwd, { DOCPATH_REGISTRY_DB: registryDb }));
    const after = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');

    assert.equal(data.selected_project.status, 'registered');
    assert.equal(data.selected_project.requested, registered.active);
    assert.equal(data.selected_project.project.root, registered.active);
    assert.equal(data.selected_project.project.task_id, 'T-ACTIVE');
    assert.equal(data.project_directory.find((item) => item.root === registered.active).selected, true);
    assert.equal(data.project_directory.find((item) => item.root === registered.idle).selected, false);
    assert.equal(before, after, 'project selection must not mutate breadcrumb');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('summarizes git changes without mutating workspace state', async () => {
    const cwd = mkWorkspace();
    git(cwd, 'init');
    git(cwd, 'config user.email test@example.com');
    git(cwd, 'config user.name Test');
    writeFileSync(join(cwd, 'README.md'), '# dashboard changes\n');
    git(cwd, 'add .');
    git(cwd, 'commit -m initial');
    mkdirSync(join(cwd, 'src'), { recursive: true });
    mkdirSync(join(cwd, 'tests'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'dashboard.ts'), 'export const dashboard = true;\n');
    writeFileSync(join(cwd, 'tests', 'dashboard-extra.test.mjs'), 'import assert from "node:assert/strict";\n');
    const before = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');
    const data = JSON.parse(run(`dashboard --cwd ${cwd} --json`, cwd));
    const after = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');

    assert.equal(data.changes.available, true);
    assert.equal(data.changes.ready_to_commit, false);
    assert.equal(data.changes.counts.untracked, 2);
    assert.equal(data.changes.groups.source.includes('src/dashboard.ts'), true);
    assert.equal(data.changes.groups.tests.includes('tests/dashboard-extra.test.mjs'), true);
    assert.ok(data.changes.blocking_reasons.some((item) => item.includes('未跟踪文件')));
    assert.equal(before, after, 'changes summary must not mutate breadcrumb');
    rmSync(cwd, { recursive: true, force: true });
  });

  it('shows a clear fallback for an unknown selected project', async () => {
    const cwd = mkWorkspace();
    const registryDb = join(mkdtempSync(join(tmpdir(), 'dp-registry-')), 'projects.sqlite');
    await registerFixtureProjects(registryDb);
    const missingRoot = join(tmpdir(), 'dp-missing-project');
    const data = JSON.parse(run(`dashboard --cwd ${cwd} --json --root ${missingRoot}`, cwd, { DOCPATH_REGISTRY_DB: registryDb }));
    const html = run(`dashboard --cwd ${cwd} --print --root ${missingRoot}`, cwd, { DOCPATH_REGISTRY_DB: registryDb });

    assert.equal(data.selected_project.status, 'missing');
    assert.equal(data.selected_project.requested, missingRoot);
    assert.equal(data.selected_project.project, null);
    assert.match(data.selected_project.message, /未找到匹配/);
    assert.match(html, /未找到匹配的已注册项目/);
    rmSync(cwd, { recursive: true, force: true });
  });

  it('filters the read-only Backlog board from query options', async () => {
    const cwd = mkWorkspace();
    const registryDb = join(mkdtempSync(join(tmpdir(), 'dp-registry-')), 'projects.sqlite');
    await registerFixtureProjects(registryDb);
    const before = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');
    const data = JSON.parse(run(`dashboard --cwd ${cwd} --json --status active --priority P1 --q Dashboard`, cwd, { DOCPATH_REGISTRY_DB: registryDb }));
    const html = run(`dashboard --cwd ${cwd} --print --status missing`, cwd, { DOCPATH_REGISTRY_DB: registryDb });
    const after = readFileSync(join(cwd, '.docpath', 'workspace', 'breadcrumb.md'), 'utf-8');

    assert.deepEqual(data.backlog.filters, { status: 'active', priority: 'P1', q: 'Dashboard' });
    assert.equal(data.backlog.filtered_total, 1);
    assert.equal(data.backlog.filtered_items[0].id, 'R-001');
    assert.equal(data.backlog.groups[0].status, 'active');
    assert.match(html, /0\/1 条匹配/);
    assert.match(html, /当前筛选没有匹配的 backlog/);
    assert.equal(before, after, 'backlog filters must not mutate breadcrumb');
    rmSync(cwd, { recursive: true, force: true });
  });
});
