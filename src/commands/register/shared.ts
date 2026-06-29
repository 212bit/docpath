export function getOptionValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function normalizeTaskFileSyncSource(
  value: string | undefined,
  optionName: string,
): 'canonical' | 'current' | 'merge' | undefined {
  if (!value) return undefined;
  if (value === 'canonical' || value === 'current' || value === 'merge') return value;
  throw new Error(`docpath ${optionName}: 参数非法: ${value}（允许: canonical|current|merge）`);
}

export function normalizeEnumOption<const T extends readonly string[]>(
  value: string | undefined,
  optionName: string,
  allowed: T,
): T[number] | undefined {
  if (!value) return undefined;
  if ((allowed as readonly string[]).includes(value)) return value as T[number];
  throw new Error(`docpath ${optionName}: 参数非法: ${value}（允许: ${allowed.join('|')}）`);
}

export function parseIntegerOption(
  value: string | undefined,
  optionName: string,
  constraints: { min?: number; max?: number } = {},
): number | undefined {
  if (value === undefined || value === '') return undefined;
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`docpath ${optionName}: 参数非法: ${value}（必须是整数）`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`docpath ${optionName}: 参数非法: ${value}（超出安全整数范围）`);
  }
  if (constraints.min !== undefined && parsed < constraints.min) {
    throw new Error(`docpath ${optionName}: 参数非法: ${value}（必须 >= ${constraints.min}）`);
  }
  if (constraints.max !== undefined && parsed > constraints.max) {
    throw new Error(`docpath ${optionName}: 参数非法: ${value}（必须 <= ${constraints.max}）`);
  }
  return parsed;
}
