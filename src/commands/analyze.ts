/**
 * docpath:analyze — 开发前需求/UI/技术分析提示生成
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { nextCommand } from './runtime.js';
import { readCurrentState, type CurrentState } from '../utils/workspace.js';
import { readStdin } from '../utils/stdin.js';

export interface AnalyzeOptions {
  cwd: string;
  file?: string;
  content?: string;
  stdin?: boolean;
  dryRun?: boolean;
  mode?: 'quick' | 'deep';
}


const ANALYSIS_CONTEXT_COLLECTION = [
  '先读取现有需求文档、README、路由/页面目录、数据模型/API、权限相关代码；只读，不进入实现。',
  '若是 UI/管理页面，至少检查现有导航、表格/表单/详情组件、加载/错误/空态模式和权限守卫。',
  '把已验证事实、合理假设、信息缺口分开写；不要把猜测伪装成事实。',
  '信息不足时先列确认问题；只有非阻塞假设可以进入后续 spec 候选。',
];

const ANALYSIS_OUTPUT_FORMAT = {
  mode: 'deep',
  sections: {
    requirements: [
      '## 1. 目标与背景',
      '## 2. 用户/角色/触发场景',
      '## 3. 功能需求矩阵（需求/优先级/验收/依赖）',
      '## 4. 非功能需求（性能/安全/合规/可观测性）',
      '## 5. 范围边界与明确不做',
    ],
    product: [
      '## 1. 用户价值与成功指标',
      '## 2. 核心用户旅程',
      '## 3. 业务规则与运营约束',
      '## 4. 竞品/替代方案与取舍',
      '## 5. 发布策略与灰度/回滚',
    ],
    ui: [
      '## 1. 信息架构与页面清单',
      '## 2. 关键流程/线框描述',
      '## 3. 组件、状态、表单与校验',
      '## 4. 空态/错误/加载/权限态',
      '## 5. 响应式、可访问性与文案',
    ],
    technical: [
      '## 1. 架构影响与模块边界',
      '## 2. 数据模型/API/事件契约',
      '## 3. 依赖、迁移与兼容性',
      '## 4. 测试策略与质量门禁',
      '## 5. 安全、性能与运维风险',
    ],
    risks: [
      '## 1. 产品风险',
      '## 2. 设计风险',
      '## 3. 技术风险',
      '## 4. 交付风险',
      '## 5. 缓解措施与触发条件',
    ],
    'open-questions': [
      '## 1. 必问问题（阻塞 spec）',
      '## 2. 可延后问题（不阻塞 MVP）',
      '## 3. 需要用户/业务确认的假设',
      '## 4. 需要实验验证的问题',
    ],
  },
  quality_bar: [
    '每个核心分区至少包含用户、边界、验收/验证维度；禁止只有标题没有内容。',
    'UI 分区必须覆盖状态、异常、响应式或可访问性中的至少三类。',
    'technical 分区必须能指导 plan 拆解与测试策略。',
    'open-questions 必须区分阻塞与非阻塞问题。',
  ],
};

async function ensureWorkspace(cwd: string): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }
}

function hasActiveAnalysisTask(current: CurrentState | null): boolean {
  return Boolean(current?.task_id && current.phase !== 'idle' && current.phase !== 'completed');
}

async function assertCanWriteAnalysis(cwd: string): Promise<void> {
  const current = await readCurrentState(cwd);
  if (hasActiveAnalysisTask(current)) return;
  throw new Error([
    'docpath analyze: 当前没有可写入 analysis 的活跃任务',
    '修复建议:',
    '- 若只是理解需求，运行 `docpath analyze --dry-run --mode deep --content "<requirement>"`',
    '- 若是新想法，先运行 `docpath backlog capture --title <title>`',
    '- 若需求已成熟，先运行 `docpath backlog promote <id>` 创建当前任务',
  ].join('\n'));
}

export async function analyzeCommand(options: AnalyzeOptions): Promise<void> {
  const { cwd } = options;
  await ensureWorkspace(cwd);
  const input = await readAnalysisInput(options);
  if (!input.trim()) {
    console.error('❌  未提供需求输入。用法：');
    console.error('   docpath analyze --file requirements.md');
    console.error('   docpath analyze --content "..."');
    console.error('   cat requirements.md | docpath analyze --stdin');
    process.exit(1);
  }

  const mode = options.mode || 'deep';
  const payload = buildAnalysisPayload(input, mode, options.dryRun === true);

  if (options.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await assertCanWriteAnalysis(cwd);

  console.log(JSON.stringify(payload, null, 2));

  await transitionWorkflow(cwd, 'task.created', { currentStep: '开发前分析中，整理后写入 analysis/<section>.md' });
  console.log('\n✅ 状态已更新为 drafting (predev-analysis)');
  await nextCommand({ cwd });
}

function buildAnalysisPayload(input: string, mode: 'quick' | 'deep', dryRun: boolean): Record<string, unknown> {
  return {
    task: 'predev-analysis',
    mode,
    dry_run: dryRun,
    intent: dryRun
      ? '预览完整开发前分析提示载荷；不更新 DocPath 状态、不写入 analysis/*。'
      : '执行开发前分析；Agent 必须基于该载荷产出内容并写入 analysis/*。',
    system: '你是资深产品经理、需求分析师、UI/UX 设计师与软件架构师。请在编写 spec 前，先把模糊需求拆成可执行、可验证、可分工更新的开发前分析。',
    context_collection: ANALYSIS_CONTEXT_COLLECTION,
    rules: [
      '默认执行 deep 分析：不得只输出提纲，必须给出假设、证据、取舍、验收与风险。',
      '先分析用户目标、角色、触发场景、边界和开放问题，再给出 UI/UX 与技术影响。',
      '输出按分区保存：requirements/product/ui/technical/risks/open-questions；用 docpath write-analysis --section <section> --stdin 逐段保存。',
      '若需求不足，明确列出阻塞 spec 的必问问题，并标注可先采用的假设。',
      'UI 分析要覆盖页面/组件、交互状态、空/错/加载态、权限态、可访问性和响应式。',
      'technical 分析要覆盖架构边界、数据/API、兼容性、测试策略和安全/性能影响。',
      '最后给出可转入 spec.md 的目标、范围、验收标准候选和 plan 拆解提示。',
    ],
    input,
    recommended_writes: [
      'docpath write-analysis --section requirements --stdin',
      'docpath write-analysis --section product --stdin',
      'docpath write-analysis --section ui --stdin',
      'docpath write-analysis --section technical --stdin',
      'docpath write-analysis --section risks --stdin',
      'docpath write-analysis --section open-questions --stdin',
    ],
    required_follow_up: [
      '正式分析完成后必须读取 analysis/requirements.md、analysis/product.md、analysis/ui.md、analysis/technical.md、analysis/risks.md、analysis/open-questions.md 中已生成的文件。',
      '回答用户或进入 refine/write-spec 前，必须引用 analysis/* 的结论、缺口与阻塞问题。',
      '不要把 dry-run 输出当作最终分析；dry-run 只用于预览提示载荷。',
    ],
    output_format: ANALYSIS_OUTPUT_FORMAT,
  };
}

async function readAnalysisInput(options: AnalyzeOptions): Promise<string> {
  if (options.content) return options.content;
  if (options.file) return readFile(join(options.cwd, options.file), 'utf-8');
  if (options.stdin !== false) return readStdin();
  return '';
}

