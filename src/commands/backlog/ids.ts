/**
 * docpath backlog — 多 id 参数解析
 */

export function parseIdList(rawId?: string): string[] {
  if (!rawId?.trim()) return [];
  return rawId
    .split(/[\s,，]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
