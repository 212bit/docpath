/**
 * docpath onboard - 交互式入门向导
 *
 * 引导新用户完成 DocPath 的首次完整工作流：
 * 1. 创建第一个 backlog 需求
 * 2. 生成 spec 规格
 * 3. 创建 plan 计划
 * 4. 执行任务（简单示例）
 * 5. 运行 check 检查
 * 6. 提交变更
 *
 * 向导状态保存到 .docpath/.onboarding-state.json，支持中断恢复。
 */

import prompts from 'prompts';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { resolveDocpathDir } from '../utils/file.js';
import { heading, subheading, success, info, warning, separator } from '../utils/output-formatter.js';

interface OnboardingState {
  currentStep: number;
  completed: string[];
  taskTitle?: string;
  taskId?: string;
  backlogId?: string;
}

interface OnboardingOptions {
  cwd: string;
  reset?: boolean;
}

const STEPS = [
  { id: 'welcome', title: '欢迎' },
  { id: 'init', title: '初始化项目' },
  { id: 'backlog', title: '创建需求' },
  { id: 'spec', title: '编写规格' },
  { id: 'plan', title: '制定计划' },
  { id: 'execute', title: '执行任务' },
  { id: 'check', title: '质量检查' },
  { id: 'commit', title: '提交变更' },
  { id: 'complete', title: '完成' }
];

function getStateFilePath(cwd: string): string {
  return join(cwd, '.docpath', '.onboarding-state.json');
}

