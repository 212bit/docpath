import { readFile, writeFile } from 'node:fs/promises';
import {
  MergeDriverConflict,
  isSupportedDocpathMergePath,
  resolveDocpathMerge,
} from '../utils/merge-driver.js';

export interface MergeDriverCommandOptions {
  cwd?: string;
  ancestor?: string;
  current?: string;
  other?: string;
  path?: string;
}

export async function mergeDriverCommand(options: MergeDriverCommandOptions): Promise<void> {
  const ancestorPath = options.ancestor;
  const currentPath = options.current;
  const otherPath = options.other;
  const docpathFile = options.path || currentPath;

  if (!ancestorPath || !currentPath || !otherPath) {
    throw new Error('merge-driver requires ancestor, current, and other file paths');
  }
  if (!docpathFile || !isSupportedDocpathMergePath(docpathFile)) {
    throw new Error(`merge-driver only supports .docpath/backlog/*.md and .docpath/rules/*.md files: ${docpathFile || '<missing>'}`);
  }

  const [ancestor, current, other] = await Promise.all([
    readFile(ancestorPath, 'utf-8'),
    readFile(currentPath, 'utf-8'),
    readFile(otherPath, 'utf-8'),
  ]);

  try {
    const resolved = resolveDocpathMerge({
      ancestor,
      current,
      other,
      path: docpathFile,
    });
    await writeFile(currentPath, resolved.content, 'utf-8');
    console.log(`✅  DocPath merge-driver resolved ${docpathFile} (${resolved.strategy})`);
  } catch (error) {
    if (error instanceof MergeDriverConflict) {
      console.error(`❌  DocPath merge-driver conflict in ${docpathFile}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
