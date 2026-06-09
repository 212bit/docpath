import { readCurrentState } from './workspace.js';
import { readHybridContextIndexSummary } from './context-index.js';
import { readDeliverableIndexSummary } from './deliverables.js';

export type RoleTeam = 'product' | 'design' | 'software' | 'qa';

export interface RoleProfile {
  id: string;
  team: RoleTeam;
  title: string;
  responsibility: string;
  deliverables: string[];
  focus: string[];
}

const ROLES: RoleProfile[] = [
  {
    id: 'product-director',
    team: 'product',
    title: 'Product Director',
    responsibility: '判断产品目标、商业价值、优先级和干系人沟通是否清晰。',
    deliverables: ['prd', 'stakeholder-update'],
    focus: ['目标用户', '价值假设', '范围取舍', '路线图风险'],
  },
  {
    id: 'requirement-analyst',
    team: 'product',
    title: 'Requirement Analyst',
    responsibility: '澄清需求边界、验收标准和非功能约束。',
    deliverables: ['prd'],
    focus: ['功能范围', '验收标准', '边界条件', '依赖关系'],
  },
  {
    id: 'user-researcher',
    team: 'product',
    title: 'User Researcher',
    responsibility: '从用户问题、反馈和场景角度审查需求。',
    deliverables: ['prd', 'stakeholder-update'],
    focus: ['用户场景', '痛点证据', '可用性风险', '反馈假设'],
  },
  {
    id: 'competitive-analyst',
    team: 'product',
    title: 'Competitive Analyst',
    responsibility: '比较竞品能力、定位差异和市场风险。',
    deliverables: ['competitive-analysis'],
    focus: ['竞品定位', '差异化', '替代方案', '风险机会'],
  },
  {
    id: 'design-lead',
    team: 'design',
    title: 'Design Lead',
    responsibility: '审查信息架构、交互路径和视觉一致性。',
    deliverables: ['prototype-review'],
    focus: ['用户路径', '信息层级', '组件一致性', '可访问性'],
  },
  {
    id: 'prototype-builder',
    team: 'design',
    title: 'Prototype Builder',
    responsibility: '把需求转成可检查的原型和交互细节。',
    deliverables: ['prototype-review'],
    focus: ['原型范围', '交互状态', '响应式行为', '交付格式'],
  },
  {
    id: 'software-architect',
    team: 'software',
    title: 'Software Architect',
    responsibility: '审查架构边界、数据流、模块依赖和长期维护成本。',
    deliverables: ['architecture-brief'],
    focus: ['模块边界', '数据契约', '扩展性', '回滚方案'],
  },
  {
    id: 'software-engineer',
    team: 'software',
    title: 'Software Engineer',
    responsibility: '执行实现并保持代码、测试和现有模式一致。',
    deliverables: ['architecture-brief'],
    focus: ['代码路径', '测试覆盖', '兼容性', '实现成本'],
  },
  {
    id: 'qa-engineer',
    team: 'qa',
    title: 'QA Engineer',
    responsibility: '验证验收标准、回归风险和质量证据。',
    deliverables: ['qa-report'],
    focus: ['验收覆盖', '失败复现', '回归范围', '证据完整性'],
  },
];

export function listRoleProfiles(): RoleProfile[] {
  return [...ROLES];
}

export function resolveRoleProfile(roleId: string): RoleProfile {
  const role = ROLES.find((item) => item.id === roleId);
  if (!role) {
    throw new Error(`Unknown role: ${roleId}`);
  }
  return role;
}

export async function renderRoleContext(cwd: string, roleId: string): Promise<string> {
  const role = resolveRoleProfile(roleId);
  const current = await readCurrentState(cwd);
  const contextIndex = await readHybridContextIndexSummary(cwd);
  const deliverables = await readDeliverableIndexSummary(cwd);
  const requiredFiles = [
    '.docpath/workspace/current.md',
    '.docpath/tasks/current/spec.md',
    '.docpath/tasks/current/plan.md',
    contextIndex?.path,
    deliverables?.path,
  ].filter((item): item is string => !!item);

  return [
    `# Role Context — ${role.id}`,
    '',
    `- team: ${role.team}`,
    `- title: ${role.title}`,
    `- task_id: ${current?.task_id || 'unknown'}`,
    `- task_title: ${current?.task_title || 'unknown'}`,
    '',
    '## Responsibility',
    '',
    role.responsibility,
    '',
    '## Required Reading',
    '',
    ...requiredFiles.map((file) => `- ${file}`),
    '',
    '## Focus',
    '',
    ...role.focus.map((item) => `- ${item}`),
    '',
    '## Expected Outputs',
    '',
    ...role.deliverables.map((item) => `- deliverable: ${item}`),
    '- payload: role_report',
    '',
    '## DocPath Gates',
    '',
    '- 不绕过 spec -> plan -> go -> check -> review -> journal。',
    '- 角色产出必须落盘到 deliverables 或任务 evidence，再进入后续上下文。',
    '- 如果需要改变范围、架构或 Agent 行为，先补 Decision Brief 并等待确认。',
  ].join('\n');
}
