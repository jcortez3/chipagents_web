'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || '';
const POLL_MS = 5000;
const RUNNING_MIN_GAP_MS = 10000;
const SNIPPET = 4096;
const MARKER_RE = /\[(pasted image|attached file|attached folder): ([^\]\n]+?)\]/g;
const SECRET_RE = /(^|\/)(credentials\.json|\.git-credentials|\.netrc|\.env(\.[\w-]+)?|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|[^/]*\.(pem|key|p12|pfx|kdbx|keystore))$|\/\.ssh\/|\/\.gnupg\//i;
const SYSTEM_RE = /^\/(proc|sys|dev|run)(\/|$)/;
const SCAN_ROOT_RE = /^(\/mnt\/[a-z]\/|\/home\/|\/root\/)/;
const READ_TOOLS = {
  View: ['file_path'],
  ViewSpreadsheetRange: ['file_path'],
  ViewSpreadsheetStats: ['file_path'],
  searchInFile: ['file_path'],
  queryFileWithEmbeddings: ['file_path'],
  pdfMarkdown: ['file_path'],
  ExtractPdf: ['file_path'],
  queryWaveform: ['filePath'],
  Lint: ['files'],
};
const WRITE_TOOLS = { Edit: ['file_path'], ExtractPdf: ['output_path'], Plot: ['outPath'] };
const RANK = { listed: 0, read: 1, edited: 2, created: 3, generated: 4, attached: 5, folder: 5 };

function toPosix(p) {
  const s = String(p || '').trim();
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(s);
  if (m) return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
  if (s === '~' || s.startsWith('~/')) return path.join(HOME, s.slice(1));
  return s;
}

function mirror(p) {
  const m = /^\/mnt\/([a-z])\/(.*)$/.exec(p);
  return m ? path.join(m[1].toUpperCase(), m[2]) : p.replace(/^\/+/, '');
}

function safeName(s, max) {
  const out = String(s || '').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, max).replace(/_+$/, '');
  return out || 'conversation';
}

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

function localTime(ms, withDate = true) {
  if (!ms) return '';
  const d = new Date(ms);
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withDate ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${t}` : t;
}

function human(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fence(text, lang = '') {
  const runs = String(text).match(/`{3,}/g) || [];
  const f = '`'.repeat(Math.max(3, ...runs.map((r) => r.length + 1)));
  return `${f}${lang}\n${text}\n${f}`;
}

