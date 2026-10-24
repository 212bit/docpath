import { readFile } from 'node:fs/promises';

/**
 * 从 stdin 读取全部输入；TTY（无管道）时立即返回空串。
 * DOCPATH_STDIN_FILE 供进程内 CLI 复用（测试 worker）注入一次管道输入，读完即删。
 */
export function readStdin(): Promise<string> {
  const injected = process.env.DOCPATH_STDIN_FILE;
  if (injected) {
    delete process.env.DOCPATH_STDIN_FILE;
    return readFile(injected, 'utf-8').catch(() => '');
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', () => resolve(''));
    if (process.stdin.isTTY) resolve('');
  });
}
