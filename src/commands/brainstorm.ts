/**
 * docpath:brainstorm — 苏格拉底式需求拷问
 *
 * 通过 LLM 驱动的渐进式提问，帮助用户将模糊需求逐步澄清为结构化 spec.md。
 *
 * 流程：
 *   1. 检测 .docpath/ 是否存在（不存在则提示 docpath:init）
 *   2. 读取现有 spec.md（若有）作为上下文
 *   3. 调用 LLM 发起苏格拉底式提问
 *   4. 用户回答后，LLM 总结 → 写入 spec.md
 *   5. 更新 current.md 状态为 spec_written
 */

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { askQuestion, readCurrentMd, updateCurrentState } from '../utils/workspace.js';
import { callLLM } from '../llm/client.js';
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

  // 2. 读取现有 spec（若存在）
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  let existingSpec = '';
  try {
    existingSpec = await readFile(specPath, 'utf-8');
    console.log('📄  已加载现有 spec.md，将基于此继续深化。\n');
  } catch {
    // spec 不存在，从零开始
  }

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
  if (options.noInteractive) {
    const userMsg = input || '（未提供需求描述）';
    console.log(`👤  需求描述: ${userMsg}\n`);

    try {
      conversationHistory.push({ role: 'user', content: userMsg });
      const llmResponse = await callLLM({
        system: systemPrompt,
        messages: conversationHistory,
      });
      const reply = llmResponse.content;

      // 尝试提取 YAML spec
      const yamlMatch = reply.match(/```yaml\n([\s\S]*?)```/);
      if (yamlMatch) {
        await writeFile(specPath, `# 规约: ${userMsg}\n\n${yamlMatch[1]}`, 'utf-8');
        console.log(`✅  Spec 已写入 ${specPath}`);
      } else {
        // 没有 YAML 块，直接写 LLM 输出
        await writeFile(specPath, `# 规约: ${userMsg}\n\n${reply}`, 'utf-8');
        console.log(`✅  Spec 已写入 ${specPath}（原始输出）`);
      }
    } catch {
      // LLM 失败 → 从输入生成模板 spec
      console.log('⚠️  LLM 不可用，使用模板生成 spec...');
      const templateSpec = [
        `title: "${userMsg.slice(0, 60)}"`,
        `background: |`,
        `  ${userMsg}`,
        `functional_requirements:`,
        `  - id: FR-1`,
        `    description: "${userMsg}"`,
        `constraints: []`,
        `acceptance_criteria:`,
        `  - 核心功能可正常运行`,
      ].join('\n');
      await writeFile(specPath, `# 规约: ${userMsg}\n\n${templateSpec}`, 'utf-8');
      console.log(`✅  模板 Spec 已写入 ${specPath}`);
    }

    await updateCurrentState(cwd, 'spec_written');
    console.log('✅  状态已更新为 spec_written');
    console.log('\n✨  需求生成完成！下一步：`docpath:plan`\n');
    return;
  }

  // 4. 发起第一轮提问
  const userFirstMsg = input || '（等待输入需求描述）';
  console.log(`👤  需求描述: ${userFirstMsg}\n`);

  conversationHistory.push({ role: 'user', content: userFirstMsg });

  // 进入交互循环（简化版：最多 5 轮问答）
  let specComplete = false;
  let round = 0;
  const MAX_ROUNDS = 5;

  while (!specComplete && round < MAX_ROUNDS) {
    round++;
    console.log(`\n--- 第 ${round} 轮 ---\n`);

    // 调用 LLM 提问
    const llmResponse = await callLLM({
      system: systemPrompt,
      messages: conversationHistory,
    });

    const reply = llmResponse.content;
    conversationHistory.push({ role: 'assistant', content: reply });

    // 检查是否输出了 SPEC_COMPLETE
    if (reply.includes('SPEC_COMPLETE')) {
      specComplete = true;
      console.log(`🤖  AI:\n${reply}\n`);

      // 提取 YAML spec 部分
      const yamlMatch = reply.match(/```yaml\n([\s\S]*?)```/);
      if (yamlMatch) {
        const specContent = yamlMatch[1];
        await writeFile(specPath, `# 规约: ${input || 'Untitled'}\n\n${specContent}`, 'utf-8');
        console.log(`✅  Spec 已写入 ${specPath}`);
      }

      // 更新 current.md 状态
      await updateCurrentState(cwd, 'spec_written');
      console.log('✅  状态已更新为 spec_written');
      break;
    }

    // AI 提问，等待用户回答
    console.log(`🤖  AI:\n${reply}\n`);
    const userAnswer = await askQuestion('👤  你的回答: ');
    conversationHistory.push({ role: 'user', content: userAnswer });
  }

  if (!specComplete) {
    console.log('\n⚠️  已达到最大提问轮次，需求仍不完全清晰。');
    console.log('请手动编辑 spec.md 后，运行 `docpath:plan` 生成计划。\n');
  }

  console.log('\n✨  需求拷问完成！下一步：`docpath:plan`\n');
}
