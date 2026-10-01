/**
 * R-462: 仓库根协议文件 ↔ 模板母版 正文漂移检测门禁 回归测试。
 *
 * 用 DOCPATH_TEMPLATES_DIR 注入 fixture 模板目录，驱动 detectRepoProtocolDrift：
 *   - 模板独有的正文行（仓根缺）→ drift=true（fail-loud）；
 *   - 仓根独有的正文行（模板缺）→ extraInRepo（drift=false，仅提示）；
 *   - {{PROJECT_NAME}} 占位 vs 实际项目名 → 不误判；
 *   - `docpath:drift-exempt` 豁免标记 → 整文件跳过；
 *   - 无漂移时 hasDrift=false（不误报）。
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

const DEFAULT_TEMPLATES_DIR = process.env.DOCPATH_TEMPLATES_DIR;
let workbook = '';

const { detectRepoProtocolDrift, protocolBodyLines } = await import('../dist/utils/protocol-drift.js');

function writeTemplate(flavors) {
  for (const [name, content] of Object.entries(flavors)) {
    writeFileSync(join(workbook, 'templates', 'protocols', name), content);
  }
}

function writeRepo(repoDir, name, content) {
  writeFileSync(join(repoDir, name), content);
}

before(() => {
  workbook = mkdtempSync(join(tmpdir(), 'drifttest-'));
  mkdirSync(join(workbook, 'templates', 'protocols'), { recursive: true });
  process.env.DOCPATH_TEMPLATES_DIR = join(workbook, 'templates');
});

after(() => {
  if (DEFAULT_TEMPLATES_DIR === undefined) delete process.env.DOCPATH_TEMPLATES_DIR;
  else process.env.DOCPATH_TEMPLATES_DIR = DEFAULT_TEMPLATES_DIR;
  rmSync(workbook, { recursive: true, force: true });
});

function mkRepoDir() {
  const dir = join(workbook, 'repo');
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('protocolBodyLines 剔除 block 注入区与空行', () => {
  const content = [
    '# DocPath',
    '',
    '正文行 A.',
    '<!-- docpath:block demo -->',
    '共享块正文（应被剔除）',
    '<!-- /docpath:block -->',
    '正文行 B.',
    '',
  ].join('\n');
  const lines = protocolBodyLines(content, null);
  assert.deepEqual(lines, ['# DocPath', '正文行 A.', '正文行 B.']);
});

test('protocolBodyLines 替换 {{PROJECT_NAME}} 占位', () => {
  const lines = protocolBodyLines('Linked to: **{{PROJECT_NAME}}**', 'docpath');
  assert.deepEqual(lines, ['Linked to: **docpath**']);
});

test('无漂移（仓根==模板归一化）不误报', async () => {
  writeTemplate({
    'AGENTS.md':
      '# DocPath\nLinked to: **{{PROJECT_NAME}}**\n<!-- docpath:block w -->\nx\n<!-- /docpath:block -->\n正文A\n',
  });
  const repo = mkRepoDir();
  writeRepo(
    repo,
    'AGENTS.md',
    '# DocPath\nLinked to: **docpath**\n<!-- docpath:block w -->\nx\n<!-- /docpath:block -->\n正文A\n',
  );
  const report = await detectRepoProtocolDrift(repo, 'docpath');
  const entry = report.files.find((f) => f.file === 'AGENTS.md');
  assert.equal(report.hasDrift, false);
  assert.equal(entry?.drift, false);
  assert.equal(entry?.exempt, false);
});

test('模板新增正文行而仓根缺 → drift 命中且 must-fix', async () => {
  writeTemplate({ 'AGENTS.md': '正文A.\n新条款 X（R-460）。\n正文B。' });
  const repo = mkRepoDir();
  writeRepo(repo, 'AGENTS.md', '正文A.\n正文B。');
  const report = await detectRepoProtocolDrift(repo, 'docpath');
  const entry = report.files.find((f) => f.file === 'AGENTS.md');
  assert.equal(report.hasDrift, true);
  assert.equal(entry?.drift, true);
  assert.deepEqual(entry?.missingFromRepo, ['新条款 X（R-460）。']);
});

test('仓根独有正文行 → 提示且不阻断（drift=false）', async () => {
  writeTemplate({ 'AGENTS.md': '正文A\n' });
  const repo = mkRepoDir();
  writeRepo(repo, 'AGENTS.md', '正文A\n本地定制句。\n');
  const report = await detectRepoProtocolDrift(repo, 'docpath');
  const entry = report.files.find((f) => f.file === 'AGENTS.md');
  assert.equal(report.hasDrift, false);
  assert.equal(entry?.drift, false);
  assert.deepEqual(entry?.extraInRepo, ['本地定制句。']);
});

test('豁免标记整文件跳过', async () => {
  writeTemplate({ 'AGENTS.md': '正文A\n新条款X。\n' });
  const repo = mkRepoDir();
  writeRepo(repo, 'AGENTS.md', '<!-- docpath:drift-exempt -->\n正文A\n');
  const report = await detectRepoProtocolDrift(repo, 'docpath');
  const entry = report.files.find((f) => f.file === 'AGENTS.md');
  assert.equal(entry?.exempt, true);
  assert.equal(entry?.drift, false);
  assert.equal(report.hasDrift, false);
});

test('仓库根含 block 区但模板一致 → 不误报（block 由 R-300 治理）', async () => {
  writeTemplate({ 'AGENTS.md': '标题\n<!-- docpath:block w -->\n块内容\n<!-- /docpath:block -->\n正文A\n' });
  const repo = mkRepoDir();
  writeRepo(
    repo,
    'AGENTS.md',
    '标题\n<!-- docpath:block w -->\n块内容（仓根块被本地改过）\n<!-- /docpath:block -->\n正文A\n',
  );
  // block 区被剔除，只比正文；标题/正文一致 → 无漂移
  const report = await detectRepoProtocolDrift(repo, 'docpath');
  const entry = report.files.find((f) => f.file === 'AGENTS.md');
  assert.equal(entry?.drift, false);
});

test('未安装 flavor（模板无文件）跳过', async () => {
  writeTemplate({ 'AGENTS.md': 'X\n' });
  const repo = mkRepoDir();
  writeRepo(repo, 'AGENTS.md', 'X\n');
  const report = await detectRepoProtocolDrift(repo, 'docpath');
  const codex = report.files.find((f) => f.file === 'CODEX.md');
  // 模板没 CODEX.md → resolveTemplate 抛错前 exists 守卫已跳过：files 里不含它
  assert.equal(codex, undefined);
});