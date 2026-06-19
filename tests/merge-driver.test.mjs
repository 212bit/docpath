import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

function run(args, { expectFailure = false } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    timeout: 30000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (!expectFailure && result.status !== 0) {
    throw new Error(`command failed (${result.status}): docpath ${args.join(' ')}\n${output}`);
  }
  if (expectFailure && result.status === 0) {
    throw new Error(`command unexpectedly succeeded: docpath ${args.join(' ')}\n${output}`);
  }
  return { ...result, output };
}

describe('merge-driver command', () => {
  it('resolves backlog.md table conflicts correctly (status promotion, sorting, and union)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dp-merge-backlog-'));
    const ancestorPath = join(tmp, 'ancestor.md');
    const currentPath = join(tmp, 'current.md');
    const otherPath = join(tmp, 'other.md');

    const ancestor = [
      '# DocPath Backlog Index',
      '',
      '## 条目列表',
      '',
      '| id | title | status | priority | level | task |',
      '|----|-------|--------|----------|-------|------|',
      '| R-214 | task 214 | proposed | P2 | 1 |  |',
      '',
    ].join('\n');

    const current = [
      '# DocPath Backlog Index',
      '',
      '## 条目列表',
      '',
      '| id | title | status | priority | level | task |',
      '|----|-------|--------|----------|-------|------|',
      '| R-214 | task 214 | active | P2 | 1 | T-20260619-214 |',
      '| R-215 | task 215 | proposed | P1 | 2 |  |',
      '',
    ].join('\n');

    const other = [
      '# DocPath Backlog Index',
      '',
      '## 条目列表',
      '',
      '| id | title | status | priority | level | task |',
      '|----|-------|--------|----------|-------|------|',
      '| R-214 | task 214 | done | P2 | 1 | T-20260619-214 |',
      '| R-216 | task 216 | accepted | P2 | 1 |  |',
      '',
    ].join('\n');

    writeFileSync(ancestorPath, ancestor, 'utf-8');
    writeFileSync(currentPath, current, 'utf-8');
    writeFileSync(otherPath, other, 'utf-8');

    run([
      'merge-driver',
      '--ancestor', ancestorPath,
      '--current', currentPath,
      '--other', otherPath,
      '--path', '.docpath/backlog/backlog.md',
    ]);

    const result = readFileSync(currentPath, 'utf-8');
    assert.match(result, /R-214 \| task 214 \| done \| P2 \| 1 \| T-20260619-214/);
    assert.match(result, /R-215 \| task 215 \| proposed \| P1 \| 2 \|/);
    assert.match(result, /R-216 \| task 216 \| accepted \| P2 \| 1 \|/);

    // Verify sorting: P1 (R-215) should be listed before P2 (R-214, R-216)
    const lines = result.split('\n');
    const tableLines = lines.filter(l => l.trim().startsWith('|') && !l.includes('id') && !l.includes('----'));
    assert.equal(tableLines.length, 3);
    assert.match(tableLines[0], /R-215/);
    assert.match(tableLines[1], /R-214/);
    assert.match(tableLines[2], /R-216/);

    rmSync(tmp, { recursive: true, force: true });
  });

  it('resolves markdown list conflicts in rules files', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dp-merge-rules-'));
    const ancestorPath = join(tmp, 'ancestor.md');
    const currentPath = join(tmp, 'current.md');
    const otherPath = join(tmp, 'other.md');

    const ancestor = [
      '# Style Rules',
      '',
      '- rule 1',
      '',
    ].join('\n');

    // Make Ours and Theirs conflict on rule addition
    const current = [
      '# Style Rules',
      '',
      '- rule 1',
      '- rule 2',
      '',
    ].join('\n');

    const other = [
      '# Style Rules',
      '',
      '- rule 1',
      '- rule 3',
      '',
    ].join('\n');

    writeFileSync(ancestorPath, ancestor, 'utf-8');
    writeFileSync(currentPath, current, 'utf-8');
    writeFileSync(otherPath, other, 'utf-8');

    run([
      'merge-driver',
      '--ancestor', ancestorPath,
      '--current', currentPath,
      '--other', otherPath,
      '--path', '.docpath/rules/style.md',
    ]);

    const result = readFileSync(currentPath, 'utf-8');
    assert.match(result, /- rule 1/);
    assert.match(result, /- rule 2/);
    assert.match(result, /- rule 3/);

    rmSync(tmp, { recursive: true, force: true });
  });

  it('falls back to conflict markers and exits 1 on unresolvable conflicts', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dp-merge-fallback-'));
    const ancestorPath = join(tmp, 'ancestor.md');
    const currentPath = join(tmp, 'current.md');
    const otherPath = join(tmp, 'other.md');

    const ancestor = 'hello world\n';
    const current = 'hello from ours\n';
    const other = 'hello from theirs\n';

    writeFileSync(ancestorPath, ancestor, 'utf-8');
    writeFileSync(currentPath, current, 'utf-8');
    writeFileSync(otherPath, other, 'utf-8');

    const res = run([
      'merge-driver',
      '--ancestor', ancestorPath,
      '--current', currentPath,
      '--other', otherPath,
      '--path', 'README.md',
    ], { expectFailure: true });

    assert.equal(res.status, 1);
    const content = readFileSync(currentPath, 'utf-8');
    assert.match(content, /<<<<<<<|=======|>>>>>>>/);

    rmSync(tmp, { recursive: true, force: true });
  });
});
