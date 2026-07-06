import { join } from 'node:path';

export const PROJECT_INTAKE_SCHEMA_VERSION = 1;
export const PROJECT_INTAKE_ROOT = 'project-intake';

export type ProjectIntakeStage =
  | 'captured'
  | 'analyzed'
  | 'briefed'
  | 'settled'
  | 'specified'
  | 'architected'
  | 'planned'
  | 'confirmed'
  | 'decomposed'
  | 'blocked';

export type ProjectIntakeSourceType =
  | 'markdown'
  | 'text'
  | 'ppt'
  | 'pdf'
  | 'api-doc'
  | 'intro-doc'
  | 'requirements'
  | 'meeting-notes'
  | 'mixed'
  | 'unknown';

export type ProjectIntakeArtifactKind =
  | 'source'
  | 'analysis'
  | 'brief'
  | 'settle'
  | 'spec'
  | 'architecture'
  | 'plan'
  | 'backlog';

export type ProjectIntakeCommandAction =
  | 'capture'
  | 'analyze'
  | 'brief'
  | 'settle'
  | 'plan'
  | 'backlog'
  | 'status';

export interface ProjectIntakeSource {
  id: string;
  title: string;
  type: ProjectIntakeSourceType;
  captured_at: string;
  content_path?: string;
  original_path?: string;
  content_sha256?: string;
  excerpt?: string;
}

export interface ProjectIntakeArtifactRef {
  kind: ProjectIntakeArtifactKind;
  path: string;
  updated_at?: string;
}

export interface ProjectIntakeState {
  schema_version: number;
  id: string;
  title: string;
  stage: ProjectIntakeStage;
  created_at: string;
  updated_at: string;
  sources: ProjectIntakeSource[];
  artifacts: ProjectIntakeArtifactRef[];
  user_confirmed: string | null;
  approval_state?: 'approved' | 'partial' | 'blocked';
  blocked_reason: string | null;
  backlog_items: string[];
}

export interface ProjectIntakePaths {
  root: string;
  state: string;
  sourcesDir: string;
  analysisDir: string;
  brief: string;
  settle: string;
  spec: string;
  architecture: string;
  plan: string;
  backlog: string;
}

export function projectIntakeDir(docpathDir: string, intakeId: string): string {
  return join(docpathDir, PROJECT_INTAKE_ROOT, intakeId);
}

export function projectIntakePaths(docpathDir: string, intakeId: string): ProjectIntakePaths {
  const root = projectIntakeDir(docpathDir, intakeId);
  return {
    root,
    state: join(root, 'intake.json'),
    sourcesDir: join(root, 'sources'),
    analysisDir: join(root, 'analysis'),
    brief: join(root, 'brief.md'),
    settle: join(root, 'settle.md'),
    spec: join(root, 'spec.md'),
    architecture: join(root, 'architecture.md'),
    plan: join(root, 'plan.md'),
    backlog: join(root, 'backlog.md'),
  };
}

export function projectIntakeRelativePaths(intakeId: string): ProjectIntakePaths {
  return projectIntakePaths(`.docpath`, intakeId);
}
