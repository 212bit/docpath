/**
 * docpath:prompt — 输出结构化 prompt（支持 OMX 风格）
 */

import { generateAgentOutput } from '../utils/agent-output.js';
import type { AgentOutput } from '../utils/agent-output.js';
import { parse } from 'yaml';

interface PromptOptions {
  cwd: string;
  style?: string;
}

/**
 * prompt 命令的主入口
 */
export async function promptAction(options: PromptOptions): Promise<void> {
  const { cwd, style = 'omx' } = options;

  // 生成 agent output (YAML)
  const yamlOutput = await generateAgentOutput(cwd);
  const data = parse(yamlOutput) as AgentOutput;

  // 根据 style 格式化输出
  let output: string;
  switch (style) {
    case 'omx':
      output = formatOMXPrompt(data);
      break;
    default:
      throw new Error(`Unsupported style: ${style}`);
  }

  console.log(output);
}

/**
 * 格式化为 OMX 风格的结构化 Markdown prompt
 */
function formatOMXPrompt(data: AgentOutput): string {
  const sections: string[] = [];

  // Section 1: 当前状态
  sections.push('## 当前状态');
  sections.push('');
  sections.push(`- **Phase**: ${data.phase || 'unknown'}`);
  sections.push(`- **Gate**: ${data.gate || 'none'}`);
  sections.push(`- **Progress**: ${data.progress.done}/${data.progress.total} 完成`);
  if (data.progress.in_progress > 0) {
    sections.push(`- **In Progress**: ${data.progress.in_progress}`);
  }
  if (data.progress.blocked > 0) {
    sections.push(`- **Blocked**: ${data.progress.blocked}`);
  }
  sections.push('');

  // Section 2: 上下文索引（如果有）
  if (data.context_index_trunk && data.context_index_trunk.length > 0) {
    sections.push('## 上下文索引');
    sections.push('');
    sections.push('### Trunk（核心上下文）');
    sections.push('');
    for (const entry of data.context_index_trunk) {
      sections.push(`#### ${entry.label}`);
      sections.push('');
      sections.push(entry.summary);
      sections.push('');
    }
  }

  if (data.context_index_leaves && data.context_index_leaves.length > 0) {
    sections.push('### Leaves（索引）');
    sections.push('');
    for (const leaf of data.context_index_leaves) {
      sections.push(`- **${leaf.label}**: ${leaf.summary}`);
    }
    sections.push('');
  }

  // Section 3: 推荐动作
  sections.push('## 推荐动作');
  sections.push('');
  sections.push(`- **Next Action**: ${data.next_action}`);
  sections.push(`- **Command**: \`${data.recommended_command}\``);
  sections.push('');

  // Section 4: 必需文件
  if (data.required_files && data.required_files.length > 0) {
    sections.push('## 必需文件');
    sections.push('');
    for (const file of data.required_files) {
      sections.push(`- ${file}`);
    }
    sections.push('');
  }

  // Section 5: 当前焦点（如果有）
  if (data.current_focus) {
    sections.push('## 当前焦点');
    sections.push('');
    sections.push(data.current_focus.detail);
    sections.push('');
  }

  return sections.join('\n');
}
