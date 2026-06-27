import { existsSync, readFileSync, appendFileSync } from 'fs';
import { appendFile, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from './file.js';
import { readCurrentState } from './workspace.js';

export interface TraceEntry {
  ts: string;
  cmd: string;
  args: string[];
  durationMs: number;
  exitCode: number;
  session: string;
  agent: string;
  phase: string;
  gate: string;
  taskId: string;
  cwd: string;
}

/**
 * 判断是否开启了追踪。
 * 支持环境变量 DOCPATH_TRACE=1 或配置文件中配置 trace: true。
 */
export async function isTraceEnabled(cwd: string): Promise<boolean> {
  if (process.env.DOCPATH_TRACE === '1') {
    return true;
  }
  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const configPath = join(docpathDir, 'config.yaml');
    if (existsSync(configPath)) {
      const configContent = await readFile(configPath, 'utf-8');
      if (/^trace:\s*true/m.test(configContent)) {
        return true;
      }
    }
  } catch {
    // 忽略错误
  }
  return false;
}

/**
 * 检测当前是由什么 Agent 发起的调用。
 */
export function detectAgent(): string {
  // 检查是否运行在特殊的 agent 环境变量下
  if (process.env.CLAUDE_SESSION || process.env.CLAUDE_TRACE) return 'claude';
  if (process.env.CODEX_SESSION || process.env.CODEX_TRACE) return 'codex';
  if (process.env.OPENCODE_SESSION) return 'opencode';

  // 检查进程树中的命令行参数或环境变量
  const envKeys = Object.keys(process.env).join(',');
  if (envKeys.includes('CLAUDE')) return 'claude';
  if (envKeys.includes('CODEX')) return 'codex';
  if (envKeys.includes('OPENCODE')) return 'opencode';

  return 'unknown';
}

/**
 * 获取当前的 Session ID
 */
export function getSessionId(): string {
  return (
    process.env.CLAUDE_SESSION ||
    process.env.CODEX_SESSION ||
    process.env.OPENCODE_SESSION ||
    process.env.DOCPATH_SESSION ||
    'session-default'
  );
}

/**
 * 记录一条追踪信息
 */
export async function writeTraceEntry(
  cwd: string,
  entryData: Omit<TraceEntry, 'ts' | 'session' | 'agent' | 'phase' | 'gate' | 'taskId' | 'cwd'>
): Promise<void> {
  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const traceFile = join(docpathDir, 'workspace', 'trace.jsonl');

    // 默认获取当前状态快照
    let phase = 'unknown';
    let gate = 'none';
    let taskId = 'none';
    try {
      const state = await readCurrentState(cwd);
      if (state) {
        phase = state.phase || 'unknown';
        gate = state.gate || 'none';
        taskId = state.task_id || 'none';
      }
    } catch {
      // 忽略读取状态时的异常
    }

    const entry: TraceEntry = {
      ts: new Date().toISOString(),
      session: getSessionId(),
      agent: detectAgent(),
      phase,
      gate,
      taskId,
      cwd,
      ...entryData,
    };

    // 确保 workspace 目录存在
    const workspaceDir = join(docpathDir, 'workspace');
    if (!existsSync(workspaceDir)) {
      // 理论上此时已经有了工作流，但为了鲁棒性做个保护
      return;
    }

    await appendFile(traceFile, JSON.stringify(entry) + '\n', 'utf-8');
    truncateTraceFileIfNeeded(traceFile);
  } catch {
    // 追踪写入失败需静默，不能阻塞正常 CLI 命令
  }
}

/**
 * 读取追踪记录
 */
export async function readTraceEntries(cwd: string): Promise<TraceEntry[]> {
  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const traceFile = join(docpathDir, 'workspace', 'trace.jsonl');
    if (!existsSync(traceFile)) {
      return [];
    }
    const content = await readFile(traceFile, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as TraceEntry);
  } catch {
    return [];
  }
}

/**
 * 清空追踪文件
 */
export async function clearTrace(cwd: string): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const traceFile = join(docpathDir, 'workspace', 'trace.jsonl');
  if (existsSync(traceFile)) {
    await writeFile(traceFile, '', 'utf-8');
  }
}

/**
 * 同步检查是否启用追踪
 */
export function isTraceEnabledSync(cwd: string): boolean {
  if (process.env.DOCPATH_TRACE === '1') {
    return true;
  }
  try {
    const docpathDir = join(cwd, '.docpath');
    const configPath = join(docpathDir, 'config.yaml');
    if (existsSync(configPath)) {
      const configContent = readFileSync(configPath, 'utf-8');
      if (/^trace:\s*true/m.test(configContent)) {
        return true;
      }
    }
  } catch {
    // 忽略
  }
  return false;
}

/**
 * 同步记录追踪，适用于 process.exit 时保证同步刷入磁盘
 */
export function writeTraceEntrySync(
  cwd: string,
  entryData: Omit<TraceEntry, 'ts' | 'session' | 'agent' | 'phase' | 'gate' | 'taskId' | 'cwd'>
): void {
  try {
    const docpathDir = join(cwd, '.docpath');
    const traceFile = join(docpathDir, 'workspace', 'trace.jsonl');

    let phase = 'unknown';
    let gate = 'none';
    let taskId = 'none';
    try {
      const stateFile = join(docpathDir, 'workspace', 'state.json');
      if (existsSync(stateFile)) {
        const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
        if (state) {
          phase = state.phase || 'unknown';
          gate = state.gate || 'none';
          taskId = state.task_id || 'none';
        }
      }
    } catch {
      // 忽略
    }

    const entry: TraceEntry = {
      ts: new Date().toISOString(),
      session: getSessionId(),
      agent: detectAgent(),
      phase,
      gate,
      taskId,
      cwd,
      ...entryData,
    };

    const workspaceDir = join(docpathDir, 'workspace');
    if (!existsSync(workspaceDir)) return;

    appendFileSync(traceFile, JSON.stringify(entry) + '\n', 'utf-8');
    truncateTraceFileIfNeeded(traceFile);
  } catch {
    // 忽略
  }
}

/**
 * 限制追踪文件大小，当记录超过 2000 条时保留最近的 1000 条以保性能
 */
function truncateTraceFileIfNeeded(traceFile: string): void {
  try {
    if (!existsSync(traceFile)) return;
    const content = readFileSync(traceFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    if (lines.length > 2000) {
      const truncated = lines.slice(-1000);
      writeFileSync(traceFile, truncated.join('\n') + '\n', 'utf-8');
    }
  } catch {
    // 忽略
  }
}
