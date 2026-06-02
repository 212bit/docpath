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

type CliPositional = { required?: boolean; variadic?: boolean };

function getPositionalAllowance(
  matchedCommand: { args?: CliPositional[] } | undefined,
): { declaredCount: number; hasVariadic: boolean } {
  const args = matchedCommand?.args || [];
  return {
    declaredCount: args.length,
    hasVariadic: args.some((arg) => arg.variadic),
  };
}

// fail-loud：先解析不执行，校验命令合法性后再运行。
// - 未知 flag / 缺失必填参数：cac 在 runMatchedCommand 内抛 CACError → 被捕获并清晰报错
// - 未知命令：给了位置参数却没有命令匹配 → 显式报错
// 任何一种都以非零码退出，绝不静默忽略。
try {
  const parsed = cli.parse(process.argv, { run: false });

  // --help / --version 已在 parse() 内输出，直接结束。
  if (cli.options.help || cli.options.version) {
    process.exit(0);
  }

  if (!cli.matchedCommand && parsed.args.length > 0) {
    console.error(`❌  未知命令: ${parsed.args[0]}`);
    console.error('    运行 `docpath --help` 查看可用命令。');
    process.exit(1);
  }

  if (cli.matchedCommand) {
    const { declaredCount, hasVariadic } = getPositionalAllowance(
      cli.matchedCommand as { args?: CliPositional[] },
    );
    const extraPositionals = hasVariadic ? [] : parsed.args.slice(declaredCount);
    if (extraPositionals.length > 0) {
      console.error(`❌  命令 \`${cli.matchedCommand.rawName}\` 收到了未声明的位置参数: ${extraPositionals.join(' ')}`);
      console.error('    运行 `docpath --help` 查看用法。');
      process.exit(1);
    }
  }

  await cli.runMatchedCommand();
} catch (err) {
  console.error(`❌  ${err instanceof Error ? err.message : String(err)}`);
  console.error('    运行 `docpath --help` 查看用法。');
  process.exit(1);
}
