import { defineConfig } from 'tsup';

/**
 * DocPath CLI 构建配置。
 *
 * entry 列表集中在此，供 build:clean / build:test / dev 三个脚本共用，
 * 避免在 package.json 中三重复制。clean / watch 仍由命令行 flag 控制：
 *   - build:clean → tsup --clean
 *   - build:test  → tsup
 *   - dev         → tsup --watch
 */
const CLI_ENTRY = [
  'src/index.ts',
  'src/engine/breadcrumb.ts',
  'src/engine/state-machine.ts',
  'src/engine/transitions.ts',
  'src/engine/policy.ts',
  'src/engine/backlog.ts',
  'src/governance/decisions.ts',
  'src/utils/pending-done.ts',
  'src/utils/doc-parser.ts',
  'src/utils/ui-gate.ts',
  'src/utils/lock.ts',
  'src/utils/session.ts',
  'src/utils/git-closeout.ts',
  'src/utils/merge-driver.ts',
  'src/utils/payload.ts',
  'src/utils/context-index.ts',
  'src/utils/deliverables.ts',
  'src/utils/roles.ts',
  'src/utils/worktree.ts',
  'src/utils/output-formatter.ts',
  'src/utils/error-messages.ts',
  'src/utils/error-helpers.ts',
  'src/utils/contextual-help.ts',
  'src/utils/agent-output.ts',
  'src/utils/topic-synonyms.ts',
  'src/commands/check/evidence.ts',
  'src/commands/check/validators.ts',
];

export default defineConfig({
  entry: CLI_ENTRY,
  format: ['esm'],
  outDir: 'dist',
});
