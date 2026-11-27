// jcortez3
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const fsp = fs.promises;
const MB = 1024 * 1024;
const DEFAULT_REPO = 'jcortez3/chipagents_web';
const SHA_RE = /^[0-9a-f]{40}$/;
const CHECK_TTL_MS = 6 * 3600 * 1000;
const MAX_TARBALL = 100 * MB;
const KEEP_BACKUPS = 3;
const HANDOFF_TTL_MS = 10 * 60 * 1000;
const SHOW_COMMITS = 20;
const BAT = 'chipagents-web-paste.bat';
const BUILD_INFO = 'paste-proxy/build-info.txt';
const REQUIRED = ['paste-proxy/paste-proxy.js', 'paste-proxy/start.sh', BUILD_INFO];
const USER_CONFIG = new Set(['paste-proxy/skill-catalog.json']);
const SYSTEM_CA = ['/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt'];

function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${p(d.getMilliseconds(), 3)}`;
}

const firstLine = (s) => String(s || '').split('\n')[0].trim();
const blobSha = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const safeRel = (rel) => !!rel && !path.isAbsolute(rel) && !rel.split('/').some((p) => !p || p === '.' || p === '..');
const userContent = (rel) => USER_CONFIG.has(rel) || (rel.startsWith('skill-catalog/') && rel !== 'skill-catalog/README.md');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 180000, maxBuffer: 8 * MB, ...opts }, (err, out, stderr) => {
      if (err) reject(new Error(String(stderr || '').trim().split('\n').pop() || err.message));
      else resolve(String(out));
    });
  });
}

async function exists(p) {
  try {
    await fsp.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function isFile(p) {
  try {
    return (await fsp.lstat(p)).isFile();
  } catch {
    return false;
  }
}

async function sameFile(a, b) {
  try {
    const [x, y] = await Promise.all([fsp.readFile(a), fsp.readFile(b)]);
    return x.equals(y);
  } catch {
    return false;
  }
}

async function listFiles(root) {
  const out = [];
  const visit = async (rel) => {
    for (const e of await fsp.readdir(path.join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) throw new Error(`update contains a symlink: ${r}`);
      if (e.isDirectory()) await visit(r);
      else if (e.isFile()) out.push(r);
    }
  };
  await visit('');
  return out.sort();
}

async function writeAtomic(src, dst) {
  await fsp.mkdir(path.dirname(dst), { recursive: true });
  const tmp = `${dst}.update-tmp`;
  await fsp.copyFile(src, tmp);
  const mode = (await fsp.stat(src)).mode & 0o777;
  await fsp.chmod(tmp, mode).catch(() => {});
  await fsp.rename(tmp, dst);
}

function create(opts = {}) {
  const appDir = path.resolve(opts.appDir || path.dirname(__dirname));
  const caHome = opts.caHome || process.env.CHIPAGENTS_HOME || path.join(process.env.HOME || '', '.chipagents');
  const stateDir = opts.stateDir || path.join(caHome, 'web-updater');
  const repo = opts.repo || process.env.TOOL_UPDATE_REPO || DEFAULT_REPO;
  const branch = opts.branch || process.env.TOOL_UPDATE_BRANCH || 'main';
  const api = String(opts.api || process.env.TOOL_UPDATE_API || 'https://api.github.com').replace(/\/+$/, '');
  const codeload = String(opts.codeload || process.env.TOOL_UPDATE_CODELOAD || 'https://codeload.github.com').replace(/\/+$/, '');
  const token = opts.token ?? process.env.GITHUB_TOKEN ?? '';
  const hooks = opts.hooks || {};
  const stagingRoot = path.join(stateDir, 'staging');
  const backupRoot = path.join(stateDir, 'backups');
  const stateFile = path.join(stateDir, 'state.json');
  const handoffFile = path.join(stateDir, 'handoff.json');
  let cache = null;
  let backoffUntil = 0;
  let prefetching = null;
  let prefetchError = '';

  async function readState() {
    try {
      const s = JSON.parse(await fsp.readFile(stateFile, 'utf8'));
      return { installed: {}, dismissed: '', ...s };
    } catch {
      return { installed: {}, dismissed: '' };
    }
  }

  async function writeState(fn) {
    const s = await readState();
    fn(s);
    await fsp.mkdir(stateDir, { recursive: true });
    const tmp = `${stateFile}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(s, null, 2));
    await fsp.rename(tmp, stateFile);
  }

  async function gitEnv() {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    if (!process.env.NODE_EXTRA_CA_CERTS) return env;
    const parts = [];
    for (const f of [...SYSTEM_CA, process.env.NODE_EXTRA_CA_CERTS]) {
      try {
        parts.push(await fsp.readFile(f, 'utf8'));
      } catch {
        continue;
      }
    }
    if (parts.length) {
      await fsp.mkdir(stateDir, { recursive: true });
      env.GIT_SSL_CAINFO = path.join(stateDir, 'ca.pem');
      await fsp.writeFile(env.GIT_SSL_CAINFO, parts.join('\n'));
    }
    return env;
  }

  const git = (...args) => run('git', ['-C', appDir, ...args]);

  async function installed() {
    if (await exists(path.join(appDir, '.git'))) {
      try {
        const [sha, date, br, dirty] = await Promise.all([
          git('rev-parse', 'HEAD'), git('log', '-1', '--format=%cI'), git('rev-parse', '--abbrev-ref', 'HEAD'),
          git('status', '--porcelain', '--untracked-files=no'),
        ]);
        return { mode: 'git', sha: sha.trim(), date: date.trim(), branch: br.trim(), dirty: !!dirty.trim() };
      } catch (e) {
        return { mode: 'git', sha: '', date: '', branch: '', dirty: false, error: e.message };
      }
    }
    try {
      const m = /([0-9a-f]{40})[ \t]+(\S+)/.exec(await fsp.readFile(path.join(appDir, BUILD_INFO), 'utf8'));
      if (m) return { mode: 'archive', sha: m[1], date: m[2] };
    } catch {
      void 0;
    }
    const s = (await readState()).installed[appDir];
    if (s && SHA_RE.test(s.sha || '')) return { mode: 'archive', sha: s.sha, date: s.date || '' };
    return { mode: 'archive', sha: '', date: '' };
  }

  async function gh(p) {
    if (backoffUntil > Date.now()) throw new Error(`GitHub rate limit reached; try again after ${new Date(backoffUntil).toLocaleTimeString()}`);
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'chipagents-web-updater', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(api + p, { headers, signal: AbortSignal.timeout(20000) });
    if ((r.status === 403 || r.status === 429) && r.headers.get('x-ratelimit-remaining') === '0') {
      backoffUntil = parseInt(r.headers.get('x-ratelimit-reset') || '0', 10) * 1000 || Date.now() + 3600 * 1000;
      throw new Error(`GitHub rate limit reached; try again after ${new Date(backoffUntil).toLocaleTimeString()}`);
    }
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw Object.assign(new Error(`GitHub HTTP ${r.status}${j && j.message ? `: ${j.message}` : ''}`), { status: r.status });
    return j;
  }

  async function check(force = false) {
    const inst = await installed();
    if (!force && cache && Date.now() - cache.at < CHECK_TTL_MS && cache.value.installed.sha === inst.sha) {
      cache.value.installed = inst;
      return cache.value;
    }
    let v;
    try {
      const head = await gh(`/repos/${repo}/commits/${encodeURIComponent(branch)}`);
      const latest = { sha: head.sha, date: (head.commit && head.commit.committer && head.commit.committer.date) || '', message: firstLine(head.commit && head.commit.message) };
      if (!SHA_RE.test(latest.sha || '')) throw new Error('GitHub returned no commit');
      let status = 'identical';
      let commits = [];
      let files = [];
      if (!inst.sha) status = 'unknown';
      else if (inst.sha !== latest.sha) {
        try {
          const cmp = await gh(`/repos/${repo}/compare/${inst.sha}...${latest.sha}`);
          status = cmp.status;
          commits = (cmp.commits || []).map((c) => ({
            sha: c.sha, date: (c.commit && c.commit.committer && c.commit.committer.date) || '',
            message: firstLine(c.commit && c.commit.message), merge: (c.parents || []).length > 1,
          })).reverse();
          files = (cmp.files || []).map((f) => ({ name: f.filename, status: f.status, sha: f.sha || '', previous: f.previous_filename || '' }));
        } catch (e) {
          if (e.status !== 404) throw e;
          status = 'diverged';
        }
      }
      v = { latest, status, commits, files, error: '' };
    } catch (e) {
      v = { latest: cache && cache.value.latest, status: '', commits: [], files: [], error: (e.cause && e.cause.code) || e.message };
    }
    v.installed = inst;
    v.checkedAt = Date.now();
    v.updateAvailable = !v.error && !!v.latest && (v.status === 'ahead' || v.status === 'unknown');
    cache = { at: Date.now(), value: v };
    return v;
  }

  const readyFile = (sha) => path.join(stagingRoot, sha, 'ready.json');
  const ready = async (sha) => SHA_RE.test(sha || '') && exists(readyFile(sha));

  function prefetch(sha, date = '') {
    if (!SHA_RE.test(sha || '')) return Promise.reject(new Error('bad version'));
    if (prefetching && prefetching.sha === sha) return prefetching.promise;
    const dir = path.join(stagingRoot, sha);
    const tree = path.join(dir, 'tree');
    const promise = (async () => {
      if (await exists(readyFile(sha))) return tree;
      await fsp.rm(dir, { recursive: true, force: true });
      await fsp.mkdir(tree, { recursive: true });
      const headers = { 'User-Agent': 'chipagents-web-updater' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(`${codeload}/${repo}/tar.gz/${sha}`, { headers, signal: AbortSignal.timeout(300000) });
      if (!r.ok) throw new Error(`download failed (HTTP ${r.status})`);
      if (parseInt(r.headers.get('content-length') || '0', 10) > MAX_TARBALL) throw new Error('update is larger than 100 MB');
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_TARBALL) throw new Error('update is larger than 100 MB');
      const tgz = path.join(dir, 'src.tar.gz');
      await fsp.writeFile(tgz, buf);
      await run('tar', ['-xzf', tgz, '-C', tree, '--strip-components=1', '--no-same-owner']);
      await fsp.rm(tgz, { force: true });
      const files = await listFiles(tree);
      for (const f of REQUIRED) if (!files.includes(f)) throw new Error(`update is missing ${f}`);
      const m = /([0-9a-f]{40})/.exec(await fsp.readFile(path.join(tree, BUILD_INFO), 'utf8'));
      if (m && m[1] !== sha) throw new Error(`update is version ${m[1].slice(0, 7)}, expected ${sha.slice(0, 7)}`);
      await fsp.writeFile(path.join(tree, BUILD_INFO), `${sha} ${date || new Date().toISOString()}\n`);
      for (const f of files.filter((x) => /^paste-proxy\/[^/]+\.js$/.test(x))) {
        await run(process.execPath, ['--check', path.join(tree, f)]).catch((e) => { throw new Error(`update has a broken ${f}: ${e.message}`); });
      }
      await fsp.writeFile(readyFile(sha), JSON.stringify({ sha, date, at: Date.now() }));
      for (const n of await fsp.readdir(stagingRoot)) if (n !== sha) await fsp.rm(path.join(stagingRoot, n), { recursive: true, force: true });
      return tree;
    })();
    prefetching = { sha, promise };
    promise.then(() => { prefetchError = ''; }, (e) => {
      prefetchError = e.message;
      void fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    }).finally(() => {
      if (prefetching && prefetching.promise === promise) prefetching = null;
    });
    return promise;
  }

  async function planChanges(tree, v) {
    const files = await listFiles(tree);
    const ops = [];
    const kept = [];
    for (const rel of files) {
      const dst = path.join(appDir, rel);
      const has = await isFile(dst);
      if (has && await sameFile(path.join(tree, rel), dst)) continue;
      if (has && userContent(rel)) {
        kept.push(rel);
        continue;
      }
      if (rel === BAT && has) {
        ops.push({ kind: (await isFile(`${dst}.new`)) ? 'replace' : 'create', src: rel, dst: `${BAT}.new` });
        continue;
      }
      ops.push({ kind: has ? 'replace' : 'create', src: rel, dst: rel });
    }
    const keep = new Set(files);
    for (const f of v.files) {
      const old = f.status === 'removed' ? f.name : f.status === 'renamed' ? f.previous : '';
      if (!safeRel(old) || keep.has(old)) continue;
      const dst = path.join(appDir, old);
      if (!(await isFile(dst))) continue;
      if (f.sha && blobSha(await fsp.readFile(dst)) === f.sha) ops.push({ kind: 'delete', dst: old });
      else kept.push(old);
    }
    return { ops, kept };
  }

  async function rollback(done, backup) {
    const errors = [];
    for (const op of [...done].reverse()) {
      const dst = path.join(appDir, op.dst);
      try {
        if (op.kind === 'create') await fsp.rm(dst, { force: true });
        else await writeAtomic(path.join(backup, 'files', op.dst), dst);
      } catch (e) {
        errors.push(`${op.dst}: ${e.message}`);
      }
    }
    return errors;
  }

  async function pruneBackups() {
    const all = (await fsp.readdir(backupRoot).catch(() => [])).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await fsp.rm(path.join(backupRoot, old), { recursive: true, force: true });
  }

  const touchesCompanion = (names) => names.some((n) => n.startsWith('companion-extension/'));

  async function applyArchive(v, onPhase) {
    const inst = v.installed;
    onPhase('downloading');
    const tree = await prefetch(v.latest.sha, v.latest.date);
    onPhase('backing up');
    const { ops, kept } = await planChanges(tree, v);
    const backup = path.join(backupRoot, `${stamp()}_${(inst.sha || 'unknown').slice(0, 7)}`);
    for (const op of ops) {
      if (op.kind === 'create') continue;
      const dst = path.join(backup, 'files', op.dst);
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.copyFile(path.join(appDir, op.dst), dst);
    }
    await fsp.mkdir(backup, { recursive: true });
    await fsp.writeFile(path.join(backup, 'manifest.json'), JSON.stringify({ appDir, from: inst.sha, to: v.latest.sha, at: Date.now(), ops, kept }, null, 2));
    onPhase('installing');
    const done = [];
    try {
      for (const op of ops) {
        if (hooks.beforeWrite) await hooks.beforeWrite(op);
        if (op.kind === 'delete') await fsp.rm(path.join(appDir, op.dst), { force: true });
        else await writeAtomic(path.join(tree, op.src), path.join(appDir, op.dst));
        done.push(op);
      }
    } catch (e) {
      const left = await rollback(done, backup);
      throw new Error(`update failed and was undone: ${e.message}${left.length ? ` (could not restore: ${left.join(', ')})` : ''}`);
    }
    await writeState((s) => { s.installed[appDir] = { sha: v.latest.sha, date: v.latest.date, at: Date.now() }; });
    await pruneBackups();
    cache = null;
    return {
      mode: 'archive', from: inst.sha, to: v.latest.sha, changed: ops.filter((o) => o.kind !== 'delete').length,
      deleted: ops.filter((o) => o.kind === 'delete').length, kept, backup,
      bat: ops.some((o) => o.dst === `${BAT}.new`), companion: touchesCompanion(ops.map((o) => o.dst)),
    };
  }

  async function applyGit(v, onPhase) {
    const inst = v.installed;
    if (inst.dirty) throw new Error('this folder has local changes; commit or stash them, then run git pull');
    if (inst.branch !== branch) throw new Error(`this folder is on branch ${inst.branch}; switch to ${branch} to update`);
    onPhase('installing');
    await run('git', ['-C', appDir, 'pull', '--ff-only', 'origin', branch], { env: await gitEnv() });
    const now = await installed();
    cache = null;
    return { mode: 'git', from: inst.sha, to: now.sha, changed: v.files.length, deleted: 0, kept: [], bat: false, companion: touchesCompanion(v.files.map((f) => f.name)) };
  }

  async function apply(onPhase = () => {}) {
    onPhase('checking');
    const v = await check(true);
    if (v.error) throw new Error(`could not check GitHub: ${v.error}`);
    if (!v.updateAvailable) throw new Error('already up to date');
    return v.installed.mode === 'git' ? applyGit(v, onPhase) : applyArchive(v, onPhase);
  }

  async function status(force = false) {
    const v = await check(force);
    const inst = v.installed;
    const st = await readState();
    const sha = v.latest ? v.latest.sha : '';
    if (v.updateAvailable && inst.mode === 'archive' && !prefetching && !(await ready(sha))) prefetch(sha, v.latest.date).catch(() => {});
    const blocked = inst.mode !== 'git' ? '' : inst.dirty ? 'it has local changes' : inst.branch !== branch ? `it is on branch ${inst.branch}` : '';
    const shown = v.commits.filter((c) => !c.merge);
    const list = shown.length ? shown : v.commits;
    return {
      repo, branch, mode: inst.mode, installed: inst, latest: v.latest, status: v.status, updateAvailable: v.updateAvailable,
      ready: inst.mode === 'git' || await ready(sha), prefetching: !!prefetching, prefetchError,
      dismissed: !!sha && st.dismissed === sha, blocked, checkedAt: v.checkedAt, error: v.error,
      commits: list.slice(0, SHOW_COMMITS), more: Math.max(0, list.length - SHOW_COMMITS),
      companion: touchesCompanion(v.files.map((f) => f.name)),
    };
  }

  async function dismiss(sha) {
    if (!SHA_RE.test(String(sha || ''))) throw new Error('bad version');
    await writeState((s) => { s.dismissed = sha; });
  }

  async function writeHandoff(data) {
    await fsp.mkdir(stateDir, { recursive: true });
    const tmp = `${handoffFile}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify({ ...data, until: Date.now() + HANDOFF_TTL_MS }), { mode: 0o600 });
    await fsp.rename(tmp, handoffFile);
  }

  async function takeHandoff() {
    try {
      const j = JSON.parse(await fsp.readFile(handoffFile, 'utf8'));
      await fsp.rm(handoffFile, { force: true });
      return j && j.until > Date.now() && Array.isArray(j.tokens) ? j : null;
    } catch {
      return null;
    }
  }

  function startTimer(log = () => {}) {
    const tick = async (force) => {
      const s = await status(force).catch(() => null);
      if (s && s.updateAvailable && !s.dismissed) log(`ChipAgents Web update available: ${(s.installed.sha || 'unknown').slice(0, 7)} -> ${s.latest.sha.slice(0, 7)}`);
    };
    setTimeout(() => void tick(false), 15000).unref();
    setInterval(() => void tick(true), CHECK_TTL_MS).unref();
  }

  return { installed, check, prefetch, apply, status, dismiss, writeHandoff, takeHandoff, startTimer, paths: { appDir, stateDir } };
}

module.exports = { create, blobSha };
