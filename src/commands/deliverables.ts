import { stringify as stringifyYaml } from 'yaml';
import {
  listDeliverableTemplates,
  renderDeliverableTemplate,
  renderDeliverableToFile,
  validateDeliverables,
} from '../utils/deliverables.js';
import {
  readLifecycleConfig,
  readLifecycleRegistry,
  getStageStatus,
  initLifecycle,
  generateStageContract,
  writeStageContent,
  renderStageDefaultTemplate
} from '../utils/lifecycle.js';

export interface DeliverablesOptions {
  cwd: string;
  action?: 'list' | 'render' | 'check' | 'init' | 'status' | 'generate';
  template?: string;
  output?: string;
  force?: boolean;
  json?: boolean;
  profile?: string;
  stage?: string;
  stdin?: boolean;
  dryRun?: boolean;
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
  const config = await readLifecycleConfig(options.cwd);
  if (config) {
    const { validateLifecycleDeliverables } = await import('../utils/lifecycle.js');
    const lifecycleIssues = await validateLifecycleDeliverables(options.cwd);
    const errors = lifecycleIssues.filter((issue) => issue.severity === 'error');
    const warnings = lifecycleIssues.filter((issue) => issue.severity === 'warning');

    if (options.json) {
      console.log(JSON.stringify({ passed: errors.length === 0, lifecycle_issues: errors, warnings }, null, 2));
      return;
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log('✅ deliverables check passed');
      return;
    }

    console.log(stringifyYaml({ passed: errors.length === 0, lifecycle_issues: errors, warnings }, { indent: 2 }));
    if (errors.length > 0) {
      throw new Error(`deliverables check failed: ${errors.length} error(s)`);
    }
    return;
  }

  // Fallback to old task-level template check
  const issues = await validateDeliverables(options.cwd);
  if (options.json) {
    console.log(JSON.stringify({ passed: issues.length === 0, issues }, null, 2));
    return;
  }
  if (issues.length === 0) {
    console.log('✅ deliverables check passed');
    return;
  }
  console.log(stringifyYaml({ passed: false, issues }, { indent: 2 }));
  throw new Error(`deliverables check failed: ${issues.length} issue(s)`);
}

async function initLifecycleAction(options: DeliverablesOptions): Promise<void> {
  const profileId = (options.profile || 'standard') as any;
  if (!['lightweight', 'standard', 'regulated'].includes(profileId)) {
    throw new Error(`Unsupported profile: ${profileId}. Expected lightweight | standard | regulated`);
  }

  const config = await initLifecycle(options.cwd, profileId);
  console.log(`✅ lifecycle profile initialized: ${profileId}`);
  console.log(`配置文件已写入: .docpath/lifecycle.yaml`);
  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
  }
}

async function statusLifecycleAction(options: DeliverablesOptions): Promise<void> {
  const config = await readLifecycleConfig(options.cwd);
  if (!config) {
    console.log('💡 项目生命周期配置不存在。使用 `docpath deliverables init --profile <regulated|standard|lightweight>` 进行初始化。');
    return;
  }

  const registry = await readLifecycleRegistry(options.cwd);
  
  if (options.json) {
    const statusList = [];
    for (const stage of config.stages) {
      const status = await getStageStatus(options.cwd, stage, registry);
      statusList.push({ ...stage, status });
    }
    console.log(JSON.stringify({ profile: config.profile, stages: statusList }, null, 2));
    return;
  }

  console.log(`\n📋 项目交付物状态视图 (Profile: ${config.profile})\n`);
  console.log(`  ${'阶段标识'.padEnd(25)} ${'交付物标题'.padEnd(20)} ${'交付物状态'.padEnd(12)} ${'交付物路径'}`);
  console.log(`  ${'-'.repeat(25)} ${'-'.repeat(20)} ${'-'.repeat(12)} ${'-'.repeat(30)}`);

  for (const stage of config.stages) {
    const status = await getStageStatus(options.cwd, stage, registry);
    let statusLabel = `[${status.toUpperCase()}]`;
    let color = '';
    const reset = '\x1b[0m';
    if (status === 'missing') {
      color = '\x1b[31m'; // Red
    } else if (status === 'draft') {
      color = '\x1b[33m'; // Yellow
    } else if (status === 'reviewed') {
      color = '\x1b[32m'; // Green
    } else {
      color = '\x1b[36m'; // Cyan
    }

    let warningSuffix = '';
    if (config.profile === 'regulated' && (!stage.sources || stage.sources.length === 0)) {
      warningSuffix = ' (sources not declared)';
    }

    console.log(`  ${stage.id.padEnd(25)} ${stage.title.padEnd(20)} ${color}${statusLabel.padEnd(12)}${reset} ${stage.artifact}${warningSuffix}`);
  }
  console.log('');
}

async function generateLifecycleAction(options: DeliverablesOptions): Promise<void> {
  const stageId = options.stage;
  if (!stageId) {
    throw new Error('docpath deliverables generate requires --stage <stage-id>');
  }

  const config = await readLifecycleConfig(options.cwd);
  if (!config) {
    throw new Error('Lifecycle config not found. Run docpath deliverables init first.');
  }

  const stage = config.stages.find(s => s.id === stageId || s.id.replace(/_/g, '-') === stageId);
  if (!stage) {
    throw new Error(`Stage "${stageId}" not found in current lifecycle.`);
  }

  if (options.dryRun) {
    const contract = generateStageContract(stage, config);
    console.log(JSON.stringify(contract, null, 2));
    return;
  }

  let content = '';
  if (options.stdin) {
    const { readStdin } = await import('../utils/stdin.js');
    content = await readStdin();
    if (!content.trim()) {
      throw new Error('docpath deliverables generate: stdin is empty');
    }
  } else {
    content = renderStageDefaultTemplate(stage);
  }

  const updatedStage = await writeStageContent(options.cwd, stageId, content);
  console.log(`✅ 交付物已写入: ${updatedStage.artifact}`);
}

export async function deliverablesCommand(options: DeliverablesOptions): Promise<void> {
  const action = options.action || 'list';
  if (!['list', 'render', 'check', 'init', 'status', 'generate'].includes(action)) {
    throw new Error(`Unsupported deliverables action: ${action}. Expected list | render | check | init | status | generate`);
  }
  if (action === 'list') return printTemplates(options.json);
  if (action === 'render') return renderTemplate(options);
  if (action === 'check') return checkDeliverables(options);
  if (action === 'init') return initLifecycleAction(options);
  if (action === 'status') return statusLifecycleAction(options);
  if (action === 'generate') return generateLifecycleAction(options);
}
