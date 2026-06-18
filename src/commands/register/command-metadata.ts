export type CommandVisibility = 'core' | 'advanced' | 'hidden' | 'deprecated';

export interface CommandMetadata {
  name: string;
  description: string;
  visibility: CommandVisibility;
  replacement?: string;
}

export const COMMAND_METADATA: CommandMetadata[] = [
  { name: 'init', description: 'Initialize DocPath in a project', visibility: 'core' },
  { name: 'install', description: 'Install agent protocol files and adapters', visibility: 'core' },
  { name: 'status', description: 'Read workflow diagnostics', visibility: 'core' },
  { name: 'next', description: 'Read the recommended next route', visibility: 'core' },
  { name: 'backlog', description: 'Capture, shape, accept, and promote work', visibility: 'core' },
  { name: 'analyze', description: 'Generate pre-development analysis payloads', visibility: 'core' },
  { name: 'refine', description: 'Generate requirement refinement payloads', visibility: 'core' },
  { name: 'write-analysis', description: 'Persist generated analysis sections', visibility: 'core' },
  { name: 'write-spec', description: 'Persist generated task specs', visibility: 'core' },
  { name: 'plan', description: 'Generate execution plan payloads', visibility: 'core' },
  { name: 'write-plan', description: 'Persist generated execution plans', visibility: 'core' },
  { name: 'quick', description: 'Create a fast-track task for tiny scoped changes', visibility: 'core' },
  { name: 'start', description: 'Start a plan step (semantic wrapper)', visibility: 'core' },
  { name: 'step', description: 'Mark current step status (done/blocked/skipped)', visibility: 'core' },
  { name: 'done', description: 'Complete task with full gate sequence', visibility: 'core' },
  { name: 'recover', description: 'Recover from blocked step', visibility: 'core' },
  { name: 'retry', description: 'Retry skipped step', visibility: 'core' },
  { name: 'unblock', description: 'Explicitly unblock and restart step', visibility: 'core' },
  { name: 'commit', description: 'Git closeout wrapper: preview/stage/commit', visibility: 'core' },
  { name: 'go', description: 'Atomically claim/start a plan step', visibility: 'core' },
  { name: 'agent', description: 'Agent lifecycle: enter, step, done, handoff', visibility: 'core' },
  { name: 'check', description: 'Run quality and workflow gates', visibility: 'core' },
  { name: 'review', description: 'Run local static review gate', visibility: 'core' },
  { name: 'journal', description: 'Archive completed task knowledge', visibility: 'core' },
  { name: 'changes', description: 'Read-only git closeout view', visibility: 'core' },
  { name: 'context', description: 'Build a budgeted agent context package', visibility: 'core' },
  { name: 'reveal', description: 'Progressively expand indexed context', visibility: 'core' },
  { name: 'docs', description: 'Scan and maintain the document index', visibility: 'core' },
  { name: 'tasks', description: 'Diagnose and sync current/canonical task files', visibility: 'advanced' },
  { name: 'task', description: 'Abort or reset the current task', visibility: 'advanced' },
  { name: 'doctor', description: 'Diagnose DocPath and Git workspace hygiene', visibility: 'advanced' },
  { name: 'config', description: 'Read or update DocPath configuration', visibility: 'advanced' },
  { name: 'learn', description: 'Promote or prune journal lessons', visibility: 'advanced' },
  { name: 'gc', description: 'Preview or run workspace/task cleanup', visibility: 'advanced' },
  { name: 'worktree', description: 'Manage isolated Git worktrees', visibility: 'advanced' },
  { name: 'deliverables', description: 'Render and check deliverable templates', visibility: 'advanced' },
  { name: 'roles', description: 'Render role-specific context', visibility: 'advanced' },
  { name: 'export', description: 'Export workflow state as Markdown', visibility: 'advanced' },
  { name: 'stats', description: 'Show project statistics', visibility: 'advanced' },
  { name: 'dashboard', description: 'Start the read-only dashboard', visibility: 'advanced' },
  { name: 'debug', description: 'Run the systematic debug workflow', visibility: 'advanced' },
  { name: 'projects', description: 'List locally registered projects', visibility: 'advanced' },
  { name: 'unlink', description: 'Remove project linkage', visibility: 'advanced' },
  { name: 'gc-decisions', description: 'Rotate old decision logs', visibility: 'advanced' },
  { name: 'continue', description: 'Read recovery context and route hints', visibility: 'advanced' },
  { name: 'resume', description: 'Compatibility recovery view', visibility: 'advanced' },
  { name: 'diff', description: 'Inspect scoped Git diffs', visibility: 'advanced' },
  { name: 'run', description: 'Low-level runtime lifecycle primitive', visibility: 'hidden' },
  { name: 'compact', description: 'Persist compact handoff context', visibility: 'hidden' },
  { name: 'discover', description: 'List context files for diagnostics', visibility: 'hidden' },
  { name: 'render', description: 'Regenerate Markdown views from JSON truth', visibility: 'hidden' },
  { name: 'write-journal', description: 'Persist generated journal notes', visibility: 'hidden' },
  { name: 'write-design', description: 'Persist generated design evidence', visibility: 'hidden' },
  { name: 'prompt', description: 'Emit structured prompt payloads', visibility: 'hidden' },
  { name: 'brainstorm', description: 'Legacy requirement brainstorming prompt', visibility: 'hidden' },
  { name: 'brainstor', description: 'Typo compatibility alias for brainstorm', visibility: 'deprecated', replacement: 'brainstorm' },
  { name: 'disclosure', description: 'Legacy information disclosure view', visibility: 'deprecated', replacement: 'reveal or context' },
  { name: 'tdd', description: 'Experimental parallel TDD workflow', visibility: 'deprecated', replacement: 'plan, go, check, review' },
];

