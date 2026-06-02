/**
 * docpath:resume — Checkpoint 恢复
 *
 * 与 `continue` 的差异：
 * - **resume**: 更强调“上次中断点 / checkpoint”视角，适合人类恢复现场
 * - **continue**: 更强调“继续推进”视角，适合人类或 agent 按下一步执行
 *
 * 两者共同原则：
 * 1. 状态以 state.json 真源为准
 * 2. 下一步建议统一复用 `generateAgentOutput()` 路由
 * 3. 不再输出过时的 `docpath:...` 命令名
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { readCurrentState } from '../utils/workspace.js';
import { readFileSafe, resolveDocpathDir } from '../utils/file.js';
import { generateAgentOutput } from '../utils/agent-output.js';

interface ResumeOptions {
  cwd: string;
  verbose?: boolean;
}

type ResumeRoute = {
  next_action?: string;
  recommended_command?: string;
  required_files?: string[];
};

function parseRoute(raw: string): ResumeRoute {
  try {
    return (parseYaml(raw) as ResumeRoute | null) || {};
  } catch {
    return {};
  }
}

function printRequiredFiles(requiredFiles: string[]): void {
  if (requiredFiles.length === 0) return;
  console.log('\n建议先读文件:');
  for (const file of requiredFiles) {
    console.log(`  - ${file}`);
  }
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  const { cwd, verbose } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.log('\n⚠️  未找到活跃任务。运行 `docpath init` 或 `docpath brainstorm` 开始。\n');
    return;
  }

  const current = await readCurrentState(cwd);
  if (!current) {
    console.log('\n⚠️  未找到活跃任务。运行 `docpath init` 或 `docpath brainstorm` 开始。\n');
    return;
  }

  const breadcrumbPath = join(docpathDir, 'workspace', 'breadcrumb.md');
  const breadcrumbContent = await readFileSafe(breadcrumbPath);
  const configContent = await readFileSafe(join(docpathDir, 'config.yaml'));

  console.log('\n🔄  断线恢复 — DocPath Checkpoint\n');
  console.log(`📋  任务: ${current.task_title || '(无标题)'}`);
  console.log(`📊  级别: Level ${current.level ?? '?'} | 状态: ${current.state}`);
  console.log(`📍  阶段: ${current.phase} | 门禁: ${current.gate}`);

  if (verbose && breadcrumbContent) {
    console.log('\n─── 面包屑上下文 ───');
    const recentLines = breadcrumbContent.split('\n').slice(-20);
    console.log(recentLines.join('\n'));
  }

  if (configContent) {
    const hasKey = configContent.includes('apiKey:') && !configContent.includes('apiKey: ""');
    console.log(`\n🤖  LLM: ${hasKey ? '已配置' : '未配置 (仅模板模式)'}`);
  }

  const route = parseRoute(await generateAgentOutput(cwd));
  const nextAction = route.next_action || '运行 `docpath next --agent` 查看下一步';
  const recommended = route.recommended_command || 'docpath next --agent';
  const requiredFiles = route.required_files || [];

  console.log(`\n💡  下一步: ${nextAction}`);
  console.log(`推荐命令: ${recommended}`);

  if (verbose) {
    printRequiredFiles(requiredFiles);
  }

  console.log('');
}
