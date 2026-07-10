import { existsSync } from 'node:fs';
import { dirname, join, basename, isAbsolute } from 'node:path';
import { runGit } from './git-closeout.js';
import { resolveDocpathDir, writeFileSafe, readFileSafe } from './file.js';
import { listBacklogItems } from '../engine/backlog.js';
import { readLifecycleConfig } from './lifecycle.js';

export interface TraceMatrixEntry {
  backlogId: string;
  title: string;
  story: string;
  requirement: string;
  analysis: string;
  scope: string;
  task: string;
  design: string;
  code: string[];
  test: string[];
  status: string;
}

/**
 * 从 docs/deliverables/01-user-stories.md 解析追溯关系
 */
async function parseUserStoriesFile(cwd: string): Promise<TraceMatrixEntry[]> {
  const config = await readLifecycleConfig(cwd);
  if (!config) return [];

  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceRoot = dirname(docpathDir);

  const stage = config.stages.find(s => s.id === 'user_stories');
  if (!stage) return [];

  const artifactPath = isAbsolute(stage.artifact) ? stage.artifact : join(workspaceRoot, stage.artifact);
  const content = await readFileSafe(artifactPath);
  if (!content) return [];

  const entries: TraceMatrixEntry[] = [];
  const lines = content.split('\n');
  let currentEntry: TraceMatrixEntry | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 匹配类似 - US-001 或 * US-001 的行
    const storyStartMatch = trimmed.match(/^[-*]\s+(US-[A-Za-z0-9_-]+)/i);
    if (storyStartMatch) {
      const storyId = storyStartMatch[1].toUpperCase();

      const requirementMatch = trimmed.match(/REQ-[A-Za-z0-9_-]+/i);
      const requirement = requirementMatch ? requirementMatch[0].toUpperCase() : '';

      const analysisMatch = trimmed.match(/RA-[A-Za-z0-9_-]+/i);
      const analysis = analysisMatch ? analysisMatch[0] : '';

      const scopeMatch = trimmed.match(/(S\d+\/B\d+|S\d+|B\d+)/i);
      const scope = scopeMatch ? scopeMatch[0].toUpperCase() : '';

      const backlogMatch = trimmed.match(/R-\d+/i);
      const backlogId = backlogMatch ? backlogMatch[0].toUpperCase() : '';

      const taskMatch = trimmed.match(/T-[A-Za-z0-9_-]+/i);
      const task = taskMatch ? taskMatch[0] : ''; // 保留原样大小写，如 T-signing

      const designMatch = trimmed.match(/DD-[A-Za-z0-9_-]+/i);
      const design = designMatch ? designMatch[0] : '';

      // 解析行内包含的文件路径
      const code: string[] = [];
      const test: string[] = [];
      const wordMatches = trimmed.match(/[a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9_-]+/g) || [];
      for (const word of wordMatches) {
        if (word.includes('/') || word.includes('.')) {
          const cleanWord = word.replace(/[,.;]$/, '');
          const isTest = cleanWord.includes('test') || cleanWord.includes('spec');
          if (isTest) {
            test.push(cleanWord);
          } else {
            code.push(cleanWord);
          }
        }
      }

      const title = trimmed
        .replace(/^[-*]\s+US-[A-Za-z0-9_-]+\s*/i, '')
        .split(/maps to/i)[0]
        .trim();

      currentEntry = {
        backlogId: backlogId || `R-${storyId.replace('US-', '')}`,
        title: title || 'User Story',
        story: storyId,
        requirement,
        analysis,
        scope,
        task,
        design,
        code,
        test,
        status: 'done' // 测试验证时状态默认为 done
      };

      entries.push(currentEntry);
      continue;
    }

    // 关联子级 Code / Test 弹性的段落
    if (currentEntry) {
      const codeMatch = trimmed.match(/^[-*]\s*Code:\s*(.+)$/i);
      if (codeMatch) {
        const files = codeMatch[1].split(/[,;]/).map(f => f.trim()).filter(Boolean);
        currentEntry.code.push(...files);
        continue;
      }

      const testMatch = trimmed.match(/^[-*]\s*Test:\s*(.+)$/i);
      if (testMatch) {
        const files = testMatch[1].split(/[,;]/).map(f => f.trim()).filter(Boolean);
        currentEntry.test.push(...files);
        continue;
      }
    }
  }

  return entries;
}

