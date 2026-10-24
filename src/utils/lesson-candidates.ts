export type CandidateAction = 'keep' | 'archive' | 'skip';
export type LessonTarget = 'style' | 'architecture';

export interface LessonPattern {
  type: 'anti-pattern' | 'best-practice' | 'convention' | 'architecture';
  keyword: string;
  description: string;
  source: string;
  taskId?: string;
  target: LessonTarget;
}

export interface CandidateBlock {
  raw: string;
  title: string;
  taskId?: string;
  type?: string;
  target?: string;
  source: string;
  key: string;
  description: string;
}

export interface CandidateClassification {
  block: CandidateBlock;
  action: CandidateAction;
  reasons: string[];
  pattern?: LessonPattern;
}

function extractKeyword(text: string): string | null {
  const match = text.match(/[\u4e00-\u9fa5a-zA-Z_]{2,20}/);
  return match ? match[0] : null;
}

function isOrphanCandidate(candidate: CandidateBlock): boolean {
  const taskId = (candidate.taskId || '').trim().toLowerCase();
  return !taskId || taskId === 'unknown';
}

function isLowValueWorkflowLesson(candidate: CandidateBlock): boolean {
  const description = candidate.description.replace(/\s+/g, ' ').trim();
  return /推荐保留本次任务的执行经验/u.test(description)
    || /完成\s*\d+\s*\/\s*\d+\s*步/u.test(description)
    || /阻塞\s*\d+\s*步/u.test(description);
}

function isVagueLesson(candidate: CandidateBlock): boolean {
  const description = candidate.description.replace(/[✅⚠️📋🏗️]/g, '').trim();
  if (description.length < 18) return true;
  return /^(待补充|暂无|无|none|n\/a)$/i.test(description);
}

/** Whole-segment placeholders. `无` is exact so phrases like `无法回滚` stay substantive. */
const LESSON_PLACEHOLDER_TOKEN = /^(?:待补充|暂无|无|none|n\/a|tbd|todo)$/i;

/**
 * Lesson text is the value, not the label. Blank values, placeholder tokens,
 * and empty field shells such as `推荐方案:` do not count. A `title: value`
 * line counts only when `value` itself is substantive, so a whitespace brief
 * that falls back to the task title plus an empty field is still empty.
 */
function hasSubstantiveLessonText(text: string): boolean {
  const normalized = text.replace(/[\u00a0\u3000]/g, ' ').replace(/^\s*[-*]\s*/, '').trim();
  if (!normalized) return false;
  if (LESSON_PLACEHOLDER_TOKEN.test(normalized)) return false;
  const labeled = normalized.match(/^(?:推荐方案|推荐|目标|决策|结论)\s*[:：]\s*(.*)$/);
  if (labeled) return hasSubstantiveLessonText(labeled[1]);
  const colon = normalized.match(/^([^:：]+)[:：]\s*(.*)$/);
  if (colon) return hasSubstantiveLessonText(colon[2]);
  return true;
}

/**
 * A generated `### Lesson` body should not be written when it carries no
 * reusable text: empty, whitespace-only (ASCII space, NBSP, ideographic space),
 * or only placeholder tokens. Markdown headings are structure, not body text.
 */
