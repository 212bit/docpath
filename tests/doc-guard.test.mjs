import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  installDocGuardHook,
  getStagedFiles,
  diagnoseDocumentHealth,
  runDocGuard,
} from '../dist/utils/docs-doctor.js';

test('installDocGuardHook creates and updates .git/hooks/pre-commit correctly', async () => {
  const tempDir = join(tmpdir(), `docpath-guard-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  await mkdir(join(tempDir, '.docpath', 'workspace'), { recursive: true });

  // 1. When not a git repo
  const failRes = await installDocGuardHook(tempDir);
  assert.equal(failRes.success, false);

  // 2. Initialize git repo
  execSync('git init', { cwd: tempDir, stdio: 'ignore' });
  const successRes = await installDocGuardHook(tempDir);
  assert.equal(successRes.success, true);
  const hookFile = join(tempDir, '.git', 'hooks', 'pre-commit');
  assert.ok(existsSync(hookFile));
  const content = await readFile(hookFile, 'utf-8');
  assert.ok(content.includes('docpath doc guard --staged'));

  // Verify executable permission
  const stat = statSync(hookFile);
  assert.ok((stat.mode & 0o111) !== 0, 'pre-commit hook must be executable');

  // 3. Second run should be idempotent
  const idempRes = await installDocGuardHook(tempDir);
  assert.equal(idempRes.success, true);
  const content2 = await readFile(hookFile, 'utf-8');
  assert.equal(content2, content);

  await rm(tempDir, { recursive: true, force: true });
});

test('getStagedFiles and stagedOnly diagnoseDocumentHealth fast path', async () => {
  const tempDir = join(tmpdir(), `docpath-staged-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  await mkdir(join(tempDir, '.docpath', 'workspace'), { recursive: true });
  await mkdir(join(tempDir, 'docs'), { recursive: true });
  await mkdir(join(tempDir, 'src'), { recursive: true });

  execSync('git init', { cwd: tempDir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });

  // Create a code file and stage it
  await writeFile(join(tempDir, 'src', 'index.ts'), 'export const a = 1;', 'utf-8');
  execSync('git add src/index.ts', { cwd: tempDir, stdio: 'ignore' });

  // Create a doc file but do NOT stage it yet (and has an issue)
  await writeFile(join(tempDir, 'docs', 'broken.md'), '# Broken\n[Dead](./not-found.md)', 'utf-8');

  // getStagedFiles should only contain src/index.ts
  const staged = await getStagedFiles(tempDir);
  assert.deepEqual(staged, ['src/index.ts']);

  // stagedOnly health check: should return immediately with 0 scanned files (< 10ms)
  const reportStagedOnly = await diagnoseDocumentHealth(tempDir, { stagedOnly: true });
  assert.equal(reportStagedOnly.scannedCount, 0);
  assert.equal(reportStagedOnly.healthy, true);

  // When we stage the broken doc
  execSync('git add docs/broken.md', { cwd: tempDir, stdio: 'ignore' });
  const staged2 = await getStagedFiles(tempDir);
  assert.ok(staged2.includes('docs/broken.md'));

  const reportStagedWithDoc = await diagnoseDocumentHealth(tempDir, { stagedOnly: true });
  assert.equal(reportStagedWithDoc.scannedCount, 1);
  assert.equal(reportStagedWithDoc.healthy, false);
  assert.ok(reportStagedWithDoc.issues.some((i) => i.type === 'broken-link'));

  await rm(tempDir, { recursive: true, force: true });
});

test('runDocGuard blocks on fatal issues and auto-heals with re-staging when fix is true', async () => {
  const tempDir = join(tmpdir(), `docpath-run-guard-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  await mkdir(join(tempDir, '.docpath', 'workspace'), { recursive: true });
  await mkdir(join(tempDir, 'docs'), { recursive: true });
  await mkdir(join(tempDir, 'src'), { recursive: true });

  execSync('git init', { cwd: tempDir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });

  // Target doc file exists
  await writeFile(join(tempDir, 'docs', 'guide.md'), '# User Guide\n\nWelcome.', 'utf-8');
  // Source doc with dead link that can be auto-healed (fuzzily matching guide.md)
  await writeFile(join(tempDir, 'docs', 'readme.md'), '# Main\n\nSee [Guide](./guides.md)', 'utf-8');

  execSync('git add docs/guide.md docs/readme.md', { cwd: tempDir, stdio: 'ignore' });

  // 1. Guard check should block
  const guardRes = await runDocGuard(tempDir, { staged: true, fix: false });
  assert.equal(guardRes.passed, false);
  assert.equal(guardRes.blockingCount, 1);
  assert.equal(guardRes.blockingIssues[0].type, 'broken-link');

  // 2. Guard with fix: true should auto-heal and re-stage
  const fixGuardRes = await runDocGuard(tempDir, { staged: true, fix: true });
  assert.equal(fixGuardRes.passed, true);
  assert.ok(fixGuardRes.repairedCount >= 1);

  // Check that the file content was fixed
  const fixedContent = await readFile(join(tempDir, 'docs', 'readme.md'), 'utf-8');
  assert.ok(fixedContent.includes('[Guide](./guide.md)'));

  // Check git status to confirm docs/readme.md is staged with the fix
  const diffStaged = execSync('git diff --cached docs/readme.md', { cwd: tempDir, encoding: 'utf-8' });
  assert.ok(diffStaged.includes('+See [Guide](./guide.md)'));

  await rm(tempDir, { recursive: true, force: true });
});

test('CLI doc guard and hook options execution', async () => {
  const BIN = new URL('../dist/index.js', import.meta.url).pathname;
  const tempDir = join(tmpdir(), `docpath-cli-guard-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  await mkdir(join(tempDir, '.docpath', 'workspace'), { recursive: true });
  execSync('git init', { cwd: tempDir, stdio: 'ignore' });

  // Test --install via CLI
  const installOutput = execSync(`node "${BIN}" doc guard --install --cwd "${tempDir}"`, {
    encoding: 'utf-8',
  });
  assert.ok(installOutput.includes('.git/hooks/pre-commit'));

  // Test --staged fast pass on clean staged repo (silent or 0 exit)
  const cleanOutput = execSync(`node "${BIN}" doc guard --staged --cwd "${tempDir}"`, {
    encoding: 'utf-8',
  });
  assert.equal(cleanOutput.trim(), '');

  // Test --staged with JSON output
  const jsonOutput = execSync(`node "${BIN}" doc guard --staged --json --cwd "${tempDir}"`, {
    encoding: 'utf-8',
  });
  const parsedJson = JSON.parse(jsonOutput);
  assert.equal(parsedJson.passed, true);
  assert.equal(parsedJson.staged, true);
  assert.equal(parsedJson.scannedCount, 0);

  await rm(tempDir, { recursive: true, force: true });
});
