import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveCoAuthor } from '../dist/utils/agent-coauthor.js';
import { detectAgent } from '../dist/utils/trace.js';

function mkWorkspace(configYaml = 'project:\n  name: coauthor-test\n') {
  const cwd = mkdtempSync(join(tmpdir(), 'dp-coauthor-'));
  const dp = join(cwd, '.docpath');
  mkdirSync(dp, { recursive: true });
  writeFileSync(join(dp, 'config.yaml'), configYaml);
  return cwd;
}

describe('agent co-author dynamic resolution & runtime adaptation', () => {
  it('disables co-author when git.co_author: false in config.yaml', async () => {
    const cwd = mkWorkspace('project:\n  name: coauthor-test\ngit:\n  co_author: false\n');
    try {
      const res = await resolveCoAuthor(cwd);
      assert.equal(res.enabled, false);
      assert.equal(res.trailer, null);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('uses custom co-author when git.co_author is a string', async () => {
    const cwd = mkWorkspace('project:\n  name: coauthor-test\ngit:\n  co_author: "Pair Programmer <pair@example.com>"\n');
    try {
      const res = await resolveCoAuthor(cwd);
      assert.equal(res.enabled, true);
      assert.equal(res.trailer, 'Co-Authored-By: Pair Programmer <pair@example.com>');
      assert.equal(res.agentName, 'Custom Agent');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('disables co-author when GIT_CO_AUTHOR env is false or none', async () => {
    const cwd = mkWorkspace();
    const oldEnv = process.env.GIT_CO_AUTHOR;
    try {
      process.env.GIT_CO_AUTHOR = 'none';
      const res = await resolveCoAuthor(cwd);
      assert.equal(res.enabled, false);
      assert.equal(res.trailer, null);
    } finally {
      if (oldEnv === undefined) delete process.env.GIT_CO_AUTHOR;
      else process.env.GIT_CO_AUTHOR = oldEnv;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('detects Antigravity runtime correctly', async () => {
    const cwd = mkWorkspace();
    const oldEnv = process.env.ANTIGRAVITY_AGENT;
    try {
      process.env.ANTIGRAVITY_AGENT = 'true';
      const detected = detectAgent();
      assert.equal(detected, 'antigravity');

      const res = await resolveCoAuthor(cwd);
      assert.equal(res.enabled, true);
      assert.ok(res.trailer?.includes('Antigravity Assistant'));
      assert.ok(res.trailer?.includes('<noreply@google.com>'));
      assert.equal(res.agentName, 'Antigravity');
    } finally {
      if (oldEnv === undefined) delete process.env.ANTIGRAVITY_AGENT;
      else process.env.ANTIGRAVITY_AGENT = oldEnv;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('detects Codex runtime correctly', async () => {
    const cwd = mkWorkspace();
    const oldCodex = process.env.CODEX_SESSION;
    const oldConv = process.env.GEMINI_CONVERSATION_ID;
    const oldAgy = process.env.ANTIGRAVITY_AGENT;
    const oldApp = process.env.GEMINI_CLI_APP_DATA_DIR;
    try {
      delete process.env.GEMINI_CONVERSATION_ID;
      delete process.env.ANTIGRAVITY_AGENT;
      delete process.env.GEMINI_CLI_APP_DATA_DIR;
      process.env.CODEX_SESSION = 'sess-123';
      const detected = detectAgent();
      assert.equal(detected, 'codex');

      const res = await resolveCoAuthor(cwd);
      assert.equal(res.enabled, true);
      assert.ok(res.trailer?.includes('Codex Assistant'));
      assert.ok(res.trailer?.includes('<noreply@openai.com>'));
      assert.equal(res.agentName, 'Codex');
    } finally {
      if (oldCodex === undefined) delete process.env.CODEX_SESSION;
      else process.env.CODEX_SESSION = oldCodex;
      if (oldConv !== undefined) process.env.GEMINI_CONVERSATION_ID = oldConv;
      if (oldAgy !== undefined) process.env.ANTIGRAVITY_AGENT = oldAgy;
      if (oldApp !== undefined) process.env.GEMINI_CLI_APP_DATA_DIR = oldApp;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('detects OpenCode runtime correctly', async () => {
    const cwd = mkWorkspace();
    const oldOpen = process.env.OPENCODE_SESSION;
    const oldConv = process.env.GEMINI_CONVERSATION_ID;
    const oldAgy = process.env.ANTIGRAVITY_AGENT;
    const oldApp = process.env.GEMINI_CLI_APP_DATA_DIR;
    try {
      delete process.env.GEMINI_CONVERSATION_ID;
      delete process.env.ANTIGRAVITY_AGENT;
      delete process.env.GEMINI_CLI_APP_DATA_DIR;
      process.env.OPENCODE_SESSION = 'opencode-456';
      const detected = detectAgent();
      assert.equal(detected, 'opencode');

      const res = await resolveCoAuthor(cwd);
      assert.equal(res.enabled, true);
      assert.ok(res.trailer?.includes('OpenCode Assistant'));
      assert.ok(res.trailer?.includes('<noreply@opencode.dev>'));
      assert.equal(res.agentName, 'OpenCode');
    } finally {
      if (oldOpen === undefined) delete process.env.OPENCODE_SESSION;
      else process.env.OPENCODE_SESSION = oldOpen;
      if (oldConv !== undefined) process.env.GEMINI_CONVERSATION_ID = oldConv;
      if (oldAgy !== undefined) process.env.ANTIGRAVITY_AGENT = oldAgy;
      if (oldApp !== undefined) process.env.GEMINI_CLI_APP_DATA_DIR = oldApp;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('honors DOCPATH_AGENT override', async () => {
    const cwd = mkWorkspace();
    const oldDocAgent = process.env.DOCPATH_AGENT;
    try {
      process.env.DOCPATH_AGENT = 'claude';
      const detected = detectAgent();
      assert.equal(detected, 'claude');

      const res = await resolveCoAuthor(cwd);
      assert.equal(res.enabled, true);
      assert.ok(res.trailer?.includes('Claude Opus'));
    } finally {
      if (oldDocAgent === undefined) delete process.env.DOCPATH_AGENT;
      else process.env.DOCPATH_AGENT = oldDocAgent;
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
