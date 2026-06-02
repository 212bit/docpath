/**
 * docpath:debug — 系统化调试工作流
 *
 * 借鉴 Superpowers 的 systematic-debugging:
 * 1. reproduce — 明确复现步骤
 * 2. isolate   — 隔离问题范围
 * 3. hypothesize — 列出可能原因
 * 4. verify    — 逐个验证假设
 * 5. fix       — 修复并回归
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { writeBreadcrumb } from '../engine/breadcrumb.js';

interface DebugOptions {
  cwd: string;
  action?: 'start' | 'log' | 'done' | 'reproduce' | 'isolate' | 'hypothesize' | 'verify' | 'fix';
  issue?: string;
  evidence?: string;
}

interface DebugSession {
  startedAt: string;
  issue: string;
  steps: { phase: string; content: string; timestamp: string }[];
  status: 'active' | 'resolved' | 'blocked';
  resolution?: string;
}

const DEBUG_PATH = 'workspace/debug.json';
const DEBUG_PHASES = ['reproduce', 'isolate', 'hypothesize', 'verify', 'fix'];

function createDebugSession(issue?: string): DebugSession {
  return {
    startedAt: new Date().toISOString(),
    issue: issue || '未描述的问题',
    steps: [{ phase: 'reproduce', content: '等待复现步骤...', timestamp: new Date().toISOString() }],
    status: 'active',
  };
}

async function startDebugSession(debugPath: string, issue?: string): Promise<void> {
  const session = createDebugSession(issue);
  await writeFile(debugPath, JSON.stringify(session, null, 2), 'utf-8');
  console.log(`🔍 调试会话已创建: ${session.issue}`);
  console.log('步骤: reproduce → isolate → hypothesize → verify → fix');
  console.log('运行 `docpath debug --action=log --evidence="..."` 记录证据');
}

async function readDebugSession(debugPath: string): Promise<DebugSession> {
  return JSON.parse(await readFile(debugPath, 'utf-8'));
}

async function logDebugEvidence(debugPath: string, session: DebugSession, evidence: string): Promise<void> {
  const currentPhase = session.steps.length <= DEBUG_PHASES.length
    ? DEBUG_PHASES[Math.min(session.steps.length - 1, DEBUG_PHASES.length - 1)]
    : 'extra';
  session.steps.push({ phase: currentPhase, content: evidence, timestamp: new Date().toISOString() });
  await writeFile(debugPath, JSON.stringify(session, null, 2), 'utf-8');
  console.log(`📝 证据已记录 [${currentPhase}]: ${evidence.slice(0, 80)}`);
}

async function completeDebugSession(cwd: string, debugPath: string, session: DebugSession, evidence?: string): Promise<void> {
  session.status = 'resolved';
  session.resolution = evidence || '已修复';
  await writeFile(debugPath, JSON.stringify(session, null, 2), 'utf-8');
  await writeBreadcrumb(cwd, {
    taskId: 'debug',
    step: 'debug',
    status: 'done',
    context: `调试完成: ${session.issue} → ${session.resolution}`,
  });
  console.log(`✅ 调试完成: ${session.resolution}`);
}

function printDebugSession(session: DebugSession): void {
  console.log(`🔍 调试会话: ${session.issue}`);
  console.log(`状态: ${session.status} | 步骤: ${session.steps.length}`);
  for (const step of session.steps) {
    console.log(`  [${step.phase}] ${step.content.slice(0, 100)}`);
  }
}

export async function debugCommand(opts: DebugOptions): Promise<void> {
  const docpathDir = await resolveDocpathDir(opts.cwd);
  const debugPath = join(docpathDir, DEBUG_PATH);

  if (opts.action === 'start' || !existsSync(debugPath)) {
    await startDebugSession(debugPath, opts.issue);
    return;
  }

  const session = await readDebugSession(debugPath);

  if (opts.action === 'log' && opts.evidence) {
    await logDebugEvidence(debugPath, session, opts.evidence);
    return;
  }

  if (opts.action === 'done') {
    await completeDebugSession(opts.cwd, debugPath, session, opts.evidence);
    return;
  }

  printDebugSession(session);
}
