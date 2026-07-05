import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { resolveDocpathDir } from '../utils/file.js';
import { readStdin } from '../utils/stdin.js';
import { withLock } from '../utils/lock.js';
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
  confirm?: string;
  agent?: boolean;
  json?: boolean;
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

const REQUIREMENTS_SHAPING_FLOW = [
  'raw-material capture',
  'domain analysis',
  'gap index',
  'stakeholder questions',
  'decision cards',
  'requirements approval',
  'backlog guidance',
] as const;

const REQUIREMENTS_SHAPING_OUTPUTS = [
  'source provenance inventory',
  'six-domain analysis',
  'gap index with owner, impact, blocking status, and next confirmation route',
  'stakeholder question list grouped by audience',
  'decision cards for assumptions that require explicit approval',
  'approved requirements brief with scope, non-goals, acceptance candidates, and approval gate',
  'minimal standards package: requirements.md, architecture.md, and development-checklist.md',
  'optional standards artifacts only when complexity requires them: open-questions.md, decisions/*.md, and style.md',
  'structured backlog quality guidance after confirmation only; do not require a phase-backlog.md document',
] as const;

const PROJECT_STANDARDS_REQUIRED = [
  'requirements.md',
  'architecture.md',
  'development-checklist.md',
] as const;

const PROJECT_STANDARDS_OPTIONAL = [
  'open-questions.md',
  'decisions/*.md',
  'style.md',
] as const;

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

async function atomicUpdateIntakeState(
  docpathDir: string,
  intakeId: string,
  updater: (state: ProjectIntakeState) => Promise<ProjectIntakeState> | ProjectIntakeState
): Promise<void> {
  const lockPath = join(docpathDir, 'project-intake', `${intakeId}.lock`);
  await withLock(lockPath, async () => {
    const state = await readIntakeState(docpathDir, intakeId);
    const updated = await updater(state);
    await writeIntakeState(docpathDir, updated);
  });
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
    intent: 'Shape raw project materials into confirmed requirements evidence. Do not implement product code or create executable backlog items.',
    workflow: REQUIREMENTS_SHAPING_FLOW,
    sources: state.sources.map((source) => ({
      id: source.id,
      title: source.title,
      type: source.type,
      content_path: source.content_path,
      original_path: source.original_path,
      excerpt: source.excerpt,
    })),
    sections: {
      requirements: ['goals', 'actors', 'jobs-to-be-done', 'scope', 'non-goals', 'assumptions', 'approval criteria'],
      product: ['user value', 'success metrics', 'core journey', 'business rules', 'rollout/rollback'],
      ui: ['information architecture', 'states', 'accessibility', 'responsive behavior', 'copy'],
      technical: ['modules', 'data/API contracts', 'permissions', 'migrations', 'testing', 'observability'],
      risks: ['product', 'design', 'technical', 'security', 'maintenance'],
      'open-questions': [
        'gap index with owner and blocking status',
        'stakeholder questions grouped by audience',
        'decision cards for assumptions needing approval',
        'blocking questions',
        'non-blocking questions',
      ],
    },
    required_outputs: REQUIREMENTS_SHAPING_OUTPUTS,
    standards_package: {
      required: PROJECT_STANDARDS_REQUIRED,
      optional: PROJECT_STANDARDS_OPTIONAL,
      rules: [
        'requirements.md is the approved requirements source of truth: goals, scope, workflows, business rules, non-goals, acceptance criteria, and approval status.',
        'architecture.md is the hard development contract: module boundaries, dependency direction, ADRs, forbidden crossings, and assumptions that are not yet approved.',
        'development-checklist.md is the pre-development gate that agents must satisfy before implementation.',
        'open-questions.md is optional; keep questions inside requirements.md unless the gap list needs owner/status tracking.',
        'decisions/*.md is optional for significant decisions; architecture decisions must also be summarized into architecture.md ADRs.',
        'style.md is optional when team-wide standards already exist; if present, keep only project-specific differences and avoid generic boilerplate.',
      ],
    },
    rules: [
      'Separate verified facts, assumptions, gaps, and proposed decisions.',
      'Do not convert intake output into normal backlog before explicit user confirmation.',
      'Mark each gap as blocking, can-mock, or later.',
      'Decision cards must include problem, options, recommendation, risk, non-goals, owner, and approval effect.',
      'Do not treat inferred architecture, draft standards, or prototype notes as approved development rules.',
      'Backlog is structured data quality, not a required phase-backlog.md document.',
    ],
    recommended_writes: ANALYSIS_SECTIONS.map((section) => `docpath project analyze ${state.id} --section ${section} --stdin`),
  };
}

