import { existsSync } from 'fs';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { gatePolicyForProfile, resolveEffectiveWorkflowProfile } from './workflow-profile.js';
import { selectCurrentFocus, summarizeDrift, loadAgentOutputContext, inferRouteFromContext, generateQuickFix, routeStepTopic } from './agent-output/formatters.js';
import { formatActiveGuardrails } from './agent-output/context-injection.js';
import { detectBinaryDrift, detectPathShadowing, takePathShadowAdvisory } from '../utils/version-drift.js';
import { evaluateSessionWatchdog } from './session-watchdog.js';
export type { AgentOutput } from './agent-output/formatters.js';

/**
 * 生成 Agent YAML 输出
 *
 * - compact: R-339 超紧凑机器模式——只输出核心路由字段
 *   （state / next_action / recommended_command / step_id），
 *   将单次状态视图压至 200 Token 以内；非关键信息走 reveal 按需查询。
 */
export async function generateAgentOutput(
  cwd: string,
  options: { view?: 'status' | 'next'; verbose?: boolean; compact?: boolean } = {},
): Promise<string> {
  const { stringify } = await import('yaml');
  const view = options.view || 'next';
  const verbose = options.verbose === true;
  const compact = options.compact === true;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    const routeHint = {
      next_action: '运行 docpath init 初始化项目',
      recommended_command: 'docpath init',
      exit_criteria: '项目已初始化并生成 .docpath 工作流目录',
    };
    if (compact) {
      return stringify({
        agent_view: view,
        state: 'uninitialized',
        next_action: view === 'status'
          ? '项目未初始化；需要执行路线时运行 docpath next --agent'
          : routeHint.next_action,
        recommended_command: view === 'status' ? 'docpath next --agent' : routeHint.recommended_command,
        step_id: '',
      }, { indent: 2 });
    }
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
  const binaryDrift = await detectBinaryDrift(cwd);
  // R-332: 旧全局二进制不含检测模块（0.1.1 实测在仓库内静默），由开发版侧
  // 首见 nag-once 报 PATH 影子；drifted 分支（R-335）已有机器字段，不重复提示。
  if (!binaryDrift?.drifted) {
    const shadowAdvisory = takePathShadowAdvisory(await detectPathShadowing(cwd));
    if (shadowAdvisory) console.warn(shadowAdvisory);
  }
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

  // R-339: 超紧凑机器模式——跳过非核心元数据与活跃会话探测，
  // 只输出核心路由字段。token 消耗从 500+ 压至 200 Token 以内（减少 60%+）。
  if (compact) {
    const stepId = routeStepTopic(routeFields.recommended_command) || context.state?.current_step || '';
    return stringify({
      agent_view: view,
      state: context.state?.state || 'unknown',
      next_action: routeFields.next_action,
      recommended_command: routeFields.recommended_command,
      step_id: stepId,
    }, { indent: 2 });
  }

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
    // gate_policy 是静态配置（由 profile 决定），常规输出省略，verbose 才展开。
    ...(verbose ? {
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
    } : {}),
    context_injection: {
      spec_summary: context.specSummary,
      active_guardrails: formatActiveGuardrails(context.recentDecisions),
      ...(context.relevantLivingDocs && context.relevantLivingDocs.length > 0 ? {
        relevant_docs: context.relevantLivingDocs,
      } : {}),
    },
    task_id: context.state?.task_id || '',
    task_title: context.state?.task_title || '',
    ...(() => {
      const backlogId = context.state?.backlog_id ?? context.structuredSpec?.backlog_id;
      return backlogId ? { backlog_id: backlogId } : {};
    })(),
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
        : view === 'status' || verbose
          ? {
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
          : {
              passed: context.installHealth.passed,
              reason: context.installHealth.issues.map((i) => i.message || i.id).join('; ') || '安装基线未通过',
              fix_command: context.installHealth.recommended_command || 'docpath install --target universal',
            }
      : null,
    ...(context.contextIndex ? { context_index: context.contextIndex } : {}),
    // R-335 FR-4 / R-332: 版本漂移提示——docpath 源码仓内用仓库外二进制时警告
    ...(binaryDrift?.drifted ? {
      version_drift: {
        binary_path: binaryDrift.binary_path,
        repo_local_build: binaryDrift.repo_local_build,
        reason: binaryDrift.reason,
      },
    } : {}),
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

  const currentOpenStep = context.planTasks.find((task) => !task.done);
  const sessionWatchdog = evaluateSessionWatchdog({
    phase: context.state?.phase,
    taskId: context.state?.task_id,
    currentStep: currentOpenStep ? { id: currentOpenStep.id, title: currentOpenStep.title } : undefined,
    planTasks: context.planTasks,
    breadcrumbEventCount: context.bc.entries.length,
    uncommittedFilesCount: context.dirtyWorktree?.files?.length || 0,
  });

  if (sessionWatchdog.status === 'rotate_recommended' || verbose) {
    output.session_health = {
      status: sessionWatchdog.status,
      ...(sessionWatchdog.reason ? { reason: sessionWatchdog.reason } : {}),
      ...(sessionWatchdog.recommended_action ? { recommended_action: sessionWatchdog.recommended_action } : {}),
      ...(sessionWatchdog.subagent_prompt ? { subagent_prompt: sessionWatchdog.subagent_prompt } : {}),
      ...(verbose && sessionWatchdog.metrics ? { metrics: sessionWatchdog.metrics } : {}),
    };
  }

  // Add active_sessions, concurrent_session_warning, and state_freshness to generateAgentOutput
  const { listActiveSessions, resolveSessionContext } = await import('../utils/session.js');
  const selfSession = resolveSessionContext();
  const activeSessions = await listActiveSessions(cwd, {
    excludeSelf: true,
    selfSessionId: selfSession.sessionId,
  });

  if (activeSessions.length > 0) {
    output.active_sessions = activeSessions.map((sess) => ({
      session_id: sess.session_id,
      pid: sess.pid,
      cwd: sess.cwd,
      command: sess.command,
      task_id: sess.task_id,
      step: sess.step,
      updated_at: sess.updated_at,
    }));
    output.concurrent_session_warning = `检测到 ${activeSessions.length} 个其它活跃 Agent 会话正在运行。请确保没有并发修改或锁冲突。`;
    output.state_freshness = 'potentially_stale';
  } else if (view === 'status' || verbose) {
    output.active_sessions = [];
    output.state_freshness = 'fresh';
  }

  if (verbose) {
    output.generated_at = new Date().toISOString();
  }

  return stringify(output, { indent: 2 });
}