function loadState(cwd: string): OnboardingState | null {
  const statePath = getStateFilePath(cwd);
  if (!existsSync(statePath)) return null;

  try {
    const content = readFileSync(statePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function saveState(cwd: string, state: OnboardingState): void {
  const statePath = getStateFilePath(cwd);
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

function clearState(cwd: string): void {
  const statePath = getStateFilePath(cwd);
  if (existsSync(statePath)) {
    execSync(`rm ${statePath}`);
  }
}

async function stepWelcome(): Promise<void> {
  console.log(heading('欢迎使用 DocPath！'));
  console.log();
  console.log('DocPath 是一个文档驱动的工作流引擎，帮助你：');
  console.log('• 管理需求和任务（Backlog）');
  console.log('• 编写结构化规格（Spec）');
  console.log('• 制定执行计划（Plan）');
  console.log('• 跟踪执行进度（Breadcrumb）');
  console.log('• 质量检查和代码审查（Check & Review）');
  console.log();
  console.log(info('本向导将带你完成一个完整的任务流程（约 5 分钟）'));
  console.log();

  const { proceed } = await prompts({
    type: 'confirm',
    name: 'proceed',
    message: '准备好开始了吗？',
    initial: true
  });

  if (!proceed) {
    console.log(warning('已取消。随时可以运行 docpath onboard 重新开始。'));
    process.exit(0);
  }
}

async function stepInit(cwd: string): Promise<void> {
  console.log(subheading('步骤 1: 初始化项目'));
  console.log();

  const docpathDir = join(cwd, '.docpath');
  if (existsSync(docpathDir)) {
    console.log(success('项目已初始化'));
    return;
  }

  console.log(info('正在初始化 DocPath...'));
  execSync('docpath init', { cwd, stdio: 'inherit' });
  console.log();
  console.log(success('初始化完成！'));
}

async function stepBacklog(cwd: string, state: OnboardingState): Promise<void> {
  console.log(subheading('步骤 2: 创建第一个需求'));
  console.log();
  console.log('Backlog 是需求池，用于记录待实现的功能和修复的问题。');
  console.log();

  const { title } = await prompts({
    type: 'text',
    name: 'title',
    message: '输入任务标题（例如：添加用户登录功能）',
    initial: '完成 DocPath 入门教程',
    validate: (value: string) => value.trim().length > 0 || '标题不能为空'
  });

  if (!title) {
    throw new Error('用户取消');
  }

  console.log();
  console.log(info(`正在创建需求: ${title}`));

  const output = execSync(`docpath backlog capture --title "${title}" --priority P2`, {
    cwd,
    encoding: 'utf-8'
  });

  // 提取 backlog ID
  const match = output.match(/R-(\d+)/);
  if (match) {
    state.backlogId = match[0];
    state.taskTitle = title;
    console.log(success(`需求已创建: ${state.backlogId}`));
  }
}

async function stepSpec(cwd: string, state: OnboardingState): Promise<void> {
  console.log(subheading('步骤 3: 编写需求规格'));
  console.log();
  console.log('Spec 是结构化的需求文档，明确功能需求、验收标准等。');
  console.log();

  const { useTemplate } = await prompts({
    type: 'confirm',
    name: 'useTemplate',
    message: '使用示例规格模板？',
    initial: true
  });

  if (!useTemplate) {
    console.log(info('你可以稍后运行 docpath brainstorm 来澄清需求'));
    console.log(info('或运行 docpath write-spec 编写自定义规格'));
    return;
  }

  console.log();
  console.log(info('正在生成示例规格...'));

  // 创建简单的 spec 模板
  const specContent = `# T-ONBOARD-${Date.now()} - ${state.taskTitle || '入门教程'}

> backlog_id: ${state.backlogId || 'R-DEMO'}
> user_confirmed: 这是一个入门教程示例任务

## 1. 背景与动机

这是一个通过 DocPath 入门向导创建的示例任务。

## 2. 需求清单

### 功能需求

- [ ] FR-1: 完成 DocPath 入门向导
  - 理解 DocPath 的基本概念
  - 掌握基本工作流程

### 非功能需求

- [ ] NFR-1: 体验流畅，无阻塞

## 3. 范围界定

### 包含
- 完整流程体验

### 不包含
- 复杂功能开发

## 4. 关键决策

无重大决策。

## 5. 验收标准

- [ ] AC-1: 成功完成入门向导
- [ ] AC-2: 理解 DocPath 工作流
`;

  const specPath = join(cwd, '.docpath', 'tasks', 'current', 'spec.md');
  writeFileSync(specPath, specContent, 'utf-8');

  console.log(success('规格已创建'));
}

async function stepPlan(cwd: string): Promise<void> {
  console.log(subheading('步骤 4: 制定执行计划'));
  console.log();
  console.log('Plan 将需求拆解为可执行的步骤。');
  console.log();

  console.log(info('正在生成计划...'));
  execSync('docpath plan', { cwd, stdio: 'inherit' });
  console.log();
  console.log(success('计划已生成'));
}

async function stepExecute(cwd: string): Promise<void> {
  console.log(subheading('步骤 5: 执行任务'));
  console.log();
  console.log('在真实项目中，你会在这里编写代码、修改文件。');
  console.log('本教程将跳过实际开发，直接进入检查阶段。');
  console.log();

  const { understood } = await prompts({
    type: 'confirm',
    name: 'understood',
    message: '理解了吗？按回车继续',
    initial: true
  });

  if (understood) {
    console.log(success('很好！继续下一步'));
  }
}

async function stepCheck(cwd: string): Promise<void> {
  console.log(subheading('步骤 6: 质量检查'));
  console.log();
  console.log('Check 会验证任务完成度、代码质量、测试覆盖等。');
  console.log();

  const { runCheck } = await prompts({
    type: 'confirm',
    name: 'runCheck',
    message: '运行质量检查？',
    initial: true
  });

  if (!runCheck) {
    console.log(warning('跳过检查（实际项目中不建议跳过）'));
    return;
  }

  console.log();
  console.log(info('正在运行检查...'));

  try {
    execSync('docpath check --skip-tests --skip-lint', { cwd, stdio: 'inherit' });
    console.log();
    console.log(success('检查通过'));
  } catch {
    console.log();
    console.log(warning('检查未完全通过（教程环境下正常）'));
  }
}

async function stepCommit(cwd: string): Promise<void> {
  console.log(subheading('步骤 7: 提交变更'));
  console.log();
  console.log('完成任务后，应该提交代码并记录到 Git 历史。');
  console.log();

  const { skipCommit } = await prompts({
    type: 'confirm',
    name: 'skipCommit',
    message: '跳过 Git 提交？（推荐跳过，避免污染你的 Git 历史）',
    initial: true
  });

  if (skipCommit) {
    console.log(info('已跳过提交'));
    return;
  }

  console.log();
  console.log(info('提示：你可以运行 docpath changes --agent 查看变更详情'));
  console.log(info('然后运行 git add 和 git commit 提交'));
}

async function stepComplete(cwd: string): Promise<void> {
  console.log();
  console.log(separator('='));
  console.log(heading('🎉 入门向导完成！'));
  console.log(separator('='));
  console.log();
  console.log(success('你已经完成了 DocPath 的完整工作流体验'));
  console.log();
  console.log('接下来：');
  console.log('• 运行 docpath --help 查看所有命令');
  console.log('• 运行 docpath backlog capture 创建真实需求');
  console.log('• 访问文档: https://github.com/yourusername/docpath');
  console.log();
  console.log(info('提示：运行 docpath onboard --reset 可以重新开始教程'));
  console.log();

  clearState(cwd);
}

export async function onboardCommand(options: OnboardingOptions): Promise<void> {
  const { cwd, reset } = options;

  if (reset) {
    clearState(cwd);
    console.log(success('入门状态已重置'));
    return;
  }

  let state = loadState(cwd);
  const isResume = state !== null;

  if (!state) {
    state = {
      currentStep: 0,
      completed: []
    };
  }

  if (isResume) {
    console.log(info(`从步骤 ${state.currentStep + 1}/${STEPS.length} 继续...`));
    console.log();
  }

  try {
    while (state.currentStep < STEPS.length) {
      const step = STEPS[state.currentStep];

      if (!state.completed.includes(step.id)) {
        switch (step.id) {
          case 'welcome':
            await stepWelcome();
            break;
          case 'init':
            await stepInit(cwd);
            break;
          case 'backlog':
            await stepBacklog(cwd, state);
            break;
          case 'spec':
            await stepSpec(cwd, state);
            break;
          case 'plan':
            await stepPlan(cwd);
            break;
          case 'execute':
            await stepExecute(cwd);
            break;
          case 'check':
            await stepCheck(cwd);
            break;
          case 'commit':
            await stepCommit(cwd);
            break;
          case 'complete':
            await stepComplete(cwd);
            break;
        }

        state.completed.push(step.id);
        console.log();
      }

      state.currentStep++;
      saveState(cwd, state);
    }
  } catch (error) {
    if (error instanceof Error && error.message === '用户取消') {
      console.log();
      console.log(warning('已暂停。运行 docpath onboard 继续'));
      saveState(cwd, state);
    } else {
      throw error;
    }
  }
}
