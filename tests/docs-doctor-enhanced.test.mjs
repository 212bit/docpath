import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  computeSimilarity,
  extractExportedSymbols,
  diagnoseDocumentHealth,
  fixDocumentHealth,
} from '../dist/utils/docs-doctor.js';

test('computeSimilarity calculates Levenshtein similarity correctly', () => {
  assert.equal(computeSimilarity('same', 'same'), 1);
  assert.equal(computeSimilarity('Case', 'case'), 0.95);
  assert.ok(computeSimilarity('myFunction', 'myFunctionOld') >= 0.7);
  assert.ok(computeSimilarity('readFileSafe', 'readFileSafeOld') >= 0.7);
  assert.ok(computeSimilarity('abc', 'xyz') < 0.2);
});

test('extractExportedSymbols parses various export patterns', () => {
  const code = `
export function doSomething() {}
export async function fetchRemoteData() {}
export class EngineRunner {}
export interface ConfigOptions {}
export type TaskState = 'idle' | 'running';
export const DEFAULT_TIMEOUT = 5000;
export let globalCounter = 0;
export { a, b as customAlias };
function privateHelper() {}
`;
  const symbols = extractExportedSymbols(code);
  assert.ok(symbols.has('doSomething'));
  assert.ok(symbols.has('fetchRemoteData'));
  assert.ok(symbols.has('EngineRunner'));
  assert.ok(symbols.has('ConfigOptions'));
  assert.ok(symbols.has('TaskState'));
  assert.ok(symbols.has('DEFAULT_TIMEOUT'));
  assert.ok(symbols.has('globalCounter'));
  assert.ok(symbols.has('a'));
  assert.ok(symbols.has('customAlias'));
  assert.ok(!symbols.has('privateHelper'));
});

test('diagnoseDocumentHealth and fixDocumentHealth handles symbol drift and fuzzy dead links', async () => {
  const tempDir = join(tmpdir(), `docpath-doctor-test-${Date.now()}`);
  await mkdir(join(tempDir, '.docpath', 'workspace'), { recursive: true });
  await mkdir(join(tempDir, 'docs'), { recursive: true });
  await mkdir(join(tempDir, 'src', 'utils'), { recursive: true });

  // 1. Create a source file with exports
  await writeFile(
    join(tempDir, 'src', 'utils', 'helper.ts'),
    `export function calculateScore() { return 100; }\nexport const MAX_RETRY_COUNT = 3;`,
    'utf-8',
  );

  // 2. Create another target markdown file
  await writeFile(
    join(tempDir, 'docs', 'guide-renamed.md'),
    `# Renamed Guide\n\nSome content here.`,
    'utf-8',
  );

  // 3. Create a doc with:
  // - symbol drift: [`calculateScores`](../src/utils/helper.ts) -> should suggest calculateScore
  // - inline symbol drift: `src/utils/helper.ts:MAX_RETRY_COUNTS` -> should suggest `src/utils/helper.ts:MAX_RETRY_COUNT`
  // - fuzzy dead link: [Old Guide](./guide-renamed-old.md) -> should suggest ./guide-renamed.md
  // - archive candidate: has status: deprecated
  await writeFile(
    join(tempDir, 'docs', 'feature.md'),
    `# Feature Guide

See [\`calculateScores\`](../src/utils/helper.ts) for details.
Also check \`src/utils/helper.ts:MAX_RETRY_COUNTS\`.
Refer to [Old Guide](./guide-renamed-old.md).
`,
    'utf-8',
  );

  await writeFile(
    join(tempDir, 'docs', 'deprecated-feature.md'),
    `---
status: deprecated
---
# Old Deprecated Feature

> **Deprecated**: This feature is no longer supported.
`,
    'utf-8',
  );

  // Diagnose
  const report = await diagnoseDocumentHealth(tempDir);

  const symbolDriftIssues = report.issues.filter((i) => i.type === 'symbol-drift');
  assert.equal(symbolDriftIssues.length, 2);
  assert.ok(symbolDriftIssues.some((i) => i.linkData?.suggestedTarget === 'calculateScore'));
  assert.ok(symbolDriftIssues.some((i) => i.linkData?.suggestedTarget === '`src/utils/helper.ts:MAX_RETRY_COUNT`'));

  const brokenLinkIssues = report.issues.filter((i) => i.type === 'broken-link');
  assert.equal(brokenLinkIssues.length, 1);
  assert.equal(brokenLinkIssues[0].autoFixable, true);
  assert.equal(brokenLinkIssues[0].linkData?.suggestedTarget, './guide-renamed.md');

  const archiveIssues = report.issues.filter((i) => i.type === 'archive-candidate');
  assert.equal(archiveIssues.length, 1);
  assert.equal(archiveIssues[0].file, 'docs/deprecated-feature.md');

  // Fix
  const fixResult = await fixDocumentHealth(tempDir);
  assert.ok(fixResult.fixedCount >= 3);

  // Verify repaired content
  const fixedContent = await (await import('node:fs/promises')).readFile(join(tempDir, 'docs', 'feature.md'), 'utf-8');
  assert.ok(fixedContent.includes('[`calculateScore`](../src/utils/helper.ts)'));
  assert.ok(fixedContent.includes('`src/utils/helper.ts:MAX_RETRY_COUNT`'));
  assert.ok(fixedContent.includes('(./guide-renamed.md)'));

  // Clean up
  await rm(tempDir, { recursive: true, force: true });
});
