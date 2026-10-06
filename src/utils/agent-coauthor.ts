/**
 * agent-coauthor.ts — Git 提交署名 (Co-Authored-By) 动态解析与解耦引擎
 *
 * 默认模式为纯净模式（缺省时不添加任何 Co-Authored-By 署名）。
 * 仅在 .docpath/config.yaml 中配置 git.co_author / agent.co_author，
 * 或设置环境变量 GIT_CO_AUTHOR 时生效：
 * - 字符串：使用自定义署名 (如 "DocPath <docpath@users.noreply.github.com>")
 * - true：开启署名，默认使用 "DocPath <docpath@users.noreply.github.com>"
 * - false / 缺省 (undefined)：纯净模式，不添加署名
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
  const detected = detectAgent();
  const agentLabel = detected ? detected.charAt(0).toUpperCase() + detected.slice(1) : 'Agent';

  let explicitCoAuthor: boolean | string | undefined;

  try {
    const config = await readDocPathConfig(cwd);
    explicitCoAuthor = config.git?.co_author ?? config.agent?.co_author;
  } catch {
    // 容错
  }

  // 1. 显式关闭署名
  if (explicitCoAuthor === false || explicitCoAuthor === 'none' || explicitCoAuthor === 'false') {
    return { enabled: false, trailer: null, agentName: agentLabel };
  }

  // 2. 显式自定义署名字符串 (在 config 中)
  if (typeof explicitCoAuthor === 'string' && explicitCoAuthor.trim()) {
    const raw = explicitCoAuthor.trim();
    const trailer = raw.toLowerCase().startsWith('co-authored-by:') ? raw : `Co-Authored-By: ${raw}`;
    return { enabled: true, trailer, agentName: agentLabel };
  }

  // 3. 环境变量覆盖
  if (process.env.GIT_CO_AUTHOR) {
    const raw = process.env.GIT_CO_AUTHOR.trim();
    if (raw === 'false' || raw === 'none' || raw === '0') {
      return { enabled: false, trailer: null, agentName: agentLabel };
    }
    if (raw === 'true' || raw === '1') {
      return {
        enabled: true,
        trailer: 'Co-Authored-By: DocPath <docpath@users.noreply.github.com>',
        agentName: agentLabel,
      };
    }
    const trailer = raw.toLowerCase().startsWith('co-authored-by:') ? raw : `Co-Authored-By: ${raw}`;
    return { enabled: true, trailer, agentName: agentLabel };
  }

  // 4. 如果配置了 true，则生成默认 DocPath 署名
  if (explicitCoAuthor === true || explicitCoAuthor === 'true') {
    return {
      enabled: true,
      trailer: 'Co-Authored-By: DocPath <docpath@users.noreply.github.com>',
      agentName: agentLabel,
    };
  }

  // 5. 默认缺省：纯净模式，不添加任何 Co-Authored-By 署名
  return {
    enabled: false,
    trailer: null,
    agentName: agentLabel,
  };
}