function briefPromptPayload(state: ProjectIntakeState): Record<string, unknown> {
  return {
    task: 'project-intake-brief',
    dry_run: true,
    intake_id: state.id,
    title: state.title,
    intent: 'Create a requirements-shaping brief from project-intake analysis. Do not create executable backlog items yet.',
    workflow: REQUIREMENTS_SHAPING_FLOW,
    required_content: [
      'project goal',
      'target users',
      'core scenarios',
      'included scope',
      'excluded scope',
      'assumptions',
      'gap index summary with blocking/can-mock/later status',
      'stakeholder question summary grouped by owner',
      'decision cards or links for unresolved assumptions',
      'dependencies',
      'risks',
      'acceptance candidates',
      'blocking decisions',
      'approval gate and approval owner',
      'standards package status: requirements.md, architecture.md, development-checklist.md',
      'optional artifact decision: open-questions.md, decisions/*.md, style.md when needed',
    ],
    standards_package: {
      required: PROJECT_STANDARDS_REQUIRED,
      optional: PROJECT_STANDARDS_OPTIONAL,
      backlog_policy: 'No phase-backlog.md is required; create structured backlog items only after approval, preserving provenance and acceptance criteria.',
    },
    recommended_write: `docpath project brief ${state.id} --stdin`,
  };
}

function backlogPromptPayload(state: ProjectIntakeState): Record<string, unknown> {
  return {
    task: 'project-intake-backlog-decomposition',
    dry_run: true,
    intake_id: state.id,
    title: state.title,
    intent: 'After explicit approval, convert requirements-shaping output into reviewable normal backlog item drafts with provenance links.',
    workflow: REQUIREMENTS_SHAPING_FLOW,
    guardrails: [
      'This command emits guidance only; it does not auto-create executable backlog items.',
      'Do not run non-dry-run without explicit user confirmation that requirements are approved for backlog decomposition.',
      'Each future backlog item must preserve project-intake provenance and its own acceptance criteria.',
      'Do not require or generate phase-backlog.md as a durable source of truth.',
      'Before development, the project must have approved requirements.md, architecture.md, and development-checklist.md or equivalent paths linked from the backlog evidence.',
    ],
    provenance: {
      intake_state: `.docpath/project-intake/${state.id}/intake.json`,
      brief: `.docpath/project-intake/${state.id}/brief.md`,
    },
    required_item_fields: [
      'title',
      'priority',
      'level',
      'background',
      'acceptance',
      'readiness',
      'dependencies',
      'decision_refs when architecture/API/data/permission/UI/workflow changes are involved',
      'evidence-analysis or evidence-spec',
      'evidence-decision for level 3 items',
      'user-confirmed for level 3 items',
    ],
    structured_backlog_quality: [
      'Backlog items are the task queue source of truth; markdown phase backlog files are optional draft views only.',
      'Every backlog item must link to approved requirements or intake brief evidence.',
      'Level 3 items must link to a decision reference and explicit user confirmation.',
      'Items that depend on unresolved gaps must mark the dependency as blocking, can-mock, or later.',
    ],
    recommended_command_template: `docpath backlog add --title "<title>" --priority P1 --level 2 --background "<background with project-intake provenance>" --acceptance "<acceptance>" --readiness analyzed --evidence-analysis ".docpath/project-intake/${state.id}/brief.md"`,
  };
}

function missingAnalysisSections(docpathDir: string, intakeId: string): AnalysisSection[] {
  return ANALYSIS_SECTIONS.filter((section) => !existsSync(artifactPathForAnalysis(docpathDir, intakeId, section)));
}

