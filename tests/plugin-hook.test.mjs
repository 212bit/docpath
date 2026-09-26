import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, chmod } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { loadPlugins, diagnosePlugins } from '../dist/engine/plugin-system.js';
import { executeLifecycleHook, listAllRegisteredHooks } from '../dist/engine/hook-runner.js';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

describe('DocPath Plugin & Hook Extensibility Engine', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'docpath-plugin-hook-test-'));
    await mkdir(join(tempDir, '.docpath', 'workspace'), { recursive: true });
    await mkdir(join(tempDir, '.docpath', 'hooks'), { recursive: true });
    await mkdir(join(tempDir, '.docpath', 'plugins'), { recursive: true });

    // Workspace state
    await writeFile(
      join(tempDir, '.docpath', 'workspace', 'state.json'),
      JSON.stringify({ schema_version: '1.0', state: 'idle', phase: 'idle', task_id: 'T-HOOK-TEST' }),
      'utf-8',
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Plugin System', () => {
    it('discovers and loads valid plugins', async () => {
      const pluginDir = join(tempDir, '.docpath', 'plugins', 'security-guard');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(
        join(pluginDir, 'plugin.json'),
        JSON.stringify({
          name: 'security-guard',
          version: '1.2.0',
          description: 'Enterprise security policy checker',
          author: 'SecOps Team',
          hooks: {
            'pre-check': [
              { command: 'echo "running security scan"', name: 'sec-scan', fail_fast: true },
            ],
          },
          rules: [
            { name: 'no-eval', description: 'Disallow eval usage' },
          ],
        }),
        'utf-8',
      );

      const plugins = await loadPlugins(tempDir);
      assert.equal(plugins.length, 1);
      assert.equal(plugins[0].name, 'security-guard');
      assert.equal(plugins[0].valid, true);
      assert.equal(plugins[0].hooksCount, 1);
      assert.equal(plugins[0].rulesCount, 1);

      const report = await diagnosePlugins(tempDir);
      assert.equal(report.healthy, true);
      assert.equal(report.active_plugins, 1);
    });

    it('diagnoses invalid plugin configurations', async () => {
      const pluginDir = join(tempDir, '.docpath', 'plugins', 'broken-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(
        join(pluginDir, 'plugin.json'),
        JSON.stringify({
          // Missing 'name'
          hooks: {
            'invalid-event-name': ['echo 1'],
          },
        }),
        'utf-8',
      );

      const report = await diagnosePlugins(tempDir);
      assert.equal(report.healthy, false);
      const broken = report.plugins.find((p) => p.name === 'broken-plugin');
      assert.ok(broken);
      assert.equal(broken.valid, false);
      assert.ok(broken.errors.some((e) => e.includes('name')));
      assert.ok(broken.errors.some((e) => e.includes('未知的 hook 事件名')));
    });

    it('supports docpath plugin list and doctor CLI commands', () => {
      const outList = execSync(`node "${BIN}" plugin list --agent --cwd "${tempDir}"`, {
        encoding: 'utf-8',
      });
      const parsedList = parse(outList);
      assert.equal(parsedList.agent_view, 'plugin_list');
      assert.equal(parsedList.total_plugins, 0);

      const outDoctor = execSync(`node "${BIN}" plugin doctor --agent --cwd "${tempDir}"`, {
        encoding: 'utf-8',
      });
      const parsedDoctor = parse(outDoctor);
      assert.equal(parsedDoctor.agent_view, 'plugin_doctor');
      assert.equal(parsedDoctor.healthy, true);
    });
  });

  describe('Lifecycle Hook Runner', () => {
    it('executes script hooks in .docpath/hooks/ and passes context env vars', async () => {
      const hookScript = join(tempDir, '.docpath', 'hooks', 'pre-check.sh');
      await writeFile(
        hookScript,
        '#!/usr/bin/env bash\necho "HOOK_EVENT=$DOCPATH_HOOK_EVENT TASK=$DOCPATH_TASK_ID"',
        'utf-8',
      );
      await chmod(hookScript, 0o755);

      const registered = await listAllRegisteredHooks(tempDir);
      assert.ok(registered.some((h) => h.event === 'pre-check' && h.source === 'script'));

      const report = await executeLifecycleHook(tempDir, 'pre-check', { taskId: 'T-HOOK-TEST' });
      assert.equal(report.passed, true);
      assert.equal(report.total_hooks, 1);
      assert.match(report.results[0].output, /HOOK_EVENT=pre-check/);
      assert.match(report.results[0].output, /TASK=T-HOOK-TEST/);
    });

    it('executes config-driven hooks from config.yaml', async () => {
      await writeFile(
        join(tempDir, '.docpath', 'config.yaml'),
        `
hooks:
  post-step:
    - name: notify-slack
      command: 'echo "Step completed notification"'
      fail_fast: false
`,
        'utf-8',
      );

      const registered = await listAllRegisteredHooks(tempDir);
      assert.ok(registered.some((h) => h.event === 'post-step' && h.source === 'config'));

      const report = await executeLifecycleHook(tempDir, 'post-step', { step: 'S1' });
      assert.equal(report.passed, true);
      assert.equal(report.results.length, 1);
      assert.match(report.results[0].output, /Step completed notification/);
    });

    it('blocks execution when fail_fast hook fails', async () => {
      await writeFile(
        join(tempDir, '.docpath', 'config.yaml'),
        `
hooks:
  pre-check:
    - name: strict-gate
      command: 'exit 1'
      fail_fast: true
`,
        'utf-8',
      );

      const report = await executeLifecycleHook(tempDir, 'pre-check');
      assert.equal(report.passed, false);
      assert.equal(report.results[0].passed, false);
      assert.equal(report.results[0].fail_fast, true);
    });

    it('supports docpath hook list and docpath hook run CLI commands', () => {
      const outList = execSync(`node "${BIN}" hook list --agent --cwd "${tempDir}"`, {
        encoding: 'utf-8',
      });
      const parsedList = parse(outList);
      assert.equal(parsedList.agent_view, 'hook_list');

      const outRun = execSync(`node "${BIN}" hook run pre-check --agent --cwd "${tempDir}"`, {
        encoding: 'utf-8',
      });
      const parsedRun = parse(outRun);
      assert.equal(parsedRun.agent_view, 'hook_run');
      assert.equal(parsedRun.event, 'pre-check');
      assert.equal(parsedRun.passed, true);
    });
  });
});
