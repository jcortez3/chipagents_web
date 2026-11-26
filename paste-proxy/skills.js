// jcortez3
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { SECRET_RE, toPosix } = require('./conversations');

const fsp = fs.promises;
const MB = 1024 * 1024;
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const FOLDER_RE = /^[A-Za-z0-9_][\w.-]{0,127}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const BACKUP_RE = /^\d{8}_\d{6}_\d{3}(_\d+)?$/;
const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '__MACOSX']);
const SKIP_DIRS = new Set(['.git', '__pycache__']);
const ARCHIVE_RE = /\.(zip|tgz|tar\.gz|tar)$/i;
const MAX_FILES = 2000;
const MAX_BYTES = 200 * MB;
const STAGE_TTL_MS = 3600 * 1000;
const KEEP_BACKUPS = 5;
const SYSTEM_CA = ['/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt'];

function bad(msg, status = 400, kind = '') {
  return Object.assign(new Error(msg), { status, kind });
}

function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${p(d.getMilliseconds(), 3)}`;
}

const newId = () => Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const skipName = (n) => JUNK.has(n) || n.startsWith('._') || SKIP_DIRS.has(n);
const inside = (base, p) => p === base || p.startsWith(base + path.sep);

async function exists(p) {
  try {
    await fsp.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function isDir(p) {
  try {
    return (await fsp.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function unquote(v) {
  const m = /^(["'])([\s\S]*)\1$/.exec(v);
  if (!m) return v;
  return m[1] === '"' ? m[2].replace(/\\(["\\])/g, '$1').replace(/\\n/g, '\n') : m[2].replace(/''/g, "'");
}

function frontmatter(text) {
  const m = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!m) return null;
  const out = {};
  const lines = m[1].split(/\r?\n/);
  const isKey = (l) => /^[A-Za-z][\w-]*\s*:(\s|$)/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z][\w-]*)\s*:\s?(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const block = [];
    while (i + 1 < lines.length && !isKey(lines[i + 1]) && (/^\s/.test(lines[i + 1]) || /^-\s/.test(lines[i + 1]) || !lines[i + 1].trim())) {
      block.push(lines[++i]);
    }
    let v = kv[2].trim();
    const body = block.map((l) => l.trim()).filter(Boolean);
    if (/^[|>][+-]?$/.test(v)) v = body.join(v[0] === '|' ? '\n' : ' ');
    else if (!v && body.length && body.every((l) => l.startsWith('- '))) v = body.map((l) => unquote(l.slice(2).trim()));
    else if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
    else v = unquote([v, ...body].filter(Boolean).join(' '));
    out[kv[1].toLowerCase()] = v;
  }
  return out;
}

async function skillFile(dir) {
  for (const n of ['SKILL.md', 'skill.md']) {
    try {
      if ((await fsp.stat(path.join(dir, n))).isFile()) return path.join(dir, n);
    } catch {
      continue;
    }
  }
  return '';
}

async function walk(root) {
  const res = { files: [], links: [], bytes: 0, mtime: 0, over: false };
  const visit = async (rel) => {
    const ents = (await fsp.readdir(path.join(root, rel), { withFileTypes: true })).sort(byName);
    for (const e of ents) {
      if (res.over) return;
      if (skipName(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) res.links.push(r);
      else if (e.isDirectory()) await visit(r);
      else if (e.isFile()) {
        const st = await fsp.stat(path.join(root, r));
        res.files.push({ rel: r, size: st.size, mtimeMs: st.mtimeMs });
        res.bytes += st.size;
        res.mtime = Math.max(res.mtime, st.mtimeMs);
        if (res.files.length > MAX_FILES || res.bytes > MAX_BYTES) res.over = true;
      }
    }
  };
  await visit('');
  return res;
}

const hashCache = new Map();
async function contentHash(root, files) {
  const sig = crypto.createHash('sha1').update(root + '\n' + files.map((f) => `${f.rel}:${f.size}:${f.mtimeMs}`).join('\n')).digest('hex');
  if (hashCache.has(sig)) return hashCache.get(sig);
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f.rel + '\0');
    h.update(await fsp.readFile(path.join(root, f.rel)));
    h.update('\0');
  }
  const v = h.digest('hex').slice(0, 16);
  if (hashCache.size > 5000) hashCache.clear();
  hashCache.set(sig, v);
  return v;
}

async function describe(dir) {
  const file = await skillFile(dir);
  const w = await walk(dir);
  const fm = file ? frontmatter(await fsp.readFile(file, 'utf8')) : null;
  const str = (v) => (Array.isArray(v) ? v.join(' ') : String(v || '')).trim();
  const name = fm ? str(fm.name) : '';
  const description = fm ? str(fm.description) : '';
  const kw = fm ? fm.keywords : '';
  const keywords = Array.isArray(kw) ? kw : String(kw || '').split(/[\s,]+/).filter(Boolean);
  const autoApprove = !!fm && String(fm['auto-approve-scripts'] || '').toLowerCase() === 'true';
  const errors = [];
  const warnings = [];
  if (!file) errors.push('no SKILL.md');
  else if (!fm) errors.push('SKILL.md has no frontmatter block (--- name: … description: … ---) at the top');
  if (fm && !name) errors.push('frontmatter has no name');
  else if (fm && !NAME_RE.test(name)) errors.push(`name "${name}" must be lowercase letters, digits, - or _ (max 64, starting with a letter or digit)`);
  if (fm && !description) errors.push('frontmatter has no description');
  if (w.over) errors.push(`more than ${MAX_FILES} files or ${MAX_BYTES / MB} MB`);
  if (w.links.length) errors.push(`contains symlinks: ${w.links.slice(0, 5).join(', ')}`);
  const scripts = w.files.filter((f) => f.rel.startsWith('scripts/')).map((f) => f.rel);
  const secrets = w.files.filter((f) => SECRET_RE.test('/' + f.rel)).map((f) => f.rel);
  if (autoApprove) warnings.push('auto-approve-scripts: true: its bundled scripts run without asking you');
  if (secrets.length) warnings.push(`looks like it contains secrets: ${secrets.slice(0, 5).join(', ')}`);
  if (name && NAME_RE.test(name) && name !== path.basename(dir)) warnings.push(`folder "${path.basename(dir)}" will be installed as "${name}"`);
  return {
    dir, folder: path.basename(dir), name, description, keywords, autoApprove, scripts,
    files: w.files.length, bytes: w.bytes, mtime: w.mtime, errors, warnings, _files: w.files,
  };
}

const pub = (d) => {
  const { _files, ...rest } = d;
  return rest;
};

async function findSkills(root, depth) {
  const out = [];
  const visit = async (dir, d) => {
    if (await skillFile(dir)) return void out.push(dir);
    if (d <= 0) return;
    let ents = [];
    try {
      ents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents.sort(byName)) {
      if (e.isDirectory() && !e.name.startsWith('.') && !skipName(e.name) && e.name !== 'node_modules') await visit(path.join(dir, e.name), d - 1);
    }
  };
  await visit(root, depth);
  return out;
}

async function moveDir(src, dst) {
  await fsp.mkdir(path.dirname(dst), { recursive: true });
  try {
    await fsp.rename(src, dst);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    await fsp.cp(src, dst, { recursive: true, errorOnExist: true, force: false });
    await fsp.rm(src, { recursive: true, force: true });
  }
}

async function copyDir(src, dst) {
  await fsp.cp(src, dst, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (s) => !path.relative(src, s).split(path.sep).some((p) => p && skipName(p)),
  });
}

function create(opts = {}) {
  const caHome = opts.caHome || process.env.CHIPAGENTS_HOME || path.join(process.env.HOME || '', '.chipagents');
  const workspacesJson = opts.workspacesJson || path.join(caHome, 'workspaces.json');
  const catalogFile = opts.catalogFile || path.join(__dirname, 'skill-catalog.json');
  const python = opts.python || 'python3';
  const archiveTool = path.join(__dirname, 'skill-archive.py');
  const stateDir = path.join(caHome, 'skill-importer');
  const stageRoot = path.join(stateDir, 'staging');
  const backupRoot = path.join(stateDir, 'backups');
  const cacheRoot = path.join(stateDir, 'catalog-cache');
  const metaFile = path.join(stateDir, 'installed.json');
  const batches = new Map();
  const gitLocks = new Map();
  let chain = Promise.resolve();
  const locked = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };

  async function scopes() {
    let user = path.join(caHome, 'skills');
    try {
      user = await fsp.realpath(user);
    } catch {
      user = path.join(caHome, 'skills');
    }
    const list = [{ id: 'user', label: 'User (all workspaces)', dir: user }];
    let ws = [];
    try {
      ws = JSON.parse(await fsp.readFile(workspacesJson, 'utf8')).workspaces || [];
    } catch {
      ws = [];
    }
    for (const w of ws) {
      const root = (w.roots || [])[0];
      if (!root || !ID_RE.test(String(w.id || ''))) continue;
      try {
        const real = await fsp.realpath(root);
        list.push({ id: `ws:${w.id}`, label: `Workspace: ${w.name || path.basename(real)}`, root: real, dir: path.join(real, '.chipagents', 'skills') });
      } catch {
        continue;
      }
    }
    return list;
  }

  async function scopeById(id) {
    const s = (await scopes()).find((x) => x.id === id);
    if (!s) throw bad(`unknown scope: ${id}`);
    return s;
  }

  async function readMeta() {
    try {
      return JSON.parse(await fsp.readFile(metaFile, 'utf8'));
    } catch {
      return {};
    }
  }

  async function writeMeta(fn) {
    const m = await readMeta();
    fn(m);
    await fsp.mkdir(stateDir, { recursive: true });
    const tmp = `${metaFile}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(m, null, 2));
    await fsp.rename(tmp, metaFile);
  }

  function runArchive(args) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, SKILL_MAX_FILES: String(MAX_FILES), SKILL_MAX_BYTES: String(MAX_BYTES) };
      execFile(python, [archiveTool, ...args], { timeout: 300000, maxBuffer: 4 * MB, env }, (err, out, stderr) => {
        let j = null;
        try {
          j = JSON.parse(String(out || '').trim().split('\n').pop());
        } catch {
          j = null;
        }
        if (j && j.ok) return resolve(j);
        reject(bad((j && j.error) || String(stderr || '').trim().split('\n').pop() || (err && err.message) || 'archive tool failed'));
      });
    });
  }

  async function caBundle() {
    if (!process.env.NODE_EXTRA_CA_CERTS) return '';
    const parts = [];
    for (const f of [...SYSTEM_CA, process.env.NODE_EXTRA_CA_CERTS]) {
      try {
        parts.push(await fsp.readFile(f, 'utf8'));
      } catch {
        continue;
      }
    }
    if (!parts.length) return '';
    const file = path.join(stateDir, 'ca.pem');
    await fsp.mkdir(stateDir, { recursive: true });
    await fsp.writeFile(file, parts.join('\n'));
    return file;
  }

  async function git(args) {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    const ca = await caBundle();
    if (ca) env.GIT_SSL_CAINFO = ca;
    return new Promise((resolve, reject) => {
      execFile('git', args, { timeout: 180000, maxBuffer: 4 * MB, env }, (err, out, stderr) => {
        if (err) reject(new Error(String(stderr || '').trim().split('\n').pop() || err.message));
        else resolve(out);
      });
    });
  }

  async function syncGit(src, refresh) {
    const dir = path.join(cacheRoot, src.id);
    const prev = gitLocks.get(src.id) || Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      const has = await exists(path.join(dir, '.git'));
      if (has && !refresh) return dir;
      if (!has) {
        await fsp.rm(dir, { recursive: true, force: true });
        await fsp.mkdir(cacheRoot, { recursive: true });
        await git(['clone', '--depth', '1', ...(src.branch ? ['--branch', src.branch] : []), '--', src.location, dir]);
        return dir;
      }
      await git(['-C', dir, 'fetch', '--depth', '1', 'origin', src.branch || 'HEAD']);
      await git(['-C', dir, 'reset', '--hard', 'FETCH_HEAD']);
      return dir;
    });
    gitLocks.set(src.id, run);
    return run;
  }

  async function catalogSources() {
    let cfg = [];
    try {
      cfg = JSON.parse(await fsp.readFile(catalogFile, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return { sources: [], error: '' };
      return { sources: [], error: `${path.basename(catalogFile)}: ${e.message}` };
    }
    if (!Array.isArray(cfg)) cfg = (cfg && cfg.sources) || [];
    const sources = [];
    for (const s of cfg) {
      if (!s || (!s.path && !s.git)) continue;
      const kind = s.path ? 'folder' : 'git';
      const location = s.path ? path.resolve(path.dirname(catalogFile), toPosix(String(s.path))) : String(s.git);
      if (kind === 'git' && location.startsWith('-')) continue;
      const id = crypto.createHash('sha1').update(`${kind}\n${location}\n${s.branch || ''}`).digest('hex').slice(0, 10);
      sources.push({ id, name: String(s.name || location), kind, location, branch: String(s.branch || ''), publish: kind === 'folder' && s.publish !== false });
    }
    return { sources, error: '' };
  }

  async function catalog(refresh) {
    const { sources, error } = await catalogSources();
    const skills = [];
    const out = [];
    for (const s of sources) {
      const info = { ...s, error: '', count: 0 };
      try {
        let root = s.location;
        if (s.kind === 'git') root = await syncGit(s, refresh);
        else if (!(await isDir(root))) {
          if (!s.publish) throw new Error('folder not found');
          await fsp.mkdir(root, { recursive: true });
        }
        for (const dir of await findSkills(root, 3)) {
          const d = await describe(dir);
          const rel = path.relative(root, dir).split(path.sep).join('/') || '.';
          const hash = d.errors.length ? '' : await contentHash(dir, d._files);
          skills.push({ ...pub(d), id: `${s.id}:${rel}`, rel, hash, sourceId: s.id, sourceName: s.name });
          info.count++;
        }
      } catch (e) {
        info.error = e.message;
      }
      out.push(info);
    }
    return { file: catalogFile, error, sources: out, skills };
  }

  async function installed() {
    const sc = await scopes();
    const meta = await readMeta();
    const skills = [];
    for (const s of sc) {
      for (const dir of await findSkills(s.dir, 1)) {
        if (dir === s.dir) continue;
        const d = await describe(dir);
        const m = meta[`${s.id}/${d.folder}`] || null;
        skills.push({ ...d, scope: s.id, scopeLabel: s.label, source: m });
      }
    }
    return { scopes: sc, skills };
  }

  async function list({ refresh = false } = {}) {
    const [{ scopes: sc, skills }, cat] = await Promise.all([installed(), catalog(refresh)]);
    const catByName = new Map();
    for (const c of cat.skills) if (c.name && !catByName.has(c.name)) catByName.set(c.name, c);
    for (const sk of skills) {
      const c = catByName.get(sk.name);
      sk.hash = c && !sk.errors.length ? await contentHash(sk.dir, sk._files) : '';
      sk.catalog = c && c.hash ? { id: c.id, sourceName: c.sourceName, same: c.hash === sk.hash } : null;
      const twins = skills.filter((o) => o !== sk && o.name && o.name === sk.name);
      sk.shadowedBy = sk.scope === 'user' ? twins.filter((o) => o.scope !== 'user').map((o) => o.scopeLabel) : [];
      sk.shadows = sk.scope !== 'user' && twins.some((o) => o.scope === 'user');
    }
    for (const c of cat.skills) {
      c.installedIn = skills.filter((sk) => sk.name === c.name).map((sk) => ({ scope: sk.scope, label: sk.scopeLabel, same: !!c.hash && sk.hash === c.hash }));
    }
    const target = cat.sources.find((s) => s.publish && !s.error);
    return {
      scopes: sc.map(({ id, label, dir }) => ({ id, label, dir })),
      skills: skills.map(pub),
      catalog: cat,
      publishTo: target ? { id: target.id, name: target.name, location: target.location } : null,
    };
  }

  function stageDir(id) {
    if (!ID_RE.test(String(id || ''))) throw bad('bad stage id');
    return path.join(stageRoot, id);
  }

  async function cleanStaging() {
    let ents = [];
    try {
      ents = await fsp.readdir(stageRoot);
    } catch {
      return;
    }
    for (const n of ents) {
      const p = path.join(stageRoot, n);
      try {
        if (Date.now() - (await fsp.stat(p)).mtimeMs > STAGE_TTL_MS) await fsp.rm(p, { recursive: true, force: true });
      } catch {
        continue;
      }
    }
    for (const [k, b] of batches) if (Date.now() - b.at > STAGE_TTL_MS) batches.delete(k);
  }

  function cleanPart(s) {
    const out = String(s).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 120);
    if (!out) throw bad('bad file name');
    return out;
  }

  function decodeHeader(v) {
    try {
      return decodeURIComponent(String(v || ''));
    } catch {
      throw bad('bad file name');
    }
  }

  function uploadTarget(headers) {
    const name = decodeHeader(headers['x-file-name']);
    const rel = decodeHeader(headers['x-rel-path']);
    if (rel) {
      const batchId = String(headers['x-batch'] || '');
      const dir = stageDir(batchId);
      const parts = rel.split('/');
      if (parts.length < 2 || parts.length > 32 || parts.some((p) => !p || p === '.' || p === '..' || /[\\:]/.test(p))) throw bad('bad folder path');
      let b = batches.get(batchId);
      if (!b) batches.set(batchId, (b = { files: 0, bytes: 0, at: Date.now() }));
      if (++b.files > MAX_FILES) throw bad(`folder has more than ${MAX_FILES} files`, 413);
      b.at = Date.now();
      return { stageId: batchId, file: path.join(dir, 'files', ...parts.map(cleanPart)), batch: b };
    }
    const stageId = newId();
    return { stageId, file: path.join(stageDir(stageId), 'upload', cleanPart(path.basename(name || 'upload'))) };
  }

  async function receive(req) {
    void cleanStaging();
    const t = uploadTarget(req.headers);
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > MAX_BYTES) throw bad(`file larger than ${MAX_BYTES / MB} MB`, 413);
    await fsp.mkdir(path.dirname(t.file), { recursive: true });
    const part = `${t.file}.part-${process.pid}`;
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(part, { start: 0 });
      let size = 0;
      let failed = false;
      const fail = (e) => {
        if (failed) return;
        failed = true;
        out.destroy();
        req.unpipe(out);
        req.resume();
        fsp.rm(part, { force: true }).catch(() => {});
        reject(e);
      };
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) fail(bad(`file larger than ${MAX_BYTES / MB} MB`, 413));
        else if (t.batch && t.batch.bytes + size > MAX_BYTES) fail(bad(`folder larger than ${MAX_BYTES / MB} MB`, 413));
      });
      req.on('error', () => fail(bad('upload interrupted')));
      out.on('error', (e) => fail(e));
      out.on('finish', () => {
        if (failed) return;
        if (t.batch) t.batch.bytes += size;
        resolve();
      });
      req.pipe(out);
    });
    await fsp.rename(part, t.file);
    return { stageId: t.stageId };
  }

  async function unpack(dir) {
    const up = path.join(dir, 'upload');
    const files = path.join(dir, 'files');
    const got = await fsp.readdir(up).catch(() => []);
    if (!got.length) return;
    const src = path.join(up, got[0]);
    await fsp.rm(files, { recursive: true, force: true });
    try {
      if (ARCHIVE_RE.test(got[0])) await runArchive(['extract', src, files]);
      else if (/\.md$/i.test(got[0])) {
        const fm = frontmatter(await fsp.readFile(src, 'utf8')) || {};
        const n = NAME_RE.test(String(fm.name || '')) ? fm.name : 'skill';
        await fsp.mkdir(path.join(files, n), { recursive: true });
        await fsp.copyFile(src, path.join(files, n, 'SKILL.md'));
      } else throw bad(`${got[0]}: unsupported file type. Use a .zip, .tar.gz, .tgz, a folder or a SKILL.md`);
    } catch (e) {
      await fsp.rm(files, { recursive: true, force: true });
      throw e;
    } finally {
      await fsp.rm(up, { recursive: true, force: true });
    }
  }

  async function stage({ stageId }) {
    const dir = stageDir(stageId);
    if (!(await isDir(dir))) throw bad('upload not found or expired; upload it again', 404);
    await unpack(dir);
    batches.delete(stageId);
    const files = path.join(dir, 'files');
    const found = await findSkills(files, 3);
    if (!found.length) throw bad('no SKILL.md found. A skill is a folder with a SKILL.md at its top (or one or two folders down in the archive)');
    const { skills } = await installed();
    const out = [];
    for (const d of found) {
      const s = await describe(d);
      const key = path.relative(files, d).split(path.sep).join('/') || '.';
      const installedIn = skills.filter((x) => x.name === s.name).map((x) => ({ scope: x.scope, label: x.scopeLabel }));
      out.push({ ...pub(s), key, installedIn });
    }
    return { stageId, skills: out };
  }

  async function backupDir(dir, name, scope, reason) {
    let id = stamp();
    for (let n = 1; await exists(path.join(backupRoot, name, id)); n++) id = `${stamp()}_${n}`;
    const b = path.join(backupRoot, name, id);
    await moveDir(dir, path.join(b, 'skill'));
    await fsp.writeFile(path.join(b, 'meta.json'), JSON.stringify({ name, scope: scope.id, label: scope.label, from: dir, reason, at: Date.now() }, null, 2));
    const all = (await fsp.readdir(path.join(backupRoot, name)).catch(() => [])).filter((x) => BACKUP_RE.test(x)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await fsp.rm(path.join(backupRoot, name, old), { recursive: true, force: true });
    return { id, dir: path.join(b, 'skill') };
  }

  async function place(src, parent, name, scope, reason) {
    await fsp.mkdir(parent, { recursive: true });
    const tmpRoot = path.join(path.dirname(parent), '.skill-importer-tmp');
    const tmp = path.join(tmpRoot, `${name}-${process.pid}-${Date.now()}`);
    await fsp.mkdir(tmpRoot, { recursive: true });
    try {
      await copyDir(src, tmp);
      const target = path.join(parent, name);
      const backup = (await exists(target)) ? await backupDir(target, name, scope, reason) : null;
      try {
        await fsp.rename(tmp, target);
      } catch (e) {
        if (backup) await moveDir(backup.dir, target).catch(() => {});
        throw e;
      }
      return { target, backup };
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
      await fsp.rmdir(tmpRoot).catch(() => {});
    }
  }

  async function resolveSource({ stageId, key, catalogId }) {
    if (catalogId) {
      const c = (await catalog(false)).skills.find((s) => s.id === catalogId);
      if (!c) throw bad('catalog skill not found (refresh the catalog)', 404);
      return { src: c.dir, meta: { source: 'catalog', catalogId: c.id, sourceName: c.sourceName } };
    }
    const base = path.join(stageDir(stageId), 'files');
    const src = path.resolve(base, String(key || '.'));
    if (!inside(base, src) || !(await isDir(src))) throw bad('staged skill not found or expired; upload it again', 404);
    return { src, meta: { source: 'upload' } };
  }

  function install(body = {}) {
    return locked(async () => {
      const { src, meta } = await resolveSource(body);
      const d = await describe(src);
      if (d.errors.length) throw bad(d.errors.join('; '));
      if (d.autoApprove && !body.allowAutoApprove) throw bad(`${d.name} sets auto-approve-scripts: true. Confirm before installing`, 400, 'auto_approve');
      const s = await scopeById(body.scope || 'user');
      const target = path.join(s.dir, d.name);
      const had = await exists(target);
      if (had && !body.overwrite) throw bad(`${d.name} already exists in ${s.label}`, 409, 'exists');
      const r = await place(src, s.dir, d.name, s, 'replaced by install');
      const hash = await contentHash(src, d._files);
      await writeMeta((m) => { m[`${s.id}/${d.name}`] = { ...meta, hash, at: Date.now() }; });
      return { name: d.name, scope: s.id, label: s.label, path: r.target, replaced: had, backup: r.backup && r.backup.id };
    });
  }

  async function existingSkill(name, scopeId) {
    if (!FOLDER_RE.test(String(name || ''))) throw bad('bad skill name');
    const s = await scopeById(scopeId || 'user');
    const dir = path.join(s.dir, name);
    if (!(await isDir(dir)) || !(await skillFile(dir))) throw bad(`${name} is not installed in ${s.label}`, 404);
    return { s, dir };
  }

  function remove({ name, scope } = {}) {
    return locked(async () => {
      const { s, dir } = await existingSkill(name, scope);
      const b = await backupDir(dir, name, s, 'deleted');
      await writeMeta((m) => { delete m[`${s.id}/${name}`]; });
      return { name, scope: s.id, label: s.label, backup: b.id };
    });
  }

  async function backups({ name } = {}) {
    if (name && !FOLDER_RE.test(String(name))) throw bad('bad skill name');
    const names = name ? [name] : await fsp.readdir(backupRoot).catch(() => []);
    const out = [];
    for (const n of names) {
      if (!FOLDER_RE.test(n)) continue;
      for (const id of await fsp.readdir(path.join(backupRoot, n)).catch(() => [])) {
        if (!BACKUP_RE.test(id)) continue;
        let m = {};
        try {
          m = JSON.parse(await fsp.readFile(path.join(backupRoot, n, id, 'meta.json'), 'utf8'));
        } catch {
          m = {};
        }
        let description = '';
        try {
          description = String((frontmatter(await fsp.readFile(await skillFile(path.join(backupRoot, n, id, 'skill')), 'utf8')) || {}).description || '');
        } catch {
          description = '';
        }
        out.push({ name: n, id, scope: m.scope || '', label: m.label || '', reason: m.reason || '', at: m.at || 0, description });
      }
    }
    return { backups: out.sort((a, b) => b.at - a.at) };
  }

  function restore({ name, backupId, scope } = {}) {
    return locked(async () => {
      if (!FOLDER_RE.test(String(name || '')) || !BACKUP_RE.test(String(backupId || ''))) throw bad('bad backup');
      const b = path.join(backupRoot, name, backupId);
      if (!(await isDir(path.join(b, 'skill')))) throw bad('backup not found', 404);
      let m = {};
      try {
        m = JSON.parse(await fsp.readFile(path.join(b, 'meta.json'), 'utf8'));
      } catch {
        m = {};
      }
      const s = await scopeById(scope || m.scope || 'user');
      const r = await place(path.join(b, 'skill'), s.dir, name, s, 'replaced by restore');
      await writeMeta((mm) => { mm[`${s.id}/${name}`] = { source: 'restore', backupId, at: Date.now() }; });
      return { name, scope: s.id, label: s.label, path: r.target };
    });
  }

  async function exportZip({ name, scope } = {}) {
    const { dir } = await existingSkill(name, scope);
    const tmp = path.join(stateDir, 'export', newId());
    await fsp.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, `${name}.zip`);
    try {
      await runArchive(['zip', dir, file, name]);
    } catch (e) {
      await fsp.rm(tmp, { recursive: true, force: true });
      throw e;
    }
    return { file, cleanup: () => fsp.rm(tmp, { recursive: true, force: true }).catch(() => {}) };
  }

  function publish({ name, scope, overwrite } = {}) {
    return locked(async () => {
      const { sources } = await catalogSources();
      const target = sources.find((x) => x.publish);
      if (!target) throw bad('no catalog folder to publish to (add a "path" source to skill-catalog.json)');
      const { dir } = await existingSkill(name, scope);
      const d = await describe(dir);
      if (d.errors.length) throw bad(d.errors.join('; '));
      const dest = path.join(target.location, d.name);
      const had = await exists(dest);
      if (had && !overwrite) throw bad(`${d.name} is already in catalog "${target.name}"`, 409, 'exists');
      const r = await place(dir, target.location, d.name, { id: `catalog:${target.id}`, label: `Catalog: ${target.name}` }, 'replaced by publish');
      return { name: d.name, catalog: target.name, path: r.target, replaced: had };
    });
  }

  return { scopes, list, catalog, receive, stage, install, remove, backups, restore, exportZip, publish, paths: { caHome, stateDir, catalogFile } };
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(bad('request too large', 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(bad('bad JSON'));
      }
    });
    req.on('error', reject);
  });
}

