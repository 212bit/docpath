/**
 * 上下文感知帮助系统
 *
 * 根据当前工作流状态提供相关的命令建议和帮助信息。
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveDocpathDir } from './file.js';
import { readCurrentState } from './workspace.js';
import { info, warning, success, highlightCommand, separator } from './output-formatter.js';

export interface ContextualHelp {
  situation: string;
  suggestions: string[];
  commands: string[];
}

/**
 * 获取上下文感知的帮助信息
 */
export async function getContextualHelp(cwd: string): Promise<ContextualHelp> {
  const docpathDir = await resolveDocpathDir(cwd);

  // 检查是否初始化
  if (!existsSync(docpathDir)) {
    return {
      situation: '项目未初始化',
      suggestions: [
        '看起来这是你第一次使用 DocPath',
        '需要先初始化项目'
      ],
      commands: [
        'docpath init - 初始化项目',
        'docpath onboard - 启动入门向导（推荐新用户）'
      ]
    };
  }

  // 读取状态
  const state = await readCurrentState(cwd);

  if (!state) {
    return {
      situation: '无法读取状态',
      suggestions: ['状态文件可能损坏'],
      commands: [
        'docpath status --agent - 查看详细诊断',
        'docpath doctor - 检查项目健康'
      ]
    };
  }

  // 根据状态给出建议
  const { state: workflowState, task_id } = state;

  // 空闲状态 - 没有活跃任务
  if (workflowState === 'idle' || !task_id) {
    return {
      situation: '空闲状态 - 没有活跃任务',
      suggestions: [
        '可以创建新需求或从 backlog 提升现有需求',
        '使用 backlog list 查看所有待处理需求'
      ],
      commands: [
        'docpath backlog list - 查看需求池',
        'docpath backlog capture --title "..." - 创建新需求',
        'docpath backlog promote R-xxx - 提升需求为当前任务'
      ]
    };
  }

  // 执行状态
  if (workflowState === 'executing') {
    const tasksDir = join(docpathDir, 'tasks', 'current');
    const hasSpec = existsSync(join(tasksDir, 'spec.md'));
    const hasPlan = existsSync(join(tasksDir, 'plan.md'));

    if (!hasSpec) {
      return {
        situation: '任务已激活，但缺少规格文档',
        suggestions: [
          '需要先编写需求规格',
          '可以使用 brainstorm 澄清需求'
        ],
        commands: [
          'docpath brainstorm - 澄清需求',
          'docpath write-spec - 编写规格文档'
        ]
      };
    }

    if (!hasPlan) {
      return {
        situation: '规格已完成，但缺少执行计划',
        suggestions: [
          '需要制定执行计划',
          '计划会将需求拆解为可执行步骤'
        ],
        commands: [
          'docpath plan - 生成执行计划',
          'docpath analyze --dry-run - 预览分析结果'
        ]
      };
    }

    return {
      situation: '任务执行中',
      suggestions: [
        '按照计划执行各个步骤',
        '完成后运行 check 检查质量'
      ],
      commands: [
        'docpath go --step S1 - 执行指定步骤',
        'docpath check - 运行质量检查',
        'docpath done - 完成任务'
      ]
    };
  }

  // 其他状态
  return {
    situation: `当前状态: ${workflowState}`,
    suggestions: ['运行 status 查看详细信息'],
    commands: [
      'docpath status - 查看状态',
      'docpath next --agent - 查看推荐命令'
    ]
  };
}

/**
 * 显示上下文感知帮助
 */
export async function showContextualHelp(cwd: string): Promise<void> {
  const help = await getContextualHelp(cwd);

  console.log(separator());
  console.log(info(`当前情况: ${help.situation}`));
  console.log();

  if (help.suggestions.length > 0) {
    console.log('💡 建议:');
    help.suggestions.forEach(s => console.log(`  • ${s}`));
    console.log();
  }

  if (help.commands.length > 0) {
    console.log('📋 相关命令:');
    help.commands.forEach(cmd => {
      const [command, description] = cmd.split(' - ');
      console.log(`  ${highlightCommand(command)}`);
      if (description) {
        console.log(`     ${description}`);
      }
    });
  }

  console.log(separator());
  console.log();
  console.log(info('运行 docpath --help 查看所有命令'));
  console.log(info('运行 docpath onboard 启动入门向导'));
}
