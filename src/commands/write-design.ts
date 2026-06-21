/** docpath:write-design — 写入 UI/UX 设计证据；不负责触发 UI 设计门禁 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { writeActiveTaskFile } from '../utils/task-files.js';
import { readCurrentState } from '../utils/workspace.js';
import { readStdin } from '../utils/stdin.js';

interface WriteDesignOptions {
  cwd: string;
  /** 写入目标: stack/frontend-stack, brief/ui-brief, handoff/external-design-handoff, preview/design-preview, approval/design-approval, acceptance/visual-acceptance */
  kind?: string;
  /** Markdown 内容 */
  content?: string;
  /** 从 stdin 读取 */
  stdin?: boolean;
  /** 是否使用模板初始化 */
  template?: boolean;
}

const DESIGN_FILES: Record<string, string> = {
  stack: 'frontend-stack.md',
  brief: 'ui-brief.md',
  handoff: 'external-design-handoff.md',
  preview: 'design-preview.md',
  approval: 'design-approval.md',
  acceptance: 'visual-acceptance.md',
};

const DESIGN_TEMPLATES: Record<string, string> = {
  stack: 'frontend-stack.md',
  brief: 'ui-prompt-brief.md',
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

  const kind = normalizeDesignKind(options.kind, options.template);

  if (options.template) {
    const current = await readCurrentState(cwd);
    const taskId = current?.task_id || 'current';

    const TEMPLATES_DIR = join(
      import.meta.dirname ?? join(process.cwd(), 'dist'),
      '..', 'templates', 'design'
    );

    const kindsToInit = kind === 'all'
      ? (Object.keys(DESIGN_FILES) as Array<keyof typeof DESIGN_FILES>)
      : [kind as keyof typeof DESIGN_FILES];

    for (const k of kindsToInit) {
      const file = DESIGN_FILES[k];
      const templateFile = DESIGN_TEMPLATES[k];
      const templatePath = join(TEMPLATES_DIR, templateFile);

      let templateContent = '';
      if (existsSync(templatePath)) {
        templateContent = await readFile(templatePath, 'utf-8');
      } else {
        console.error(`❌  找不到模板文件: ${templatePath}`);
        process.exit(1);
      }

      const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, file, templateContent);
      console.log(`✅  ${file} 已初始化: ${canonicalPath}`);
    }
    return;
  }

  let designContent = content || '';
  if (!designContent && options.stdin !== false) {
    designContent = await readStdin();
  }

  if (!designContent.trim()) {
    console.error('❌  未提供设计文档内容。用法：');
    console.error('   docpath write-design --kind stack --content "..."');
    console.error('   echo "..." | docpath write-design --kind acceptance --stdin');
    console.error('   docpath write-design --kind all --template');
    process.exit(1);
  }

  const current = await readCurrentState(cwd);
  const taskId = current?.task_id || 'current';
  const file = DESIGN_FILES[kind as keyof typeof DESIGN_FILES];
  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, file, `${designContent.trim()}\n`);

  console.log(`✅  ${file} 已写入: ${canonicalPath}`);
}

function normalizeDesignKind(kind: string | undefined, isTemplate = false): keyof typeof DESIGN_FILES | 'all' {
  const defaultKind = isTemplate ? 'all' : 'preview';
  const normalized = (kind || defaultKind).trim().toLowerCase();
  if (normalized === 'all') return 'all';
  if (normalized === 'stack' || normalized === 'frontend-stack' || normalized === 'framework' || normalized === 'framework-decision') return 'stack';
  if (normalized === 'brief' || normalized === 'ui-brief' || normalized === 'ui-prompt-brief') return 'brief';
  if (normalized === 'handoff' || normalized === 'external-design-handoff' || normalized === 'design-handoff') return 'handoff';
  if (normalized === 'preview' || normalized === 'design' || normalized === 'design-preview') return 'preview';
  if (normalized === 'approval' || normalized === 'design-approval') return 'approval';
  if (normalized === 'acceptance' || normalized === 'visual' || normalized === 'visual-acceptance') return 'acceptance';
  throw new Error(`未知 design kind: ${kind}（允许: stack, brief, handoff, preview, approval, acceptance, all）`);
}
