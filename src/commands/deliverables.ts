import { stringify } from 'yaml';
import {
  listDeliverableTemplates,
  renderDeliverableTemplate,
  renderDeliverableToFile,
  validateDeliverables,
} from '../utils/deliverables.js';

export interface DeliverablesOptions {
  cwd: string;
  action?: 'list' | 'render' | 'check';
  template?: string;
  output?: string;
  force?: boolean;
  json?: boolean;
}

function printTemplates(json?: boolean): void {
  const templates = listDeliverableTemplates();
  if (json) {
    console.log(JSON.stringify({ templates }, null, 2));
    return;
  }
  console.log('\n📦 Deliverable templates\n');
  for (const template of templates) {
    console.log(`- ${template.id} (${template.category}) — ${template.description}`);
  }
  console.log('');
}

async function renderTemplate(options: DeliverablesOptions): Promise<void> {
  if (!options.template) {
    throw new Error('docpath deliverables render requires --template <id>');
  }
  if (!options.output) {
    console.log(renderDeliverableTemplate(options.template));
    return;
  }
  const entry = await renderDeliverableToFile({
    cwd: options.cwd,
    template: options.template,
    output: options.output,
    force: !!options.force,
  });
  console.log(`✅ deliverable 已写入: ${entry.path}`);
  console.log('索引: .docpath/tasks/current/deliverables.json');
}

async function checkDeliverables(options: DeliverablesOptions): Promise<void> {
  const issues = await validateDeliverables(options.cwd);
  if (options.json) {
    console.log(JSON.stringify({ passed: issues.length === 0, issues }, null, 2));
    return;
  }
  if (issues.length === 0) {
    console.log('✅ deliverables check passed');
    return;
  }
  console.log(stringify({ passed: false, issues }, { indent: 2 }));
  throw new Error(`deliverables check failed: ${issues.length} issue(s)`);
}

export async function deliverablesCommand(options: DeliverablesOptions): Promise<void> {
  const action = options.action || 'list';
  if (!['list', 'render', 'check'].includes(action)) {
    throw new Error(`Unsupported deliverables action: ${action}. Expected list | render | check`);
  }
  if (action === 'list') return printTemplates(options.json);
  if (action === 'render') return renderTemplate(options);
  return checkDeliverables(options);
}
