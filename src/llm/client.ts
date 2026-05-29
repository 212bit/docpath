/**
 * LLM 抽象层 — ⚠️ DEPRECATED STUB
 *
 * DocPath CLI 不再内嵌 LLM 推理。CLI 只输出 prompt 模板，
 * 由宿主 Agent (Claude Code / Cursor / Copilot) 负责推理。
 *
 * 本文件保留类型导出以维持 API 兼容，但所有调用将返回错误提示。
 *
 * @deprecated CLI 已改为 prompt-only 模式，LLM 推理由宿主 Agent 完成
 */

// import { readFile } from 'node:fs/promises';   // no longer needed
// import { join } from 'node:path';               // no longer needed
// import { existsSync } from 'node:fs';           // no longer needed

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  /** 系统 Prompt */
  system: string;
  /** 对话历史 */
  messages: LLMMessage[];
  /** 温度参数 (0-1)，默认 0.3 */
  temperature?: number;
  /** 最大输出 token 数 */
  maxTokens?: number;
}

export interface LLMResponse {
  /** 输出文本 */
  content: string;
  /** token 用量 */
  usage?: {
    input: number;
    output: number;
  };
}

export interface LLMClient {
  name: string;
  chat(request: LLMRequest): Promise<LLMResponse>;
}

// ────────────────────────────────────────────
// ⚠️ DEPRECATED — 以下实现已被 prompt-only 模式替代
// 保留类型导出以维持 API 兼容
// ────────────────────────────────────────────

class DeprecatedLLM implements LLMClient {
  name = 'deprecated';

  async chat(_request: LLMRequest): Promise<LLMResponse> {
    return {
      content: '⚠️  DocPath CLI 已改为 prompt-only 模式。LLM 推理由宿主 Agent (Claude Code / Cursor / Copilot) 完成。',
    };
  }
}

// ────────────────────────────────────────────
// OpenAI-compatible LLM — 真实 API 接入
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// ⚠️ DEPRECATED — 以下实现已被 prompt-only 模式替代
// 保留类型导出以维持 API 兼容
// ────────────────────────────────────────────

class DeprecatedLLM implements LLMClient {
  name = 'deprecated';

  async chat(_request: LLMRequest): Promise<LLMResponse> {
    return {
      content: '⚠️  DocPath CLI 已改为 prompt-only 模式。LLM 推理由宿主 Agent (Claude Code / Cursor / Copilot) 完成。',
    };
  }
}

// ────────────────────────────────────────────
// 全局客户端管理 — ⚠️ DEPRECATED STUB
// ────────────────────────────────────────────

let _client: LLMClient = new DeprecatedLLM();

/**
 * @deprecated 不再需要初始化 LLM 客户端
 */
export async function initLLMClient(_cwd?: string): Promise<void> {
  // no-op
}

/**
 * @deprecated 不再需要刷新 LLM 客户端
 */
export async function refreshLLMClient(_cwd?: string): Promise<void> {
  // no-op
}

export function getLLMClient(): LLMClient {
  return _client;
}

export function setLLMClient(client: LLMClient): void {
  _client = client;
}

/**
 * @deprecated DocPath CLI 已改为 prompt-only 模式
 */
export async function callLLM(request: LLMRequest, _cwd?: string): Promise<LLMResponse> {
  return _client.chat(request);
}
