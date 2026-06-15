import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listBacklogItems } from '../engine/backlog.js';
import { listRegisteredProjects } from '../engine/project-registry.js';
import { readFileSafe, resolveDocpathDir } from '../utils/file.js';
import { readReviewMarkdown } from '../utils/workspace-evidence.js';

type DashboardOptions = {
  cwd?: string;
  host?: string;
  port?: number;
};

type DashboardRequestOptions = {
  cwd: string;
};

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 5179;
const DASHBOARD_DIST_DIR = fileURLToPath(new URL('../dashboard-dist/', import.meta.url));
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function jsonResponse(status: number, payload: unknown): Response {
  const body = JSON.stringify(payload, null, 2);
  return new Response(`${body}\n`, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function htmlResponse(): Response {
  return new Response(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DocPath Dashboard</title>
  </head>
  <body>
    <main>
      <h1>DocPath Dashboard</h1>
      <p>Dashboard server is running. Read-only API implementation is available under /api/*.</p>
    </main>
  </body>
</html>
`, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function fileResponse(filePath: string): Promise<Response> {
  const content = await readFile(filePath);
  return new Response(content, {
    status: 200,
    headers: {
      'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
      'cache-control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
    },
  });
}

async function staticDashboardResponse(pathname: string): Promise<Response> {
  const distRoot = DASHBOARD_DIST_DIR.endsWith(sep) ? DASHBOARD_DIST_DIR : `${DASHBOARD_DIST_DIR}${sep}`;
  const normalizedPath = normalize(decodeURIComponent(pathname))
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
  const assetPath = normalizedPath === ''
    ? join(distRoot, 'index.html')
    : join(distRoot, normalizedPath);

  if (!assetPath.startsWith(distRoot)) return jsonResponse(404, { error: 'not_found' });

  try {
    const assetStat = await stat(assetPath);
    if (assetStat.isFile()) return await fileResponse(assetPath);
  } catch {
    // React Router 前端路径回退到 index.html。
  }

  try {
    return await fileResponse(join(distRoot, 'index.html'));
  } catch {
    return htmlResponse();
  }
}

async function sendFetchResponse(response: ServerResponse, fetchResponse: Response, headOnly: boolean): Promise<void> {
  const headers = Object.fromEntries(fetchResponse.headers.entries());
  response.writeHead(fetchResponse.status, headers);
  if (headOnly) {
    response.end();
    return;
  }
  response.end(await fetchResponse.text());
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${body}\n`);
}

function parseJsonOrFallback(content: string | null, fallback: unknown): unknown {
  if (!content) return fallback;
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function summarizeReview(markdown: string | null): { status: 'pass' | 'fail' | 'unknown'; errors: number; warnings: number; hints: number } {
  const content = markdown || '';
  const status = /PASS|通过|✅/i.test(content)
    ? 'pass'
    : /FAIL|失败|❌/i.test(content)
      ? 'fail'
      : 'unknown';
  const errors = Number(content.match(/(\d+)\s*(?:错误|error)/i)?.[1] || 0);
  const warnings = Number(content.match(/(\d+)\s*(?:警告|warning|warn)/i)?.[1] || 0);
  const hints = Number(content.match(/(\d+)\s*(?:提示|hint)/i)?.[1] || 0);
  return { status, errors, warnings, hints };
}

async function resolveRequestedRoot(url: URL, cwd: string): Promise<string> {
  const requestedRoot = url.searchParams.get('root');
  if (!requestedRoot || requestedRoot === cwd) return cwd;

  const projects = await listRegisteredProjects();
  if (projects.some((project) => project.root === requestedRoot)) return requestedRoot;
  throw new Error('unknown_project_root');
}

async function readProjectState(projectRoot: string): Promise<unknown> {
  const docpathDir = await resolveDocpathDir(projectRoot);
  return parseJsonOrFallback(
    await readFileSafe(join(docpathDir, 'workspace', 'state.json')),
    null,
  );
}

async function readCheckHistory(projectRoot: string): Promise<unknown[]> {
  const docpathDir = await resolveDocpathDir(projectRoot);
  const parsed = parseJsonOrFallback(
    await readFileSafe(join(docpathDir, 'workspace', 'check-history.json')),
    [],
  );
  return Array.isArray(parsed) ? parsed : [];
}

async function readReview(projectRoot: string): Promise<{ markdown: string; summary: ReturnType<typeof summarizeReview> }> {
  const docpathDir = await resolveDocpathDir(projectRoot);
  const markdown = await readReviewMarkdown(docpathDir);
  return {
    markdown,
    summary: summarizeReview(markdown),
  };
}

export async function handleDashboardFetch(request: Request, options: DashboardRequestOptions): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method || 'GET';
  const path = url.pathname;

  if (method !== 'GET' && method !== 'HEAD') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  if (path === '/api/health') {
    return jsonResponse(200, {
      ok: true,
      mode: 'readonly',
      endpoints: ['/api/projects', '/api/state', '/api/checks', '/api/review', '/api/backlog'],
    });
  }

  if (path === '/api/projects') {
    return jsonResponse(200, { projects: await listRegisteredProjects() });
  }

  if (path === '/api/state') {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    return jsonResponse(200, { projectRoot, state: await readProjectState(projectRoot) });
  }

  if (path === '/api/checks') {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    return jsonResponse(200, { projectRoot, history: await readCheckHistory(projectRoot) });
  }

  if (path === '/api/review') {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    return jsonResponse(200, { projectRoot, review: await readReview(projectRoot) });
  }

  if (path === '/api/backlog') {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    return jsonResponse(200, { projectRoot, items: await listBacklogItems(projectRoot) });
  }

  if (!path.startsWith('/api/')) return await staticDashboardResponse(path);

  return jsonResponse(404, { error: 'not_found' });
}

async function handleDashboardRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: DashboardRequestOptions,
): Promise<void> {
  const requestUrl = request.url ? new URL(request.url, 'http://localhost') : new URL('/', 'http://localhost');
  try {
    const fetchResponse = await handleDashboardFetch(
      new Request(requestUrl, { method: request.method || 'GET' }),
      options,
    );
    await sendFetchResponse(response, fetchResponse, request.method === 'HEAD');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, message === 'unknown_project_root' ? 404 : 500, { error: message });
  }
}

export async function dashboardCommand(options: DashboardOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const host = options.host || DEFAULT_HOST;
  const port = options.port || DEFAULT_PORT;
  const server = createServer((request, response) => {
    void handleDashboardRequest(request, response, { cwd });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  console.log(`\nDocPath dashboard listening on http://${host}:${port}`);
  console.log('Mode: read-only\n');
  console.log('Dev UI: pnpm exec vite --config vite.dashboard.config.ts\n');
}
