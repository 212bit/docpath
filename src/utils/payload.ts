export type PayloadKind =
  | 'change_summary'
  | 'evaluation_result'
  | 'role_report'
  | 'requirement_change';

export interface BasePayload {
  kind: PayloadKind;
  summary: string;
  source: string;
  created_at: string;
}

export interface ChangeSummaryPayload extends BasePayload {
  kind: 'change_summary';
  changed_files: string[];
}

export interface EvaluationResultPayload extends BasePayload {
  kind: 'evaluation_result';
  status: 'pass' | 'partial' | 'fail' | 'unevaluable';
  issues: string[];
}

export interface RoleReportPayload extends BasePayload {
  kind: 'role_report';
  role: string;
  findings: string[];
}

export interface RequirementChangePayload extends BasePayload {
  kind: 'requirement_change';
  change: string;
  impact: string;
}

export type DocPathPayload =
  | ChangeSummaryPayload
  | EvaluationResultPayload
  | RoleReportPayload
  | RequirementChangePayload;

const PAYLOAD_KINDS: PayloadKind[] = [
  'change_summary',
  'evaluation_result',
  'role_report',
  'requirement_change',
];

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function requireString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid DocPath Payload: missing string field "${field}"`);
  }
  return value;
}

function requireStringArray(input: Record<string, unknown>, field: string): string[] {
  const value = input[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`Invalid DocPath Payload: missing string[] field "${field}"`);
  }
  return value;
}

function parseBasePayload(input: Record<string, unknown>): BasePayload {
  const kind = input.kind;
  if (typeof kind !== 'string' || !PAYLOAD_KINDS.includes(kind as PayloadKind)) {
    throw new Error(`Invalid DocPath Payload: unsupported kind "${String(kind)}"`);
  }
  return {
    kind: kind as PayloadKind,
    summary: requireString(input, 'summary'),
    source: requireString(input, 'source'),
    created_at: requireString(input, 'created_at'),
  };
}

export function parseDocPathPayload(input: unknown): DocPathPayload {
  if (!isRecord(input)) {
    throw new Error('Invalid DocPath Payload: expected object');
  }

  const base = parseBasePayload(input);
  if (base.kind === 'change_summary') {
    return {
      ...base,
      kind: 'change_summary',
      changed_files: requireStringArray(input, 'changed_files'),
    };
  }

  if (base.kind === 'evaluation_result') {
    const status = requireString(input, 'status');
    if (!['pass', 'partial', 'fail', 'unevaluable'].includes(status)) {
      throw new Error(`Invalid DocPath Payload: unsupported evaluation status "${status}"`);
    }
    return {
      ...base,
      kind: 'evaluation_result',
      status: status as EvaluationResultPayload['status'],
      issues: requireStringArray(input, 'issues'),
    };
  }

  if (base.kind === 'role_report') {
    return {
      ...base,
      kind: 'role_report',
      role: requireString(input, 'role'),
      findings: requireStringArray(input, 'findings'),
    };
  }

  return {
    ...base,
    kind: 'requirement_change',
    change: requireString(input, 'change'),
    impact: requireString(input, 'impact'),
  };
}

export function validateDocPathPayload(input: unknown): boolean {
  parseDocPathPayload(input);
  return true;
}
