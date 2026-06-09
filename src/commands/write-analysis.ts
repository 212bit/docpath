/** docpath:write-analysis — 写入开发前分析 analysis/<section>.md */

import { existsSync } from 'fs';
import { resolveDocpathDir } from '../utils/file.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { nextCommand } from './runtime.js';
import { readCurrentState } from '../utils/workspace.js';
import { normalizeAnalysisSection, writeActiveAnalysisSection, writeActiveTaskFile } from '../utils/task-files.js';

export interface WriteAnalysisOptions {
  cwd: string;
  content?: string;
  stdin?: boolean;
  section?: string;
}

export async function writeAnalysisCommand(options: WriteAnalysisOptions): Promise<void> {
  const docpathDir = await resolveDocpathDir(options.cwd);
  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  let analysisContent = options.content || '';
  if (!analysisContent && options.stdin !== false) analysisContent = await readStdin();
  if (!analysisContent.trim()) {
    console.error('❌  未提供 analysis 内容。用法：');
    console.error('   docpath write-analysis --section requirements --content "..."');
    console.error('   echo "..." | docpath write-analysis --stdin');
    process.exit(1);
  }

  const current = await readCurrentState(options.cwd);
  const taskId = current?.task_id || 'current';
  let canonicalPath: string;
  let file: string;
  if (options.section) {
    const section = normalizeAnalysisSection(options.section);
    const result = await writeActiveAnalysisSection(docpathDir, taskId, section, analysisContent);
    canonicalPath = result.canonicalPath;
    file = result.file;
  } else {
    const result = await writeActiveTaskFile(docpathDir, taskId, 'analysis.md', analysisContent);
    canonicalPath = result.canonicalPath;
    file = 'analysis.md';
  }
  console.log(`✅  ${file} 已写入: ${canonicalPath}`);
  await transitionWorkflow(options.cwd, 'task.created', { currentStep: `${file} 已写入，下一步: docpath refine 或 write-spec` });
  console.log('📌  状态已更新为 drafting (analysis-written)');
  await nextCommand({ cwd: options.cwd });
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', () => resolve(''));
    if (process.stdin.isTTY) resolve('');
  });
}
