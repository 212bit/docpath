import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

const {
  MergeDriverConflict,
  resolveDocpathMerge,
} = await import(new URL('../dist/utils/merge-driver.js', import.meta.url).href);

function backlog(rows) {
  return [
    '# Backlog',
    '',
    '| id | title | status | priority | level | task |',
    '|----|-------|--------|----------|-------|------|',
    ...rows,
    '',
  ].join('\n');
}

describe('DocPath merge driver resolver', () => {
  it('uses the changed backlog row when only one side changed it', () => {
    const ancestor = backlog(['| R-001 | First | proposed | P2 | 1 |  |']);
    const current = backlog(['| R-001 | First | accepted | P2 | 1 |  |']);
    const other = ancestor;

    const result = resolveDocpathMerge({
      ancestor,
      current,
      other,
      path: '.docpath/backlog/backlog.md',
    });

    assert.match(result.content, /\| R-001 \| First \| accepted \| P2 \| 1 \|  \|/);
    assert.equal(result.strategy, 'backlog-index');
  });

  it('merges independent concurrent backlog row additions', () => {
    const ancestor = backlog(['| R-001 | First | proposed | P2 | 1 |  |']);
    const current = backlog([
      '| R-001 | First | proposed | P2 | 1 |  |',
      '| R-002 | Current | proposed | P2 | 1 |  |',
    ]);
    const other = backlog([
      '| R-001 | First | proposed | P2 | 1 |  |',
      '| R-003 | Other | proposed | P2 | 1 |  |',
    ]);

    const result = resolveDocpathMerge({
      ancestor,
      current,
      other,
      path: '.docpath/backlog/backlog.md',
    });

    assert.match(result.content, /\| R-001 \| First/);
    assert.match(result.content, /\| R-002 \| Current/);
    assert.match(result.content, /\| R-003 \| Other/);
  });

  it('fails loud on divergent edits to the same backlog row', () => {
    const ancestor = backlog(['| R-001 | First | proposed | P2 | 1 |  |']);
    const current = backlog(['| R-001 | First | accepted | P2 | 1 |  |']);
    const other = backlog(['| R-001 | First | dropped | P2 | 1 |  |']);

    assert.throws(
      () => resolveDocpathMerge({ ancestor, current, other, path: '.docpath/backlog/backlog.md' }),
      MergeDriverConflict,
    );
  });

  it('merges independent insertion-only rules edits', () => {
    const ancestor = '# Rules\n\n## Context\n- Start\n';
    const current = '# Rules\n\n## Context\n- Start\n- Current addition\n';
    const other = '# Rules\n\n## Context\n- Start\n- Other addition\n';

    const result = resolveDocpathMerge({
      ancestor,
      current,
      other,
      path: '.docpath/rules/style.md',
    });

    assert.match(result.content, /- Current addition/);
    assert.match(result.content, /- Other addition/);
    assert.equal(result.strategy, 'markdown-insertions');
  });

  it('fails loud on divergent rules edits outside insertion-only regions', () => {
    const ancestor = '# Rules\n\n- Keep output concise\n';
    const current = '# Rules\n\n- Keep output very concise\n';
    const other = '# Rules\n\n- Keep output detailed\n';

    assert.throws(
      () => resolveDocpathMerge({ ancestor, current, other, path: '.docpath/rules/style.md' }),
      MergeDriverConflict,
    );
  });

  it('CLI merge-driver writes the resolved content to the current file', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-merge-driver-'));
    const ancestorPath = join(cwd, 'ancestor.md');
    const currentPath = join(cwd, 'current.md');
    const otherPath = join(cwd, 'other.md');
    const ancestor = backlog(['| R-001 | First | proposed | P2 | 1 |  |']);
    const current = backlog(['| R-001 | First | accepted | P2 | 1 |  |']);

    writeFileSync(ancestorPath, ancestor);
    writeFileSync(currentPath, current);
    writeFileSync(otherPath, ancestor);

    execFileSync(process.execPath, [
      BIN,
      'merge-driver',
      ancestorPath,
      currentPath,
      otherPath,
      '.docpath/backlog/backlog.md',
    ], { cwd, encoding: 'utf-8' });

    assert.match(readFileSync(currentPath, 'utf-8'), /\| R-001 \| First \| accepted \| P2 \| 1 \|  \|/);
    rmSync(cwd, { recursive: true, force: true });
  });
});
