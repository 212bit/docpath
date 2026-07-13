import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { generateAgentOutput } from '../utils/agent-output.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';
import { listValidWorkflowEvents, type WorkflowTransitionMetadata } from '../engine/transitions.js';

export interface AgentSnapshot {
  schema_version: 1;
  kind: 'agent_snapshot';
  phase: string;
  gate: string;
  state: string;
  task_id: string;
  task_title: string;
  current_step: string;
  recommended_command: string;
  next_valid_events: Array<Pick<WorkflowTransitionMetadata, 'event' | 'phase' | 'gate' | 'requiredGate'>>;
  drift: boolean;
  drift_lock: boolean;
  drift_summary: string | null;
  identity_drift_summary: string | null;
  active_sessions: unknown[];
  updated_at: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function buildAgentSnapshot(cwd: string): Promise<AgentSnapshot> {
  const agentOutput = await generateAgentOutput(cwd, { view: 'next', verbose: true });
  const parsed = asRecord(parseYaml(agentOutput));
  const current = await readCurrentState(cwd);
  const phase = asString(parsed.phase || current?.phase);
  const gate = asString(parsed.gate || current?.gate || 'none') || 'none';
  const validTransitions = current ? listValidWorkflowEvents(current) : [];
  const driftSummary = asString(parsed.drift_summary) || null;
  const identityDriftSummary = asString(parsed.identity_drift_summary) || null;
  const driftDetails = asRecord(parsed.drift_details);
  const planDoneWithoutBreadcrumb = asArray(driftDetails.plan_done_without_breadcrumb);
  const drift = Boolean(driftSummary || identityDriftSummary);
  const driftLock = Boolean(identityDriftSummary || planDoneWithoutBreadcrumb.length > 0);

  return {
    schema_version: 1,
    kind: 'agent_snapshot',
    phase,
    gate,
    state: asString(parsed.state || current?.state),
    task_id: asString(parsed.task_id || current?.task_id),
    task_title: asString(parsed.task_title || current?.task_title),
    current_step: current?.current_step || '',
    recommended_command: asString(parsed.recommended_command),
    next_valid_events: validTransitions.map((transition) => ({
      event: transition.event,
      phase: transition.phase,
      gate: transition.gate,
      requiredGate: transition.requiredGate,
    })),
    drift,
    drift_lock: driftLock,
    drift_summary: driftSummary,
    identity_drift_summary: identityDriftSummary,
    active_sessions: asArray(parsed.active_sessions),
    updated_at: new Date().toISOString(),
  };
}

export async function refreshAgentSnapshot(cwd: string): Promise<AgentSnapshot> {
  const snapshot = await buildAgentSnapshot(cwd);
  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceDir = join(docpathDir, 'workspace');
  await mkdir(workspaceDir, { recursive: true });
  await writeFile(join(workspaceDir, 'agent-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
  return snapshot;
}

export async function hooksStatusCommand(options: { cwd: string; agent?: boolean }): Promise<void> {
  const snapshot = await refreshAgentSnapshot(options.cwd);
  if (options.agent) {
    process.stdout.write(stringifyYaml(snapshot, { indent: 2 }));
    return;
  }

  process.stdout.write(`phase: ${snapshot.phase}\n`);
  process.stdout.write(`gate: ${snapshot.gate}\n`);
  process.stdout.write(`state: ${snapshot.state}\n`);
  process.stdout.write(`current_step: ${snapshot.current_step || '-'}\n`);
  process.stdout.write(`recommended_command: ${snapshot.recommended_command || '-'}\n`);
  process.stdout.write(`drift_lock: ${snapshot.drift_lock ? 'yes' : 'no'}\n`);
}

export async function assertNoDriftLock(cwd: string, commandName: string): Promise<void> {
  const snapshot = await buildAgentSnapshot(cwd);
  if (!snapshot.drift_lock) return;

  const summary = snapshot.identity_drift_summary || snapshot.drift_summary || 'workflow drift detected';
  throw new Error(
    `${commandName}: drift_lock active; refusing state change.\n` +
    `reason: ${summary}\n` +
    'recovery: run `docpath next --agent --verbose` to inspect drift, then resolve task/plan/breadcrumb sync before retrying.',
  );
}