function nextActionForIntake(docpathDir: string, state: ProjectIntakeState): { next_action: string; recommended_command: string; exit_criteria: string } {
  const missing = missingAnalysisSections(docpathDir, state.id);
  const paths = projectIntakePaths(docpathDir, state.id);
  if (state.stage === 'captured' || missing.length > 0) {
    return {
      next_action: missing.length === ANALYSIS_SECTIONS.length
        ? `shape requirements from captured project materials: ${state.id}`
        : `complete remaining requirements-shaping analysis sections: ${missing.join(', ')}`,
      recommended_command: missing.length === ANALYSIS_SECTIONS.length
        ? `docpath project analyze ${state.id} --dry-run`
        : `docpath project analyze ${state.id} --section ${missing[0]} --stdin`,
      exit_criteria: 'all requirements-shaping analysis sections are written, including gaps, stakeholder questions, and decision cards',
    };
  }
  if (!existsSync(paths.brief)) {
    return {
      next_action: `create requirements brief with approval gate for ${state.id}`,
      recommended_command: `docpath project brief ${state.id} --dry-run`,
      exit_criteria: 'brief.md captures scope, gaps, decisions, acceptance candidates, and approval gate',
    };
  }
  if (!state.user_confirmed) {
    return {
      next_action: `obtain explicit requirements approval before backlog decomposition: ${state.id}`,
      recommended_command: `docpath project backlog ${state.id} --dry-run`,
      exit_criteria: 'user confirmation is recorded before backlog guidance',
    };
  }
  return {
    next_action: `create reviewed backlog items from approved intake guidance: ${state.id}`,
    recommended_command: `docpath backlog add --title "<title>" --evidence-analysis ".docpath/project-intake/${state.id}/backlog.md"`,
    exit_criteria: 'reviewed backlog items are captured with project-intake provenance',
  };
}

function printAgentStatus(docpathDir: string, state: ProjectIntakeState): void {
  const route = nextActionForIntake(docpathDir, state);
  const missing = missingAnalysisSections(docpathDir, state.id);
  console.log(`agent_view: project_status`);
  console.log(`id: ${state.id}`);
  console.log(`title: ${JSON.stringify(state.title)}`);
  console.log(`stage: ${state.stage}`);
  console.log(`source_count: ${state.sources.length}`);
  console.log(`artifact_count: ${state.artifacts.length}`);
  console.log(`user_confirmed: ${state.user_confirmed ? JSON.stringify(state.user_confirmed) : 'null'}`);
  console.log(`missing_analysis_sections:`);
  for (const section of missing) console.log(`  - ${section}`);
  console.log(`next_action: ${JSON.stringify(route.next_action)}`);
  console.log(`recommended_command: ${JSON.stringify(route.recommended_command)}`);
  console.log(`exit_criteria: ${JSON.stringify(route.exit_criteria)}`);
}

async function listIntakeStates(docpathDir: string): Promise<ProjectIntakeState[]> {
  const root = join(docpathDir, 'project-intake');
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const states: ProjectIntakeState[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const statePath = projectIntakePaths(docpathDir, entry.name).state;
    if (!existsSync(statePath)) continue;
    states.push(JSON.parse(await readFile(statePath, 'utf-8')) as ProjectIntakeState);
  }
  return states.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
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
  console.log(`  next_action: shape requirements from captured project materials ${intakeId}`);
  console.log(`  recommended_command: docpath project analyze ${intakeId} --dry-run`);
  console.log('  exit_criteria: requirements-shaping analysis sections are written under analysis/');
}

