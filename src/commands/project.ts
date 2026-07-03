import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { resolveDocpathDir } from '../utils/file.js';
import { readStdin } from '../utils/stdin.js';
import {
  PROJECT_INTAKE_SCHEMA_VERSION,
  projectIntakePaths,
  type ProjectIntakeSource,
  type ProjectIntakeSourceType,
  type ProjectIntakeState,
} from '../engine/project-intake.js';

type ProjectCommandOptions = {
  cwd: string;
  action?: string;
  id?: string;
  title?: string;
  content?: string;
  file?: string;
  stdin?: boolean;
  sourceRef?: string;
  sourceType?: string;
};

const SOURCE_TYPES: ProjectIntakeSourceType[] = [
  'markdown',
  'text',
  'ppt',
  'pdf',
  'api-doc',
  'intro-doc',
  'requirements',
  'meeting-notes',
  'mixed',
  'unknown',
];

function slugify(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return ascii || 'project-intake';
}

function todayStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function relativeDocpathPath(fullPath: string, docpathDir: string): string {
  return `.docpath/${fullPath.slice(docpathDir.length + 1).replace(/\\/g, '/')}`;
}

function normalizeSourceType(value: string | undefined): ProjectIntakeSourceType {
  if (!value) return 'unknown';
  if ((SOURCE_TYPES as string[]).includes(value)) return value as ProjectIntakeSourceType;
  throw new Error(`docpath project capture: --source-type 参数非法: ${value}（允许: ${SOURCE_TYPES.join('|')}）`);
}

async function generateIntakeId(docpathDir: string, title: string): Promise<string> {
  const base = `P-${todayStamp()}-${slugify(title)}`;
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!existsSync(projectIntakePaths(docpathDir, candidate).root)) return candidate;
  }
  throw new Error(`docpath project capture: unable to generate unique intake id for ${title}`);
}

async function readCaptureContent(options: ProjectCommandOptions): Promise<{ content: string; originalPath?: string }> {
  if (options.content !== undefined) return { content: options.content };
  if (options.file) {
    const content = await readFile(options.file, 'utf-8');
    return { content, originalPath: options.file };
  }
  if (options.stdin) return { content: await readStdin() };
  return { content: '' };
}

function assertTextContent(content: string, sourceDescription: string): void {
  if (content.includes('\0')) {
    throw new Error(`docpath project capture: ${sourceDescription} appears to be binary; MVP supports extracted text/markdown only`);
  }
}

async function projectCapture(options: ProjectCommandOptions): Promise<void> {
  const title = options.title?.trim();
  if (!title) throw new Error('docpath project capture requires --title <title>');

  const docpathDir = await resolveDocpathDir(options.cwd);
  const intakeId = await generateIntakeId(docpathDir, title);
  const paths = projectIntakePaths(docpathDir, intakeId);
  const now = new Date().toISOString();
  const { content, originalPath } = await readCaptureContent(options);
  const sourceRef = options.sourceRef?.trim();

  if (!content.trim() && !sourceRef) {
    throw new Error('docpath project capture requires --content, --file, --stdin, or --source-ref');
  }

  await mkdir(paths.sourcesDir, { recursive: true });
  await mkdir(paths.analysisDir, { recursive: true });

  const sources: ProjectIntakeSource[] = [];
  if (content.trim()) {
    assertTextContent(content, originalPath || 'provided content');
    const sourcePath = join(paths.sourcesDir, 'source-001.md');
    await writeFile(sourcePath, content, 'utf-8');
    sources.push({
      id: 'SRC-001',
      title: originalPath ? basename(originalPath) : title,
      type: normalizeSourceType(options.sourceType),
      captured_at: now,
      content_path: relativeDocpathPath(sourcePath, docpathDir),
      ...(originalPath ? { original_path: originalPath } : {}),
      content_sha256: sha256(content),
      excerpt: content.trim().slice(0, 300),
    });
  } else if (sourceRef) {
    sources.push({
      id: 'SRC-001',
      title: sourceRef,
      type: normalizeSourceType(options.sourceType),
      captured_at: now,
      original_path: sourceRef,
    });
  }

  const state: ProjectIntakeState = {
    schema_version: PROJECT_INTAKE_SCHEMA_VERSION,
    id: intakeId,
    title,
    stage: 'captured',
    created_at: now,
    updated_at: now,
    sources,
    artifacts: [],
    user_confirmed: null,
    blocked_reason: null,
    backlog_items: [],
  };

  await writeFile(paths.state, JSON.stringify(state, null, 2), 'utf-8');

  console.log(`✅  project intake 已创建: ${intakeId}`);
  console.log(`   title: ${title}`);
  console.log(`   state: ${relativeDocpathPath(paths.state, docpathDir)}`);
  if (sources[0]?.content_path) console.log(`   source: ${sources[0].content_path}`);
  if (sources[0]?.original_path && !sources[0]?.content_path) console.log(`   source_ref: ${sources[0].original_path}`);
  console.log('');
  console.log('next_hint:');
  console.log(`  next_action: analyze project intake ${intakeId}`);
  console.log(`  recommended_command: docpath project analyze ${intakeId} --dry-run`);
  console.log('  exit_criteria: analysis sections are written under analysis/');
}

export async function projectCommand(options: ProjectCommandOptions): Promise<void> {
  const action = options.action || 'status';
  if (action === 'capture') {
    await projectCapture(options);
    return;
  }
  throw new Error(`docpath project: unsupported action ${action}（允许: capture）`);
}

