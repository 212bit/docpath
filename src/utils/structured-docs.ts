import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { parsePlanSteps, type PlanStep } from './doc-parser.js';

export const STRUCTURED_DOC_SCHEMA_VERSION = 1;

export type StructuredTaskMarkdownFile = 'spec.md' | 'plan.md';
export type StructuredTaskJsonFile = 'spec.json' | 'plan.json';

interface StructuredDocumentBase {
  schema_version: number;
  kind: 'spec' | 'plan';
  source: 'markdown';
  markdown: string;
  generated_at: string;
}

export interface StructuredPlanStep {
  id: string;
  name: string;
  description: string;
  acceptance: string;
  dependencies: string;
  status: 'pending' | 'done' | 'skipped' | 'blocked';
}

export interface StructuredPlanDocument extends StructuredDocumentBase {
  kind: 'plan';
  title: string;
  steps: StructuredPlanStep[];
}

export interface StructuredSpecItem {
  id: string;
  text: string;
  done: boolean;
}

export interface StructuredSpecDocument extends StructuredDocumentBase {
  kind: 'spec';
  title: string;
  functional_requirements: StructuredSpecItem[];
  non_functional_requirements: StructuredSpecItem[];
  acceptance_criteria: StructuredSpecItem[];
  decision_brief?: string;
}

export type StructuredTaskDocument = StructuredPlanDocument | StructuredSpecDocument;

export interface StructuredValidationResult {
  ok: boolean;
  errors: string[];
}

function firstHeading(content: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
}

function extractSection(content: string, headingPattern: RegExp): string {
  const match = headingPattern.exec(content);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const nextHeading = rest.search(/\n##\s+/);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

function parseChecklistItems(content: string, prefix: string): StructuredSpecItem[] {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^- \\[([ xX])\\]\\s*(${escaped}-\\d+)\\s*:\\s*(.+)$`, 'gm');
  return Array.from(content.matchAll(pattern)).map((match) => ({
    id: match[2],
    text: match[3].trim(),
    done: match[1].toLowerCase() === 'x',
  }));
}

function statusFromPlanStep(step: PlanStep): StructuredPlanStep['status'] {
  if (step.marker === 'x') return 'done';
  if (step.marker === '~') return 'skipped';
  if (step.marker === '!') return 'blocked';
  return 'pending';
}

function markerFromStatus(status: StructuredPlanStep['status']): 'x' | ' ' | '~' | '!' {
  if (status === 'done') return 'x';
  if (status === 'skipped') return '~';
  if (status === 'blocked') return '!';
  return ' ';
}

export function structuredJsonFileFor(file: string): StructuredTaskJsonFile | null {
  if (file === 'spec.md') return 'spec.json';
  if (file === 'plan.md') return 'plan.json';
  return null;
}

export function parsePlanMarkdownDocument(markdown: string, now = new Date()): StructuredPlanDocument {
  const steps = parsePlanSteps(markdown).map((step) => ({
    id: step.id,
    name: step.name,
    description: step.description,
    acceptance: step.acceptance,
    dependencies: step.dependencies,
    status: statusFromPlanStep(step),
  }));

  return {
    schema_version: STRUCTURED_DOC_SCHEMA_VERSION,
    kind: 'plan',
    source: 'markdown',
    title: firstHeading(markdown) || '执行计划',
    markdown,
    generated_at: now.toISOString(),
    steps,
  };
}

export function parseSpecMarkdownDocument(markdown: string, now = new Date()): StructuredSpecDocument {
  return {
    schema_version: STRUCTURED_DOC_SCHEMA_VERSION,
    kind: 'spec',
    source: 'markdown',
    title: firstHeading(markdown) || 'Spec',
    markdown,
    generated_at: now.toISOString(),
    functional_requirements: parseChecklistItems(markdown, 'FR'),
    non_functional_requirements: parseChecklistItems(markdown, 'NFR'),
    acceptance_criteria: parseChecklistItems(markdown, 'AC'),
    decision_brief: extractSection(markdown, /^###\s+Decision Brief\s*$/m),
  };
}

export function parseStructuredDocument(file: StructuredTaskMarkdownFile, markdown: string, now = new Date()): StructuredTaskDocument {
  return file === 'plan.md'
    ? parsePlanMarkdownDocument(markdown, now)
    : parseSpecMarkdownDocument(markdown, now);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateBase(doc: unknown, kind: StructuredTaskDocument['kind']): string[] {
  if (!isObject(doc)) return [`${kind}.json 必须是 JSON object`];
  const errors: string[] = [];
  if (doc.schema_version !== STRUCTURED_DOC_SCHEMA_VERSION) {
    errors.push(`${kind}.json schema_version 必须为 ${STRUCTURED_DOC_SCHEMA_VERSION}`);
  }
  if (doc.kind !== kind) errors.push(`${kind}.json kind 必须为 ${kind}`);
  if (typeof doc.markdown !== 'string') errors.push(`${kind}.json markdown 必须是字符串`);
  if (typeof doc.generated_at !== 'string') errors.push(`${kind}.json generated_at 必须是字符串`);
  return errors;
}

export function validatePlanDocument(doc: unknown): StructuredValidationResult {
  const errors = validateBase(doc, 'plan');
  if (isObject(doc)) {
    if (typeof doc.title !== 'string') errors.push('plan.json title 必须是字符串');
    if (!Array.isArray(doc.steps)) {
      errors.push('plan.json steps 必须是数组');
    } else {
      doc.steps.forEach((step, index) => {
        if (!isObject(step)) {
          errors.push(`plan.json steps[${index}] 必须是 object`);
          return;
        }
        for (const field of ['id', 'name', 'description', 'acceptance', 'dependencies', 'status']) {
          if (typeof step[field] !== 'string') errors.push(`plan.json steps[${index}].${field} 必须是字符串`);
        }
        if (typeof step.status === 'string' && !['pending', 'done', 'skipped', 'blocked'].includes(step.status)) {
          errors.push(`plan.json steps[${index}].status 非法: ${step.status}`);
        }
      });
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateSpecDocument(doc: unknown): StructuredValidationResult {
  const errors = validateBase(doc, 'spec');
  if (isObject(doc)) {
    if (typeof doc.title !== 'string') errors.push('spec.json title 必须是字符串');
    for (const field of ['functional_requirements', 'non_functional_requirements', 'acceptance_criteria']) {
      if (!Array.isArray(doc[field])) errors.push(`spec.json ${field} 必须是数组`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateStructuredDocument(doc: unknown, file: StructuredTaskMarkdownFile): StructuredValidationResult {
  return file === 'plan.md' ? validatePlanDocument(doc) : validateSpecDocument(doc);
}

export function assertValidStructuredDocument(doc: unknown, file: StructuredTaskMarkdownFile): asserts doc is StructuredTaskDocument {
  const result = validateStructuredDocument(doc, file);
  if (!result.ok) throw new Error(result.errors.join('; '));
}

export function renderPlanMarkdownFromDocument(doc: StructuredPlanDocument): string {
  if (doc.markdown.trim()) return doc.markdown.endsWith('\n') ? doc.markdown : `${doc.markdown}\n`;

  const lines = [
    '## 执行计划',
    '',
    ...doc.steps.flatMap((step) => [
      `### ${step.id}: ${step.name}`,
      `- [${markerFromStatus(step.status)}] ${step.id}: ${step.name}`,
      `- **描述**: ${step.description}`,
      `- **验收条件**: ${step.acceptance}`,
      `- **依赖**: ${step.dependencies || '无'}`,
      '',
    ]),
    '## Checklist',
    ...doc.steps.map((step) => `- [${markerFromStatus(step.status)}] ${step.id}`),
    '',
    '## 依赖关系图',
    doc.steps.map((step) => step.id).join(' → '),
    '',
  ];
  return lines.join('\n');
}

