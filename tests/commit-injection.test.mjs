import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 20000 });
}

function mkRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-commit-'));
  mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
  writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: commit-test\n');
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  // a staged change so commit has something to record
  writeFileSync(join(cwd, 'file.txt'), 'hello\n');
  git(cwd, ['add', 'file.txt']);
  return cwd;
}

function dp(cwd, args) {
  // array form: the message reaches the CLI verbatim, no shell on the test side
  return execFileSync(process.execPath, [BIN, ...args, '--cwd', cwd], {
    cwd,
    encoding: 'utf-8',
    timeout: 20000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('docpath commit — shell injection guard', () => {
  it('treats a $(...) command-substitution payload as a literal commit message', () => {
    const cwd = mkRepo();
    const marker = join(cwd, 'PWNED');
    // If the message were interpolated into a shell, $(touch PWNED) would run.
    const payload = `chore: legit$(touch ${marker})`;

    dp(cwd, ['commit', '--stage', '-m', payload]);

    // 1) the side-effect file must NOT exist — proves no shell executed the payload
    assert.equal(existsSync(marker), false, 'command substitution executed — injection!');

    // 2) the commit subject must contain the payload verbatim
    const subject = git(cwd, ['log', '-1', '--pretty=%s']).trim();
    assert.match(subject, /chore: legit\$\(touch /, 'payload not preserved literally');
  });

  it('handles backtick payloads literally too', () => {
    const cwd = mkRepo();
    const marker = join(cwd, 'PWNED_BT');
    const payload = 'fix: `touch ' + marker + '`';

    dp(cwd, ['commit', '--stage', '-m', payload]);

    assert.equal(existsSync(marker), false, 'backtick substitution executed — injection!');
  });
});
