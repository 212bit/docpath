import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';
import { parsePlanSteps, type PlanStep } from './doc-parser.js';

export const STRUCTURED_DOC_SCHEMA_VERSION = 1;

export type StructuredTaskMarkdownFile = 'spec.md' | 'plan.md';
export type StructuredTaskJsonFile = 'spec.json' | 'plan.json';

interface StructuredDocumentBase {
  schema_version: number;
  kind: 'spec' | 'plan';
  markdown: string;
  generated_at: string;
}

export interface StructuredDocumentSource {
  kind: 'markdown';
  created_at: string;
  updated_at: string;
  content_sha256?: string;
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
  source: StructuredDocumentSource;
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
  source: StructuredDocumentSource;
  task_id: string | null;
  backlog_id: string | null;
  title: string;
  scope: {
    included: string[];
    excluded: string[];
  };
  major_change_gate: {
    required: boolean;
    types: string[];
    user_confirmed: string | null;
    decision_brief_markdown: string;
  };
  ui_gate: {
    state: 'required' | 'exempt' | 'unknown';
  };
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

export interface ParseSpecOptions {
  taskId?: string;
  now?: Date;
}

export interface WriteStructuredTaskJsonOptions {
  taskId?: string;
  now?: Date;
}

export interface StructuredMarkdownHashDrift {
  file: StructuredTaskMarkdownFile;
  markdownPath: string;
  jsonPath: string;
  expectedHash: string;
  actualHash: string;
}

export function markdownSha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function firstHeading(content: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
}

function taskIdFromMarkdown(content: string): string | null {
  return content.match(/^#\s+((?:T|R)-[\w-]+)/m)?.[1]?.trim() || null;
}

function backlogIdFromMarkdown(content: string): string | null {
  return content.match(/^>\s*backlog_id:\s*([^\s]+)/m)?.[1]?.trim() || null;
}

function extractSection(content: string, headingPattern: RegExp): string {
  const match = headingPattern.exec(content);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const nextHeading = rest.search(/\n##\s+/);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

function extractSubsection(content: string, headingPattern: RegExp): string {
  const match = headingPattern.exec(content);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const nextHeading = rest.search(/\n#{2,3}\s+/);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

function parseMarkdownList(block: string): string[] {
  const items = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-\s+/, '').trim())
    .filter(Boolean);
  return items;
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

function sourceForMarkdown(markdown: string, iso: string, previous?: Partial<StructuredDocumentSource>): StructuredDocumentSource {
  return {
    kind: 'markdown',
    created_at: previous?.created_at || iso,
    updated_at: iso,
    content_sha256: markdownSha256(markdown),
  };
}

function parseScope(markdown: string): StructuredSpecDocument['scope'] {
  return {
    included: parseMarkdownList(extractSubsection(markdown, /^###\s+包含\s*$/m)),
    excluded: parseMarkdownList(extractSubsection(markdown, /^###\s+不包含\s*$/m)),
  };
}

function parseUiGateState(markdown: string): StructuredSpecDocument['ui_gate']['state'] {
  const lines = markdown.split('\n');
  let exemptChecked = false;
  let requiredChecked = false;
  for (const line of lines) {
    if (!/^\s*-\s*\[[xX]\]/.test(line)) continue;
    if (/不涉及产品\s*UI/.test(line)) exemptChecked = true;
    else if (/涉及产品\s*UI/.test(line)) requiredChecked = true;
  }
  if (requiredChecked) return 'required';
  if (exemptChecked) return 'exempt';
  return 'unknown';
}

function extractMajorGateBlock(markdown: string): string {
  return extractSection(markdown, /^##\s+4\.1\s+重大(?:决策|变更)门禁\s*$/m);
}

function parseMajorChangeGate(markdown: string): StructuredSpecDocument['major_change_gate'] {
  const gate = extractMajorGateBlock(markdown);
  const decisionBrief = extractSection(markdown, /^###\s+Decision Brief\s*$/m);
  const required = /^-\s*\[[xX]\]\s*是，需要用户确认\s*$/m.test(gate);
  const types = gate
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^-\s*\[[xX]\]/.test(line))
    .map((line) => line.replace(/^-\s*\[[xX]\]\s*/, '').trim())
    .filter((line) => !/^是，需要用户确认/.test(line))
    .filter((line) => !/^否$/.test(line))
    .filter((line) => !/^本任务/.test(line));
  const userConfirmed = decisionBrief.match(/^- 用户确认:\s*(.+)$/m)?.[1]?.trim()
    || gate.match(/^- 用户确认:\s*(.+)$/m)?.[1]?.trim()
    || null;

  return {
    required,
    types,
    user_confirmed: userConfirmed,
    decision_brief_markdown: decisionBrief,
  };
}

export function structuredJsonFileFor(file: string): StructuredTaskJsonFile | null {
  if (file === 'spec.md') return 'spec.json';
  if (file === 'plan.md') return 'plan.json';
  return null;
}

export function parsePlanMarkdownDocument(markdown: string, now = new Date()): StructuredPlanDocument {
  const iso = now.toISOString();
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
    source: sourceForMarkdown(markdown, iso),
    title: firstHeading(markdown) || '执行计划',
    markdown,
    generated_at: iso,
    steps,
  };
}

export function parseSpecMarkdownDocument(markdown: string, options: ParseSpecOptions | Date = {}): StructuredSpecDocument {
  const now = options instanceof Date ? options : options.now ?? new Date();
  const taskId = options instanceof Date ? undefined : options.taskId;
  const iso = now.toISOString();
  return {
    schema_version: STRUCTURED_DOC_SCHEMA_VERSION,
    kind: 'spec',
    source: sourceForMarkdown(markdown, iso),
    task_id: taskId || taskIdFromMarkdown(markdown),
    backlog_id: backlogIdFromMarkdown(markdown),
    title: firstHeading(markdown) || 'Spec',
    markdown,
    generated_at: now.toISOString(),
    scope: parseScope(markdown),
    major_change_gate: parseMajorChangeGate(markdown),
    ui_gate: {
      state: parseUiGateState(markdown),
    },
    functional_requirements: parseChecklistItems(markdown, 'FR'),
    non_functional_requirements: parseChecklistItems(markdown, 'NFR'),
    acceptance_criteria: parseChecklistItems(markdown, 'AC'),
    decision_brief: extractSection(markdown, /^###\s+Decision Brief\s*$/m),
  };
}

export function parseStructuredDocument(file: StructuredTaskMarkdownFile, markdown: string, options: WriteStructuredTaskJsonOptions | Date = {}): StructuredTaskDocument {
  const now = options instanceof Date ? options : options.now ?? new Date();
  return file === 'plan.md'
    ? parsePlanMarkdownDocument(markdown, now)
    : parseSpecMarkdownDocument(markdown, options instanceof Date ? now : { taskId: options.taskId, now });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asSpecItems(value: unknown): StructuredSpecItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      text: typeof item.text === 'string' ? item.text : '',
      done: item.done === true,
    }))
    .filter((item) => item.id && item.text);
}

function normalizeDocumentSource(doc: Record<string, unknown>, fallbackIso: string, markdown: string): StructuredDocumentSource {
  if (isObject(doc.source)) {
    return {
      kind: 'markdown',
      created_at: typeof doc.source.created_at === 'string' ? doc.source.created_at : fallbackIso,
      updated_at: typeof doc.source.updated_at === 'string' ? doc.source.updated_at : fallbackIso,
      content_sha256: typeof doc.source.content_sha256 === 'string'
        ? doc.source.content_sha256
        : markdownSha256(markdown),
    };
  }
  return {
    kind: 'markdown',
    created_at: fallbackIso,
    updated_at: fallbackIso,
    content_sha256: markdownSha256(markdown),
  };
}

export function normalizeSpecDocument(doc: unknown, now = new Date()): StructuredSpecDocument {
  if (!isObject(doc)) throw new Error('spec.json 必须是 JSON object');
  const markdown = typeof doc.markdown === 'string' ? doc.markdown : '';
  const generatedAt = typeof doc.generated_at === 'string' ? doc.generated_at : now.toISOString();
  const source = normalizeDocumentSource(doc, generatedAt, markdown);
  const title = typeof doc.title === 'string' ? doc.title : firstHeading(markdown) || 'Spec';
  const scope = isObject(doc.scope)
    ? {
        included: asStringArray(doc.scope.included),
        excluded: asStringArray(doc.scope.excluded),
      }
    : parseScope(markdown);
  const majorGate = isObject(doc.major_change_gate)
    ? {
        required: doc.major_change_gate.required === true,
        types: asStringArray(doc.major_change_gate.types),
        user_confirmed: typeof doc.major_change_gate.user_confirmed === 'string' ? doc.major_change_gate.user_confirmed : null,
        decision_brief_markdown: typeof doc.major_change_gate.decision_brief_markdown === 'string'
          ? doc.major_change_gate.decision_brief_markdown
          : extractSection(markdown, /^###\s+Decision Brief\s*$/m),
      }
    : parseMajorChangeGate(markdown);
  const uiState = isObject(doc.ui_gate) && typeof doc.ui_gate.state === 'string' && ['required', 'exempt', 'unknown'].includes(doc.ui_gate.state)
    ? doc.ui_gate.state as StructuredSpecDocument['ui_gate']['state']
    : parseUiGateState(markdown);

  return {
    schema_version: STRUCTURED_DOC_SCHEMA_VERSION,
    kind: 'spec',
    source,
    task_id: typeof doc.task_id === 'string' ? doc.task_id : taskIdFromMarkdown(markdown),
    backlog_id: typeof doc.backlog_id === 'string' ? doc.backlog_id : backlogIdFromMarkdown(markdown),
    title,
    markdown,
    generated_at: generatedAt,
    scope,
    major_change_gate: majorGate,
    ui_gate: { state: uiState },
    functional_requirements: asSpecItems(doc.functional_requirements),
    non_functional_requirements: asSpecItems(doc.non_functional_requirements),
    acceptance_criteria: asSpecItems(doc.acceptance_criteria),
    decision_brief: typeof doc.decision_brief === 'string'
      ? doc.decision_brief
      : extractSection(markdown, /^###\s+Decision Brief\s*$/m),
  };
}

function asPlanSteps(value: unknown): StructuredPlanStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((step) => ({
      id: typeof step.id === 'string' ? step.id : '',
      name: typeof step.name === 'string' ? step.name : '',
      description: typeof step.description === 'string' ? step.description : '',
      acceptance: typeof step.acceptance === 'string' ? step.acceptance : '',
      dependencies: typeof step.dependencies === 'string' ? step.dependencies : '',
      status: ['pending', 'done', 'skipped', 'blocked'].includes(String(step.status))
        ? step.status as StructuredPlanStep['status']
        : 'pending',
    }))
    .filter((step) => step.id && step.name);
}

export function normalizePlanDocument(doc: unknown, now = new Date()): StructuredPlanDocument {
  if (!isObject(doc)) throw new Error('plan.json 必须是 JSON object');
  const markdown = typeof doc.markdown === 'string' ? doc.markdown : '';
  const generatedAt = typeof doc.generated_at === 'string' ? doc.generated_at : now.toISOString();
  return {
    schema_version: STRUCTURED_DOC_SCHEMA_VERSION,
    kind: 'plan',
    source: normalizeDocumentSource(doc, generatedAt, markdown),
    title: typeof doc.title === 'string' ? doc.title : firstHeading(markdown) || '执行计划',
    markdown,
    generated_at: generatedAt,
    steps: asPlanSteps(doc.steps),
  };
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
  if ('source' in doc) {
    if (doc.source === 'markdown') {
      // 兼容 R-164 早期 plan.json: source 只有字符串。
    } else if (isObject(doc.source)) {
      if (doc.source.kind !== 'markdown') errors.push(`${kind}.json source.kind 必须为 markdown`);
      if (typeof doc.source.created_at !== 'string') errors.push(`${kind}.json source.created_at 必须是字符串`);
      if (typeof doc.source.updated_at !== 'string') errors.push(`${kind}.json source.updated_at 必须是字符串`);
      if ('content_sha256' in doc.source && typeof doc.source.content_sha256 !== 'string') {
        errors.push(`${kind}.json source.content_sha256 必须是字符串`);
      }
    } else {
      errors.push(`${kind}.json source 必须为 markdown 或 object`);
    }
  }
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
    if ('scope' in doc && isObject(doc.scope)) {
      if (!Array.isArray(doc.scope.included)) errors.push('spec.json scope.included 必须是数组');
      if (!Array.isArray(doc.scope.excluded)) errors.push('spec.json scope.excluded 必须是数组');
    }
    if ('major_change_gate' in doc && isObject(doc.major_change_gate)) {
      if (typeof doc.major_change_gate.required !== 'boolean') errors.push('spec.json major_change_gate.required 必须是布尔值');
      if (!Array.isArray(doc.major_change_gate.types)) errors.push('spec.json major_change_gate.types 必须是数组');
      if (typeof doc.major_change_gate.decision_brief_markdown !== 'string') errors.push('spec.json major_change_gate.decision_brief_markdown 必须是字符串');
    }
    if ('ui_gate' in doc && isObject(doc.ui_gate)) {
      if (!['required', 'exempt', 'unknown'].includes(String(doc.ui_gate.state))) {
        errors.push('spec.json ui_gate.state 必须是 required/exempt/unknown');
      }
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
  const renderList = (items: string[], fallback: string) => (items.length > 0 ? items : [fallback]).map((item) => `- ${item}`);
  const renderMajorTypes = (items: string[]) => (items.length > 0 ? items : ['其他']).map((item) => `- [x] ${item}`);
  const majorGate = doc.major_change_gate;
  return [
    `# ${doc.title}`,
    '',
    doc.backlog_id ? `> backlog_id: ${doc.backlog_id}` : '',
    '',
    '## 1. 背景与动机',
    '',
    '由 spec.json 渲染生成。',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    ...renderItems(doc.functional_requirements),
    '',
    '### 非功能需求',
    ...renderItems(doc.non_functional_requirements),
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    ...renderList(doc.scope.included, '未记录'),
    '',
    '### 不包含',
    ...renderList(doc.scope.excluded, '未记录'),
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | spec.json 渲染 | JSON / Markdown | JSON | 机器真源重建视图 |',
    '',
    '## 4.1 重大变更门禁',
    '',
    '### 是否涉及重大变更',
    `- [${majorGate.required ? ' ' : 'x'}] 否`,
    `- [${majorGate.required ? 'x' : ' '}] 是，需要用户确认`,
    '',
    '### 变更类型',
    ...renderMajorTypes(majorGate.types),
    '',
    '### UI 设计门禁',
    `- [${doc.ui_gate.state === 'exempt' ? 'x' : ' '}] 本任务不涉及产品 UI 实现（豁免设计五件套）`,
    `- [${doc.ui_gate.state === 'required' ? 'x' : ' '}] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）`,
    '',
    '### Decision Brief',
    majorGate.decision_brief_markdown || '- 用户确认: 未记录',
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

export async function writeStructuredTaskJson(
  dir: string,
  file: StructuredTaskMarkdownFile,
  markdown: string,
  options: WriteStructuredTaskJsonOptions = {},
): Promise<string> {
  const jsonFile = structuredJsonFileFor(file);
  if (!jsonFile) throw new Error(`不支持的结构化任务文件: ${file}`);
  const doc = parseStructuredDocument(file, markdown, options);
  assertValidStructuredDocument(doc, file);
  const jsonPath = join(dir, jsonFile);
  await writeFile(jsonPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');
  return jsonPath;
}

async function readStructuredTaskJsonDocument(dir: string, file: StructuredTaskMarkdownFile): Promise<StructuredTaskDocument | null> {
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

  return file === 'spec.md' ? normalizeSpecDocument(parsed) : normalizePlanDocument(parsed);
}

function expectedMarkdownHash(doc: StructuredTaskDocument): string {
  return doc.source.content_sha256 || markdownSha256(doc.markdown);
}

export async function detectStructuredMarkdownHashDrift(
  dir: string,
  file: StructuredTaskMarkdownFile,
): Promise<StructuredMarkdownHashDrift | null> {
  const jsonFile = structuredJsonFileFor(file);
  if (!jsonFile) return null;
  const jsonPath = join(dir, jsonFile);
  const markdownPath = join(dir, file);
  if (!existsSync(jsonPath) || !existsSync(markdownPath)) return null;

  const doc = await readStructuredTaskJsonDocument(dir, file);
  if (!doc) return null;
  const markdown = await readFile(markdownPath, 'utf-8');
  const expectedHash = expectedMarkdownHash(doc);
  const actualHash = markdownSha256(markdown);
  if (actualHash === expectedHash) return null;
  return { file, markdownPath, jsonPath, expectedHash, actualHash };
}

export function formatStructuredMarkdownHashDrift(drift: StructuredMarkdownHashDrift): string {
  return [
    `${drift.markdownPath} 与 ${drift.jsonPath} 的 source.content_sha256 不一致`,
    `markdown_sha256: ${drift.actualHash}`,
    `json_source_sha256: ${drift.expectedHash}`,
    '修复建议: docpath tasks sync --from current 或 docpath tasks sync --from canonical',
  ].join('\n');
}

async function readStructuredTaskJson(dir: string, file: StructuredTaskMarkdownFile): Promise<StructuredTaskDocument | null> {
  const doc = await readStructuredTaskJsonDocument(dir, file);
  if (!doc) return null;
  const drift = await detectStructuredMarkdownHashDrift(dir, file);
  if (drift) throw new Error(formatStructuredMarkdownHashDrift(drift));
  return doc;
}

export async function readStructuredSpecDocument(dir: string): Promise<StructuredSpecDocument | null> {
  return await readStructuredTaskJson(dir, 'spec.md') as StructuredSpecDocument | null;
}

export async function readStructuredTaskMarkdown(dir: string, file: StructuredTaskMarkdownFile): Promise<string | null> {
  const doc = await readStructuredTaskJson(dir, file);
  return doc === null ? null : renderStructuredMarkdown(doc);
}
