/**
 * Unified Logging Utility for DocPath
 *
 * Provides structured log wrappers around standard output and error streams.
 * Allows easy control over styling, emoji formatting, and future mock/interception for testing.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';

export interface LoggerOptions {
  emoji?: string;
  silent?: boolean;
}

class Logger {
  private isSilent = false;

  setSilent(silent: boolean) {
    this.isSilent = silent;
  }

  log(message: string, options: LoggerOptions = {}) {
    if (this.isSilent || options.silent) return;
    const prefix = options.emoji ? `${options.emoji}  ` : '';
    console.log(`${prefix}${message}`);
  }

  info(message: string, options: LoggerOptions = {}) {
    this.log(message, { emoji: 'ℹ️', ...options });
  }

  success(message: string, options: LoggerOptions = {}) {
    this.log(message, { emoji: '✅', ...options });
  }

  warn(message: string, options: LoggerOptions = {}) {
    if (this.isSilent || options.silent) return;
    const prefix = options.emoji ? `${options.emoji}  ` : '⚠️  ';
    console.warn(`${prefix}${message}`);
  }

  error(message: string, options: LoggerOptions = {}) {
    if (this.isSilent || options.silent) return;
    const prefix = options.emoji ? `${options.emoji}  ` : '❌  ';
    console.error(`${prefix}${message}`);
  }

  debug(message: string, options: LoggerOptions = {}) {
    if (process.env.DOCPATH_DEBUG || process.env.DEBUG) {
      this.log(message, { emoji: '🔍', ...options });
    }
  }
}

export const logger = new Logger();
