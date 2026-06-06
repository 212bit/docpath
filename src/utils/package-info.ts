/**
 * DocPath package metadata helpers.
 *
 * CLI commands can run from an arbitrary project cwd, so package.json lookup
 * must prefer a real DocPath package file instead of blindly reading cwd.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists } from './file.js';

interface PackageJson {
  name?: string;
  version?: string;
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

async function readDocpathPackage(filePath: string): Promise<PackageJson | null> {
  if (!(await exists(filePath))) return null;

  try {
    const pkg = JSON.parse(await readFile(filePath, 'utf-8')) as PackageJson;
    if (pkg.name === 'docpath' && pkg.version) return pkg;
  } catch {
    // Ignore invalid or unrelated package.json files.
  }

  return null;
}

export async function getDocpathPackageVersion(): Promise<string> {
  const candidates = [
    join(process.cwd(), 'package.json'),
    join(MODULE_DIR, '..', 'package.json'),
    join(MODULE_DIR, '..', '..', 'package.json'),
  ];

  for (const candidate of candidates) {
    const pkg = await readDocpathPackage(candidate);
    if (pkg?.version) return pkg.version;
  }

  return 'unknown';
}
