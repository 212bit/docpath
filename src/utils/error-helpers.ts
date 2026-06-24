/**
 * DocPath 错误处理辅助函数
 *
 * 提供统一的错误抛出和退出机制。
 */

import { formatError, getExitCode } from './error-messages.js';

/**
 * DocPath 自定义错误类
 */
export class DocPathError extends Error {
  public readonly errorKey: string;
  public readonly context?: Record<string, string>;
  public readonly exitCode: number;

  constructor(
    errorKey: string,
    context?: Record<string, string>
  ) {
    super(formatError(errorKey, context));
    this.name = 'DocPathError';
    this.errorKey = errorKey;
    this.context = context;
    this.exitCode = getExitCode(errorKey);

    // 维护正确的堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DocPathError);
    }
  }

  /**
   * 获取退出码
   */
  getExitCode(): number {
    return this.exitCode;
  }
}

/**
 * 抛出 DocPath 错误（用于需要被上层捕获的场景）
 *
 * @param errorKey 错误目录中的键
 * @param context 上下文信息
 * @throws {DocPathError}
 */
export function throwError(
  errorKey: string,
  context?: Record<string, string>
): never {
  throw new DocPathError(errorKey, context);
}

/**
 * 打印错误消息并退出进程（用于命令最外层）
 *
 * @param errorKey 错误目录中的键
 * @param context 上下文信息
 */
export function exitWithError(
  errorKey: string,
  context?: Record<string, string>
): never {
  const error = new DocPathError(errorKey, context);
  console.error(error.message);
  process.exit(error.getExitCode());
}

/**
 * 包装原生 Error 为 DocPath 格式
 *
 * @param error 原生错误对象
 * @param errorKey 对应的错误键（默认为通用错误）
 */
export function wrapError(
  error: unknown,
  errorKey: string = 'UNKNOWN_ERROR'
): DocPathError {
  if (error instanceof DocPathError) {
    return error;
  }

  const context: Record<string, string> = {};

  if (error instanceof Error) {
    context.detail = error.message;
    if (process.env.DOCPATH_DEBUG === '1') {
      context.stack = error.stack || '';
    }
  } else {
    context.detail = String(error);
  }

  return new DocPathError(errorKey, context);
}
