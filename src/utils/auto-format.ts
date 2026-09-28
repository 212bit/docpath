/**
 * Silent Auto-Format Remediation (Layer 1 Utils)
 *
 * Automatically formats touched code before check/gate executions,
 * eliminating wasteful LLM roundtrips caused by trivial formatting/whitespace errors.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { gitSyncOptional } from './git-run.js';

export interface AutoFormatResult {
  formatted: boolean;
  tool: string | null;
  filesCount: number;
}

export function performSilentAutoFormat(cwd: string): AutoFormatResult {
  try {
    // 1. Rust 项目: cargo fmt
    if (existsSync(join(cwd, 'Cargo.toml'))) {
      try {
        execSync('cargo fmt', {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 8000,
        });
        return { formatted: true, tool: 'cargo fmt', filesCount: 1 };
      } catch {
        // tool not in path or error
      }
    }

    // 2. Go 项目: gofmt
    if (existsSync(join(cwd, 'go.mod'))) {
      try {
        execSync('gofmt -w .', {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 8000,
        });
        return { formatted: true, tool: 'gofmt', filesCount: 1 };
      } catch {
        // ignore
      }
    }

    // 3. Python 项目: ruff / black
    if (existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'requirements.txt'))) {
      try {
        execSync('ruff format .', {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 8000,
        });
        return { formatted: true, tool: 'ruff format', filesCount: 1 };
      } catch {
        try {
          execSync('black .', {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 8000,
          });
          return { formatted: true, tool: 'black', filesCount: 1 };
        } catch {
          // ignore
        }
      }
    }

    // 4. Node.js / Web 项目: prettier
    if (existsSync(join(cwd, 'package.json'))) {
      const localPrettier = join(cwd, 'node_modules', '.bin', 'prettier');
      if (existsSync(localPrettier)) {
        try {
          execSync(`"${localPrettier}" --write . --log-level warn`, {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 8000,
          });
          return { formatted: true, tool: 'prettier', filesCount: 1 };
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // 静默安全兜底
  }

  return { formatted: false, tool: null, filesCount: 0 };
}
