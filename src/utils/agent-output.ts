import { existsSync } from 'fs';
import { join } from 'path';
import { resolveDocpathDir } from './file.js';
import { gatePolicyForProfile, resolveEffectiveWorkflowProfile } from '../engine/workflow-profile.js';
import { selectCurrentFocus, summarizeDrift, loadAgentOutputContext, inferRouteFromContext, generateQuickFix } from './agent-output/formatters.js';
export type { AgentOutput } from './agent-output/formatters.js';

/**
 * 生成 Agent YAML 输出
 */
export async function generateAgentOutput(
  cwd: string,
  options: { view?: 'status' | 'next'; verbose?: boolean } = {},
): Promise<string> {
  const { stringify } = await import('yaml');
  const view = options.view || 'next';
  const verbose = options.verbose === true;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    const routeHint = {
      next_action: '运行 docpath init 初始化项目',
      recommended_command: 'docpath init',
      exit_criteria: '项目已初始化并生成 .docpath 工作流目录',
    };
    // 无 .docpath 时返回最小状态
    return stringify({
      agent_view: view,
      state: 'uninitialized',
      next_action: view === 'status'
        ? '项目未初始化；需要执行路线时运行 docpath next --agent'
        : routeHint.next_action,
      recommended_command: view === 'status' ? 'docpath next --agent' : routeHint.recommended_command,
      ...(view === 'status' ? { route_hint: routeHint } : {}),
      generated_at: new Date().toISOString(),
    });
  }

  const context = await loadAgentOutputContext(cwd, docpathDir);
  const inferred = inferRouteFromContext(context);
  const quickFix = generateQuickFix(context);
  const driftSummary = summarizeDrift(context.drift);
  const hasIdentityDrift = context.identityDrifts.length > 0;
  const installHealthPassed = context.installHealth?.passed === true;
  const currentFocus = selectCurrentFocus(context.state?.phase || '', context.state?.gate || '', context);
  const profileResolution = resolveEffectiveWorkflowProfile({
    profile: context.state?.workflow_profile,
    level: context.state?.level,
    requiresSpec: context.structuredSpec ? context.structuredSpec.major_change_gate?.required || context.structuredSpec.ui_gate?.state === 'required' : false,
    requiresPlan: false,
    majorChangeRequired: context.structuredSpec?.major_change_gate?.required,
    majorChangeTypes: context.structuredSpec?.major_change_gate?.types,
    uiGateRequired: context.structuredSpec?.ui_gate?.state === 'required',
    quickScopeExceededReasons: context.majorChangeGate.signals.length > 0 && !context.majorChangeGate.confirmed
      ? context.majorChangeGate.signals.map((signal) => `${signal.label}: ${signal.detail}`)
      : [],
  });

  const routeFields = view === 'status'
    ? {
        next_action: '诊断当前工作流状态；需要执行路线时运行 docpath next --agent',
        recommended_command: 'docpath next --agent',
        route_hint: {
          next_action: inferred.next_action,
          recommended_command: inferred.recommended_command,
          exit_criteria: inferred.exit_criteria,
        },
        required_context: [...inferred.required_context],
        required_files: [...inferred.required_files],
        must_update: [],
        exit_criteria: '状态快照已读取；执行下一步前运行 docpath next --agent',
      }
    : {
        ...inferred,
        required_context: [...inferred.required_context],
        required_files: [...inferred.required_files],
        must_update: [...inferred.must_update],
      };

  const { buildContextRefs, buildCommandEffects } = await import('./agent-output/formatters.js');
  const refs = buildContextRefs(routeFields);
  const effects = buildCommandEffects(routeFields);

  const output: any = {
    agent_view: view,
    state: context.state?.state || 'unknown',
    ...(context.state?.level !== undefined && context.state?.level !== null ? { level: context.state.level } : {}),
    workflow_profile: profileResolution.effectiveProfile,
    ...(profileResolution.upgraded ? {
      stored_workflow_profile: profileResolution.storedProfile,
      workflow_profile_upgrade_reasons: profileResolution.reasons,
    } : {}),
    gate_policy: (() => {
      const policy = gatePolicyForProfile(profileResolution.effectiveProfile);
      return {
        requires_spec: policy.requiresSpec,
        requires_plan: policy.requiresPlan,
        requires_check: policy.requiresCheck,
        requires_review: policy.requiresReview,
        journal_mode: policy.journalMode,
      };
    })(),
    context_injection: {
      spec_summary: context.specSummary,
      recent_decisions: context.recentDecisions.length > 0 ? context.recentDecisions.map((d) => ({
        id: d.id,
        task_id: d.taskId,
        category: d.category,
        conclusion: d.conclusion,
        created_at: d.createdAt,
      })) : [],
    },
    task_id: context.state?.task_id || '',
    task_title: context.state?.task_title || '',
    ...(context.state?.backlog_id !== undefined ? { backlog_id: context.state.backlog_id } : {}),
    phase: context.state?.phase || '',
    gate: context.state?.gate || 'none',
    next_action: routeFields.next_action,
    recommended_command: routeFields.recommended_command,
    ...('route_hint' in routeFields ? { route_hint: routeFields.route_hint } : {}),
    ...(refs && refs.length > 0 ? { context_refs: refs } : {}),
    ...(effects && effects.updates && effects.updates.length > 0 ? { command_effects: effects } : {}),
    exit_criteria: routeFields.exit_criteria,
    ...(quickFix ? { quick_fix: quickFix } : {}),
    progress: {
      done: context.planTasks.filter((task) => task.done).length,
      total: context.planTasks.length,
      in_progress: context.bc.inProgress,
      blocked: context.bc.blocked,
    },
    ...(driftSummary ? { drift_summary: driftSummary } : {}),
    ...(verbose || driftSummary ? { drift_details: {
      plan_done_without_breadcrumb: [...context.drift.planDoneWithoutBreadcrumb],
      breadcrumb_done_without_plan: [...context.drift.breadcrumbDoneWithoutPlan],
    } } : {}),
    ...(hasIdentityDrift ? {
      identity_drift_summary: `state.task_id 与 spec task id 不一致: ${context.identityDrifts.map((drift) => `${drift.location}:${drift.declaredTaskId}`).join(', ')}`
    } : {}),
    ...(verbose || hasIdentityDrift ? { identity_drift_details: context.identityDrifts.map((drift) => ({
      file: drift.file,
      location: drift.location,
      expected_task_id: drift.expectedTaskId,
      declared_task_id: drift.declaredTaskId,
      path: drift.path,
    })) } : {}),
    lesson_summary: {
      pending_count: context.lessonSummary.pendingCount,
      ...(verbose || context.lessonSummary.pendingCount === 1
        ? { pending_keys: [...context.lessonSummary.pendingKeys] }
        : {}),
    },
    install_health: context.installHealth
      ? installHealthPassed && !verbose
        ? { passed: true }
        : {
            target: context.installHealth.target,
            adapters: [...context.installHealth.adapters],
            current_agent: context.installHealth.current_agent,
            passed: context.installHealth.passed,
            errors: context.installHealth.errors,
            warnings: context.installHealth.warnings,
            issue_scope: 'install-baseline',
            recommended_command: context.installHealth.recommended_command,
            issue_ids: context.installHealth.issues.map((issue) => issue.id),
          }
      : null,
    ...(context.contextIndex ? { context_index: context.contextIndex } : {}),
    ...(context.contextIndexTrunk && context.contextIndexTrunk.length > 0 ? { context_index_trunk: context.contextIndexTrunk } : {}),
    ...(context.contextIndexLeaves && context.contextIndexLeaves.length > 0 ? {
      context_index_leaves: context.contextIndexLeaves.map(leaf => ({
        id: leaf.id,
        label: leaf.label,
        summary: leaf.summary.slice(0, 100), // 只保留前100字符作为索引
      })),
    } : {}),
    ...(verbose && currentFocus ? { current_focus: currentFocus } : {}),
  };

  // Add active_sessions, concurrent_session_warning, and state_freshness to generateAgentOutput
  const { listActiveSessions, resolveSessionContext } = await import('./session.js');
  const selfSession = resolveSessionContext();
  const activeSessions = await listActiveSessions(cwd, {
    excludeSelf: true,
    selfSessionId: selfSession.sessionId,
  });

  output.active_sessions = activeSessions.map((sess) => ({
    session_id: sess.session_id,
    pid: sess.pid,
    cwd: sess.cwd,
    command: sess.command,
    task_id: sess.task_id,
    step: sess.step,
    updated_at: sess.updated_at,
  }));

  if (activeSessions.length > 0) {
    output.concurrent_session_warning = `检测到 ${activeSessions.length} 个其它活跃 Agent 会话正在运行。请确保没有并发修改或锁冲突。`;
  }
  output.state_freshness = activeSessions.length > 0 ? 'potentially_stale' : 'fresh';

  output.generated_at = new Date().toISOString();

  return stringify(output, { indent: 2 });
}
