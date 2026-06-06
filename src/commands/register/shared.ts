export function getOptionValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function normalizeTaskFileSyncSource(
  value: string | undefined,
  optionName: string,
): 'canonical' | 'current' | undefined {
  if (!value) return undefined;
  if (value === 'canonical' || value === 'current') return value;
  throw new Error(`docpath ${optionName}: 参数非法: ${value}（允许: canonical|current）`);
}
