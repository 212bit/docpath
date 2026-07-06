#!/usr/bin/env node
/**
 * codex-session-mine.mjs
 *
 * 从 ~/.codex/sessions 的 rollout-*.jsonl 中挖掘 DocPath 工具反馈信号。
 *
 * 用法:
 *   node scripts/codex-session-mine.mjs --cwd evoucher --month 2026-07
 *   node scripts/codex-session-mine.mjs --cwd evoucher --month 2026-07 --json
 *   node scripts/codex-session-mine.mjs --all            # 不过滤 cwd
 *
 * 提取三类信号:
 *   1. cmd_fail   — docpath 命令退出码 ≠ 0（命令 + 退出码 + 输出片段）
 *   2. out_warn   — docpath 命令输出含 漂移/陈旧/blocked/失败/冲突/不一致 等告警
 *   3. friction   — assistant/user 文本里对 docpath 的语义抱怨
 *
 * 每条信号带: session 文件名 + 1-based 行号，便于回溯证据。
 * 聚拢维度: 失败命令按 `docpath <子命令>` 归并计数，方便看高频。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SESSIONS_ROOT = join(homedir(), '.codex', 'sessions');

function parseArgs(argv) {
  const a = { cwd: null, month: null, json: false, all: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--cwd') a.cwd = argv[++i];
    else if (k === '--month') a.month = argv[++i];
    else if (k === '--json') a.json = true;
    else if (k === '--all') a.all = true;
  }
  return a;
}

const args = parseArgs(process.argv);

// 列出候选 session 文件
function listSessions() {
  const out = [];
  const years = readdirSync(SESSIONS_ROOT).filter((d) => /^\d{4}$/.test(d));
  for (const y of years) {
    const ydir = join(SESSIONS_ROOT, y);
    const months = readdirSync(ydir).filter((d) => /^\d{2}$/.test(d));
    for (const m of months) {
      if (args.month && `${y}-${m}` !== args.month) continue;
      const mdir = join(ydir, m);
      for (const day of readdirSync(mdir).filter((d) => /^\d{2}$/.test(d))) {
        const ddir = join(mdir, day);
        let st;
        try { st = statSync(ddir); } catch { continue; }
        if (!st.isDirectory()) continue;
        for (const f of readdirSync(ddir).filter((f) => f.startsWith('rollout-') && f.endsWith('.jsonl'))) {
          out.push(join(ddir, f));
        }
      }
    }
  }
  return out;
}

// 命中目标项目: 任意 session_meta / turn_context 的 cwd 包含 args.cwd
function sessionMatchesCwd(path, lines) {
  if (args.all || !args.cwd) return true;
  for (const line of lines) {
    if (!line.includes(args.cwd)) continue; // 快速跳过
    try {
      const d = JSON.parse(line);
      const cwd = d?.payload?.cwd;
      if (typeof cwd === 'string' && cwd.includes(args.cwd)) return true;
    } catch { /* ignore */ }
  }
  return false;
}

const WARN_RE = /(漂移|陈旧|blocked|失败|error|drift|stale|未通过|冲突|不一致|未预期|未提供|不完整|跳过|重复)/i;
const FRICTION_RE = /docpath[^\n]{0,120}?(不能|无法|失败|报错|没|缺|漏|重复|卡|阻塞|漂移|冲突|不一致|不|应该|建议|优化|置回|未同步|只报告|仍)/i;

