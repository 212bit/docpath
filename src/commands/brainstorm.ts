/**
 * docpath:brainstorm — 苏格拉底式需求拷问
 *
 * 输出结构化 prompt，由宿主 Agent 执行苏格拉底式提问，将模糊需求澄清为 spec.md。
 *
 * 流程：
 *   1. 检测 .docpath/ 是否存在（不存在则提示 docpath:init）
 *   2. 读取现有 spec.md（若有）作为上下文
 *   3. 输出 brainstorm prompt（系统提示 + 上下文 + 指令）
 *   4. 宿主 Agent 执行推理 → 使用 docpath write-spec 写入结果
 *   5. 更新 current.md 状态为 drafting
 */

import { existsSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { updateCurrentState } from '../utils/workspace.js';
import { emitPrompt, readTaskFile } from '../utils/agent-prompt.js';
import { resolveDocpathDir } from '../utils/file.js';

interface BrainstormOptions {
  /** 项目根目录 */
  cwd: string;
  /** 初始需求（用户的第一句话） */
  input?: string;
  /** 跳过交互，直接生成 spec（用于 CI/非交互模式） */
  dryRun?: boolean;
  /** 单次模式：不进入交互循环，直接从 input 生成 spec */
  noInteractive?: boolean;
}

/**
 * 苏格拉底式提问的系统 Prompt
 */
const SOCRATIC_SYSTEM_PROMPT = `你是一个需求分析专家，使用苏格拉底式提问法帮助用户澄清需求。

规则：
1. 每次只问 1-2 个最核心的问题，不要一次问太多
2. 从最模糊的地方开始追问：用户最不确定的是什么？
3. 使用具体例子引导用户（"你说的 X 是指 A 还是 B？"）
4. 当用户回答后，简要总结当前理解（"我目前理解是：..."），再问下一个问题
5. 当需求足够清晰时（可拆分为子任务），输出 "SPEC_COMPLETE" + 结构化 spec

输出格式（当 SPEC_COMPLETE 时）：
\`\`\`yaml
title: "xxx"
background: |
  xxx
functional_requirements:
  - id: FR-1
    description: "xxx"
constraints:
  - xxx
acceptance_criteria:
  - xxx
\`\`\`

当前项目上下文：
`;

/**
 * 交互式 brainstorm 主流程
 *
 * 注意：此函数设计为在 CLI 交互模式下运行。
 * 在 Claude Code Agent 环境中，此流程由 CLAUDE.md 协议替代。
 */
export async function brainstormCommand(options: BrainstormOptions): Promise<void> {
  const { cwd, input, dryRun } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  // 1. 检测 .docpath/
  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  console.log('\n🧠  需求拷问模式启动...\n');

  // 2. 读取现有 spec（延迟到 prompt 构建时）

  // 3. 构建初始上下文
  const projectContext = await readFile(join(docpathDir, 'config.yaml'), 'utf-8');
  let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // 添加系统 Prompt
  const systemPrompt = SOCRATIC_SYSTEM_PROMPT + projectContext +
    (existingSpec ? `\n\n已有规约：\n${existingSpec}` : '');

  if (dryRun) {
    console.log('📝  [dry-run] 生成的 Spec 预览：');
    console.log('---');
    console.log(existingSpec || '(无现有 spec)');
    console.log('---');
    return;
  }

  // 确保 tasks/current 目录存在
  const tasksCurrentDir = join(docpathDir, 'tasks', 'current');
  await mkdir(tasksCurrentDir, { recursive: true });

  // 3.5 单次模式：不进入交互循环，直接从 input 生成 spec
  // [Agent Mode] 输出结构化 prompt，由宿主 Agent 执行推理
  const userMsg = input || '（未提供需求描述）';

  // 收集现有 spec（如果有）
  const existingSpec = await readTaskFile(cwd, 'spec.md');

  const prompt = emitPrompt('brainstorm', {
    systemPrompt,
    userInput: userMsg,
    context: existingSpec
      ? `已有 spec.md（可能不完整）：\n\`\`\`markdown\n${existingSpec}\n\`\`\`\n请在此基础上完善。`
      : '这是全新需求，无现有 spec。',
    instructions: `请通过苏格拉底式提问逐步澄清需求，最终输出完整的 spec.md。

**执行方式**：
1. 分析用户输入，识别模糊点和缺失信息
2. 逐一提问澄清（每次只问 1-2 个关键问题）
3. 需求清晰后，生成结构化 spec.md
4. 使用 \`docpath write-spec\` 写入结果

**spec.md 格式要求**：
\`\`\`yaml
title: "项目标题"
background: |
  背景描述
functional_requirements:
  - id: FR-1
    description: "功能描述"
constraints: []
acceptance_criteria:
  - "验收条件"
\`\`\``,
  });

  console.log(prompt);

  await updateCurrentState(cwd, 'drafting', { substep: 'agent-brainstorm' });
  console.log('\n✅ 状态已更新为 drafting');
  console.log('📌 完成后运行: docpath write-spec\n');
}
