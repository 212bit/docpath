/** 注册 DocPath CLI 命令。 */

import type { CAC } from 'cac';
import { registerBacklogMaintenanceCommands } from './register/backlog-maintenance.js';
import { registerCoreCommands } from './register/core.js';
import { registerDocsInstallCommands } from './register/docs-install.js';
import { registerExecutionCommands } from './register/execution.js';
import { registerNavigationCommands } from './register/navigation.js';
import { registerQualityCommands } from './register/quality.js';
import { registerReportingCommands } from './register/reporting.js';
import { registerRuntimeToolCommands } from './register/runtime-tools.js';
import { registerSpecCommands } from './register/spec.js';
import { registerTddDebugCommands } from './register/tdd-debug.js';
import { registerWorktreeCommands } from './register/worktree.js';
import { registerOperationalCommands } from './register/operational.js';
import { registerAliases } from './register/aliases.js';

export function registerCommands(cli: CAC): void {
  registerCoreCommands(cli);
  registerOperationalCommands(cli);
  registerSpecCommands(cli);
  registerExecutionCommands(cli);
  registerQualityCommands(cli);
  registerNavigationCommands(cli);
  registerReportingCommands(cli);
  registerRuntimeToolCommands(cli);
  registerBacklogMaintenanceCommands(cli);
  registerDocsInstallCommands(cli);
  registerTddDebugCommands(cli);
  registerWorktreeCommands(cli);

  // 注册别名（必须在所有命令注册后）
  registerAliases(cli);
}
