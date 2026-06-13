/**
 * docpath:continue — 断线重连 + 统一恢复建议
 *
 * 与 `agent enter` 的分工：
 * - **continue**: 人类或 agent 断线后恢复上下文，读 breadcrumb + current state 给出建议，不改变工作流状态
 * - **agent enter**: agent 生命周期入口，加载 state.json 并标记执行开始
 *
 * 当前实现原则：
 * 1. 保留 breadcrumb 恢复价值
 * 2. 不再维护独立的旧状态 → 命令映射
 * 3. 恢复建议统一复用 `generateAgentOutput()` 的 next 路由结果
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { readCurrentMd, updateLevel } from '../utils/workspace.js';
import { evaluateEscalation } from '../engine/escalation.js';
import { resolveDocpathDir } from '../utils/file.js';
import { generateAgentOutput } from '../utils/agent-output.js';
import { readActiveTaskFile } from '../utils/task-files.js';

interface ContinueOptions {
  cwd: string;
  verbose?: boolean;
}

type ContinueRoute = {
  next_action?: string;
  recommended_command?: string;
  required_files?: string[];
};

function parseContinueRoute(raw: string): ContinueRoute {
  try {
    const parsed = parseYaml(raw) as ContinueRoute | null;
    return parsed || {};
  } catch {
    return {};
  }
}

async function printResumeContext(cwd: string, docpathDir: string): Promise<void> {
  const breadcrumbPath = join(docpathDir, 'workspace', 'breadcrumb.md');

  console.log('🔄  恢复断点上下文...\n');

  if (existsSync(breadcrumbPath)) {
    const breadcrumbContent = await readFile(breadcrumbPath, 'utf-8');
    const entries = parseBreadcrumbEntries(breadcrumbContent);
    if (entries.length > 0) {
      const latest = entries[entries.length - 1];
      console.log(`📍  最新面包屑: ${latest.taskId}`);
      console.log(`   状态: ${latest.status}`);
      console.log(`   上下文: ${latest.context}\n`);
    }
  }

  const current = await readCurrentMd(cwd);
  if (current) {
    console.log(`📌  当前状态: ${current.state}`);
    console.log(`   任务: ${current.task_title} (${current.task_id})`);
    console.log(`   阶段: ${current.phase}`);
    console.log(`   门禁: ${current.gate}\n`);
  }
}

function parseBreadcrumbEntries(content: string): Array<{
  taskId: string;
  status: string;
  context: string;
}> {
  const entries: Array<{ taskId: string; status: string; context: string }> = [];
  const blocks = content.split(/^### /m).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim());
    const header = lines[0];
    const taskIdMatch = header.match(/\[([^\]]+)\]/);
    if (!taskIdMatch) continue;

    const taskId = taskIdMatch[1];
    let status = 'unknown';
    let context = '';

    for (const line of lines.slice(1)) {
      const clean = line.replace(/^[-*]\s*/, '').trim();
      if (clean.startsWith('**状态**:')) status = clean.split(':')[1].trim();
      if (clean.startsWith('**上下文**:')) context = clean.split(':').slice(1).join(':').trim();
    }

    entries.push({ taskId, status, context });
  }

  return entries;
}

async function maybeEscalateLevel(cwd: string, docpathDir: string): Promise<void> {
  const current = await readCurrentMd(cwd);
  if (!current) return;

  const specContent = await readActiveTaskFile(docpathDir, current.task_id, 'spec.md');
  const planContent = await readActiveTaskFile(docpathDir, current.task_id, 'plan.md');

  const taskDescription = [specContent, planContent].filter(Boolean).join('\n\n') || 'unknown task';
  const escalation = evaluateEscalation(
    taskDescription,
    current.level as any,
    current.state,
    current.started_at,
  );

  if (escalation.action !== 'no_change') {
    console.log(`🚀  建议升级: Level ${escalation.finalLevel}`);
    console.log(`   原因: ${escalation.reason}\n`);

    await updateLevel(cwd, escalation.finalLevel);
    console.log(`✅  已升级到 Level ${escalation.finalLevel}\n`);
  }
}

function printNextRoute(route: ContinueRoute, verbose?: boolean): void {
  const nextAction = route.next_action || '运行 `docpath next --agent` 查看下一步';
  const recommended = route.recommended_command || 'docpath next --agent';
  const requiredFiles = route.required_files || [];

  console.log(`👉  建议下一步: ${nextAction}\n`);
  console.log('─── 下一步操作 ───');
  console.log(`推荐命令: ${recommended}`);

  if (verbose && requiredFiles.length > 0) {
    console.log('\n建议先读文件:');
    for (const file of requiredFiles) {
      console.log(`  - ${file}`);
    }
  }

  console.log('');
}

export async function continueCommand(options: ContinueOptions): Promise<void> {
  const { cwd, verbose } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  await printResumeContext(cwd, docpathDir);
  await maybeEscalateLevel(cwd, docpathDir);

  const agentOutput = await generateAgentOutput(cwd);
  const route = parseContinueRoute(agentOutput);
  printNextRoute(route, verbose);
}
