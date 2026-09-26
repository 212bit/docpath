/**
 * DocPath Breadcrumb Types (Layer 0)
 */

export interface BreadcrumbEntry {
  /** 任务 ID */
  taskId: string;
  /** 子任务编号 (e.g. S1.2) */
  step: string;
  /** 状态: done | in_progress | blocked | skipped */
  status: 'done' | 'in_progress' | 'blocked' | 'skipped';
  /** 上下文信息，人类可读 */
  context: string;
  /** 时间戳 (ISO) */
  timestamp?: string;
  /** 升级类型 */
  escalation?: string;
  /** 写入该事件的 agent/session 标识 */
  sessionId?: string;
}

export interface BreadcrumbSummary {
  /** 总子任务数 */
  total: number;
  /** 已完成数 */
  done: number;
  /** 进行中数 */
  inProgress: number;
  /** 阻塞数 */
  blocked: number;
  /** 最新一条记录 */
  latest: BreadcrumbEntry | null;
  /** 所有记录 */
  entries: BreadcrumbEntry[];
}

export interface BreadcrumbJsonlRecord extends BreadcrumbEntry {
  schema_version: number;
  kind: 'breadcrumb';
  timestamp: string;
}

export type BreadcrumbReporter = (message: string) => void;
