/**
 * Silent Auto-Format Remediation (Layer 1 Utils)
 *
 * Automatically formats touched code before check/gate executions,
 * eliminating wasteful LLM roundtrips caused by trivial formatting/whitespace errors.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gitSyncOptional } from './git-run.js';
import { runShellSync } from './run-tool.js';

function formatCommand(command: string, cwd: string): boolean {
  return runShellSync(command, {
    cwd,
    timeoutMs: 8000,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  }).status === 'ok';
}

export interface AutoFormatResult {
  formatted: boolean;
  tool: string | null;
  filesCount: number;
}

export function performSilentAutoFormat(cwd: string): AutoFormatResult {
  try {
    // 1. Rust 项目: cargo fmt
    if (existsSync(join(cwd, 'Cargo.toml'))) {
      if (formatCommand('cargo fmt', cwd)) {
        return { formatted: true, tool: 'cargo fmt', filesCount: 1 };
      }
    }

    // 2. Go 项目: gofmt
    if (existsSync(join(cwd, 'go.mod'))) {
      if (formatCommand('gofmt -w .', cwd)) {
        return { formatted: true, tool: 'gofmt', filesCount: 1 };
      }
    }

    // 3. Python 项目: ruff / black
    if (existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'requirements.txt'))) {
      if (formatCommand('ruff format .', cwd)) {
        return { formatted: true, tool: 'ruff format', filesCount: 1 };
      }
      if (formatCommand('black .', cwd)) {
        return { formatted: true, tool: 'black', filesCount: 1 };
      }
    }

    // 4. Node.js / Web 项目: prettier
    if (existsSync(join(cwd, 'package.json'))) {
      const localPrettier = join(cwd, 'node_modules', '.bin', 'prettier');
      if (existsSync(localPrettier)) {
        if (formatCommand(`"${localPrettier}" --write . --log-level warn`, cwd)) {
          return { formatted: true, tool: 'prettier', filesCount: 1 };
        }
      }
    }
  } catch {
    // 静默安全兜底
  }

  return { formatted: false, tool: null, filesCount: 0 };
}
