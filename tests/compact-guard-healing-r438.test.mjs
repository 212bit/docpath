import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { detectDirtyWorktree } from '../dist/utils/git-dirty-guard.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('Compact Dirty Guard & Step-Pass Auto-Heal (R-438)', () => {
  it('outputs compact 3-line error message when dirty worktree prevents new task', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-compact-guard-'));
    try {
      execSync('git init', { cwd, stdio: 'ignore' });
      writeFileSync(join(cwd, 'test.txt'), 'dirty content\n');

      let errorOutput = '';
      try {
        execSync(`node "${BIN}" start "New feature" --draft --cwd "${cwd}"`, {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        errorOutput = err.stderr || err.stdout || '';
      }

      assert.match(errorOutput, /拒绝在 dirty worktree 上启动新任务/);
      assert.match(errorOutput, /docpath start <id> --draft --adopt/);
      assert.match(errorOutput, /docpath task stash/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('auto-aligns empty current_step in step-pass to the single pending step during executing phase', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dp-step-heal-'));
    try {
      execSync(`node "${BIN}" init --cwd "${cwd}"`, { stdio: 'ignore' });
      execSync(`node "${BIN}" start "单模块功能开发" --draft --cwd "${cwd}"`, {
        stdio: 'ignore',
      });

      // Clear current_step in state.json (e.g. after interrupt)
      const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      state.current_step = '';
      writeFileSync(statePath, JSON.stringify(state, null, 2));

      // Run step-pass without explicit --step (should auto-align to S1)
      const passOutput = execSync(`node "${BIN}" step-pass --cwd "${cwd}"`, {
        encoding: 'utf-8',
      });

      assert.match(passOutput, /自动对齐唯一待完成步骤 -> S1/);
      assert.match(passOutput, /step-pass: S1 已完成/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