async function projectAnalyze(options: ProjectCommandOptions): Promise<void> {
  if (!options.id?.trim()) throw new Error('docpath project analyze requires <intake-id>');
  const docpathDir = await resolveDocpathDir(options.cwd);
  const intakeId = options.id.trim();

  // Read-only check before acquiring lock
  const stateCheck = await readIntakeState(docpathDir, intakeId);
  if (stateCheck.sources.length === 0) throw new Error(`docpath project analyze: intake ${stateCheck.id} has no sources`);

  if (options.dryRun) {
    console.log(JSON.stringify(analysisPromptPayload(stateCheck), null, 2));
    return;
  }

  const section = normalizeAnalysisSection(options.section);
  const content = await readStdin();
  if (!content.trim()) throw new Error('docpath project analyze requires analysis markdown on stdin');

  // Atomic RMW operation
  let relativePath: string;
  let writtenSections: readonly AnalysisSection[];
  await atomicUpdateIntakeState(docpathDir, intakeId, async (state) => {
    const target = artifactPathForAnalysis(docpathDir, state.id, section);
    await mkdir(projectIntakePaths(docpathDir, state.id).analysisDir, { recursive: true });
    await writeFile(target, content, 'utf-8');

    relativePath = relativeDocpathPath(target, docpathDir);
    const nextState = upsertArtifact(state, 'analysis', relativePath);
    writtenSections = ANALYSIS_SECTIONS.filter((candidate) => existsSync(artifactPathForAnalysis(docpathDir, state.id, candidate)));
    return {
      ...nextState,
      stage: writtenSections.length === ANALYSIS_SECTIONS.length ? 'analyzed' : nextState.stage,
    };
  });

  console.log(`✅  project analysis 已写入: ${intakeId}`);
  console.log(`   section: ${section}`);
  console.log(`   path: ${relativePath!}`);
  console.log('');
  console.log('next_hint:');
  if (writtenSections!.length === ANALYSIS_SECTIONS.length) {
    console.log(`  next_action: create requirements brief with approval gate for ${intakeId}`);
    console.log(`  recommended_command: docpath project brief ${intakeId} --dry-run`);
    console.log('  exit_criteria: brief.md captures scope, gaps, decisions, acceptance candidates, and approval gate');
  } else {
    const missing = ANALYSIS_SECTIONS.filter((candidate) => !writtenSections!.includes(candidate));
    console.log(`  next_action: complete remaining requirements-shaping analysis sections: ${missing.join(', ')}`);
    console.log(`  recommended_command: docpath project analyze ${intakeId} --section ${missing[0]} --stdin`);
    console.log('  exit_criteria: all requirements-shaping analysis sections are written');
  }
}

async function projectBrief(options: ProjectCommandOptions): Promise<void> {
  if (!options.id?.trim()) throw new Error('docpath project brief requires <intake-id>');
  const docpathDir = await resolveDocpathDir(options.cwd);
  const intakeId = options.id.trim();

  // Read-only check before acquiring lock
  const stateCheck = await readIntakeState(docpathDir, intakeId);

  if (options.dryRun) {
    console.log(JSON.stringify(briefPromptPayload(stateCheck), null, 2));
    return;
  }

  const missingSections = ANALYSIS_SECTIONS.filter((section) => !existsSync(artifactPathForAnalysis(docpathDir, intakeId, section)));
  if (missingSections.length > 0) {
    throw new Error(`docpath project brief: missing analysis sections: ${missingSections.join(', ')}`);
  }

  const content = await readStdin();
  if (!content.trim()) throw new Error('docpath project brief requires brief markdown on stdin');

  // Atomic RMW operation
  let relativePath: string;
  await atomicUpdateIntakeState(docpathDir, intakeId, async (state) => {
    const paths = projectIntakePaths(docpathDir, state.id);
    await writeFile(paths.brief, content, 'utf-8');
    relativePath = relativeDocpathPath(paths.brief, docpathDir);
    return {
      ...upsertArtifact(state, 'brief', relativePath),
      stage: 'briefed',
    };
  });

  console.log(`✅  project brief 已写入: ${intakeId}`);
  console.log(`   path: ${relativePath!}`);
  console.log('');
  console.log('next_hint:');
  console.log(`  next_action: obtain explicit requirements approval before backlog decomposition ${intakeId}`);
  console.log(`  recommended_command: docpath project backlog ${intakeId} --dry-run`);
  console.log('  exit_criteria: user confirmation is recorded before backlog guidance');
}