export function isEmptyOrPlaceholderLessonBody(body: string): boolean {
  const lines = body
    .split(/\r?\n/)
    .filter((line) => !/^\s*#{1,6}\s+\S/.test(line))
    .map((line) => line.replace(/^\s*[-*]\s*/, '').replace(/[\u00a0\u3000]/g, ' ').trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return true;
  return lines.every((line) => !hasSubstantiveLessonText(line));
}

function isSeedBoilerplateLesson(candidate: CandidateBlock): boolean {
  const text = [candidate.title, candidate.key, candidate.description]
    .join(' ')
    .replace(/[✅⚠️📋🏗️]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [
    /方案\s*A\s*[/／]\s*方案\s*A/iu,
    /方案\s*A\s*[:：]?\s*方案\s*A/iu,
    /backlog promote seed spec/i,
    /spec\.json\s*渲染/i,
    /JSON\s*\/\s*Markdown/i,
    /保留 backlog 作为来源/u,
    /便于后续 plan\/go 接续/u,
  ].some((pattern) => pattern.test(text));
}

function lessonQualityReasons(candidate: CandidateBlock): string[] {
  const normalized = candidate.description
    .replace(/[✅⚠️📋🏗️]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const reasons: string[] = [];

  const hasTrigger = /当|在|若|如果|遇到|默认|执行|运行|新增|修改|处理|模式|场景|入口|CLI|Agent|任务|工作流|候选|输出|命令|文件|状态|规则|lesson|journal|learn|check|next|go|plan/i.test(normalized);
  const hasExpectedBehavior = /必须|应|应该|需要|推荐|保持|避免|不要|不应|只能|清理|写入|输出|使用|保留|跳过|归档|过滤|显示/i.test(normalized);
  const hasBoundary = /避免|不要|不应|不得|只能|只|边界|除非|否则|兼容|稳定|漂移|恢复|不依赖|不新增|防止|跳过|归档|过滤|清理|模式|目录/i.test(normalized);

  if (!hasTrigger) reasons.push('缺少触发条件');
  if (!hasExpectedBehavior) reasons.push('缺少期望行为');
  if (!hasBoundary) reasons.push('缺少边界');
  return reasons;
}

function candidateToPattern(candidate: CandidateBlock): LessonPattern | undefined {
  const typeValue = candidate.type;
  const targetValue = candidate.target;
  const type: LessonPattern['type'] = targetValue === 'architecture' || typeValue === 'architecture'
    ? 'architecture'
    : typeValue === 'anti-pattern' || typeValue === 'best-practice' || typeValue === 'convention'
      ? typeValue
      : 'best-practice';

  if (!candidate.description) return undefined;

  return {
    type,
    keyword: candidate.key,
    description: candidate.description.slice(0, 300),
    source: candidate.source,
    taskId: candidate.taskId,
    target: targetValue === 'architecture' || type === 'architecture' ? 'architecture' : 'style',
  };
}

export function parseCandidateBlocks(content: string): CandidateBlock[] {
  const candidates: CandidateBlock[] = [];
  const blocks = content.split(/^##\s+/m).filter((block) => block.trim());

  for (const block of blocks) {
    const hasCandidateShape = /^- (task_id|type|target|source|key):/m.test(block)
      || /^### (Lesson|经验)\s*$/m.test(block);
    if (!hasCandidateShape) continue;

    const title = block.split('\n')[0]?.trim() || '';
    const taskId = block.match(/^- task_id:\s*(.+)$/m)?.[1]?.trim();
    const typeValue = block.match(/^- type:\s*(.+)$/m)?.[1]?.trim();
    const targetValue = block.match(/^- target:\s*(.+)$/m)?.[1]?.trim();
    const source = block.match(/^- source:\s*(.+)$/m)?.[1]?.trim() || 'lesson-candidates';
    let description = title;
    const lessonMatch = block.match(/^### (?:Lesson|经验)\s*\r?\n([\s\S]*)/im);
    if (lessonMatch && lessonMatch[1]) {
      const rest = lessonMatch[1];
      const endIdx = rest.search(/\n### (?:Evidence|证据)|\n---/i);
      description = (endIdx >= 0 ? rest.slice(0, endIdx) : rest).trim() || title;
    }
    const keyword = block.match(/^- key:\s*(.+)$/m)?.[1]?.trim() || extractKeyword(description) || title;

    candidates.push({
      raw: block.trimEnd(),
      title,
      taskId,
      type: typeValue,
      target: targetValue,
      source,
      key: keyword,
      description,
    });
  }

  return candidates;
}

export function lessonCandidateKey(candidate: CandidateBlock): string {
  return `${candidate.type || 'best-practice'}:${candidate.target || 'style'}:${candidate.key}:${candidate.source}:${candidate.taskId || ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

export function isLowValueWorkflowLessonBlock(block: string): boolean {
  const description = block.match(/^### Lesson\s*\n([\s\S]*?)(?=\n###|\n---|$)/m)?.[1]
    ?.replace(/\s+/g, ' ')
    .trim() || '';
  return /推荐保留本次任务的执行经验/u.test(description)
    || /完成\s*\d+\s*\/\s*\d+\s*步/u.test(description)
    || /阻塞\s*\d+\s*步/u.test(description);
}

export function classifyCandidateBlocks(candidates: CandidateBlock[]): CandidateClassification[] {
  const seen = new Set<string>();

  return candidates.map((candidate) => {
    const reasons: string[] = [];
    const key = lessonCandidateKey(candidate);
    const duplicate = seen.has(key);
    seen.add(key);

    if (duplicate) reasons.push('重复候选');
    if (isOrphanCandidate(candidate)) reasons.push('task_id 缺失/unknown 的孤儿候选（状态漂移产物）');
    if (isLowValueWorkflowLesson(candidate)) reasons.push('低信息密度的任务完成统计');
    if (isVagueLesson(candidate)) reasons.push('经验描述过短或占位');
    if (isSeedBoilerplateLesson(candidate)) reasons.push('seed spec 或占位方案噪音');
    if (!candidate.key || candidate.key === candidate.title) reasons.push('缺少稳定 key');

    if (duplicate || isOrphanCandidate(candidate) || isVagueLesson(candidate) || isSeedBoilerplateLesson(candidate) || !candidate.key || candidate.key === candidate.title) {
      return { block: candidate, action: 'skip', reasons };
    }

    if (isLowValueWorkflowLesson(candidate)) {
      return { block: candidate, action: 'archive', reasons };
    }

    const qualityReasons = lessonQualityReasons(candidate);
    if (qualityReasons.length > 0) {
      return { block: candidate, action: 'archive', reasons: qualityReasons };
    }

    return {
      block: candidate,
      action: 'keep',
      reasons: ['具备触发条件、期望行为和边界'],
      pattern: candidateToPattern(candidate),
    };
  });
}
