/**
 * 命令输出格式化工具
 *
 * 提供颜色、表格、进度条等视觉增强，同时保持 --agent 模式兼容。
 */

import pc from 'picocolors';
import Table from 'cli-table3';

/**
 * 检测是否应该使用颜色输出
 *
 * - TTY 环境默认启用
 * - 尊重 NO_COLOR 环境变量
 * - --agent 模式禁用
 */
export function shouldUseColor(): boolean {
  // NO_COLOR 环境变量优先
  if (process.env.NO_COLOR) {
    return false;
  }

  // FORCE_COLOR 强制启用
  if (process.env.FORCE_COLOR) {
    return true;
  }

  // 检测 TTY
  return process.stdout.isTTY || false;
}

/**
 * 状态颜色映射
 */
export function colorizeStatus(status: string): string {
  if (!shouldUseColor()) return status;

  const lowerStatus = status.toLowerCase();

  if (lowerStatus === 'idle' || lowerStatus === 'completed' || lowerStatus === 'done') {
    return pc.green(status);
  }

  if (lowerStatus === 'executing' || lowerStatus === 'in_progress') {
    return pc.yellow(status);
  }

  if (lowerStatus === 'blocked' || lowerStatus === 'failed') {
    return pc.red(status);
  }

  if (lowerStatus === 'planning' || lowerStatus === 'drafting') {
    return pc.cyan(status);
  }

  return status;
}

/**
 * 高亮显示命令
 */
export function highlightCommand(cmd: string): string {
  if (!shouldUseColor()) return cmd;
  return pc.bold(pc.cyan(cmd));
}

/**
 * 成功消息
 */
export function success(msg: string): string {
  if (!shouldUseColor()) return `✓ ${msg}`;
  return pc.green(`✓ ${msg}`);
}

/**
 * 错误消息
 */
export function error(msg: string): string {
  if (!shouldUseColor()) return `✗ ${msg}`;
  return pc.red(`✗ ${msg}`);
}

/**
 * 警告消息
 */
export function warning(msg: string): string {
  if (!shouldUseColor()) return `⚠ ${msg}`;
  return pc.yellow(`⚠ ${msg}`);
}

/**
 * 信息消息
 */
export function info(msg: string): string {
  if (!shouldUseColor()) return `ℹ ${msg}`;
  return pc.blue(`ℹ ${msg}`);
}

/**
 * 创建进度条字符串
 *
 * @param done 已完成数量
 * @param total 总数量
 * @param width 进度条宽度（字符数）
 */
export function progressBar(done: number, total: number, width: number = 20): string {
  if (total === 0) return '[----------]   0%';

  const percentage = Math.round((done / total) * 100);
  const filled = Math.round((done / total) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const display = `[${bar}] ${percentage.toString().padStart(3)}%`;

  if (!shouldUseColor()) return display;

  // 颜色渐变：红 -> 黄 -> 绿
  if (percentage < 33) {
    return pc.red(display);
  } else if (percentage < 66) {
    return pc.yellow(display);
  } else {
    return pc.green(display);
  }
}

/**
 * 创建简单表格
 *
 * @param headers 表头
 * @param rows 数据行
 */
export function createTable(headers: string[], rows: string[][]): string {
  const table = new Table({
    head: headers,
    style: {
      head: shouldUseColor() ? ['cyan'] : [],
      border: shouldUseColor() ? ['gray'] : [],
    },
    chars: shouldUseColor()
      ? undefined // 使用默认字符
      : { // ASCII-only 字符
          'top': '-',
          'top-mid': '+',
          'top-left': '+',
          'top-right': '+',
          'bottom': '-',
          'bottom-mid': '+',
          'bottom-left': '+',
          'bottom-right': '+',
          'left': '|',
          'left-mid': '+',
          'mid': '-',
          'mid-mid': '+',
          'right': '|',
          'right-mid': '+',
          'middle': '|'
        }
  });

  rows.forEach(row => table.push(row));

  return table.toString();
}

/**
 * 创建检查结果表格
 *
 * @param results 检查结果数组 { name: string, status: 'pass'|'fail'|'warn', message?: string }
 */
export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
}

export function createCheckTable(results: CheckResult[]): string {
  const rows = results.map(r => {
    let statusIcon: string;
    if (r.status === 'pass') {
      statusIcon = shouldUseColor() ? pc.green('✓') : '✓';
    } else if (r.status === 'fail') {
      statusIcon = shouldUseColor() ? pc.red('✗') : '✗';
    } else {
      statusIcon = shouldUseColor() ? pc.yellow('⚠') : '⚠';
    }

    return [
      statusIcon,
      r.name,
      r.message || ''
    ];
  });

  return createTable(['状态', '检查项', '说明'], rows);
}

/**
 * 分隔线
 */
export function separator(char: string = '-', length: number = 50): string {
  const line = char.repeat(length);
  if (!shouldUseColor()) return line;
  return pc.gray(line);
}

/**
 * 标题
 */
export function heading(text: string): string {
  if (!shouldUseColor()) return `\n${text}\n${'='.repeat(text.length)}`;
  return `\n${pc.bold(pc.white(text))}\n${pc.gray('='.repeat(text.length))}`;
}

/**
 * 次级标题
 */
export function subheading(text: string): string {
  if (!shouldUseColor()) return `\n${text}`;
  return `\n${pc.bold(text)}`;
}