function mineFile(path, raw) {
  const signals = [];
  if (!raw || !raw.length) return signals;

  const calls = new Map(); // call_id -> {cmd, workdir, line}
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    if (!line) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.type !== 'response_item') continue;
    const p = d.payload || {};
    const t = p.type;

    if (t === 'function_call' && p.name === 'exec_command') {
      let cmd = '', workdir = '';
      try { const a = JSON.parse(p.arguments || '{}'); cmd = a.cmd || ''; workdir = a.workdir || ''; } catch { /* ignore */ }
      calls.set(p.call_id, { cmd, workdir, line: i + 1 });
    } else if (t === 'function_call_output') {
      const c = calls.get(p.call_id);
      if (!c || !/^\s*docpath\b/.test(c.cmd)) continue; // 只看 docpath 命令本身，排除 sed/rg 读 .docpath 路径
      const out = p.output || '';
      const codeMatch = out.match(/Process exited with code (-?\d+)/);
      const code = codeMatch ? codeMatch[1] : '?';

      // 取 Output: 之后的纯文本片段
      const outIdx = out.indexOf('Output:');
      const body = outIdx >= 0 ? out.slice(outIdx + 7) : out;

      // 命令失败信号
      if (code !== '0' && code !== '?') {
        signals.push({
          kind: 'cmd_fail',
          file: path,
          line: i + 1,
          cmd: c.cmd,
          subcmd: subcmdOf(c.cmd),
          code,
          snippet: firstLines(body, 2).slice(0, 200),
        });
      }
      // 输出告警信号（即便退出 0）
      if (WARN_RE.test(body)) {
        const hit = body.split('\n').find((l) => WARN_RE.test(l)) || '';
        signals.push({
          kind: 'out_warn',
          file: path,
          line: i + 1,
          cmd: c.cmd,
          subcmd: subcmdOf(c.cmd),
          code,
          snippet: hit.trim().slice(0, 200),
        });
      }
    } else if (t === 'message' && (p.role === 'assistant' || p.role === 'user')) {
      const txt = (p.content || []).map((x) => (x && x.text) || '').join('');
      if (!txt) continue;
      const m = txt.match(FRICTION_RE);
      if (m) {
        signals.push({
          kind: 'friction',
          file: path,
          line: i + 1,
          role: p.role,
          snippet: m[0].slice(0, 200),
        });
      }
    }
  }
  return signals;
}

function subcmdOf(cmd) {
  // "docpath backlog promote R-005 --x" -> "docpath backlog promote"
  const m = cmd.match(/\bdocpath\b(?:\s+([\w-]+))?(?:\s+([\w-]+))?/);
  if (!m) return 'docpath';
  return ['docpath', m[1], m[2]].filter(Boolean).join(' ');
}

function firstLines(s, n) {
  return s.split('\n').filter(Boolean).slice(0, n).join(' | ');
}

// main
const files = listSessions();
let all = [];
const perFile = [];
let matched = 0;
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  if (!sessionMatchesCwd(f, lines)) continue;
  matched++;
  const sigs = mineFile(f, lines);
  if (sigs.length) { all.push(...sigs); perFile.push({ file: f, count: sigs.length }); }
}

// 聚拢: 失败命令按 subcmd 计数
const failByCmd = new Map();
for (const s of all) {
  if (s.kind !== 'cmd_fail') continue;
  failByCmd.set(s.subcmd, (failByCmd.get(s.subcmd) || 0) + 1);
}

const out = {
  args,
  sessionsScanned: files.length,
  sessionsMatched: matched,
  totalSignals: all.length,
  failBySubcmd: [...failByCmd.entries()].sort((a, b) => b[1] - a[1]),
  signals: all,
};

if (args.json) {
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
} else {
  console.log(`扫描 session 文件: ${out.sessionsScanned}, 命中 evoucher: ${out.sessionsMatched}, 信号总数: ${out.totalSignals}`);
  console.log('\n=== 失败命令按子命令聚拢 ===');
  for (const [cmd, n] of out.failBySubcmd) console.log(`  ${String(n).padStart(4)}  ${cmd}`);
  const show = (kind, label) => {
    const arr = all.filter((s) => s.kind === kind);
    console.log(`\n=== ${label} (${arr.length}) ===`);
    for (const s of arr.slice(0, 30)) {
      const loc = `${s.file.split('/sessions/')[1] || s.file}:${s.line}`;
      if (kind === 'friction') {
        console.log(`  [${s.role}] ${s.snippet}`);
        console.log(`      @ ${loc}`);
      } else {
        console.log(`  [${s.code}] ${s.cmd.slice(0, 80)}`);
        console.log(`      >>> ${s.snippet}`);
        console.log(`      @ ${loc}`);
      }
    }
    if (arr.length > 30) console.log(`  ... 还有 ${arr.length - 30} 条, 用 --json 看全部`);
  };
  show('cmd_fail', '命令失败');
  show('out_warn', '输出告警');
  show('friction', '语义抱怨');
}
