import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPortableGitEnv } from './portable-git-env.mjs';

describe('portable git env', () => {
  it('forces main, disables signing, and is idempotent', () => {
    const env = applyPortableGitEnv(applyPortableGitEnv({}));
    const keys = [];
    const count = Number(env.GIT_CONFIG_COUNT);
    for (let i = 0; i < count; i += 1) keys.push(`${env[`GIT_CONFIG_KEY_${i}`]}=${env[`GIT_CONFIG_VALUE_${i}`]}`);
    assert.deepEqual(keys, [
      'init.defaultBranch=main',
      'commit.gpgsign=false',
      'core.fsmonitor=false',
    ]);
  });

  it('git init without -b creates main and commit does not require a signer', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-portable-git-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
      const branch = execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf-8' }).trim();
      assert.equal(branch, 'main');
      const gpgsign = execFileSync('git', ['config', '--type=bool', '--get', 'commit.gpgsign'], { cwd, encoding: 'utf-8' }).trim();
      assert.equal(gpgsign, 'false');
      execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '--allow-empty', '-qm', 'init'], {
        cwd,
        stdio: 'ignore',
        timeout: 5000,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
