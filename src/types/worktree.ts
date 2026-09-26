/**
 * DocPath Git Worktree Types (Layer 0)
 */

export interface WorktreeOptions {
  cwd: string;
  action?:
    | 'create'
    | 'list'
    | 'remove'
    | 'doctor'
    | 'prune'
    | 'repair'
    | 'merge'
    | 'finish'
    | 'sync'
    | 'matrix'
    | 'status'
    | 'broadcast'
    | 'conflicts'
    | 'preflight';
  name?: string;
  force?: boolean;
  backlog?: string;
  agent?: boolean;
  json?: boolean;
  message?: string;
  allowDirtyMain?: string;
  strict?: boolean;
}

export interface WorktreePaths {
  repoRoot: string;
  safeName: string;
  worktreesDir: string;
  worktreePath: string;
}

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string;
  bare?: boolean;
  detached?: boolean;
  locked?: boolean;
  prunable?: boolean;
}

export interface WorktreeDiagnostics {
  managed: boolean;
  dirty: boolean;
  completed: boolean;
  mergedToMain: boolean;
  branchHasUniqueCommits: boolean;
  branchUniqueCommits: number;
  safeToRemove: boolean;
  cleanupCommand: string | null;
}

export interface IndexConflictResolution {
  resolved: string[];
  rebuilds: Array<{ path: string; kind: 'backlog' | 'docs' }>;
}
