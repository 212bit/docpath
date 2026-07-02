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
import { mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { transitionWorkflow } from '../engine/transitions.js';
import { nextCommand } from './runtime.js';
import { emitPrompt, readTaskFile } from '../utils/agent-prompt.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readRequirementFile } from '../utils/input.js';

interface BrainstormOptions {
  /** 项目根目录 */
  cwd: string;
  /** 初始需求（用户的第一句话） */
  input?: string;
  /** 需求文档路径（[file] 位置参数或 --file 选项） */
  file?: string;
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

async function ensureDocpathDir(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }
  return docpathDir;
}

async function resolveBrainstormInput(options: BrainstormOptions): Promise<string> {
  let userMsg = options.input?.trim() || '';
  if (!userMsg && options.file) {
    userMsg = (await readRequirementFile(options.cwd, options.file)).trim();
  }
  return userMsg || '（未提供需求描述）';
}

async function readBrainstormContext(cwd: string, docpathDir: string): Promise<{
  projectContext: string;
  existingSpec: string;
}> {
  const projectContext = await readFile(join(docpathDir, 'config.yaml'), 'utf-8');
  const existingSpec = await readTaskFile(cwd, 'spec.md');
  return { projectContext, existingSpec };
}

function buildBrainstormSystemPrompt(projectContext: string, existingSpec: string): string {
  return SOCRATIC_SYSTEM_PROMPT + projectContext +
    (existingSpec ? `\n\n已有规约：\n${existingSpec}` : '');
}

function firstMeaningfulLine(input: string): string {
  return input
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) || '未命名需求';
}