function clip(text, max = SNIPPET) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max)}\n… (${s.length - max} more characters in conversation.json)` : s;
}

function link(rel) {
  return `<${rel.split(path.sep).join('/')}>`;
}

async function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    await fs.promises.writeFile(tmp, data);
    await fs.promises.rename(tmp, file);
  } catch {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    await fs.promises.writeFile(file, data);
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function entryTime(e) {
  const t = e && e.timestamp;
  const n = typeof t === 'number' ? t : Date.parse(t);
  return Number.isFinite(n) ? n : 0;
}

function mergeSaved(run, saved) {
  const old = saved && saved.id === run.id && Array.isArray(saved.transcript) ? saved.transcript : [];
  const now = Array.isArray(run.transcript) ? run.transcript : [];
  const ids = new Set(now.map((e) => e && e.id));
  const missing = old.filter((e) => e && e.id && !ids.has(e.id));
  if (!missing.length) return 0;
  run.transcript = missing.concat(now).sort((a, b) => entryTime(a) - entryTime(b));
  return missing.length;
}

function parseCall(entry) {
  const name = (entry.meta && entry.meta.toolName) || entry.title || '';
  const text = String(entry.text || '');
  const prefix = `${name}(`;
  if (!text.startsWith(prefix) || !text.endsWith(')')) return { name, args: null };
  try {
    return { name, args: JSON.parse(text.slice(prefix.length, -1)) };
  } catch {
    return { name, args: null };
  }
}

function scanPaths(text) {
  const out = new Set();
  const s = String(text || '');
  for (const m of s.matchAll(/(["'`])((?:\/|~\/|[A-Za-z]:\\)[^"'`\n]*?)\1/g)) out.add(m[2]);
  for (const m of s.matchAll(/(?:^|[\s=(<>|])((?:\/mnt\/[a-z]|\/home|\/root|~)\/[^\s"'`;|&<>()$*?{}]+)/g)) out.add(m[1]);
  return [...out].map((p) => toPosix(p.replace(/[.,:;]+$/, ''))).filter((p) => SCAN_ROOT_RE.test(p));
}

function start(opts) {
  const root = opts.root;
  const pasteDir = path.resolve(opts.pasteDir);
  const genDir = path.resolve(opts.genDir);
  const fileMax = opts.fileMaxBytes;
  const totalMax = opts.totalMaxBytes;
  const log = opts.log || ((m) => console.log(`[conversations] ${m}`));
  const indexFile = path.join(root, 'index.json');
  const touched = new Set();
  const lastSyncAt = new Map();
  const warned = new Set();
  let index = null;
  let busy = false;
  let misses = 0;
  let timer = null;
  const warn = (key, msg) => {
    if (warned.has(key)) return;
    warned.add(key);
    log(msg);
  };
  function hubGet(p, timeoutMs = 15000) {
    return new Promise((resolve) => {
      const port = opts.hubPort();
      if (!port) return resolve({ status: 0 });
      const headers = { host: `127.0.0.1:${port}`, 'x-access-token': opts.token(), accept: 'application/json' };
      const r = http.request({ host: '127.0.0.1', port, method: 'GET', path: p, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', (e) => resolve({ status: 0, error: e.code || e.message }));
      });
      r.setTimeout(timeoutMs, () => r.destroy(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })));
      r.on('error', (e) => resolve({ status: 0, error: e.code || e.message }));
      r.end();
    });
  }
  async function loadIndex() {
    if (!index) index = await readJson(indexFile, { version: 1, threads: {} });
    return index;
  }
  function isPlaceholder(title, run) {
    if (!title || /^(new (chat|thread|conversation)|untitled)\b/i.test(title)) return true;
    const first = (run.transcript || []).find((e) => e.kind === 'system' && e.title === 'user');
    return !!first && String(first.text || '').trim().startsWith(title.replace(/…$/, '').trim()) && title.length < 80;
  }
  async function folderFor(run) {
    const idx = await loadIndex();
    const title = String(run.title || '').trim();
    const placeholder = isPlaceholder(title, run);
    let entry = idx.threads[run.id];
    const date = new Date(run.startedAt || Date.now());
    const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_`;
    const nameFor = (t) => `${base}${safeName(t, 60)}_${String(run.id).slice(0, 8)}`;
    if (!entry) {
      if (placeholder && Date.now() - (run.startedAt || 0) < 60000) return null;
      entry = { folder: nameFor(title), title, provisional: placeholder, createdAt: Date.now() };
      idx.threads[run.id] = entry;
    } else if (entry.provisional && !placeholder) {
      const next = nameFor(title);
      try {
        await fs.promises.rename(path.join(root, entry.folder), path.join(root, next));
        entry.folder = next;
      } catch (e) {
        if (e.code !== 'ENOENT') warn(`rename:${run.id}`, `could not rename folder for "${title}" (${e.code}); keeping ${entry.folder}`);
        else entry.folder = next;
      }
      entry.provisional = false;
    }
    entry.title = title;
    entry.updatedAt = run.updatedAt;
    return path.join(root, entry.folder);
  }
  function resolver(run) {
    const ws = run.workspaces && typeof run.workspaces === 'object' ? run.workspaces : {};
    return (raw, workspace) => {
      const p = toPosix(raw);
      if (!p) return '';
      if (path.isAbsolute(p)) return path.normalize(p);
      const baseDir = (workspace && ws[workspace]) || run.workingDirectory || '';
      return baseDir ? path.join(baseDir, p) : '';
    };
  }
  function collect(run) {
    const items = new Map();
    const add = (src, category, use, guess = false) => {
      if (!src) return;
      const prev = items.get(src);
      const order = { attachment: 3, generated: 2, file: 1, dir: 0 };
      if (!prev) return void items.set(src, { src, category, use, guess });
      if (!guess) prev.guess = false;
      if (order[category] > order[prev.category]) prev.category = category;
      if ((RANK[use] || 0) > (RANK[prev.use] || 0)) prev.use = use;
    };
    const resolve = resolver(run);
    const inGen = (p) => p.startsWith(genDir + path.sep);
    for (const e of run.transcript || []) {
      if (e.kind === 'system' && e.title === 'user') {
        for (const m of String(e.text || '').matchAll(MARKER_RE)) add(resolve(m[2]), 'attachment', m[1] === 'attached folder' ? 'folder' : 'attached');
      } else if (e.kind === 'agent') {
        for (const p of scanPaths(e.text)) if (inGen(p)) add(p, 'generated', 'generated', true);
      } else if (e.kind === 'tool_call') {
        const { name, args } = parseCall(e);
        if (!args) continue;
        const ws = args.workspace;
        for (const k of READ_TOOLS[name] || []) for (const v of [].concat(args[k] || [])) add(resolve(v, ws), 'file', 'read');
        for (const k of WRITE_TOOLS[name] || []) {
          const v = args[k];
          if (!v) continue;
          const created = name === 'Edit' ? args.old_string === '' : true;
          add(resolve(v, ws), 'file', created ? 'created' : 'edited');
        }
        if (name === 'LS' && args.file_path) add(resolve(args.file_path, ws), 'dir', 'listed');
        if (name === 'Bash' && args.command) for (const p of scanPaths(args.command)) add(p, 'file', 'read', true);
        if (name === 'RunToolProgram' && args.code) {
          for (const m of String(args.code).matchAll(/tools\.(\w+)\(\s*\{[^}]*?\b(file_path|filePath|outPath)\s*:\s*(['"`])((?:(?!\3).)+)\3/g)) {
            const nested = m[1];
            if (WRITE_TOOLS[nested]) add(resolve(m[4], ws), 'file', 'edited');
            else if (READ_TOOLS[nested]) add(resolve(m[4], ws), 'file', 'read');
          }
          for (const p of scanPaths(args.code)) add(p, 'file', 'read', true);
        }
      }
    }
    for (const it of items.values()) if (it.category === 'file' && inGen(it.src)) it.category = 'generated';
    return [...items.values()];
  }
  function excluded(src) {
    if (SYSTEM_RE.test(src)) return 'system path';
    if (SECRET_RE.test(src)) return 'looks like a secret (not copied)';
    if (src === root || src.startsWith(root + path.sep)) return 'inside the conversations folder';
    return '';
  }
  async function walk(dir, out, limit) {
    let list = [];
    try {
      list = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of list) {
      if (out.length >= limit) return;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) await walk(p, out, limit);
      else if (d.isFile()) out.push(p);
    }
  }
  async function copyItems(folder, items, state) {
    const rows = [];
    let total = Object.values(state.files).reduce((a, f) => a + (f.size || 0), 0);
    const copyOne = async (src, destRel) => {
      const reason = excluded(src);
      if (reason) return { skipped: reason };
      let st;
      try {
        st = await fs.promises.stat(src);
      } catch {
        return { skipped: 'no longer exists' };
      }
      if (!st.isFile()) return { skipped: 'not a regular file' };
      if (st.size > fileMax) return { skipped: `larger than ${human(fileMax)}`, size: st.size };
      const prev = state.files[src];
      const dest = path.join(folder, destRel);
      if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs && prev.dest === destRel && fs.existsSync(dest)) return { rel: destRel, size: st.size };
      if (total - (prev ? prev.size : 0) + st.size > totalMax) return { skipped: `folder limit ${human(totalMax)} reached`, size: st.size };
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(src, dest);
      total += st.size - (prev ? prev.size : 0);
      state.files[src] = { size: st.size, mtimeMs: st.mtimeMs, dest: destRel };
      return { rel: destRel, size: st.size };
    };
    for (const it of items) {
      if (it.category === 'dir') {
        rows.push({ ...it, skipped: 'directory listing only' });
        continue;
      }
      if (it.category === 'attachment' && it.use === 'folder') {
        const files = [];
        if (!excluded(it.src)) await walk(it.src, files, 5000);
        let size = 0;
        let n = 0;
        for (const f of files) {
          const r = await copyOne(f, path.join('attachments', path.basename(it.src), path.relative(it.src, f)));
          if (r.rel) { n++; size += r.size; }
        }
        rows.push({ ...it, rel: path.join('attachments', path.basename(it.src)), size, note: `${n}/${files.length} files`, skipped: files.length ? '' : excluded(it.src) || 'folder not found' });
        continue;
      }
      const destRel = it.category === 'attachment' ? path.join('attachments', path.basename(it.src))
        : it.category === 'generated' ? path.join('generated', path.basename(it.src))
          : path.join('files', mirror(it.src));
      try {
        const r = await copyOne(it.src, destRel);
        if (it.guess && (r.skipped === 'no longer exists' || r.skipped === 'not a regular file')) continue;
        rows.push({ ...it, ...r });
      } catch (e) {
        rows.push({ ...it, skipped: `copy failed: ${e.code || e.message}` });
      }
    }
    return rows;
  }
  function render(run, rows) {
    const bySrc = new Map(rows.filter((r) => r.rel).map((r) => [r.src, r]));
    const resolve = resolver(run);
    const results = new Map();
    for (const e of run.transcript || []) {
      const m = e.kind === 'tool_result' && /:result:(.+)$/.exec(String(e.id || ''));
      if (m) results.set(m[1], e);
    }
    const relink = (text) => String(text || '').replace(/\]\((<)?([^)>\n]+?)(>)?\)/g, (all, lt, target) => {
      const file = resolve(target.replace(/:\d+$/, ''));
      const hit = bySrc.get(file);
      return hit ? `](${link(hit.rel)})` : all;
    });
    const out = [];
    out.push(`# ${run.title || 'Conversation'}`, '');
    out.push('| | |', '|---|---|');
    out.push(`| Thread | \`${run.id}\` |`);
    out.push(`| Workspace | ${run.workspaceName || ''} (\`${run.workingDirectory || ''}\`) |`);
    out.push(`| Started | ${localTime(run.startedAt)} |`, `| Updated | ${localTime(run.updatedAt)} |`, `| Status | ${run.status || ''} |`, '');
    out.push('Full raw data, including thinking and complete tool output: [conversation.json](conversation.json)', '', '---', '');
    for (const e of run.transcript || []) {
      if (e.kind === 'system' && e.title === 'user') {
        const text = String(e.text || '').replace(MARKER_RE, (all, kind, p) => {
          const hit = bySrc.get(resolve(p));
          const name = path.basename(p);
          if (!hit) return `\`${all}\``;
          if (kind === 'pasted image') return `\n\n![${name}](${link(hit.rel)})\n\n`;
          return `[${kind === 'attached folder' ? '📁' : '📄'} ${name}](${link(hit.rel)})`;
        });
        out.push(`## 🧑 You · ${localTime(e.timestamp)}`, '', text.trim(), '');
      } else if (e.kind === 'agent') {
        out.push(`## 🤖 ChipAgents · ${localTime(e.timestamp)}`, '', relink(e.text).trim(), '');
        for (const p of scanPaths(e.text)) {
          const hit = bySrc.get(p);
          if (hit && hit.category === 'generated' && /\.(png|jpe?g|gif|webp|svg)$/i.test(p)) out.push(`![${path.basename(p)}](${link(hit.rel)})`, '');
        }
      } else if (e.kind === 'tool_call') {
        const { name, args } = parseCall(e);
        const target = args && (args.file_path || args.filePath || args.outPath || args.url || args.name || args.command || args.description || '');
        const label = String(target).split('\n')[0].slice(0, 100);
        const res = results.get(e.meta && e.meta.toolCallId);
        out.push(`<details><summary>🔧 ${name}${label ? ` — ${label.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}` : ''}</summary>`, '');
        out.push(fence(clip(args ? JSON.stringify(args, null, 2) : e.text), 'json'), '');
        if (res) out.push('Result:', '', fence(clip(res.text)), '');
        out.push('</details>', '');
      } else if (e.kind === 'status') {
        out.push(`> ℹ️ ${e.title || 'status'} · ${localTime(e.timestamp)}`, '');
      }
    }
    out.push('---', '', '## Files used in this conversation', '');
    if (!rows.length) out.push('None.', '');
    else {
      out.push('| File | Use | Size | Copy |', '|---|---|---|---|');
      const order = { attachment: 0, generated: 1, file: 2, dir: 3 };
      for (const r of [...rows].sort((a, b) => order[a.category] - order[b.category] || a.src.localeCompare(b.src))) {
        const copy = r.rel && !r.skipped ? `[${r.rel.split(path.sep).join('/')}](${link(r.rel)})${r.note ? ` (${r.note})` : ''}` : `— ${r.skipped || ''}`;
        out.push(`| \`${r.src}\` | ${r.use} | ${r.size ? human(r.size) : ''} | ${copy} |`);
      }
      out.push('');
    }
    return out.join('\n');
  }
  async function sync(id) {
    const res = await hubGet(`/hub/api/runs/${encodeURIComponent(id)}`, 120000);
    if (res.status !== 200) {
      warn(`get:${id}:${res.status}`, `could not read conversation ${id} from the hub (${res.status ? `HTTP ${res.status}` : res.error || 'no answer'})`);
      return;
    }
    let run;
    try {
      run = JSON.parse(res.text);
    } catch {
      return;
    }
    if (!run || !run.id || run.temporary) return;
    const folder = await folderFor(run);
    if (!folder) return;
    await fs.promises.mkdir(folder, { recursive: true });
    const jsonFile = path.join(folder, 'conversation.json');
    const added = mergeSaved(run, await readJson(jsonFile, null));
    if (added) log(`kept ${added} earlier entries of "${run.title || id}" that the hub no longer shows`);
    const stateFile = path.join(folder, '.sync.json');
    const state = await readJson(stateFile, { files: {} });
    const rows = await copyItems(folder, collect(run), state);
    await writeAtomic(jsonFile, added ? JSON.stringify(run) : res.text);
    await writeAtomic(path.join(folder, 'conversation.md'), render(run, rows));
    await writeAtomic(stateFile, JSON.stringify(state, null, 2));
    await writeAtomic(indexFile, JSON.stringify(index, null, 2));
    lastSyncAt.set(id, Date.now());
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      await loadIndex();
      const res = await hubGet('/hub/api/runs');
      let runs = [];
      if (res.status === 200) {
        misses = 0;
        try {
          const j = JSON.parse(res.text);
          runs = Array.isArray(j) ? j : j.runs || [];
        } catch {
          runs = [];
        }
      } else if (res.status && ++misses >= 3) {
        log(`sync disabled: hub did not answer /hub/api/runs (HTTP ${res.status})`);
        clearInterval(timer);
        return;
      }
      const due = new Set(touched);
      touched.clear();
      for (const r of runs) {
        if (!r || !r.id || r.temporary) continue;
        const entry = index.threads[r.id];
        if (entry && entry.updatedAt === r.updatedAt) continue;
        if (r.status === 'running' && Date.now() - (lastSyncAt.get(r.id) || 0) < RUNNING_MIN_GAP_MS) continue;
        due.add(r.id);
      }
      for (const id of due) {
        try {
          await sync(id);
        } catch (e) {
          warn(`sync:${id}:${e.code || e.message}`, `sync of ${id} failed: ${e.message}`);
        }
      }
    } finally {
      busy = false;
    }
  }
  fs.mkdirSync(root, { recursive: true });
  timer = setInterval(() => void tick(), POLL_MS);
  log(`saving conversations to ${root}`);
  return {
    touch(id) {
      if (/^[\w-]{8,80}$/.test(id)) touched.add(id);
    },
    syncNow: (id) => sync(id),
    tick,
    stop() { clearInterval(timer); },
  };
}

module.exports = { start, scanPaths, toPosix, mirror, SECRET_RE };
