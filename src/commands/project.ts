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
  dryRun?: boolean;
  section?: string;
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

const ANALYSIS_SECTIONS = [
  'requirements',
  'product',
  'ui',
  'technical',
  'risks',
  'open-questions',
] as const;

type AnalysisSection = typeof ANALYSIS_SECTIONS[number];

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

function normalizeAnalysisSection(value: string | undefined): AnalysisSection {
  if (!value) {
    throw new Error(`docpath project analyze requires --section <${ANALYSIS_SECTIONS.join('|')}> when persisting stdin`);
  }
  if ((ANALYSIS_SECTIONS as readonly string[]).includes(value)) return value as AnalysisSection;
  throw new Error(`docpath project analyze: --section 参数非法: ${value}（允许: ${ANALYSIS_SECTIONS.join('|')}）`);
}

async function readIntakeState(docpathDir: string, intakeId: string): Promise<ProjectIntakeState> {
  const paths = projectIntakePaths(docpathDir, intakeId);
  if (!existsSync(paths.state)) {
    throw new Error(`docpath project: intake 不存在: ${intakeId}`);
  }
  return JSON.parse(await readFile(paths.state, 'utf-8')) as ProjectIntakeState;
}

async function writeIntakeState(docpathDir: string, state: ProjectIntakeState): Promise<void> {
  const paths = projectIntakePaths(docpathDir, state.id);
  await writeFile(paths.state, JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2), 'utf-8');
}

function artifactPathForAnalysis(docpathDir: string, intakeId: string, section: AnalysisSection): string {
  return join(projectIntakePaths(docpathDir, intakeId).analysisDir, `${section}.md`);
}

function upsertArtifact(state: ProjectIntakeState, kind: ProjectIntakeState['artifacts'][number]['kind'], path: string): ProjectIntakeState {
  const now = new Date().toISOString();
  const artifacts = state.artifacts.filter((artifact) => !(artifact.kind === kind && artifact.path === path));
  artifacts.push({ kind, path, updated_at: now });
  return { ...state, artifacts, updated_at: now };
}

function analysisPromptPayload(state: ProjectIntakeState): Record<string, unknown> {
  return {
    task: 'project-intake-analysis',
    dry_run: true,
    intake_id: state.id,
    title: state.title,
    intent: 'Generate structured analysis from captured project source materials. Do not implement product code.',
    sources: state.sources.map((source) => ({
      id: source.id,
      title: source.title,
      type: source.type,
      content_path: source.content_path,
      original_path: source.original_path,
      excerpt: source.excerpt,
    })),
    sections: {
      requirements: ['goals', 'actors', 'jobs-to-be-done', 'scope', 'non-goals', 'assumptions'],
      product: ['user value', 'success metrics', 'core journey', 'business rules', 'rollout/rollback'],
      ui: ['information architecture', 'states', 'accessibility', 'responsive behavior', 'copy'],
      technical: ['modules', 'data/API contracts', 'permissions', 'migrations', 'testing', 'observability'],
      risks: ['product', 'design', 'technical', 'security', 'maintenance'],
      'open-questions': ['blocking questions', 'non-blocking questions', 'recommended decisions'],
    },
    recommended_writes: ANALYSIS_SECTIONS.map((section) => `docpath project analyze ${state.id} --section ${section} --stdin`),
  };
}

