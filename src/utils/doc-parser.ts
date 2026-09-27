/**
 * DocPath 文档解析与校验工具。
 *
 * 目标：
 * 1. 统一 spec.md / plan.md 的最小结构契约
 * 2. 让 write-plan 与 go 复用同一套步骤解析规则
 */

export interface PlanStep {
  id: string;
  name: string;
  description: string;
  acceptance: string;
  dependencies: string;
  done: boolean;
  marker: ' ' | 'x' | '~' | '!';
  lineText: string;
  sectionIndex: number;
  checklistIndex: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  message: string;
  line?: number;
  section?: string;
  field?: string;
}

function hasHeading(content: string, pattern: RegExp): boolean {
  return pattern.test(content);
}

function countMatches(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function lineOfIndex(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function findHeadingLine(content: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(content);
  return match ? lineOfIndex(content, match.index) : undefined;
}

function validationResult(issues: ValidationIssue[]): ValidationResult {
  return {
    ok: issues.length === 0,
    errors: issues.map((issue) => issue.message),
    issues,
  };
}

export function validateSpecContent(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const requirementsLine = findHeadingLine(content, /^##\s+2\.\s*需求清单\s*$/m);
  const acceptanceLine = findHeadingLine(content, /^##\s+5\.\s*验收标准\s*$/m);

  if (!hasHeading(content, /^#\s+.+$/m)) {
    issues.push({ message: '缺少标题：需要 `# 任务标题`', line: 1, field: 'title' });
  }

  if (!hasHeading(content, /^###\s+功能需求\s*$/m)) {
    issues.push({
      message: '缺少 `### 功能需求` 章节',
      line: requirementsLine,
      section: '## 2. 需求清单',
      field: '### 功能需求',
    });
  }

  if (countMatches(content, /^\s*-\s*\[[ xX]\]\s*FR-\d+\s*:/gm) < 1) {
    issues.push({
      message: '缺少至少一条 `FR-*` 功能需求',
      line: findHeadingLine(content, /^###\s+功能需求\s*$/m) ?? requirementsLine,
      section: '### 功能需求',
      field: 'FR-*',
    });
  }

  if (!hasHeading(content, /^##\s+5\.\s*验收标准\s*$/m)) {
    issues.push({ message: '缺少 `## 5. 验收标准` 章节', section: 'root', field: '## 5. 验收标准' });
  }

  if (countMatches(content, /^\s*-\s*\[[ xX]\]\s*AC-\d+\s*:/gm) < 1) {
    issues.push({
      message: '缺少至少一条 `AC-*` 验收标准',
      line: acceptanceLine,
      section: '## 5. 验收标准',
      field: 'AC-*',
    });
  }

  return validationResult(issues);
}

export function parsePlanSteps(planContent: string): PlanStep[] {
  const tasks: PlanStep[] = [];
  const checklistById = new Map<string, {
    marker: ' ' | 'x' | '~' | '!';
    lineText: string;
    index: number;
  }>();
  const checkboxLineRegex = /^- \[([ xX~!])\]\s*(?:\*\*)?(S\d+(?:\.\d+)?|T[\w-]*)(?:\*\*)?(?:\s*[:：]\s*(.+))?\s*$/gmi;
  let checkboxMatch: RegExpExecArray | null;

  while ((checkboxMatch = checkboxLineRegex.exec(planContent)) !== null) {
    const id = checkboxMatch[2];
    if (checklistById.has(id)) continue;
    checklistById.set(id, {
      marker: checkboxMatch[1].toLowerCase() as ' ' | 'x' | '~' | '!',
      lineText: checkboxMatch[0],
      index: checkboxMatch.index,
    });
  }

  const sectionRegex = /^###\s+(S\d+(?:\.\d+)?)[：:]\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  const sections: Array<{ index: number; id: string; name: string }> = [];

  while ((match = sectionRegex.exec(planContent)) !== null) {
    sections.push({ index: match.index, id: match[1], name: match[2].trim() });
  }

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const blockEnd = i + 1 < sections.length ? sections[i + 1].index : planContent.length;
    const block = planContent.slice(sec.index, blockEnd);

    const descMatch = block.match(/- \*\*描述\*\*[:：]\s*(.+)/);
    const accMatch = block.match(/- \*\*验收条件\*\*[:：]\s*(.+)/);
    const depMatch = block.match(/- \*\*依赖\*\*[:：]\s*(.+)/);
    const checklistMatch = block.match(new RegExp(`^- \\[([ xX~!])\\]\\s*(?:\\*\\*)?${sec.id}(?:\\*\\*)?\\s*[:：]\\s*(.+)$`, 'mi'));
    const fallbackChecklist = checklistById.get(sec.id);
    const marker = checklistMatch
      ? checklistMatch[1].toLowerCase() as ' ' | 'x' | '~' | '!'
      : fallbackChecklist?.marker ?? ' ';

    tasks.push({
      id: sec.id,
      name: sec.name,
      description: descMatch?.[1]?.trim() || '',
      acceptance: accMatch?.[1]?.trim() || '',
      dependencies: depMatch?.[1]?.trim() || '',
      done: marker === 'x' || marker === '~',
      marker,
      lineText: checklistMatch?.[0] || fallbackChecklist?.lineText || '',
      sectionIndex: sec.index,
      checklistIndex: checklistMatch ? sec.index + block.indexOf(checklistMatch[0]) : fallbackChecklist?.index ?? -1,
    });
  }

  if (tasks.length === 0) {
    const checkboxRegex = /^- \[([ xX~!])\]\s*(?:(?:\*\*)?(S\d+(?:\.\d+)?|T[\w-]*)(?:\*\*)?\s*[:：]\s*)?(.+)$/gmi;
    while ((match = checkboxRegex.exec(planContent)) !== null) {
      const marker = match[1].toLowerCase() as ' ' | 'x' | '~' | '!';
      tasks.push({
        id: match[2] || `T${tasks.length + 1}`,
        name: match[3].trim(),
        description: match[3].trim(),
        acceptance: '',
        dependencies: '无',
        done: marker === 'x' || marker === '~',
        marker,
        lineText: match[0],
        sectionIndex: -1,
        checklistIndex: match.index,
      });
    }
  }

  return tasks;
}

export function renderPlanChecklist(steps: PlanStep[]): string[] {
  return steps.map((step) => `- [${step.done ? 'x' : ' '}] ${step.id}: ${step.name}`);
}

export function validatePlanContent(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const steps = parsePlanSteps(content);

  if (steps.length === 0) {
    issues.push({
      message: '缺少至少一个可解析子任务：需要 `### S1: 名称` 或 checklist 步骤',
      line: findHeadingLine(content, /^##\s+执行计划\s*$/m),
      section: '## 执行计划',
      field: 'step',
    });
  }

  const missingDescription = steps.filter((step) => !step.description).map((step) => step.id);
  const missingAcceptance = steps.filter((step) => !step.acceptance).map((step) => step.id);
  const missingDependencies = steps.filter((step) => !step.dependencies).map((step) => step.id);

  if (missingDescription.length > 0) {
    issues.push(...missingDescription.map((stepId) => {
      const step = steps.find((item) => item.id === stepId);
      return {
        message: `以下步骤缺少 \`描述\`: ${stepId}`,
        line: step?.sectionIndex === undefined || step.sectionIndex < 0 ? undefined : lineOfIndex(content, step.sectionIndex),
        section: stepId,
        field: '描述',
      };
    }));
  }

  if (missingAcceptance.length > 0) {
    issues.push(...missingAcceptance.map((stepId) => {
      const step = steps.find((item) => item.id === stepId);
      return {
        message: `以下步骤缺少 \`验收条件\`: ${stepId}`,
        line: step?.sectionIndex === undefined || step.sectionIndex < 0 ? undefined : lineOfIndex(content, step.sectionIndex),
        section: stepId,
        field: '验收条件',
      };
    }));
  }

  if (missingDependencies.length > 0) {
    issues.push(...missingDependencies.map((stepId) => {
      const step = steps.find((item) => item.id === stepId);
      return {
        message: `以下步骤缺少 \`依赖\`: ${stepId}`,
        line: step?.sectionIndex === undefined || step.sectionIndex < 0 ? undefined : lineOfIndex(content, step.sectionIndex),
        section: stepId,
        field: '依赖',
      };
    }));
  }

  return validationResult(issues);
}
