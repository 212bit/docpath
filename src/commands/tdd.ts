/**
 * docpath:tdd — Agent TDD Skill 循环
 *
 * spec → plan → act → check → done
 * 每个阶段自动校验前置条件，强制 agent 纪律。
 */

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState, writeCurrentState } from '../utils/workspace.js';

interface TddOptions {
  cwd: string;
  action?: 'start' | 'next' | 'done';
  dryRun?: boolean;
}

// ── TDD 阶段定义 ──

type TddPhase = 'idle' | 'spec' | 'plan' | 'act' | 'check' | 'done';

const TDD_PHASES: TddPhase[] = ['idle', 'spec', 'plan', 'act', 'check', 'done'];

const PHASE_PRECONDITIONS: Record<TddPhase, { check: (cwd: string, docpathDir: string) => Promise<boolean>; message: string }> = {
  idle: { check: async () => true, message: '' },
  spec: {
    check: async (_cwd, docpathDir) => {
      const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
      return existsSync(specPath);
    },
    message: '❌ spec.md 不存在。请先创建需求规约。',
  },
  plan: {
    check: async (_cwd, docpathDir) => {
      const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
      if (!existsSync(specPath)) return false;
      const content = await readFile(specPath, 'utf-8');
      return content.trim().length > 50;
    },
    message: '❌ spec.md 内容不足（<50 字符）。请完善需求规约。',
  },
  act: {
    check: async (_cwd, docpathDir) => {
      const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
      if (!existsSync(planPath)) return false;
      const content = await readFile(planPath, 'utf-8');
      return content.includes('###') || content.includes('- [ ]');
    },
    message: '❌ plan.md 没有子任务。请先生成执行计划。',
  },
  check: {
    check: async () => true,
    message: '',
  },
  done: {
    check: async () => true,
    message: '',
  },
};

// ── TDD 状态持久化 ──

interface TddState {
  phase: TddPhase;
  started_at: string;
  updated_at: string;
  cycles: number;
}

async function readTddState(docpathDir: string): Promise<TddState> {
  const tddPath = join(docpathDir, 'workspace', 'tdd-state.json');
  if (existsSync(tddPath)) {
    try {
      return JSON.parse(await readFile(tddPath, 'utf-8'));
    } catch { /* fallback */ }
  }
  return { phase: 'idle', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), cycles: 0 };
}

async function writeTddState(docpathDir: string, state: TddState): Promise<void> {
  state.updated_at = new Date().toISOString();
  const tddPath = join(docpathDir, 'workspace', 'tdd-state.json');
  await writeFile(tddPath, JSON.stringify(state, null, 2), 'utf-8');
}

// ── 命令入口 ──

export async function tddCommand(options: TddOptions & { action?: string }): Promise<void> {
  const { cwd, action = 'status' } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
  }

  const state = await readTddState(docpathDir);

  switch (action) {
    case 'start':
      await tddStart(docpathDir, state);
      break;
    case 'next':
      await tddNext(cwd, docpathDir, state);
      break;
    case 'status':
    default:
      tddStatus(state);
      break;
  }
}

async function tddStart(docpathDir: string, state: TddState): Promise<void> {
  if (state.phase !== 'idle' && state.phase !== 'done') {
    console.log(`⚠️  TDD 循环已在进行中（当前阶段: ${state.phase}）。使用 \`docpath tdd next\` 推进。`);
    return;
  }

  // 创建 spec 骨架
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  if (!existsSync(specPath)) {
    const skelDir = join(docpathDir, 'tasks', 'current');
    await mkdir(skelDir, { recursive: true });
    await writeFile(specPath, `# Spec: [任务名称]

> Task ID: T-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-xxx
> Status: drafting
> Created: ${new Date().toISOString().slice(0, 10)}

## 问题陈述

[描述要解决的问题]

## 需求

1. [需求 1]
2. [需求 2]

## 验收标准

- [ ] 验收条件 1
- [ ] 验收条件 2

## 范围

- 包含: [...]
- 不包含: [...]
`, 'utf-8');
    console.log('✅  已创建 spec.md 骨架 → .docpath/tasks/current/spec.md');
  } else {
    console.log('ℹ️  spec.md 已存在，跳过创建。');
  }

  const newState: TddState = { phase: 'spec', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), cycles: state.cycles + (state.phase === 'done' ? 1 : 0) };
  await writeTddState(docpathDir, newState);
  console.log(`🔄  TDD 循环启动 → 阶段: spec`);
  console.log(`📋  下一步: 编辑 spec.md，然后运行 \`docpath tdd next\``);
}