function http({ core, authorized, originAllowed, sendJson }) {
  const POST = { stage: core.stage, install: core.install, delete: core.remove, restore: core.restore, publish: core.publish };
  return async function handle(req, res, p) {
    const route = p.slice('/__skills/'.length);
    const q = new URL(req.url, 'http://localhost').searchParams;
    try {
      if (req.method === 'GET' && ['list', 'backups', 'export'].includes(route)) {
        if (!(await authorized(req))) return sendJson(res, 401, { error: 'unauthorized' });
        if (route === 'list') return sendJson(res, 200, await core.list({ refresh: q.get('refresh') === '1' }));
        if (route === 'backups') return sendJson(res, 200, await core.backups({ name: q.get('name') || '' }));
        const { file, cleanup } = await core.exportZip({ name: q.get('name'), scope: q.get('scope') });
        const st = await fs.promises.stat(file);
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': st.size,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        const s = fs.createReadStream(file);
        s.on('close', cleanup);
        s.on('error', () => res.destroy());
        return void s.pipe(res);
      }
      if (req.method === 'POST' && (route === 'upload' || POST[route])) {
        if (req.headers['x-chipagents-paste'] !== '1' || !originAllowed(req)) {
          req.resume();
          return sendJson(res, 403, { error: 'forbidden' });
        }
        if (!(await authorized(req))) {
          req.resume();
          return sendJson(res, 401, { error: 'unauthorized' });
        }
        if (route === 'upload') return sendJson(res, 200, await core.receive(req));
        const r = await POST[route](await readJson(req));
        if (route !== 'stage') console.log(`[skills] ${route} ${r.name} -> ${r.label || r.catalog}`);
        return sendJson(res, 200, r);
      }
      req.resume();
      return sendJson(res, 404, { error: 'not found' });
    } catch (e) {
      req.resume();
      return sendJson(res, e.status || 500, { error: e.message, kind: e.kind || '' });
    }
  };
}

module.exports = { create, http, frontmatter, NAME_RE };
