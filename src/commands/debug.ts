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
  action?: 'start' | 'log' | 'done';
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

export async function debugCommand(opts: DebugOptions): Promise<void> {
  const docpathDir = await resolveDocpathDir(opts.cwd);
  const debugPath = join(docpathDir, DEBUG_PATH);

  if (opts.action === 'start' || !existsSync(debugPath)) {
    // 创建新的调试会话
    const session: DebugSession = {
      startedAt: new Date().toISOString(),
      issue: opts.issue || '未描述的问题',
      steps: [{ phase: 'reproduce', content: '等待复现步骤...', timestamp: new Date().toISOString() }],
      status: 'active',
    };
    await writeFile(debugPath, JSON.stringify(session, null, 2), 'utf-8');
    console.log(`🔍 调试会话已创建: ${session.issue}`);
    console.log('步骤: reproduce → isolate → hypothesize → verify → fix');
    console.log('运行 `docpath debug --action=log --evidence="..."` 记录证据');
    return;
  }

  const session: DebugSession = JSON.parse(await readFile(debugPath, 'utf-8'));

  if (opts.action === 'log' && opts.evidence) {
    // 记录调试证据
    const phases = ['reproduce', 'isolate', 'hypothesize', 'verify', 'fix'];
    const currentPhase = session.steps.length <= phases.length
      ? phases[Math.min(session.steps.length - 1, phases.length - 1)]
      : 'extra';
    session.steps.push({ phase: currentPhase, content: opts.evidence, timestamp: new Date().toISOString() });
    await writeFile(debugPath, JSON.stringify(session, null, 2), 'utf-8');
    console.log(`📝 证据已记录 [${currentPhase}]: ${opts.evidence.slice(0, 80)}`);
    return;
  }

  if (opts.action === 'done') {
    session.status = 'resolved';
    session.resolution = opts.evidence || '已修复';
    await writeFile(debugPath, JSON.stringify(session, null, 2), 'utf-8');
    await writeBreadcrumb(opts.cwd, {
      taskId: 'debug',
      step: 'debug',
      status: 'done',
      context: `调试完成: ${session.issue} → ${session.resolution}`,
    });
    console.log(`✅ 调试完成: ${session.resolution}`);
    return;
  }

  // 默认：显示当前状态
  console.log(`🔍 调试会话: ${session.issue}`);
  console.log(`状态: ${session.status} | 步骤: ${session.steps.length}`);
  for (const step of session.steps) {
    console.log(`  [${step.phase}] ${step.content.slice(0, 100)}`);
  }
}