function sanitizeInline(value: string): string {
  return value.replace(/[`*_#\[\]]/g, '').trim() || '未命名需求';
}

function buildDraftTitle(userMsg: string): string {
  const line = sanitizeInline(firstMeaningfulLine(userMsg));
  return line.length > 48 ? `${line.slice(0, 48)}...` : line;
}

function buildClarificationSection(): string[] {
  return [
    '## 澄清问题',
    '',
    '1. 这个需求主要服务哪类用户或 Agent 工作流？',
    '2. 完成后用户会通过哪个命令、文件或界面感知到变化？',
    '3. 哪些行为必须保持兼容，哪些场景明确不在本次范围内？',
    '4. 验收时应该检查哪些输出、状态变化或无副作用约束？',
    '',
  ];
}

function buildAssumptionsSection(): string[] {
  return [
    '## 默认假设',
    '',
    '- 优先保持现有 DocPath FSM 与命令行为兼容。',
    '- 如果需求仍不完整，先采用最小可交付范围，并在 spec 中写明不包含项。',
    '- 所有新增行为应可通过本地测试验证，不依赖网络或外部 LLM。',
    '',
  ];
}

function buildSpecDraftSection(title: string, summary: string): string[] {
  return [
    '## Spec 草稿',
    '',
    `# T-DRAFT - ${title}`,
    '',
    '## 1. 背景与动机',
    '',
    '## 背景',
    '',
    `- 用户提出的初始需求：${summary}`,
    '- 当前信息仍需要通过澄清问题确认用户、入口、范围和验收口径。',
    '',
    '## 验收',
    '',
    '- 需求已补齐背景、范围、功能需求和验收标准，可进入 `docpath plan`。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    `- [ ] FR-1: ${title}`,
    '  - 来源: brainstorm draft',
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 保持现有 DocPath 工作流兼容',
    '- [ ] NFR-2: 新增行为应可通过自动化测试验证',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    `- ${title}`,
    '',
    '### 不包含',
    '- 待根据澄清问题补充',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | 实施范围 | 最小可交付 / 扩展方案 | 最小可交付 | 降低入口需求不清导致的返工 |',
    '',
    '## 4.1 重大变更门禁',
    '',
    '### 是否涉及重大变更',
    '- [ ] 否',
    '- [ ] 是，需要用户确认',
    '',
    '### 变更类型',
    '- [ ] 技术栈 / 框架',
    '- [ ] UI 框架 / 设计系统',
    '- [ ] 构建工具 / 打包方式',
    '- [ ] 数据库 / 存储模型',
    '- [ ] API / 数据契约',
    '- [ ] 部署 / 运行方式',
    '- [ ] 安全 / 权限边界',
    '- [ ] 外部 SDK / 大依赖',
    '- [ ] 架构 / 模块边界',
    '- [ ] UI 信息架构 / 用户主路径',
    '- [ ] 工作流 / Agent 行为',
    '- [ ] 权限 / 写操作边界',
    '- [ ] 范围扩大',
    '- [ ] 删除 / 替换已有能力',
    '- [ ] 长期维护成本增加',
    '- [ ] 其他',
    '',
    '### Decision Brief',
    '- 当前问题:',
    '- 目标:',
    '- 背景:',
    '- 可选方案:',
    '  - 方案 A:',
    '- 推荐方案:',
    '- 决策理由:',
    '- 不做什么:',
    '- 成本:',
    '- 风险:',
    '- 回滚方案:',
    '- 用户确认:',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: 需求背景、范围和验收口径已补齐',
    '- [ ] AC-2: `docpath plan` 可基于该 spec 生成可执行计划',
    '',
  ];
}

function buildBrainstormDraft(userMsg: string): string {
  const title = buildDraftTitle(userMsg);
  const summary = userMsg.trim() || '（未提供需求描述）';
  return [
    ...buildClarificationSection(),
    ...buildAssumptionsSection(),
    ...buildSpecDraftSection(title, summary),
  ].join('\n');
}

function emitBrainstormPrompt(systemPrompt: string, userMsg: string, existingSpec: string): void {
  emitPrompt({
    task: 'brainstorm',
    system: systemPrompt,
    context: {
      '用户需求': userMsg,
      '现有spec': existingSpec
        ? `已有 spec.md（可能不完整）：\n\`\`\`markdown\n${existingSpec}\n\`\`\`\n请在此基础上完善。`
        : '这是全新需求，无现有 spec。',
    },
    instructions: [
      '请通过苏格拉底式提问逐步澄清需求，最终输出完整的 spec.md。',
      '',
      '**执行方式**：',
      '1. 分析用户输入，识别模糊点和缺失信息',
      '2. 先输出“澄清问题”，每次只问 1-2 个关键问题',
      '3. 给出“默认假设”，明确哪些边界是暂定的',
      '4. 需求清晰后，生成可执行的 Markdown spec 草稿',
      '5. 使用 `docpath write-spec` 写入结果',
      '',
      '**输出必须包含**：',
      '- `## 澄清问题`',
      '- `## 默认假设`',
      '- `## Spec 草稿`',
      '',
      '**Spec 草稿格式要求**：',
      '```markdown',
      '# T-DRAFT - 项目标题',
      '## 1. 背景与动机',
      '## 2. 需求清单',
      '### 功能需求',
      '### 非功能需求',
      '## 3. 范围界定',
      '## 4. 关键决策',
      '## 5. 验收标准',
      '```',
    ],
    output_format: '澄清问题 + 默认假设 + spec.md Markdown 草稿',
  });
}

/**
 * 交互式 brainstorm 主流程
 *
 * 注意：此函数设计为在 CLI 交互模式下运行。
 * 在 Claude Code Agent 环境中，此流程由 CLAUDE.md 协议替代。
 */
export async function brainstormCommand(options: BrainstormOptions): Promise<void> {
  const { cwd, dryRun } = options;
  const docpathDir = await ensureDocpathDir(cwd);

  // 解析需求来源：--input 文本 > [file]/--file 文件。
  // fail-loud：指定了文件就必须读到内容，否则 readRequirementFile 抛错，绝不静默回退空需求。
  const userMsg = await resolveBrainstormInput(options);

  console.log('\n🧠  需求拷问模式启动...\n');

  // 2. 读取现有 spec（延迟到 prompt 构建时）

  // 3. 构建初始上下文
  const { projectContext, existingSpec } = await readBrainstormContext(cwd, docpathDir);

  // 添加系统 Prompt
  const systemPrompt = buildBrainstormSystemPrompt(projectContext, existingSpec);

  if (dryRun) {
    console.log('📝  [dry-run] 需求头脑风暴预览：');
    console.log('---');
    console.log(buildBrainstormDraft(userMsg));
    if (existingSpec) {
      console.log('## 现有 Spec 参考');
      console.log('');
      console.log(existingSpec);
    }
    console.log('---');
    return;
  }

  // 确保 tasks/current 目录存在
  const tasksCurrentDir = join(docpathDir, 'tasks', 'current');
  await mkdir(tasksCurrentDir, { recursive: true });

  // 3.5 单次模式：不进入交互循环，直接从 input 生成 spec
  // [Agent Mode] 输出结构化 prompt，由宿主 Agent 执行推理（userMsg 已在上方解析）

  emitBrainstormPrompt(systemPrompt, userMsg, existingSpec);

  await transitionWorkflow(cwd, 'task.created', { currentStep: '需求拷问中，澄清后写入 spec' });
  console.log('\n✅ 状态已更新为 drafting');
  await nextCommand({ cwd });
}
