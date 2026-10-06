/**
 * agent-coauthor.ts — Git 提交署名 (Co-Authored-By) 动态解析与解耦引擎
 *
 * 1. 优先读取项目级配置 (.docpath/config.yaml 中的 git.co_author 或 agent.co_author)
 * 2. 检查环境变量 GIT_CO_AUTHOR 覆盖
 * 3. 动态探测当前运行的 Agent (Antigravity / Gemini CLI / Claude Code / Codex / OpenCode)
 * 4. 允许关闭署名 (co_author: false) 或自定义任意署名字符串
 */

import { readDocPathConfig } from './config.js';
import { detectAgent } from './trace.js';

export interface ResolvedCoAuthor {
  enabled: boolean;
  trailer: string | null;
  agentName: string;
}

/**
 * 解析当前环境适用的 Co-Authored-By 签名
 */
export async function resolveCoAuthor(cwd: string): Promise<ResolvedCoAuthor> {
  let explicitCoAuthor: boolean | string | undefined;

  try {
    const config = await readDocPathConfig(cwd);
    explicitCoAuthor = config.git?.co_author ?? config.agent?.co_author;
  } catch {
    // 容错
  }

  // 1. 显式关闭署名
  if (explicitCoAuthor === false || explicitCoAuthor === 'none' || explicitCoAuthor === 'false') {
    return { enabled: false, trailer: null, agentName: 'Agent' };
  }

  // 2. 显式自定义署名字符串
  if (typeof explicitCoAuthor === 'string' && explicitCoAuthor.trim()) {
    const raw = explicitCoAuthor.trim();
    const trailer = raw.toLowerCase().startsWith('co-authored-by:') ? raw : `Co-Authored-By: ${raw}`;
    return { enabled: true, trailer, agentName: 'Custom Agent' };
  }

  // 3. 环境变量覆盖
  if (process.env.GIT_CO_AUTHOR) {
    const raw = process.env.GIT_CO_AUTHOR.trim();
    if (raw === 'false' || raw === 'none' || raw === '0') {
      return { enabled: false, trailer: null, agentName: 'Agent' };
    }
    const trailer = raw.toLowerCase().startsWith('co-authored-by:') ? raw : `Co-Authored-By: ${raw}`;
    return { enabled: true, trailer, agentName: 'Agent' };
  }

  // 4. 动态探测 Agent 运行时
  const detected = detectAgent();
  switch (detected) {
    case 'antigravity':
      return {
        enabled: true,
        trailer: 'Co-Authored-By: Antigravity Assistant <noreply@google.com>',
        agentName: 'Antigravity',
      };
    case 'claude':
      return {
        enabled: true,
        trailer: 'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>',
        agentName: 'Claude Code',
      };
    case 'codex':
      return {
        enabled: true,
        trailer: 'Co-Authored-By: Codex Assistant <noreply@openai.com>',
        agentName: 'Codex',
      };
    case 'opencode':
      return {
        enabled: true,
        trailer: 'Co-Authored-By: OpenCode Assistant <noreply@opencode.dev>',
        agentName: 'OpenCode',
      };
    default:
      return {
        enabled: true,
        trailer: 'Co-Authored-By: DocPath Agent <noreply@docpath.dev>',
        agentName: 'Agent',
      };
  }
}
