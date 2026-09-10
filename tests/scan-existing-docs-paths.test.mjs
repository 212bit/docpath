import './registry-isolation.mjs';
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

let configUtils;
before(async () => {
  configUtils = await import('../dist/utils/config.js');
});

function run(args, cwd) {
  return execSync(`node ${BIN} ${args}`, { cwd, encoding: 'utf-8', timeout: 30000 });
}

/** 最小 .docpath 工作区（内部含 rules/style.md 一个可索引文档） */
function mkWorkspace(configYaml = 'project:\n  name: scan-paths-test\n') {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-scanpaths-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(join(dp, 'rules'), { recursive: true });
  mkdirSync(join(dp, 'workspace'), { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), configYaml);
  writeFileSync(join(dp, 'rules', 'style.md'), '# Style\n\nInternal style rule doc.\n');
  return cwd;
}

function readIndexPaths(cwd) {
  const raw = readFileSync(join(cwd, '.docpath', 'docs-index.json'), 'utf-8');
  return JSON.parse(raw).entries.map((entry) => entry.path);
}

describe('readDeclaredDocumentScanPaths (S7 unit / FR-5 原始语义)', () => {
  it('returns raw declared list from config.yaml, not merged defaults', async () => {
    const cwd = mkWorkspace('project:\n  name: t\ndocument_scan_paths:\n  - "wiki/"\n');
    try {
      assert.deepEqual(await configUtils.readDeclaredDocumentScanPaths(cwd), ['wiki/']);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('returns null when field is absent or empty (NFR-1 现状行为开关)', async () => {
    const absent = mkWorkspace();
    const empty = mkWorkspace('project:\n  name: t\ndocument_scan_paths: []\n');
    try {
      assert.equal(await configUtils.readDeclaredDocumentScanPaths(absent), null);
      assert.equal(await configUtils.readDeclaredDocumentScanPaths(empty), null);
    } finally {
      rmSync(absent, { recursive: true, force: true });
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('falls back to config.json declaration when yaml has no field', async () => {
    const cwd = mkWorkspace();
    try {
      writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({ document_scan_paths: ['notes/'] }));
      assert.deepEqual(await configUtils.readDeclaredDocumentScanPaths(cwd), ['notes/']);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});

describe('docs scan document_scan_paths (S7 / FR-5 / AC-5)', () => {
  it('no field → scans only .docpath/, external README/docs stay out (NFR-1)', () => {
    const cwd = mkWorkspace();
    try {
      writeFileSync(join(cwd, 'README.md'), '# Demo\n\nRoot readme.\n');
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      writeFileSync(join(cwd, 'docs', 'guide.md'), '# Guide\n\nExternal guide.\n');

      const out = run('docs scan', cwd);
      const paths = readIndexPaths(cwd);
      assert.ok(paths.includes('rules/style.md'));
      assert.ok(!paths.includes('README.md'), 'external README must stay out without the field');
      assert.ok(!paths.some((p) => p.startsWith('docs/')), 'external docs/ must stay out without the field');
      assert.ok(!out.includes('外部文档'), 'no external-scan output line without the field');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('declared paths → external README/docs enter index, §4.d noise excluded', () => {
    const cwd = mkWorkspace([
      'project:',
      '  name: t',
      'document_scan_paths:',
      '  - ".docpath/"',
      '  - "README.md"',
      '  - "docs/"',
      '  - "../outside-root"',
      '',
    ].join('\n'));
    try {
      execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
      writeFileSync(join(cwd, '.gitignore'), 'docs/draft.md\n');
      writeFileSync(join(cwd, 'README.md'), '# Demo\n\nRoot readme.\n');
      mkdirSync(join(cwd, 'docs', 'node_modules'), { recursive: true });
      writeFileSync(join(cwd, 'docs', 'guide.md'), '# Guide\n\nExternal guide.\n');
      writeFileSync(join(cwd, 'docs', 'draft.md'), '# Draft\n\nGitignored draft.\n');
      writeFileSync(join(cwd, 'docs', 'node_modules', 'noise.md'), '# Noise\n\nBlocklisted.\n');
      writeFileSync(join(cwd, 'not-declared.md'), '# Undeclared\n\nMust stay out.\n');

      const out = run('docs scan', cwd);
      const paths = readIndexPaths(cwd);
      assert.ok(paths.includes('rules/style.md'), 'internal docs still indexed');
      assert.ok(paths.includes('README.md'), 'declared README.md enters index');
      assert.ok(paths.includes('docs/guide.md'), 'declared docs/ dir scanned recursively');
      assert.ok(!paths.includes('docs/draft.md'), '.gitignore-excluded file stays out (§4.d)');
      assert.ok(!paths.some((p) => p.includes('node_modules')), 'hard blocklist excludes node_modules (§4.d)');
      assert.ok(!paths.includes('not-declared.md'), 'undeclared root files stay out');
      assert.match(out, /外部文档: 2 个/);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('declared-but-missing paths are skipped silently, scan still succeeds', () => {
    const cwd = mkWorkspace('project:\n  name: t\ndocument_scan_paths:\n  - "README.md"\n  - "docs/"\n');
    try {
      const out = run('docs scan', cwd);
      const paths = readIndexPaths(cwd);
      assert.ok(paths.includes('rules/style.md'));
      assert.match(out, /外部文档: 0 个/);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('external path colliding with internal normalized path is skipped (internal wins)', () => {
    const cwd = mkWorkspace('project:\n  name: t\ndocument_scan_paths:\n  - "README.md"\n');
    try {
      // .docpath/README.md normalize 后同为 README.md → 外部同名文件让位
      writeFileSync(join(cwd, '.docpath', 'README.md'), '# Internal readme\n\nInternal wins.\n');
      writeFileSync(join(cwd, 'README.md'), '# External readme\n\nExternal loses.\n');

      run('docs scan', cwd);
      const raw = JSON.parse(readFileSync(join(cwd, '.docpath', 'docs-index.json'), 'utf-8'));
      const readmes = raw.entries.filter((entry) => entry.path === 'README.md');
      assert.equal(readmes.length, 1, 'no duplicate README.md paths in index');
      assert.equal(readmes[0].title, 'Internal readme');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('E2E: init --scan-existing then docs scan indexes external README/docs (AC-5)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-scanpaths-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'jest' } }));
      writeFileSync(join(cwd, 'README.md'), '# Demo\n\nRoot readme.\n');
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      writeFileSync(join(cwd, 'docs', 'guide.md'), '# Guide\n\nExternal guide.\n');
      mkdirSync(join(cwd, 'src'), { recursive: true });

      execFileSync(process.execPath, [BIN, 'init', '--cwd', cwd, '--scan-existing', '--level', '1'], { stdio: 'ignore' });
      run('docs scan', cwd);

      const paths = readIndexPaths(cwd);
      assert.ok(paths.includes('README.md'), 'init-declared README.md indexed');
      assert.ok(paths.includes('docs/guide.md'), 'init-declared docs/ indexed');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
