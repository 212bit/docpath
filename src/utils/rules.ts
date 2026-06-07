import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir, readFileSafe } from './file.js';

export type RuleName = 'style' | 'architecture';

export interface ResolvedRuleFile {
  name: RuleName;
  path: string;
  displayPath: string;
  legacyPath: string;
  legacyDisplayPath: string;
  exists: boolean;
  isLegacy: boolean;
}

export interface RulePaths {
  rulesDir: string;
  legacySpecDir: string;
  style: ResolvedRuleFile;
  architecture: ResolvedRuleFile;
}

function ruleFile(docpathDir: string, name: RuleName): ResolvedRuleFile {
  const filename = `${name}.md`;
  const preferred = join(docpathDir, 'rules', filename);
  const legacy = join(docpathDir, 'spec', filename);
  const hasPreferred = existsSync(preferred);
  const hasLegacy = existsSync(legacy);

  return {
    name,
    path: hasPreferred || !hasLegacy ? preferred : legacy,
    displayPath: hasPreferred || !hasLegacy ? `.docpath/rules/${filename}` : `.docpath/spec/${filename}`,
    legacyPath: legacy,
    legacyDisplayPath: `.docpath/spec/${filename}`,
    exists: hasPreferred || hasLegacy,
    isLegacy: !hasPreferred && hasLegacy,
  };
}

export function resolveRulePaths(docpathDir: string): RulePaths {
  return {
    rulesDir: join(docpathDir, 'rules'),
    legacySpecDir: join(docpathDir, 'spec'),
    style: ruleFile(docpathDir, 'style'),
    architecture: ruleFile(docpathDir, 'architecture'),
  };
}

export async function ensureRulesDir(docpathDir: string): Promise<void> {
  await ensureDir(join(docpathDir, 'rules'));
}

export async function readRuleFile(docpathDir: string, name: RuleName): Promise<{ content: string; file: ResolvedRuleFile }> {
  const paths = resolveRulePaths(docpathDir);
  const file = paths[name];
  return {
    content: await readFileSafe(file.path) || '',
    file,
  };
}

export function ruleDisplayPaths(): string[] {
  return ['.docpath/rules/architecture.md', '.docpath/rules/style.md'];
}
