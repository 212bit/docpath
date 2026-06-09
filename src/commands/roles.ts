import { listRoleProfiles, renderRoleContext } from '../utils/roles.js';

export interface RolesOptions {
  cwd: string;
  action?: 'list' | 'context';
  role?: string;
  json?: boolean;
}

function printRoles(json?: boolean): void {
  const roles = listRoleProfiles();
  if (json) {
    console.log(JSON.stringify({ roles }, null, 2));
    return;
  }
  console.log('\n👥 Role profiles\n');
  for (const role of roles) {
    console.log(`- ${role.id} (${role.team}) — ${role.responsibility}`);
  }
  console.log('');
}

async function printRoleContext(options: RolesOptions): Promise<void> {
  if (!options.role) {
    throw new Error('docpath roles context requires --role <id>');
  }
  console.log(await renderRoleContext(options.cwd, options.role));
}

export async function rolesCommand(options: RolesOptions): Promise<void> {
  const action = options.action || 'list';
  if (!['list', 'context'].includes(action)) {
    throw new Error(`Unsupported roles action: ${action}. Expected list | context`);
  }
  if (action === 'list') return printRoles(options.json);
  return printRoleContext(options);
}