function padName(name: string): string {
  return name.padEnd(16, ' ');
}

function renderCommandRows(commands: CommandMetadata[]): string {
  return commands
    .map((command) => {
      const suffix = command.replacement ? ` (use ${command.replacement})` : '';
      return `  ${padName(command.name)} ${command.description}${suffix}`;
    })
    .join('\n');
}

export function renderDefaultHelp(version: string): string {
  const core = COMMAND_METADATA.filter((command) => command.visibility === 'core');
  return [
    `docpath/${version}`,
    '',
    'Usage:',
    '  $ docpath <command> [options]',
    '',
    'Core workflow commands:',
    renderCommandRows(core),
    '',
    'Advanced commands are hidden from the default view.',
    '  $ docpath help advanced     Show maintenance, reporting, and internal tools',
    '  $ docpath help deprecated   Show deprecated compatibility commands',
    '  $ docpath <command> --help  Show command-specific options',
    '',
    'Options:',
    '  -v, --version  Display version number',
    '  -h, --help     Display this message',
    '',
  ].join('\n');
}

export function renderAdvancedHelp(version: string): string {
  const advanced = COMMAND_METADATA.filter((command) => command.visibility === 'advanced');
  const hidden = COMMAND_METADATA.filter((command) => command.visibility === 'hidden');
  return [
    `docpath/${version}`,
    '',
    'Advanced and maintenance commands:',
    renderCommandRows(advanced),
    '',
    'Internal/agent support commands:',
    renderCommandRows(hidden),
    '',
    'These commands remain callable for protocols and recovery workflows, but are not part of the default user path.',
    '',
  ].join('\n');
}

export function renderDeprecatedHelp(version: string): string {
  const deprecated = COMMAND_METADATA.filter((command) => command.visibility === 'deprecated');
  return [
    `docpath/${version}`,
    '',
    'Deprecated compatibility commands:',
    renderCommandRows(deprecated),
    '',
    'Deprecated commands remain callable for now and print a warning before running.',
    '',
  ].join('\n');
}

export function warnDeprecatedCommand(command: string, replacement: string): void {
  console.warn(`⚠️  docpath ${command} is deprecated; use ${replacement} instead.`);
}