async function tddNext(cwd: string, docpathDir: string, state: TddState): Promise<void> {
  const currentIdx = TDD_PHASES.indexOf(state.phase);
  if (currentIdx < 0 || currentIdx >= TDD_PHASES.length - 1) {
    console.log(`✅  TDD 循环已完成。运行 \`docpath tdd start\` 开始新循环。`);
    return;
  }

  const nextPhase = TDD_PHASES[currentIdx + 1];
  const precond = PHASE_PRECONDITIONS[nextPhase];

  // 特殊处理: act → check 需要自动触发 docpath check
  if (nextPhase === 'check') {
    console.log(`🔍  阶段推进: ${state.phase} → check`);
    console.log(`💡  请运行 \`docpath check\` 进行质量门禁，然后运行 \`docpath tdd next\` 完成。`);
    state.phase = 'check';
    await writeTddState(docpathDir, state);
    return;
  }

  // 特殊处理: check → done 需要检查 last-check 是否通过
  if (nextPhase === 'done') {
    const lastCheckPath = join(docpathDir, 'workspace', 'last-check.md');
    if (existsSync(lastCheckPath)) {
      const checkContent = await readFile(lastCheckPath, 'utf-8');
      if (checkContent.includes('✅') || checkContent.toLowerCase().includes('pass')) {
        state.phase = 'done';
        state.cycles += 1;
        await writeTddState(docpathDir, state);
        console.log(`🎉  TDD 循环完成！（第 ${state.cycles} 轮）`);
        console.log(`💡  运行 \`docpath tdd start\` 开始下一轮。`);
        return;
      }
    }
    console.log(`❌  质量检查未通过。请先运行 \`docpath check\` 并确保通过。`);
    return;
  }

  // 前置条件校验
  if (!(await precond.check(cwd, docpathDir))) {
    console.log(precond.message);
    return;
  }

  state.phase = nextPhase;
  await writeTddState(docpathDir, state);
  console.log(`🔄  阶段推进: ${TDD_PHASES[currentIdx]} → ${nextPhase}`);

  // 下一步提示
  const hints: Record<string, string> = {
    spec: '📋  下一步: 编辑 spec.md，然后运行 `docpath tdd next`',
    plan: '📋  下一步: 运行 `docpath plan` 生成执行计划，然后运行 `docpath tdd next`',
    act: '📋  下一步: 运行 `docpath go` 执行子任务，完成后运行 `docpath tdd next`',
  };
  if (hints[nextPhase]) console.log(hints[nextPhase]);
}

function tddStatus(state: TddState): void {
  console.log(`\n🔄  TDD Skill 循环状态\n`);
  console.log(`  阶段: ${state.phase}`);
  console.log(`  轮次: ${state.cycles}`);
  console.log(`  启动: ${state.started_at}`);
  console.log(`  更新: ${state.updated_at}`);
  console.log();

  const phaseIdx = TDD_PHASES.indexOf(state.phase);
  const bar = TDD_PHASES.map((p, i) => {
    if (i < phaseIdx) return `✅${p}`;
    if (i === phaseIdx) return `🔵${p}`;
    return `⬜${p}`;
  }).join(' → ');
  console.log(`  ${bar}`);
  console.log();

  const nextActions: Record<string, string> = {
    idle: '运行 `docpath tdd start` 开始',
    spec: '编辑 spec.md → `docpath tdd next`',
    plan: '`docpath plan` → `docpath tdd next`',
    act: '`docpath go` → `docpath tdd next`',
    check: '`docpath check` → `docpath tdd next`',
    done: '运行 `docpath tdd start` 开始新循环',
  };
  console.log(`  💡  ${nextActions[state.phase] || ''}`);
}
