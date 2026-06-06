/**
 * docpath:status — 查看当前工作流状态
 */

import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildExpectedInstallAssets, type InstallAssetManifestEntry, type Target } from './install.js';
import { generateAgentOutput } from '../utils/agent-output.js';
import { readFileSafe, resolveDocpathDir } from '../utils/file.js';
import { getDocpathPackageVersion } from '../utils/package-info.js';
import { handleStalePendingDoneWarning, readPendingDone } from '../utils/pending-done.js';
import { readCurrentState, type CurrentState } from '../utils/workspace.js';

interface StatusOptions {
  cwd: string;
  agent?: boolean;
}

const LEVEL_NAMES: Record<string, string> = {
  '0': '即时响应',
  '1': '轻量任务',
  '2': '标准任务',
  '3': '复杂任务',
};

const INSTALL_TARGETS: Target[] = ['codex', 'claude', 'opencode', 'universal'];

function printMissingStateHint(): void {
  console.log('\n⚠️  未找到可解析的工作流状态');
  console.log('  请先运行 `docpath init` 初始化工作流，或检查 .docpath/workspace/state.json 是否存在');
  console.log('  其中 current.md 只是由 state.json 重建的渲染产物，二者应保持同步\n');
}

function printStateSummary(current: CurrentState, currentPath: string): void {
  const level = String(current.level ?? '?');
  const state = current.state || '?';
  const task = current.task_title || '(无活跃任务)';
  const phase = current.phase || '?';
  const gate = current.gate || 'none';

  console.log(`  级别:  Level ${level} — ${LEVEL_NAMES[level] || '未知'}`);
  console.log(`  状态:  ${state}`);
  console.log(`  阶段:  ${phase}`);
  console.log(`  门禁:  ${gate}`);
  console.log(`  任务:  ${task}`);
  console.log(`  状态真源:  .docpath/workspace/state.json`);
  console.log(`  渲染产物:  ${currentPath}`);
}

async function printPendingDoneWarning(cwd: string, current: CurrentState): Promise<void> {
  const pendingDone = await handleStalePendingDoneWarning(cwd, current, await readPendingDone(cwd));
  if (
    current.phase === 'executing' &&
    pendingDone &&
    pendingDone.task_id === current.task_id
  ) {
    console.log('\n  ⚠️  检测到当前任务存在未收尾哨兵');
    console.log(`     task_id: ${pendingDone.task_id}`);
    console.log(`     entered_at: ${pendingDone.entered_at}`);
    console.log('     建议先运行: docpath agent done');
  }
}

async function printBreadcrumbProgress(breadcrumbPath: string): Promise<void> {
  const breadcrumb = await readFileSafe(breadcrumbPath);
  if (breadcrumb && breadcrumb.includes('## 当前会话')) {
    const phaseMatch = breadcrumb.match(/当前 Phase:\s*(\w+)/);
    const subTaskMatch = breadcrumb.match(/当前子任务:\s*(.+)/);
    if (phaseMatch || subTaskMatch) {
      console.log(`\n  🍞  执行进度:`);
      if (phaseMatch) console.log(`     Phase: ${phaseMatch[1]}`);
      if (subTaskMatch) console.log(`     子任务: ${subTaskMatch[1]}`);
    }
  }
}

function printPhaseHint(phase: string): void {
  if (phase === 'completed') {
    console.log('\n  ✅  当前任务已完成，适合启动新 backlog 或归档知识。');
  } else if (phase === 'drafting') {
    console.log('\n  ℹ️  当前处于起草阶段，完成后应进入 plan / go。');
  } else if (phase === 'planning') {
    console.log('\n  ℹ️  当前处于计划阶段，完成后应进入 go。');
  } else if (phase === 'executing') {
    console.log('\n  ℹ️  当前处于执行阶段，请继续推进当前子任务。');
  }
}

