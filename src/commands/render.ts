import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { BREADCRUMB_HEADER, formatEntry, readBreadcrumb } from '../engine/breadcrumb.js';
import { readCurrentState, syncCurrentDocument } from '../utils/workspace.js';
import { readFileSafe, resolveDocpathDir, writeFileAtomic } from '../utils/file.js';
import {
  canonicalTaskDir,
  currentTaskDir,
  readActiveTaskFile,
} from '../utils/task-files.js';
import { readStructuredTaskMarkdownView, type StructuredTaskMarkdownFile } from '../utils/structured-docs.js';
import { readLastCheckMarkdown, readReviewMarkdown } from '../utils/workspace-evidence.js';
import { syncProtocolBlocks } from '../utils/protocol-blocks.js';
import { resolveTemplate } from '../utils/install-core.js';

const SUPPORTED_VIEWS = ['current', 'spec', 'plan', 'breadcrumb', 'check', 'review'] as const;

type RenderView = typeof SUPPORTED_VIEWS[number];

interface RenderOptions {
  cwd: string;
  view?: string;
  all?: boolean;
  json?: boolean;
}

interface RenderedView {
  view: RenderView;
  content: string;
  paths: string[];
}

function assertView(value: string | undefined): RenderView {
  if (!value || !SUPPORTED_VIEWS.includes(value as RenderView)) {
    throw new Error(`render --view 必须是: ${SUPPORTED_VIEWS.join(' | ')}`);
  }
  return value as RenderView;
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

async function writeView(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, ensureTrailingNewline(content));
}

async function renderCurrentView(cwd: string, docpathDir: string): Promise<RenderedView> {
  await syncCurrentDocument(cwd);
  const path = join(docpathDir, 'workspace', 'current.md');
  const content = await readFileSafe(path);
  if (!content?.trim()) throw new Error('无法渲染 current: 缺少 state.json/current.md');
  return { view: 'current', content, paths: [path] };
}

async function readTaskMarkdownView(
  docpathDir: string,
  taskId: string | undefined,
  file: StructuredTaskMarkdownFile,
): Promise<string> {
  if (taskId) {
    const canonical = await readStructuredTaskMarkdownView(canonicalTaskDir(docpathDir, taskId), file);
    if (canonical !== null) return canonical;
  }
  const current = await readStructuredTaskMarkdownView(currentTaskDir(docpathDir), file);
  if (current !== null) return current;
  return readActiveTaskFile(docpathDir, taskId, file);
}

async function renderTaskView(cwd: string, docpathDir: string, view: 'spec' | 'plan'): Promise<RenderedView> {
  const state = await readCurrentState(cwd);
  const taskId = state?.task_id || undefined;
  const file: StructuredTaskMarkdownFile = view === 'spec' ? 'spec.md' : 'plan.md';
  const content = await readTaskMarkdownView(docpathDir, taskId, file);
  if (!content.trim()) throw new Error(`无法渲染 ${view}: 缺少 ${file}/${view}.json`);

  const paths = [
    ...(taskId ? [join(canonicalTaskDir(docpathDir, taskId), file)] : []),
    join(currentTaskDir(docpathDir), file),
  ];
  for (const path of paths) await writeView(path, content);
  return { view, content, paths };
}

async function renderBreadcrumbView(cwd: string, docpathDir: string): Promise<RenderedView> {
  const summary = await readBreadcrumb(cwd);
  const content = BREADCRUMB_HEADER + summary.entries.map((entry) => formatEntry(entry)).join('');
  const path = join(docpathDir, 'workspace', 'breadcrumb.md');
  await writeView(path, content);
  return { view: 'breadcrumb', content, paths: [path] };
}

async function renderEvidenceView(docpathDir: string, view: 'check' | 'review'): Promise<RenderedView> {
  const content = view === 'check'
    ? await readLastCheckMarkdown(docpathDir)
    : await readReviewMarkdown(docpathDir);
  const file = view === 'check' ? 'last-check.md' : 'review.md';
  if (!content.trim()) throw new Error(`无法渲染 ${view}: 缺少 ${file.replace('.md', '.json')} 或 ${file}`);
  const path = join(docpathDir, 'workspace', file);
  await writeView(path, content);
  return { view, content, paths: [path] };
}

async function renderOne(cwd: string, view: RenderView): Promise<RenderedView> {
  const docpathDir = await resolveDocpathDir(cwd);
  if (view === 'current') return renderCurrentView(cwd, docpathDir);
  if (view === 'spec' || view === 'plan') return renderTaskView(cwd, docpathDir, view);
  if (view === 'breadcrumb') return renderBreadcrumbView(cwd, docpathDir);
  return renderEvidenceView(docpathDir, view);
}

function renderSummary(cwd: string, rendered: RenderedView[]): string {
  const lines = ['rendered_views:'];
  for (const item of rendered) {
    lines.push(`  - view: ${item.view}`);
    lines.push(`    paths: ${item.paths.map((path) => relative(cwd, path)).join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function renderCommand(options: RenderOptions): Promise<void> {
  if (options.all && options.view) throw new Error('render 不能同时使用 --all 和 --view');
  if (!options.all && !options.view) throw new Error('render 需要 --view <name> 或 --all');

  // R-300: protocols 视图——从 templates/protocols/blocks/ 重渲染 flavor canonical
  // 的共享契约注入区。写 templates 源（非 JSON 派生视图），故不纳入 --all，仅显式调用。
  if (options.view === 'protocols') {
    const templatesDir = await resolveTemplate();
    const report = await syncProtocolBlocks(templatesDir, { write: true });
    if (!report.available) {
      throw new Error('render --view protocols: 未找到 templates/protocols/blocks（仅 DocPath 开发仓库可用）');
    }
    const unknown = report.files.flatMap((f) => f.unknown.map((n) => `${f.file}:${n}`));
    if (unknown.length > 0) {
      throw new Error(`render --view protocols: 标记引用了不存在的块源: ${unknown.join(', ')}`);
    }
    for (const f of report.files) {
      if (f.updated.length > 0) console.log(`🩹  ${f.file} 注入区已重渲染: ${f.updated.join(', ')}`);
      else if (f.present.length > 0) console.log(`✓  ${f.file} 注入区已同步 (${f.present.join(', ')})`);
    }
    console.log('提示: root 副本经 install manifest 机制同步（docpath install --check）。');
    return;
  }

  if (options.all) {
    const rendered: RenderedView[] = [];
    for (const view of SUPPORTED_VIEWS) rendered.push(await renderOne(options.cwd, view));
    if (options.json) {
      process.stdout.write(`${JSON.stringify(rendered.map((item) => ({
        view: item.view,
        paths: item.paths.map((path) => relative(options.cwd, path)),
      })), null, 2)}\n`);
      return;
    }
    process.stdout.write(renderSummary(options.cwd, rendered));
    return;
  }

  const rendered = await renderOne(options.cwd, assertView(options.view));
  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      view: rendered.view,
      paths: rendered.paths.map((path) => relative(options.cwd, path)),
      markdown: rendered.content,
    }, null, 2)}\n`);
    return;
  }
  process.stdout.write(ensureTrailingNewline(rendered.content));
}
