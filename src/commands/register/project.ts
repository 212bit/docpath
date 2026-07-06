import type { CAC } from 'cac';
import { projectCommand } from '../project.js';

export function registerProjectCommands(cli: CAC): void {
  cli.command('project [action] [id]', '新项目 intake 工作流: capture | analyze | brief | settle | backlog | status')
    .option('--cwd <path>', '项目目录')
    .option('--title <title>', 'capture: project intake 标题')
    .option('--content <content>', 'capture: 直接传入文本/markdown 内容')
    .option('--file <path>', 'capture: 从文本/markdown 文件读取 source')
    .option('--stdin', 'capture: 从 stdin 读取 source')
    .option('--source-ref <ref>', 'capture: 记录外部 source 引用而不复制内容')
    .option('--source-type <type>', 'capture: markdown|text|ppt|pdf|api-doc|intro-doc|requirements|meeting-notes|mixed|unknown')
    .option('--dry-run', 'analyze/brief/settle/backlog: 只输出 prompt payload，不写文件')
    .option('--section <section>', 'analyze: requirements|product|ui|technical|risks|open-questions')
    .option('--confirm <text>', 'settle/backlog: 用户确认依据')
    .option('--approval-state <state>', 'settle: approved|partial|blocked')
    .option('--phase <name>', 'settle: 阶段名称，如 phase-1')
    .option('--agent', 'status: 输出 agent-readable 状态')
    .option('--json', 'status: 输出 JSON')
    .action(async (action: string | undefined, id: string | undefined, options: {
      cwd?: string;
      title?: string;
      content?: string;
      file?: string;
      stdin?: boolean;
      dryRun?: boolean;
      'dry-run'?: boolean;
      section?: string;
      confirm?: string;
      approvalState?: string;
      'approval-state'?: string;
      phase?: string;
      agent?: boolean;
      json?: boolean;
      sourceRef?: string;
      'source-ref'?: string;
      sourceType?: string;
      'source-type'?: string;
    }) => {
      await projectCommand({
        cwd: options.cwd || process.cwd(),
        action,
        id,
        title: options.title,
        content: options.content,
        file: options.file,
        stdin: !!options.stdin,
        sourceRef: options.sourceRef || options['source-ref'],
        sourceType: options.sourceType || options['source-type'],
        dryRun: !!(options.dryRun || options['dry-run']),
        section: options.section,
        confirm: options.confirm,
        approvalState: options.approvalState || options['approval-state'],
        phase: options.phase,
        agent: !!options.agent,
        json: !!options.json,
      });
    });
}