async function printLinkedProject(cwd: string): Promise<void> {
  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const infoRaw = await readFileSafe(join(docpathDir, 'docpath.json'));
    if (infoRaw) {
      const info = JSON.parse(infoRaw);
      if (info.linkedTo) {
        const target = join(cwd, info.linkedTo);
        console.log(`  🔗  已关联: ${info.linkedTo} (${target})`);
      }
    }
  } catch {
    // 无关联项目或关联信息不可读时忽略。
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function isInstallTarget(value: unknown): value is Target {
  return typeof value === 'string' && INSTALL_TARGETS.includes(value as Target);
}

function assetKey(asset: Pick<InstallAssetManifestEntry, 'path' | 'source'>): string {
  return `${asset.path}\0${asset.source}`;
}

async function countLocalAssetDrift(
  cwd: string,
  installedAssets: InstallAssetManifestEntry[],
): Promise<{ missing: number; modified: number }> {
  let missing = 0;
  let modified = 0;

  for (const asset of installedAssets) {
    const localContent = await readFileSafe(join(cwd, asset.path));
    if (localContent === null) {
      missing++;
      continue;
    }
    if (sha256(localContent) !== asset.sha256) {
      modified++;
    }
  }

  return { missing, modified };
}

async function printInstallAssetDrift(cwd: string, meta: {
  target?: string;
  projectName?: string;
  assets?: InstallAssetManifestEntry[];
}): Promise<void> {
  if (!isInstallTarget(meta.target)) return;
  if (!Array.isArray(meta.assets) || meta.assets.length === 0) {
    console.log('  ⚠️  安装资产 manifest 缺失，建议重新运行: docpath install --target <target>');
    return;
  }

  const expectedAssets = await buildExpectedInstallAssets({
    target: meta.target,
    projectName: meta.projectName || cwd.split('/').at(-1) || 'project',
  });
  const installedByKey = new Map(meta.assets.map((asset) => [assetKey(asset), asset]));
  const templateDrift = expectedAssets.filter((expected) => {
    const installed = installedByKey.get(assetKey(expected));
    return !installed || installed.sha256 !== expected.sha256;
  });
  const localDrift = await countLocalAssetDrift(cwd, meta.assets);

  if (templateDrift.length === 0 && localDrift.missing === 0 && localDrift.modified === 0) return;

  console.log(`  ⚠️  安装资产 manifest 检测到漂移: 模板 ${templateDrift.length} 项, 缺失 ${localDrift.missing} 项, 本地改动 ${localDrift.modified} 项`);
  const sample = templateDrift.slice(0, 3).map((asset) => asset.path).join(', ');
  if (sample) console.log(`      模板漂移示例: ${sample}`);
  console.log(`      建议运行: docpath install --target ${meta.target}`);
}

async function printInstallMetadata(cwd: string): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const metaRaw = await readFileSafe(join(docpathDir, '.install-meta.json'));
  if (!metaRaw) return;

  try {
    const meta = JSON.parse(metaRaw) as {
      target?: string;
      docpathVersion?: string;
      installedAt?: string;
      projectName?: string;
      assets?: InstallAssetManifestEntry[];
    };
    const installedVersion = meta.docpathVersion || 'unknown';
    const currentVersion = await getDocpathPackageVersion();
    const target = meta.target ? `target=${meta.target}` : 'target=unknown';

    console.log(`  📦  安装资产: DocPath ${installedVersion} (${target})`);
    if (meta.installedAt) {
      console.log(`      安装时间: ${meta.installedAt}`);
    }
    if (currentVersion !== 'unknown' && installedVersion !== currentVersion) {
      console.log(`  ⚠️  当前 CLI 版本 ${currentVersion} 与安装资产版本 ${installedVersion} 不一致`);
      console.log('      建议运行: docpath install --target <target>');
    }
    await printInstallAssetDrift(cwd, meta);
  } catch {
    console.log('  ⚠️  .docpath/.install-meta.json 无法解析，建议重新运行: docpath install');
  }
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const cwd = options.cwd;
  if (options.agent) {
    console.log(await generateAgentOutput(cwd));
    return;
  }

  const currentPath = join(cwd, '.docpath/workspace/current.md');
  const breadcrumbPath = join(cwd, '.docpath/workspace/breadcrumb.md');

  const current = await readCurrentState(cwd);
  if (!current) {
    printMissingStateHint();
    return;
  }

  console.log('\n📊  DocPath 工作流状态\n');

  printStateSummary(current, currentPath);
  await printPendingDoneWarning(cwd, current);
  await printBreadcrumbProgress(breadcrumbPath);
  printPhaseHint(current.phase);
  await printLinkedProject(cwd);
  await printInstallMetadata(cwd);

  console.log('');
}
