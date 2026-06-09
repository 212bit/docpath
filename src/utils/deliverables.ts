import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { resolveDocpathDir } from './file.js';
import { readCurrentState } from './workspace.js';

export type DeliverableTemplateId =
  | 'prd'
  | 'competitive-analysis'
  | 'architecture-brief'
  | 'prototype-review'
  | 'qa-report'
  | 'stakeholder-update';

export interface DeliverableTemplate {
  id: DeliverableTemplateId;
  title: string;
  category: 'product-strategy' | 'design' | 'engineering' | 'qa';
  description: string;
  sections: string[];
}

export interface DeliverableIndexEntry {
  task_id: string;
  template: DeliverableTemplateId;
  path: string;
  status: 'generated';
  source: string;
  updated_at: string;
}

export interface DeliverableIndex {
  version: 1;
  task_id: string;
  updated_at: string;
  entries: DeliverableIndexEntry[];
}

export interface DeliverableValidationIssue {
  path: string;
  template: DeliverableTemplateId;
  missing_sections: string[];
}

const REQUIRED_SECTIONS = ['TL;DR', '核心结论', '行动项', 'Non-goals / Assumptions', '证据来源'];

const TEMPLATES: DeliverableTemplate[] = [
  {
    id: 'prd',
    title: 'PRD',
    category: 'product-strategy',
    description: '产品需求文档，用于固化目标用户、问题、范围和验收。',
    sections: REQUIRED_SECTIONS,
  },
  {
    id: 'competitive-analysis',
    title: 'Competitive Analysis',
    category: 'product-strategy',
    description: '竞品分析，用于比较定位、差异、风险和机会。',
    sections: REQUIRED_SECTIONS,
  },
  {
    id: 'architecture-brief',
    title: 'Architecture Brief',
    category: 'engineering',
    description: '架构简报，用于记录关键设计、边界和取舍。',
    sections: REQUIRED_SECTIONS,
  },
  {
    id: 'prototype-review',
    title: 'Prototype Review',
    category: 'design',
    description: '原型审查，用于记录设计质量、可用性和交互风险。',
    sections: REQUIRED_SECTIONS,
  },
  {
    id: 'qa-report',
    title: 'QA Report',
    category: 'qa',
    description: 'QA 报告，用于记录验证范围、结果、缺陷和回归建议。',
    sections: REQUIRED_SECTIONS,
  },
  {
    id: 'stakeholder-update',
    title: 'Stakeholder Update',
    category: 'product-strategy',
    description: '干系人更新，用于简洁汇报状态、风险和下一步。',
    sections: REQUIRED_SECTIONS,
  },
];

export function listDeliverableTemplates(): DeliverableTemplate[] {
  return [...TEMPLATES];
}

export function getDeliverableTemplate(id: string): DeliverableTemplate {
  const template = TEMPLATES.find((item) => item.id === id);
  if (!template) {
    throw new Error(`Unknown deliverable template: ${id}`);
  }
  return template;
}

export function renderDeliverableTemplate(id: string): string {
  const template = getDeliverableTemplate(id);
  return [
    `# ${template.title}`,
    '',
    `> template: ${template.id}`,
    `> category: ${template.category}`,
    '',
    ...template.sections.flatMap((section) => [
      `## ${section}`,
      '',
      '- 待补充',
      '',
    ]),
  ].join('\n');
}

async function getDeliverableIndexPath(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  return join(docpathDir, 'tasks', 'current', 'deliverables.json');
}

function resolveOutputPath(cwd: string, output: string): string {
  return isAbsolute(output) ? output : join(cwd, output);
}

function defaultOutputPath(template: DeliverableTemplate): string {
  return join('deliverables', template.category, `${template.id}.md`);
}

async function readDeliverableIndex(cwd: string): Promise<DeliverableIndex> {
  const indexPath = await getDeliverableIndexPath(cwd);
  const current = await readCurrentState(cwd);
  if (!existsSync(indexPath)) {
    return {
      version: 1,
      task_id: current?.task_id || 'unknown',
      updated_at: new Date().toISOString(),
      entries: [],
    };
  }
  const parsed = JSON.parse(await readFile(indexPath, 'utf-8')) as DeliverableIndex;
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error('Invalid deliverables index');
  }
  return parsed;
}

async function writeDeliverableIndex(cwd: string, index: DeliverableIndex): Promise<void> {
  const indexPath = await getDeliverableIndexPath(cwd);
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf-8');
}

export async function renderDeliverableToFile(options: {
  cwd: string;
  template: string;
  output?: string;
  force?: boolean;
  source?: string;
}): Promise<DeliverableIndexEntry> {
  const template = getDeliverableTemplate(options.template);
  const output = options.output || defaultOutputPath(template);
  const fullPath = resolveOutputPath(options.cwd, output);
  if (existsSync(fullPath) && !options.force) {
    throw new Error(`Deliverable already exists: ${output}. Use --force to overwrite.`);
  }

  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, renderDeliverableTemplate(template.id), 'utf-8');

  const current = await readCurrentState(options.cwd);
  const now = new Date().toISOString();
  const entry: DeliverableIndexEntry = {
    task_id: current?.task_id || 'unknown',
    template: template.id,
    path: relative(options.cwd, fullPath).replace(/\\/g, '/'),
    status: 'generated',
    source: options.source || 'docpath deliverables render',
    updated_at: now,
  };

  const index = await readDeliverableIndex(options.cwd);
  const entries = index.entries.filter((item) => item.path !== entry.path);
  entries.push(entry);
  await writeDeliverableIndex(options.cwd, {
    version: 1,
    task_id: entry.task_id,
    updated_at: now,
    entries,
  });
  return entry;
}

export async function readDeliverableIndexSummary(cwd: string): Promise<{ count: number; path: string } | null> {
  const indexPath = await getDeliverableIndexPath(cwd);
  if (!existsSync(indexPath)) return null;
  const index = await readDeliverableIndex(cwd);
  return {
    count: index.entries.length,
    path: '.docpath/tasks/current/deliverables.json',
  };
}

export async function validateDeliverables(cwd: string): Promise<DeliverableValidationIssue[]> {
  const indexPath = await getDeliverableIndexPath(cwd);
  if (!existsSync(indexPath)) return [];
  const index = await readDeliverableIndex(cwd);
  const issues: DeliverableValidationIssue[] = [];
  for (const entry of index.entries) {
    const fullPath = resolveOutputPath(cwd, entry.path);
    const content = existsSync(fullPath) ? await readFile(fullPath, 'utf-8') : '';
    const missing = REQUIRED_SECTIONS.filter((section) =>
      !new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(content),
    );
    if (missing.length > 0) {
      issues.push({
        path: entry.path,
        template: entry.template,
        missing_sections: missing,
      });
    }
  }
  return issues;
}