export function renderSpecMarkdownFromDocument(doc: StructuredSpecDocument): string {
  if (doc.markdown.trim()) return doc.markdown.endsWith('\n') ? doc.markdown : `${doc.markdown}\n`;
  const renderItems = (items: StructuredSpecItem[]) => items.map((item) => `- [${item.done ? 'x' : ' '}] ${item.id}: ${item.text}`);
  return [
    `# ${doc.title}`,
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    ...renderItems(doc.functional_requirements),
    '',
    '### 非功能需求',
    ...renderItems(doc.non_functional_requirements),
    '',
    '## 5. 验收标准',
    '',
    ...renderItems(doc.acceptance_criteria),
    '',
  ].join('\n');
}

export function renderStructuredMarkdown(doc: StructuredTaskDocument): string {
  return doc.kind === 'plan'
    ? renderPlanMarkdownFromDocument(doc)
    : renderSpecMarkdownFromDocument(doc);
}

export async function writeStructuredTaskJson(dir: string, file: StructuredTaskMarkdownFile, markdown: string): Promise<string> {
  const jsonFile = structuredJsonFileFor(file);
  if (!jsonFile) throw new Error(`不支持的结构化任务文件: ${file}`);
  const doc = parseStructuredDocument(file, markdown);
  assertValidStructuredDocument(doc, file);
  const jsonPath = join(dir, jsonFile);
  await writeFile(jsonPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');
  return jsonPath;
}

export async function readStructuredTaskMarkdown(dir: string, file: StructuredTaskMarkdownFile): Promise<string | null> {
  const jsonFile = structuredJsonFileFor(file);
  if (!jsonFile) return null;
  const jsonPath = join(dir, jsonFile);
  if (!existsSync(jsonPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(jsonPath, 'utf-8'));
  } catch (error) {
    throw new Error(`${jsonPath} 不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    assertValidStructuredDocument(parsed, file);
  } catch (error) {
    throw new Error(`${jsonPath} 结构化校验失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  return renderStructuredMarkdown(parsed);
}
