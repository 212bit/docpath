/** docpath:write-design — 写入 UI/UX 设计预览与视觉验收文档 */

import { existsSync } from 'fs';
import { resolveDocpathDir } from '../utils/file.js';
import { writeActiveTaskFile } from '../utils/task-files.js';
import { readCurrentState } from '../utils/workspace.js';

interface WriteDesignOptions {
  cwd: string;
  /** 写入目标: brief/ui-brief, handoff/external-design-handoff, preview/design-preview, approval/design-approval, acceptance/visual-acceptance */
  kind?: string;
  /** Markdown 内容 */
  content?: string;
  /** 从 stdin 读取 */
  stdin?: boolean;
}

const DESIGN_FILES: Record<string, string> = {
  brief: 'ui-brief.md',
  handoff: 'external-design-handoff.md',
  preview: 'design-preview.md',
  approval: 'design-approval.md',
  acceptance: 'visual-acceptance.md',
};

export async function writeDesignCommand(options: WriteDesignOptions): Promise<void> {
  const { cwd, content } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  const kind = normalizeDesignKind(options.kind);
  let designContent = content || '';
  if (!designContent && options.stdin !== false) {
    designContent = await readStdin();
  }

  if (!designContent.trim()) {
    console.error('❌  未提供设计文档内容。用法：');
    console.error('   docpath write-design --kind preview --content "..."');
    console.error('   echo "..." | docpath write-design --kind acceptance --stdin');
    process.exit(1);
  }

  const current = await readCurrentState(cwd);
  const taskId = current?.task_id || 'current';
  const file = DESIGN_FILES[kind];
  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, file, `${designContent.trim()}\n`);

  console.log(`✅  ${file} 已写入: ${canonicalPath}`);
}

function normalizeDesignKind(kind: string | undefined): keyof typeof DESIGN_FILES {
  const normalized = (kind || 'preview').trim().toLowerCase();
  if (normalized === 'brief' || normalized === 'ui-brief' || normalized === 'ui-prompt-brief') return 'brief';
  if (normalized === 'handoff' || normalized === 'external-design-handoff' || normalized === 'design-handoff') return 'handoff';
  if (normalized === 'preview' || normalized === 'design' || normalized === 'design-preview') return 'preview';
  if (normalized === 'approval' || normalized === 'design-approval') return 'approval';
  if (normalized === 'acceptance' || normalized === 'visual' || normalized === 'visual-acceptance') return 'acceptance';
  throw new Error(`未知 design kind: ${kind}（允许: brief, handoff, preview, approval, acceptance）`);
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
