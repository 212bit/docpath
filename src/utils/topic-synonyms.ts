/**
 * Topic synonyms mapping for document retrieval
 * 
 * 提供中英文主题同义词映射，提升检索命中率。
 * 当用户搜索 "memory" 时，自动扩展到 ["memory", "记忆", "知识沉淀", "context"] 等。
 */

/**
 * 核心同义词映射表（手动维护 20-30 组）
 * 
 * 键：标准英文术语（小写）
 * 值：同义词数组（包含中英文变体）
 */
export const TOPIC_SYNONYMS: Record<string, string[]> = {
  // 记忆与知识
  'memory': ['memory', '记忆', '知识沉淀', 'knowledge', 'context', '上下文'],
  'context': ['context', '上下文', '背景', 'memory', '记忆'],
  'knowledge': ['knowledge', '知识', '记忆', 'memory', 'learnings'],
  
  // 架构与设计
  'architecture': ['architecture', '架构', '设计', 'design', '结构'],
  'design': ['design', '设计', '架构', 'architecture', '方案'],
  'pattern': ['pattern', '模式', '设计模式', 'design pattern'],
  
  // 任务与工作流
  'task': ['task', '任务', 'work', '工作项'],
  'workflow': ['workflow', '工作流', '流程', 'process'],
  'plan': ['plan', '计划', '规划', 'execution plan'],
  'spec': ['spec', '规范', '规格', 'specification', '需求'],
  
  // 代码与技术
  'code': ['code', '代码', 'implementation', '实现'],
  'api': ['api', '接口', 'contract', '契约'],
  'test': ['test', '测试', 'testing', 'verification'],
  'bug': ['bug', '缺陷', 'issue', '问题', 'error'],
  
  // 文档与索引
  'document': ['document', '文档', 'doc', 'documentation'],
  'index': ['index', '索引', 'catalog', '目录'],
  'docs': ['docs', '文档', 'documentation', 'documents'],
  
  // 决策与回顾
  'decision': ['decision', '决策', 'adr', 'architecture decision'],
  'review': ['review', '审查', '评审', 'code review'],
  'retrospective': ['retrospective', '回顾', '复盘', 'lesson', '经验'],
  'journal': ['journal', '日志', '记录', 'archive', '归档'],
  
  // 状态与进度
  'status': ['status', '状态', 'state', 'progress', '进度'],
  'phase': ['phase', '阶段', 'stage', 'step'],
  
  // 规则与规范
  'rule': ['rule', '规则', 'convention', '规范', 'standard'],
  'style': ['style', '风格', 'coding style', '代码风格'],
  
  // 工具与命令
  'command': ['command', '命令', 'cli', 'tool'],
  'agent': ['agent', '智能体', 'ai agent', '助手'],
};

/**
 * 反向索引：从任意同义词快速找到标准键
 * 例如：'记忆' -> 'memory', '架构' -> 'architecture'
 */
const REVERSE_INDEX: Map<string, string> = new Map();

// 构建反向索引
for (const [key, synonyms] of Object.entries(TOPIC_SYNONYMS)) {
  for (const synonym of synonyms) {
    const lower = synonym.toLowerCase();
    if (!REVERSE_INDEX.has(lower)) {
      REVERSE_INDEX.set(lower, key);
    }
  }
}

/**
 * 规范化主题查询：将用户输入扩展为同义词集合
 * 
 * @param topic 用户输入的主题词
 * @returns 扩展后的同义词数组（去重、小写化）
 * 
 * @example
 * normalizeTopic('memory') 
 *   // => ['memory', '记忆', '知识沉淀', 'knowledge', 'context', '上下文']
 * 
 * normalizeTopic('记忆')
 *   // => ['memory', '记忆', '知识沉淀', 'knowledge', 'context', '上下文']
 */
export function normalizeTopic(topic: string): string[] {
  const trimmed = topic.trim();
  if (!trimmed) return [];
  
  const lower = trimmed.toLowerCase();
  
  // 1. 如果是已知的标准键，直接返回其同义词
  if (TOPIC_SYNONYMS[lower]) {
    return [...new Set(TOPIC_SYNONYMS[lower].map(s => s.toLowerCase()))];
  }
  
  // 2. 如果是某个同义词，找到对应的标准键，再展开
  const canonicalKey = REVERSE_INDEX.get(lower);
  if (canonicalKey && TOPIC_SYNONYMS[canonicalKey]) {
    return [...new Set(TOPIC_SYNONYMS[canonicalKey].map(s => s.toLowerCase()))];
  }
  
  // 3. 未知主题，只返回自身（小写）
  return [lower];
}

/**
 * 检查两个主题是否语义相关（通过同义词映射）
 * 
 * @param topic1 主题 1
 * @param topic2 主题 2
 * @returns 是否相关
 * 
 * @example
 * areTopicsRelated('memory', '记忆') // => true
 * areTopicsRelated('memory', 'code') // => false
 */
export function areTopicsRelated(topic1: string, topic2: string): boolean {
  const normalized1 = normalizeTopic(topic1);
  const normalized2 = normalizeTopic(topic2);
  
  // 检查是否有交集
  const set1 = new Set(normalized1);
  return normalized2.some(t => set1.has(t.toLowerCase()));
}

/**
 * 获取所有已注册的标准主题键
 */
export function getCanonicalTopics(): string[] {
  return Object.keys(TOPIC_SYNONYMS);
}

/**
 * 为主题添加自定义同义词（运行时扩展）
 * 
 * @param canonicalKey 标准主题键
 * @param synonyms 新增的同义词数组
 * 
 * @example
 * addSynonyms('memory', ['brain', 'cognition'])
 */
export function addSynonyms(canonicalKey: string, synonyms: string[]): void {
  const key = canonicalKey.toLowerCase();
  
  if (!TOPIC_SYNONYMS[key]) {
    TOPIC_SYNONYMS[key] = [key];
  }
  
  // 添加到同义词列表
  for (const synonym of synonyms) {
    const lower = synonym.toLowerCase();
    if (!TOPIC_SYNONYMS[key].includes(lower)) {
      TOPIC_SYNONYMS[key].push(lower);
    }
    
    // 更新反向索引
    if (!REVERSE_INDEX.has(lower)) {
      REVERSE_INDEX.set(lower, key);
    }
  }
}
