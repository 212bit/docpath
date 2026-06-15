/**
 * context-compaction — 智能上下文压缩
 *
 * 检测 agent 对话过长时，自动压缩历史消息：
 * - 保留 system prompt + 最近 N 条消息
 * - 中间消息压缩为摘要
 * - 输出 compacted context 供 agent 使用
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from './file.js';

// ── 配置 ──

export interface CompactionConfig {
  /** 保留最近 N 条消息（默认 6） */
  keepRecent: number;
  /** 每条摘要最大字符数（默认 200） */
  summaryMaxChars: number;
  /** 超过此消息数触发压缩（默认 12） */
  triggerThreshold: number;
}

const DEFAULT_CONFIG: CompactionConfig = {
  keepRecent: 6,
  summaryMaxChars: 200,
  triggerThreshold: 12,
};

// ── 消息接口 ──

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

// ── 压缩算法 ──

/**
 * 压缩消息历史：
 * 1. 按 triggerThreshold 判断是否需要压缩
 * 2. 保留 system 消息 + 最近 keepRecent 条
 * 3. 中间消息按 role 分组，每组生成摘要
 * 4. 返回压缩后的消息数组
 */
export function compactMessages(messages: Message[], config: Partial<CompactionConfig> = {}): {
  messages: Message[];
  compacted: boolean;
  originalCount: number;
  compactedCount: number;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (messages.length <= cfg.triggerThreshold) {
    return { messages, compacted: false, originalCount: messages.length, compactedCount: messages.length };
  }

  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystemMessages = messages.filter(m => m.role !== 'system');

  if (nonSystemMessages.length <= cfg.keepRecent) {
    return { messages, compacted: false, originalCount: messages.length, compactedCount: messages.length };
  }

  const keepMessages = nonSystemMessages.slice(-cfg.keepRecent);
  const compactMessages_ = nonSystemMessages.slice(0, -cfg.keepRecent);

  // 按连续 role 分组生成摘要
  const summaryChunks: string[] = [];
  let currentRole = '';
  let currentChunk: string[] = [];

  for (const msg of compactMessages_) {
    if (msg.role !== currentRole) {
      if (currentChunk.length > 0) {
        summaryChunks.push(summarizeChunk(currentRole, currentChunk, cfg.summaryMaxChars));
      }
      currentRole = msg.role;
      currentChunk = [msg.content];
    } else {
      currentChunk.push(msg.content);
    }
  }
  if (currentChunk.length > 0) {
    summaryChunks.push(summarizeChunk(currentRole, currentChunk, cfg.summaryMaxChars));
  }

  const summaryMessage: Message = {
    role: 'system',
    content: `[Context Compaction] 以下是被压缩的 ${compactMessages_.length} 条历史消息摘要:\n\n${summaryChunks.join('\n\n')}\n\n---\n最近 ${cfg.keepRecent} 条消息保留如下。`,
  };

  const result = [...systemMessages, summaryMessage, ...keepMessages];
  return { messages: result, compacted: true, originalCount: messages.length, compactedCount: result.length };
}

function summarizeChunk(role: string, contents: string[], maxChars: number): string {
  const combined = contents.join('\n');
  const truncated = combined.length > maxChars ? combined.slice(0, maxChars) + '...' : combined;
  return `[${role}] (${contents.length} messages): ${truncated}`;
}

// ── CLI 命令 ──

interface CompactionOptions {
  cwd: string;
  stdin?: boolean;
  file?: string;
}

export async function compactCommand(options: CompactionOptions): Promise<void> {
  const { cwd, stdin, file } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。');
    process.exit(1);
  }

  let messages: Message[];

  if (file) {
    const content = await readFile(file, 'utf-8');
    messages = JSON.parse(content);
  } else if (stdin) {
    // 从 stdin 读取
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    messages = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } else {
    // 从当前 task context 读取
    const contextPath = join(docpathDir, 'workspace', 'context.json');
    if (!existsSync(contextPath)) {
      console.log('ℹ️  无 context.json，跳过压缩。');
      return;
    }
    messages = JSON.parse(await readFile(contextPath, 'utf-8'));
  }

  const result = compactMessages(messages);

  if (!result.compacted) {
    console.log(`ℹ️  消息数 ${result.originalCount} 未达阈值，无需压缩。`);
    return;
  }

  console.log(`📦  上下文压缩完成:`);
  console.log(`    原始: ${result.originalCount} 条`);
  console.log(`    压缩后: ${result.compactedCount} 条`);
  console.log(`    节省: ${result.originalCount - result.compactedCount} 条`);

  // 输出到 stdout
  console.log(JSON.stringify(result.messages, null, 2));
}
