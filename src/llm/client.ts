/**
 * LLM 抽象层 — 可插拔的 AI 后端接口
 *
 * 支持：
 * - PlaceholderLLM（默认 fallback，不调用真实 API）
 * - OpenAI-compatible endpoint（通过 config set llm.endpoint + llm.apiKey 配置）
 *
 * 优先级：真实 endpoint > PlaceholderLLM
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

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
// Placeholder LLM — fallback when no real API
// ────────────────────────────────────────────

class PlaceholderLLM implements LLMClient {
  name = 'placeholder';

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const lastMsg = request.messages[request.messages.length - 1];
    const userContent = lastMsg?.content || '';

    if (userContent.toLowerCase().includes('spec') || userContent.includes('规约')) {
      return {
        content: `SPEC_COMPLETE\n\n基于你的描述，我整理了以下规约：\n\n\`\`\`yaml\ntitle: "需求规约"\nbackground: |\n  用户输入的需求澄清结果。\nfunctional_requirements:\n  - id: FR-1\n    description: "${userContent.slice(0, 100)}"\nconstraints:\n  - 保持简洁\nacceptance_criteria:\n  - 核心功能可正常运行\n\`\`\``,
      };
    }

    return {
      content: `我理解你的需求。让我再确认一下：\n\n1. 这个需求的核心目标是什么？\n2. 有没有明确的技术约束？\n\n请补充更多细节，我来帮你生成规约。`,
    };
  }
}

// ────────────────────────────────────────────
// OpenAI-compatible LLM — 真实 API 接入
// ────────────────────────────────────────────

interface OpenAIConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

class OpenAICompatibleLLM implements LLMClient {
  name = 'openai-compatible';
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const { endpoint, apiKey, model } = this.config;

    // 构建 OpenAI-compatible messages
    const messages = [
      { role: 'system', content: request.system },
      ...request.messages,
    ];

    const body = {
      model,
      messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 4096,
    };

    const url = endpoint.endsWith('/') ? `${endpoint}chat/completions` : `${endpoint}/chat/completions`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => resp.statusText);
        throw new Error(`LLM API ${resp.status}: ${errText}`);
      }

      const data = await resp.json() as any;
      const content = data.choices?.[0]?.message?.content || '';
      const usage = data.usage ? {
        input: data.usage.prompt_tokens || 0,
        output: data.usage.completion_tokens || 0,
      } : undefined;

      return { content, usage };
    } catch (err: any) {
      console.error(`⚠️  LLM API 调用失败 (${err.message})，回退到 PlaceholderLLM`);
      const fallback = new PlaceholderLLM();
      return fallback.chat(request);
    }
  }
}

// ────────────────────────────────────────────
// 全局客户端管理
// ────────────────────────────────────────────

let _client: LLMClient = new PlaceholderLLM();
let _configCache: OpenAIConfig | null = null;

/**
 * 从 .docpath/workspace.json 读取 LLM 配置
 */
async function loadLLMConfig(cwd?: string): Promise<OpenAIConfig | null> {
  // 尝试多个可能的 cwd
  const searchDirs = cwd ? [cwd] : [process.cwd()];

  for (const dir of searchDirs) {
    const configPath = join(dir, '.docpath', 'workspace.json');
    try {
      if (existsSync(configPath)) {
        const raw = await readFile(configPath, 'utf-8');
        const config = JSON.parse(raw);

        const endpoint = config.llm?.endpoint;
        const apiKey = config.llm?.apiKey;
        const model = config.llm?.model || 'gpt-4o-mini';

        if (endpoint && apiKey) {
          return { endpoint, apiKey, model };
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // 环境变量 fallback
  const envEndpoint = process.env.DOCPATH_LLM_ENDPOINT;
  const envKey = process.env.DOCPATH_LLM_API_KEY;
  const envModel = process.env.DOCPATH_LLM_MODEL || 'gpt-4o-mini';

  if (envEndpoint && envKey) {
    return { endpoint: envEndpoint, apiKey: envKey, model: envModel };
  }

  return null;
}

/**
 * 初始化 LLM 客户端 — 读取配置，决定用真实 API 还是 Placeholder
 */
export async function initLLMClient(cwd?: string): Promise<void> {
  if (_configCache) return; // 已初始化

  const config = await loadLLMConfig(cwd);
  if (config) {
    _client = new OpenAICompatibleLLM(config);
    _configCache = config;
    console.log(`🤖  LLM 已连接: ${config.endpoint} (${config.model})`);
  }
  // 否则保持 PlaceholderLLM
}

/**
 * 强制刷新 LLM 配置（config set 后调用）
 */
export async function refreshLLMClient(cwd?: string): Promise<void> {
  _configCache = null;
  _client = new PlaceholderLLM();
  await initLLMClient(cwd);
}

export function getLLMClient(): LLMClient {
  return _client;
}

export function setLLMClient(client: LLMClient): void {
  _client = client;
}

export async function callLLM(request: LLMRequest, cwd?: string): Promise<LLMResponse> {
  // 懒初始化
  if (_client.name === 'placeholder' && !_configCache) {
    await initLLMClient(cwd);
  }
  return _client.chat(request);
}
