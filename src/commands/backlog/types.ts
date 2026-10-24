/**
 * docpath backlog — 命令选项
 */

export interface BacklogCommandOptions {
  cwd: string;
  action?: string;
  id?: string;
  target?: string;
  title?: string;
  query?: string;
  kind?: string;
  priority?: string;
  level?: string;
  background?: string;
  acceptance?: string;
  fr?: string;
  nonGoals?: string;
  bodyFile?: string;
  readiness?: string;
  evidenceBrainstorm?: string;
  evidenceAnalysis?: string;
  evidenceSpec?: string;
  evidenceDecision?: string;
  userConfirmed?: string;
  status?: string;
  task?: string;
  milestone?: string;
  parent?: string;
  dependsOn?: string;
  blocks?: string;
  readyOnly?: boolean;
  unblocked?: boolean;
  mermaid?: boolean;
  json?: boolean;
  limit?: number;
  format?: 'json' | 'yaml' | 'markdown';
  output?: string;
  file?: string;
  dryRun?: boolean;
  overwrite?: boolean;
  fix?: boolean;
  all?: boolean;
  includeArchived?: boolean;
  archived?: boolean;
  archivedOnly?: boolean;
  agent?: boolean;
  draft?: boolean;
  adopt?: boolean;
  start?: boolean;
  promote?: boolean;
  nonInteractive?: boolean;
}