async function projectBacklog(options: ProjectCommandOptions): Promise<void> {
  if (!options.id?.trim()) throw new Error('docpath project backlog requires <intake-id>');
  const docpathDir = await resolveDocpathDir(options.cwd);
  const intakeId = options.id.trim();

  // Read-only check before acquiring lock
  const stateCheck = await readIntakeState(docpathDir, intakeId);
  const paths = projectIntakePaths(docpathDir, stateCheck.id);

  if (!existsSync(paths.brief)) {
    throw new Error(`docpath project backlog: missing project brief for ${stateCheck.id}`);
  }

  if (options.dryRun) {
    console.log(JSON.stringify(backlogPromptPayload(stateCheck), null, 2));
    return;
  }

  const confirmation = options.confirm?.trim() || stateCheck.user_confirmed;
  if (!confirmation) {
    throw new Error(`docpath project backlog: ${stateCheck.id} requires --confirm <text> before backlog decomposition`);
  }

  // Atomic RMW operation
  let relativePath: string;
  await atomicUpdateIntakeState(docpathDir, intakeId, async (state) => {
    const guidance = [
      `# Backlog Decomposition Guidance: ${state.title}`,
      '',
      `> intake_id: ${state.id}`,
      `> confirmed: ${confirmation}`,
      `> project_brief: .docpath/project-intake/${state.id}/brief.md`,
      '',
      'Use this guidance to create normal backlog items with explicit provenance after requirements approval.',
      '',
      'Requirements-shaping guardrails:',
      '- Do not create executable backlog from unapproved intake materials.',
      '- Do not require or maintain phase-backlog.md as a durable source of truth; backlog quality is enforced on structured backlog items.',
      '- Keep each backlog item tied to this intake provenance and its own acceptance criteria.',
      '- Preserve unresolved gaps as blocking/can-mock/later dependencies in the backlog item background.',
      '- Before implementation, ensure approved requirements.md, architecture.md, and development-checklist.md exist or are linked as equivalent standards evidence.',
      '- Use open-questions.md, decisions/*.md, and style.md only when project complexity requires separate artifacts.',
      '',
      '```bash',
      `docpath backlog add --title "<title>" --priority P1 --level 2 --background "<background; provenance: .docpath/project-intake/${state.id}/brief.md>" --acceptance "<acceptance>" --readiness analyzed --evidence-analysis ".docpath/project-intake/${state.id}/brief.md"`,
      '```',
      '',
    ].join('\n');
    const paths = projectIntakePaths(docpathDir, state.id);
    await writeFile(paths.backlog, guidance, 'utf-8');

    relativePath = relativeDocpathPath(paths.backlog, docpathDir);
    return {
      ...upsertArtifact(state, 'backlog', relativePath),
      stage: 'confirmed',
      user_confirmed: confirmation,
    };
  });

  console.log(`✅  project backlog guidance 已写入: ${intakeId}`);
  console.log(`   path: ${relativePath!}`);
  console.log('   status: confirmed');
  console.log('');
  console.log('next_hint:');
  console.log(`  next_action: create reviewed backlog items from approved intake guidance ${intakeId}`);
  console.log(`  recommended_command: docpath backlog add --title "<title>" --evidence-analysis "${relativePath!}"`);
  console.log('  exit_criteria: reviewed backlog items are captured with project-intake provenance');
}

async function projectStatus(options: ProjectCommandOptions): Promise<void> {
  const docpathDir = await resolveDocpathDir(options.cwd);
  if (!options.id?.trim()) {
    const states = await listIntakeStates(docpathDir);
    if (options.json) {
      console.log(JSON.stringify({ intakes: states }, null, 2));
      return;
    }
    console.log(`count: ${states.length}`);
    console.log('items:');
    for (const state of states) {
      console.log(`  - id: ${state.id}`);
      console.log(`    title: ${JSON.stringify(state.title)}`);
      console.log(`    stage: ${state.stage}`);
    }
    return;
  }

  const state = await readIntakeState(docpathDir, options.id.trim());
  if (options.json) {
    console.log(JSON.stringify({ intake: state, route: nextActionForIntake(docpathDir, state) }, null, 2));
    return;
  }
  if (options.agent) {
    printAgentStatus(docpathDir, state);
    return;
  }
  const route = nextActionForIntake(docpathDir, state);
  console.log(`Project intake: ${state.id}`);
  console.log(`  title: ${state.title}`);
  console.log(`  stage: ${state.stage}`);
  console.log(`  sources: ${state.sources.length}`);
  console.log(`  next: ${route.recommended_command}`);
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
  if (action === 'backlog') {
    await projectBacklog(options);
    return;
  }
  if (action === 'status') {
    await projectStatus(options);
    return;
  }
  throw new Error(`docpath project: unsupported action ${action}（允许: capture|analyze|brief|backlog|status）`);
}