function briefPromptPayload(state: ProjectIntakeState): Record<string, unknown> {
  return {
    task: 'project-intake-brief',
    dry_run: true,
    intake_id: state.id,
    title: state.title,
    intent: 'Create a project brief from project-intake analysis. Do not create executable backlog items yet.',
    required_content: [
      'project goal',
      'target users',
      'core scenarios',
      'included scope',
      'excluded scope',
      'assumptions',
      'dependencies',
      'risks',
      'acceptance candidates',
      'blocking decisions',
    ],
    recommended_write: `docpath project brief ${state.id} --stdin`,
  };
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

async function projectAnalyze(options: ProjectCommandOptions): Promise<void> {
  if (!options.id?.trim()) throw new Error('docpath project analyze requires <intake-id>');
  const docpathDir = await resolveDocpathDir(options.cwd);
  const state = await readIntakeState(docpathDir, options.id.trim());
  if (state.sources.length === 0) throw new Error(`docpath project analyze: intake ${state.id} has no sources`);

  if (options.dryRun) {
    console.log(JSON.stringify(analysisPromptPayload(state), null, 2));
    return;
  }

  const section = normalizeAnalysisSection(options.section);
  const content = await readStdin();
  if (!content.trim()) throw new Error('docpath project analyze requires analysis markdown on stdin');

  const target = artifactPathForAnalysis(docpathDir, state.id, section);
  await mkdir(projectIntakePaths(docpathDir, state.id).analysisDir, { recursive: true });
  await writeFile(target, content, 'utf-8');

  const relativePath = relativeDocpathPath(target, docpathDir);
  const nextState = upsertArtifact(state, 'analysis', relativePath);
  const writtenSections = ANALYSIS_SECTIONS.filter((candidate) => existsSync(artifactPathForAnalysis(docpathDir, state.id, candidate)));
  await writeIntakeState(docpathDir, {
    ...nextState,
    stage: writtenSections.length === ANALYSIS_SECTIONS.length ? 'analyzed' : nextState.stage,
  });

  console.log(`✅  project analysis 已写入: ${state.id}`);
  console.log(`   section: ${section}`);
  console.log(`   path: ${relativePath}`);
  console.log('');
  console.log('next_hint:');
  if (writtenSections.length === ANALYSIS_SECTIONS.length) {
    console.log(`  next_action: create project brief for ${state.id}`);
    console.log(`  recommended_command: docpath project brief ${state.id} --dry-run`);
    console.log('  exit_criteria: brief.md is written');
  } else {
    const missing = ANALYSIS_SECTIONS.filter((candidate) => !writtenSections.includes(candidate));
    console.log(`  next_action: complete remaining analysis sections: ${missing.join(', ')}`);
    console.log(`  recommended_command: docpath project analyze ${state.id} --section ${missing[0]} --stdin`);
    console.log('  exit_criteria: all analysis sections are written');
  }
}

async function projectBrief(options: ProjectCommandOptions): Promise<void> {
  if (!options.id?.trim()) throw new Error('docpath project brief requires <intake-id>');
  const docpathDir = await resolveDocpathDir(options.cwd);
  const state = await readIntakeState(docpathDir, options.id.trim());

  if (options.dryRun) {
    console.log(JSON.stringify(briefPromptPayload(state), null, 2));
    return;
  }

  const missingSections = ANALYSIS_SECTIONS.filter((section) => !existsSync(artifactPathForAnalysis(docpathDir, state.id, section)));
  if (missingSections.length > 0) {
    throw new Error(`docpath project brief: missing analysis sections: ${missingSections.join(', ')}`);
  }

  const content = await readStdin();
  if (!content.trim()) throw new Error('docpath project brief requires brief markdown on stdin');

  const paths = projectIntakePaths(docpathDir, state.id);
  await writeFile(paths.brief, content, 'utf-8');
  const relativePath = relativeDocpathPath(paths.brief, docpathDir);
  await writeIntakeState(docpathDir, {
    ...upsertArtifact(state, 'brief', relativePath),
    stage: 'briefed',
  });

  console.log(`✅  project brief 已写入: ${state.id}`);
  console.log(`   path: ${relativePath}`);
  console.log('');
  console.log('next_hint:');
  console.log(`  next_action: plan project intake ${state.id}`);
  console.log(`  recommended_command: docpath project plan ${state.id} --dry-run`);
  console.log('  exit_criteria: project plan evidence is written');
}

export async function projectCommand(options: ProjectCommandOptions): Promise<void> {
  const action = options.action || 'status';
  if (action === 'capture') {
    await projectCapture(options);
    return;
  }
  if (action === 'analyze') {
    await projectAnalyze(options);
    return;
  }
  if (action === 'brief') {
    await projectBrief(options);
    return;
  }
  throw new Error(`docpath project: unsupported action ${action}（允许: capture|analyze|brief）`);
}