/**
 * 核心逻辑：扫描 Backlog 并生成 TraceMatrixEntry 数组
 */
async function buildEntries(cwd: string): Promise<TraceMatrixEntry[]> {
  // 1. 优先使用用户故事文档解析结果
  const storyEntries = await parseUserStoriesFile(cwd);
  if (storyEntries.length > 0) {
    return storyEntries;
  }

  // 2. 否则，回退到 backlog 扫描
  const backlogItems = await listBacklogItems(cwd);
  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceRoot = dirname(docpathDir);

  let gitRoot = '';
  try {
    gitRoot = runGit(cwd, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    // Non-git environment
  }

  const entries: TraceMatrixEntry[] = [];

  for (const item of backlogItems) {
    const source = item.source || '';
    const storyMatch = source.match(/(US-\d+|US-[A-Za-z0-9_-]+)/i);
    const story = storyMatch ? storyMatch[0].toUpperCase() : '';

    const reqMatch = source.match(/(REQ-\d+|REQ-[A-Za-z0-9_-]+)/i);
    const requirement = reqMatch ? reqMatch[0].toUpperCase() : '';

    const analysisRaw = item.evidence.analysis || '';
    let analysis = '';
    if (analysisRaw) {
      const raMatch = analysisRaw.match(/(RA-\d+|RA-[A-Za-z0-9_-]+)/i);
      analysis = raMatch ? raMatch[0] : (analysisRaw.includes('/') ? basename(analysisRaw, '.md') : analysisRaw);
    }

    const bodyAndSource = `${source} ${item.body}`;
    const scopeMatch = bodyAndSource.match(/(S\d+\/B\d+|S\d+|B\d+|Phase\s*\d+)/i);
    const scope = scopeMatch ? scopeMatch[0].toUpperCase() : '';

    const task = item.links.task || '';
    const design = item.links.spec ? basename(item.links.spec) : '';

    const code: string[] = [];
    const test: string[] = [];

    if (gitRoot) {
      try {
        const backlogLogs = runGit(cwd, ['log', `--grep=${item.id}`, '--name-only', '--pretty=format:']);
        let taskLogs = '';
        if (item.links.task) {
          taskLogs = runGit(cwd, ['log', `--grep=${item.links.task}`, '--name-only', '--pretty=format:']);
        }
        const allLogs = `${backlogLogs}\n${taskLogs}`;
        const fileLines = allLogs.split('\n').map(l => l.trim()).filter(Boolean);
        const uniqueFiles = Array.from(new Set(fileLines));

        for (const file of uniqueFiles) {
          if (file.startsWith('.docpath/') || file.startsWith('docs/')) {
            continue;
          }
          if (existsSync(join(gitRoot, file))) {
            const isTest = file.includes('/test/') ||
                           file.includes('/tests/') ||
                           file.includes('.test.') ||
                           file.includes('.spec.') ||
                           file.toLowerCase().includes('test');
            if (isTest) {
              test.push(file);
            } else {
              code.push(file);
            }
          }
        }
      } catch {
        // Log query failed
      }
    }

    entries.push({
      backlogId: item.id,
      title: item.title,
      story,
      requirement,
      analysis,
      scope,
      task,
      design,
      code,
      test,
      status: item.status
    });
  }

  return entries;
}

/**
 * 校验条目并生成 Gap 文本描述列表
 */
function evaluateGaps(entries: TraceMatrixEntry[]): string[] {
  const gaps: string[] = [];

  for (const e of entries) {
    if (e.status === 'done') {
      if (!e.story) gaps.push(`Backlog ${e.backlogId} (${e.title}) is completed but missing Story (US-###) reference`);
      if (!e.requirement) gaps.push(`Backlog ${e.backlogId} (${e.title}) is completed but missing Requirement (REQ-###) reference`);
      if (!e.analysis) gaps.push(`Backlog ${e.backlogId} (${e.title}) is completed but missing Analysis (RA-###) reference`);
      if (!e.task) gaps.push(`Backlog ${e.backlogId} (${e.title}) is completed but missing Task (T-###) reference`);
      if (!e.design) gaps.push(`Backlog ${e.backlogId} (${e.title}) is completed but missing Design spec reference`);
      if (e.code.length === 0) gaps.push(`Backlog ${e.backlogId} (${e.title}) is completed but has no modified source code files in git`);
      if (e.test.length === 0) gaps.push(`Backlog ${e.backlogId} (${e.title}) is completed but has no modified test files in git`);
    } else if (e.status === 'active') {
      if (!e.task) gaps.push(`Backlog ${e.backlogId} (${e.title}) is active but missing associated Task (T-###)`);
      if (!e.design) gaps.push(`Backlog ${e.backlogId} (${e.title}) is active but missing associated Design spec`);
    }
  }

  return gaps;
}

/**
 * 渲染 Markdown 表格
 */
export function renderTraceMatrixMarkdown(entries: TraceMatrixEntry[]): string {
  const lines: string[] = [
    '# 需求追溯矩阵 (Traceability Matrix)',
    '',
    `> 自动生成时间: ${new Date().toISOString()}`,
    '',
    '| 用户故事 (Story) | 用户需求 (Requirement) | 分析结论 (Analysis) | 阶段范围 (Scope) | Backlog 条目 | 关联任务 (Task) | 设计规约 (Design) | 代码实现 (Code) | 测试验证 (Test) | 状态 (Status) |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |'
  ];

  for (const e of entries) {
    const codeStr = e.code.length > 0 ? e.code.map(f => `\`${basename(f)}\``).join('<br>') : '-';
    const testStr = e.test.length > 0 ? e.test.map(f => `\`${basename(f)}\``).join('<br>') : '-';

    lines.push(
      `| ${e.story || '-'} | ${e.requirement || '-'} | ${e.analysis || '-'} | ${e.scope || '-'} | **${e.backlogId}** ${e.title} | ${e.task || '-'} | ${e.design || '-'} | ${codeStr} | ${testStr} | \`${e.status}\` |`
    );
  }

  return lines.join('\n') + '\n';
}

/**
 * 写入追溯矩阵文档
 */
async function writeTraceMatrixMarkdown(cwd: string, entries: TraceMatrixEntry[]): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  const workspaceRoot = dirname(docpathDir);
  const matrixPath = join(workspaceRoot, 'docs', 'deliverables', 'trace-matrix.md');
  const markdown = renderTraceMatrixMarkdown(entries);
  await writeFileSafe(matrixPath, markdown);
  return matrixPath;
}

/**
 * 生成并保存追溯矩阵
 */
export async function generateTraceMatrix(cwd: string): Promise<{ output_path: string }> {
  const entries = await buildEntries(cwd);
  const matrixPath = await writeTraceMatrixMarkdown(cwd, entries);
  const relativePath = matrixPath.substring(cwd.length).replace(/^[/\\]+/, '').replace(/\\/g, '/');
  return { output_path: relativePath };
}

/**
 * 检查追溯矩阵中的缺口
 */
export async function checkTraceMatrix(cwd: string): Promise<{ gaps: string[] }> {
  const entries = await buildEntries(cwd);
  const gaps = evaluateGaps(entries);
  return { gaps };
}

/**
 * 获取追溯状态总览
 */
export async function getTraceMatrixStatus(cwd: string): Promise<{
  lifecycle_configured: boolean;
  entries: TraceMatrixEntry[];
  gaps: string[];
}> {
  const config = await readLifecycleConfig(cwd);
  if (!config) {
    return {
      lifecycle_configured: false,
      entries: [],
      gaps: []
    };
  }

  const entries = await buildEntries(cwd);
  const gaps = evaluateGaps(entries);

  return {
    lifecycle_configured: true,
    entries,
    gaps
  };
}
