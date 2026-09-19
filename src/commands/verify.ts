/**
 * docpath verify — 语义反漂移与需求闭环门禁命令
 */

import { runSemanticVerification, renderSemanticVerificationTable } from '../utils/semantic-verify.js';

export interface VerifyOptions {
  cwd: string;
  agent?: boolean;
  json?: boolean;
}

export async function verifyCommand(options: VerifyOptions): Promise<void> {
  const { cwd, agent = false, json = false } = options;
  const report = await runSemanticVerification(cwd);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
    return;
  }

  if (agent) {
    const { stringify } = await import('yaml');
    console.log(
      stringify({
        agent_view: 'verify',
        task_id: report.taskId,
        task_title: report.taskTitle,
        phase: report.phase,
        passed: report.passed,
        errors_count: report.errorsCount,
        warnings_count: report.warningsCount,
        scope_guard: {
          passed: report.scope.passed,
          violations: report.scope.violations,
        },
        requirements: {
          total: report.requirements.total,
          satisfied: report.requirements.satisfied,
          items: report.requirements.items.map((i) => ({
            id: i.id,
            text: i.text,
            status: i.status,
            mapped_steps: i.mappedSteps,
          })),
        },
        acceptance_criteria: {
          total: report.acceptanceCriteria.total,
          passed: report.acceptanceCriteria.passed,
          items: report.acceptanceCriteria.items.map((a) => ({
            id: a.id,
            text: a.text,
            status: a.status,
          })),
        },
        suggested_actions: report.suggestedActions,
      }),
    );
    if (!report.passed) process.exitCode = 1;
    return;
  }

  console.log(renderSemanticVerificationTable(report));
  if (!report.passed) {
    process.exit(1);
  }
}
