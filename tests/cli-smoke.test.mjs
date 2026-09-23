import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cac } from 'cac';
import { registerCommands } from '../dist/commands/register.js';
import { COMMAND_METADATA } from '../dist/commands/register/command-metadata.js';

describe('CLI command registration smoke tests', () => {
  it('registers all commands without throwing runtime or missing import errors', () => {
    const cli = cac('docpath');
    assert.doesNotThrow(() => {
      registerCommands(cli);
    });
    assert.ok(cli.commands.length > 20, `Should register >20 commands, registered ${cli.commands.length}`);
  });

  it('verifies all registered commands have valid descriptions and action handlers', () => {
    const cli = cac('docpath');
    registerCommands(cli);

    for (const cmd of cli.commands) {
      assert.ok(cmd.name, 'Command must have a name');
      assert.ok(cmd.description, `Command ${cmd.name} must have a description`);
      assert.equal(typeof cmd.commandAction, 'function', `Command ${cmd.name} must have an action handler`);
    }
  });

  it('matches metadata roster against core registered commands', () => {
    const cli = cac('docpath');
    registerCommands(cli);
    const commandNames = new Set(cli.commands.map(c => c.name.split(' ')[0]));

    for (const meta of COMMAND_METADATA) {
      if (meta.visibility === 'core') {
        assert.ok(
          commandNames.has(meta.name),
          `Core command ${meta.name} declared in COMMAND_METADATA should be registered in CLI`,
        );
      }
    }
  });
});
