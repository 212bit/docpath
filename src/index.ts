#!/usr/bin/env node

/** DocPath CLI — 文径工作流引擎 */

import { cac } from 'cac';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerCommands } from './commands/register.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(
  await readFile(join(__dirname, '..', 'package.json'), 'utf-8')
);

const cli = cac('docpath');

cli.version(pkg.version);
cli.help();
registerCommands(cli);
cli.parse();
